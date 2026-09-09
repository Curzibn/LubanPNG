use crate::domain::task::CompressTask;
use crate::error::{AppError, AppResult};
use crate::infrastructure::compression::CompressionStrategy;
use crate::infrastructure::storage::{FileStorage, get_format_extension};
use crate::repositories::task_repository::TaskRepository;
use async_trait::async_trait;
use image::ImageFormat;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Semaphore};
use tokio::task::JoinHandle;

pub struct CompressionTaskMessage {
    pub task_id: String,
    pub file_data: Vec<u8>,
    pub original_path: String,
}

pub struct TaskQueue {
    sender: mpsc::UnboundedSender<CompressionTaskMessage>,
    queue_size: Arc<tokio::sync::RwLock<usize>>,
}

impl TaskQueue {
    pub fn new() -> (Self, mpsc::UnboundedReceiver<CompressionTaskMessage>) {
        let (sender, receiver) = mpsc::unbounded_channel();
        (
            Self {
                sender,
                queue_size: Arc::new(tokio::sync::RwLock::new(0)),
            },
            receiver,
        )
    }

    pub async fn enqueue(&self, message: CompressionTaskMessage) -> Result<(), AppError> {
        self.sender.send(message).map_err(|e| {
            AppError::internal(format!("任务入队失败: {}", e))
        })?;
        let mut size = self.queue_size.write().await;
        *size += 1;
        Ok(())
    }

    pub async fn get_queue_size(&self) -> usize {
        *self.queue_size.read().await
    }

    pub async fn decrement_queue_size(&self) {
        let mut size = self.queue_size.write().await;
        if *size > 0 {
            *size -= 1;
        }
    }
}

#[async_trait]
pub trait CompressionService: Send + Sync {
    async fn compress_image(
        &self,
        file_data: Vec<u8>,
        filename: String,
    ) -> AppResult<String>;
    
    async fn get_task_status(&self, task_id: &str) -> AppResult<TaskStatusResponse>;
}

pub struct CompressionServiceImpl {
    task_repo: Arc<dyn TaskRepository>,
    compression_strategies: HashMap<ImageFormat, Arc<dyn CompressionStrategy>>,
    storage: Arc<dyn FileStorage>,
    task_queue: Arc<TaskQueue>,
    semaphore: Arc<Semaphore>,
}

impl CompressionServiceImpl {
    pub fn new(
        task_repo: Arc<dyn TaskRepository>,
        compression_strategies: HashMap<ImageFormat, Arc<dyn CompressionStrategy>>,
        storage: Arc<dyn FileStorage>,
        task_queue: Arc<TaskQueue>,
        max_concurrent: usize,
    ) -> Self {
        Self {
            task_repo,
            compression_strategies,
            storage,
            task_queue,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
        }
    }

    fn get_strategy(&self, format: ImageFormat) -> AppResult<Arc<dyn CompressionStrategy>> {
        self.compression_strategies
            .get(&format)
            .cloned()
            .ok_or_else(|| AppError::compression(format!("不支持的图片格式: {:?}", format)))
    }

    async fn do_compress(
        &self,
        task_id: String,
        file_data: Vec<u8>,
        _original_path: String,
    ) -> AppResult<()> {
        self.task_repo.update_processing(&task_id).await?;

        let img_format = image::guess_format(&file_data)
            .map_err(|e| AppError::compression(format!("无法识别图片格式: {}", e)))?;

        let strategy = self.get_strategy(img_format)?;
        let config = crate::config::AppConfig::get().clone();

        self.task_repo.update_progress(&task_id, 30).await?;

        let file_data_clone = file_data.clone();
        let compression_result = tokio::task::spawn_blocking(move || {
            tokio::runtime::Handle::try_current()
                .map_err(|_| AppError::compression("无法获取运行时句柄".to_string()))?
                .block_on(strategy.compress(&file_data_clone, &config))
        })
        .await
        .map_err(|e| AppError::compression(format!("任务执行失败: {}", e)))?
        .map_err(|e| AppError::compression(format!("压缩失败: {}", e)))?;

        self.task_repo.update_progress(&task_id, 70).await?;

        let extension = get_format_extension(compression_result.format);
        let output_path = self.storage
            .save_output(&task_id, &compression_result.data, extension)
            .await?;

        let compressed_size = compression_result.data.len() as u64;

        self.task_repo.update_completed(&task_id, compressed_size, output_path).await?;

        Ok(())
    }

    pub async fn process_task(
        &self,
        message: CompressionTaskMessage,
    ) {
        let task_id = message.task_id.clone();
        let task_repo = self.task_repo.clone();
        let task_queue = self.task_queue.clone();

        let _permit = self.semaphore.acquire().await.unwrap();

        task_queue.decrement_queue_size().await;

        if let Err(e) = self.do_compress(
            message.task_id.clone(),
            message.file_data,
            message.original_path,
        ).await {
            if let Err(update_err) = task_repo.update_failed(&task_id, e.to_string()).await {
                eprintln!("更新任务状态失败: {:?}", update_err);
            }
        }
    }
}

pub fn start_worker_pool(
    mut receiver: mpsc::UnboundedReceiver<CompressionTaskMessage>,
    service: Arc<CompressionServiceImpl>,
    worker_count: usize,
) -> Vec<JoinHandle<()>> {
    let mut handles = Vec::new();
    let mut worker_channels = Vec::new();

    for _ in 0..worker_count {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let worker_service = service.clone();
        worker_channels.push(tx);
        
        let handle = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                worker_service.process_task(msg).await;
            }
        });
        
        handles.push(handle);
    }

    let distributor_handle = tokio::spawn(async move {
        let mut worker_index = 0;
        while let Some(msg) = receiver.recv().await {
            if let Some(worker_tx) = worker_channels.get(worker_index % worker_count) {
                let _ = worker_tx.send(msg);
            }
            worker_index += 1;
        }
    });
    
    handles.push(distributor_handle);
    handles
}

#[async_trait]
impl CompressionService for CompressionServiceImpl {
    async fn compress_image(
        &self,
        file_data: Vec<u8>,
        filename: String,
    ) -> AppResult<String> {
        let file_size = file_data.len() as u64;
        let extension = std::path::Path::new(&filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| format!(".{}", ext))
            .unwrap_or_else(|| String::new());

        let mut task = CompressTask::new(String::new(), file_size);
        task.original_filename = Some(filename.clone());
        let task_id = task.id.clone();

        let original_path = self.storage
            .save_upload(&task_id, &file_data, &extension)
            .await?;

        task.original_path = original_path.clone();
        
        self.task_repo.create(task).await?;

        let message = CompressionTaskMessage {
            task_id: task_id.clone(),
            file_data,
            original_path,
        };

        self.task_queue.enqueue(message).await?;
        
        let final_queue_size = self.task_queue.get_queue_size().await;
        self.task_repo.update_queue_position(&task_id, final_queue_size).await?;

        Ok(task_id)
    }

    async fn get_task_status(&self, task_id: &str) -> AppResult<TaskStatusResponse> {
        let task = self.task_repo.get(task_id).await?
            .ok_or_else(|| AppError::not_found(format!("任务不存在: {}", task_id)))?;

        let mut queue_position = task.queue_position;
        if task.status.as_str() == "pending" {
            let current_queue_size = self.task_queue.get_queue_size().await;
            let available_permits = self.semaphore.available_permits();
            let max_concurrent = self.semaphore.available_permits() + 
                (available_permits == 0).then_some(1).unwrap_or(0);
            
            let estimated_position = current_queue_size + (max_concurrent - available_permits);
            if let Some(pos) = queue_position {
                queue_position = Some(pos.min(estimated_position));
            } else {
                queue_position = Some(estimated_position);
            }
        } else {
            queue_position = None;
        }

        let compressed_url = task.compressed_path.as_ref().map(|p| {
            format!(
                "/v1/images/download/{}",
                std::path::Path::new(p)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
            )
        });

        Ok(TaskStatusResponse {
            task_id: task.id,
            status: task.status.as_str().to_string(),
            progress: task.progress,
            original_size: task.original_size,
            compressed_size: task.compressed_size,
            compressed_url,
            error_msg: task.error_msg,
            created_at: task.created_at,
            completed_at: task.completed_at,
            queue_position,
        })
    }
}

#[derive(Debug, Clone)]
pub struct TaskStatusResponse {
    pub task_id: String,
    pub status: String,
    pub progress: u8,
    pub original_size: u64,
    pub compressed_size: Option<u64>,
    pub compressed_url: Option<String>,
    pub error_msg: Option<String>,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub queue_position: Option<usize>,
}
