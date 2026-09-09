use crate::domain::task::CompressTask;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::RwLock;

pub type TaskStore = Arc<RwLock<std::collections::HashMap<String, CompressTask>>>;

#[async_trait]
pub trait TaskRepository: Send + Sync {
    async fn create(&self, task: CompressTask) -> AppResult<String>;
    async fn get(&self, id: &str) -> AppResult<Option<CompressTask>>;
    async fn update_processing(&self, id: &str) -> AppResult<()>;
    async fn update_progress(&self, id: &str, progress: u8) -> AppResult<()>;
    async fn update_completed(&self, id: &str, compressed_size: u64, compressed_path: String) -> AppResult<()>;
    async fn update_failed(&self, id: &str, error_msg: String) -> AppResult<()>;
    async fn update_queue_position(&self, id: &str, position: usize) -> AppResult<()>;
}

pub struct TaskRepositoryImpl {
    store: TaskStore,
}

impl TaskRepositoryImpl {
    pub fn new(store: TaskStore) -> Self {
        Self { store }
    }
}

#[async_trait]
impl TaskRepository for TaskRepositoryImpl {
    async fn create(&self, task: CompressTask) -> AppResult<String> {
        let task_id = task.id.clone();
        let mut store = self.store.write().await;
        store.insert(task_id.clone(), task);
        Ok(task_id)
    }

    async fn get(&self, id: &str) -> AppResult<Option<CompressTask>> {
        let store = self.store.read().await;
        Ok(store.get(id).cloned())
    }

    async fn update_processing(&self, id: &str) -> AppResult<()> {
        let mut store = self.store.write().await;
        if let Some(task) = store.get_mut(id) {
            task.mark_processing();
            task.queue_position = None;
            Ok(())
        } else {
            Err(AppError::not_found(format!("任务不存在: {}", id)))
        }
    }

    async fn update_progress(&self, id: &str, progress: u8) -> AppResult<()> {
        let mut store = self.store.write().await;
        if let Some(task) = store.get_mut(id) {
            task.update_progress(progress);
            Ok(())
        } else {
            Err(AppError::not_found(format!("任务不存在: {}", id)))
        }
    }

    async fn update_completed(&self, id: &str, compressed_size: u64, compressed_path: String) -> AppResult<()> {
        let mut store = self.store.write().await;
        if let Some(task) = store.get_mut(id) {
            task.mark_completed(compressed_size, compressed_path);
            Ok(())
        } else {
            Err(AppError::not_found(format!("任务不存在: {}", id)))
        }
    }

    async fn update_failed(&self, id: &str, error_msg: String) -> AppResult<()> {
        let mut store = self.store.write().await;
        if let Some(task) = store.get_mut(id) {
            task.mark_failed(error_msg);
            Ok(())
        } else {
            Err(AppError::not_found(format!("任务不存在: {}", id)))
        }
    }

    async fn update_queue_position(&self, id: &str, position: usize) -> AppResult<()> {
        let mut store = self.store.write().await;
        if let Some(task) = store.get_mut(id) {
            task.queue_position = Some(position);
            Ok(())
        } else {
            Err(AppError::not_found(format!("任务不存在: {}", id)))
        }
    }
}

pub fn create_task_store() -> TaskStore {
    Arc::new(RwLock::new(std::collections::HashMap::new()))
}
