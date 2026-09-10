use crate::config::AppConfig;
use crate::domain::compression::ConversionRequest;
use crate::domain::subject::{Plan, Subject, SubjectKind};
use crate::domain::task::{TaskRecord, TaskStatus};
use crate::error::{AppError, AppResult};
use crate::infrastructure::compression::convert::convert_image;
use crate::infrastructure::compression::probe;
use crate::infrastructure::compression::CompressionStrategy;
use crate::infrastructure::storage::{content_type_for_extension, format_extension, ObjectStorage};
use crate::repositories::identity_repository::IdentityRepository;
use crate::repositories::task_repository::{NewTask, TaskRepository};
use crate::services::quota::QuotaService;
use bytes::Bytes;
use chrono::{DateTime, Duration, Utc};
use image::ImageFormat;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration as StdDuration;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TaskStatusView {
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub task_id: String,
    #[schema(example = "completed")]
    pub status: String,
    #[schema(example = 100)]
    pub progress: u8,
    #[schema(example = "web")]
    pub source: String,
    #[schema(example = "photo.png")]
    pub original_name: String,
    #[schema(example = 1024000)]
    pub original_size: u64,
    #[schema(example = 512000)]
    pub compressed_size: Option<u64>,
    #[schema(example = "/v1/images/download/550e8400-e29b-41d4-a716-446655440000.png")]
    pub compressed_url: Option<String>,
    #[schema(example = "webp")]
    pub target_format: Option<String>,
    #[schema(example = "png")]
    pub output_format: Option<String>,
    #[schema(example = 1)]
    pub quota_units: i32,
    pub error_msg: Option<String>,
    #[schema(example = 1691234567)]
    pub created_at: i64,
    #[schema(example = 1691234600)]
    pub completed_at: Option<i64>,
    #[schema(example = 1691321000)]
    pub expires_at: Option<i64>,
    #[schema(example = 1)]
    pub queue_position: Option<i64>,
    pub downloadable: bool,
}

pub struct CompressionService {
    tasks: Arc<TaskRepository>,
    identity: Arc<IdentityRepository>,
    quota: Arc<QuotaService>,
    storage: Arc<dyn ObjectStorage>,
    strategies: HashMap<ImageFormat, Arc<dyn CompressionStrategy>>,
    config: AppConfig,
}

pub const SUPPORTED_FORMATS_MESSAGE: &str = "只支持 PNG、JPEG、GIF、WebP、AVIF 图片";
pub const HEIF_MESSAGE: &str = "暂不支持 HEIC/HEIF，请先在设备上导出为 JPEG 再上传";

fn detect_format(data: &[u8]) -> AppResult<ImageFormat> {
    match probe::sniff_format(data) {
        Some(
            format @ (ImageFormat::Png
            | ImageFormat::Jpeg
            | ImageFormat::Gif
            | ImageFormat::WebP
            | ImageFormat::Avif),
        ) => Ok(format),
        _ if probe::is_heif(data) => Err(AppError::validation(HEIF_MESSAGE)),
        _ => Err(AppError::validation(SUPPORTED_FORMATS_MESSAGE)),
    }
}

fn effective_conversion(
    source: ImageFormat,
    conversion: Option<ConversionRequest>,
) -> Option<ConversionRequest> {
    conversion.filter(|request| request.target.image_format() != source)
}

fn sanitize_name(name: &str) -> String {
    let trimmed = name.trim().rsplit(['/', '\\']).next().unwrap_or("").trim();
    let cleaned: String = trimmed
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '"' | '\''))
        .take(120)
        .collect();
    if cleaned.is_empty() {
        "image".to_string()
    } else {
        cleaned
    }
}

impl CompressionService {
    pub fn new(
        tasks: Arc<TaskRepository>,
        identity: Arc<IdentityRepository>,
        quota: Arc<QuotaService>,
        storage: Arc<dyn ObjectStorage>,
        strategies: HashMap<ImageFormat, Arc<dyn CompressionStrategy>>,
        config: AppConfig,
    ) -> Self {
        Self {
            tasks,
            identity,
            quota,
            storage,
            strategies,
            config,
        }
    }

    fn strategy(&self, format: ImageFormat) -> AppResult<Arc<dyn CompressionStrategy>> {
        self.strategies
            .get(&format)
            .cloned()
            .ok_or_else(|| AppError::compression(format!("不支持的图片格式: {:?}", format)))
    }

    pub async fn submit(
        &self,
        subject: &Subject,
        data: Bytes,
        filename: &str,
        conversion: Option<ConversionRequest>,
    ) -> AppResult<TaskRecord> {
        let size = data.len() as i64;
        if size == 0 {
            return Err(AppError::validation("文件不能为空"));
        }
        if size > subject.plan.max_file_size {
            return Err(AppError::file_too_large(
                size as u64,
                subject.plan.max_file_size as u64,
            ));
        }
        let format = detect_format(&data)?;
        let conversion = effective_conversion(format, conversion);
        let units = 1 + i32::from(conversion.is_some());
        let extension = format_extension(format);
        let task_id = Uuid::new_v4();
        let snapshot = self.quota.reserve(subject, task_id, units).await?;
        let input_key = format!("uploads/{}{}", task_id, extension);
        let subject_type = subject.kind.as_str();
        if let Err(err) = self
            .storage
            .put(
                &input_key,
                data,
                content_type_for_extension(extension),
                None,
            )
            .await
        {
            self.quota
                .refund(subject_type, subject.id, &snapshot.period_key, task_id, units)
                .await?;
            return Err(err);
        }
        let created = self
            .tasks
            .create(NewTask {
                id: task_id,
                subject_type: subject_type.to_string(),
                subject_id: subject.id,
                source: subject.source.as_str().to_string(),
                original_name: sanitize_name(filename),
                original_size: size,
                input_key: input_key.clone(),
                quota_period: snapshot.period_key.clone(),
                quota_units: units as i16,
                target_format: conversion.map(|request| request.target.as_str().to_string()),
                background: conversion
                    .and_then(|request| request.background)
                    .map(|background| background.to_hex()),
            })
            .await;
        match created {
            Ok(record) => Ok(record),
            Err(err) => {
                self.quota
                    .refund(subject_type, subject.id, &snapshot.period_key, task_id, units)
                    .await?;
                let _ = self.storage.delete(&input_key).await;
                Err(err)
            }
        }
    }

    async fn view(&self, task: TaskRecord) -> AppResult<TaskStatusView> {
        let now = Utc::now();
        let queue_position = if task.status() == TaskStatus::Pending {
            Some(self.tasks.queue_position(&task).await?)
        } else {
            None
        };
        let downloadable = task.downloadable(now);
        Ok(TaskStatusView {
            task_id: task.id.to_string(),
            status: task.status.clone(),
            progress: task.progress.max(0) as u8,
            source: task.source.clone(),
            original_name: task.original_name.clone(),
            original_size: task.original_size.max(0) as u64,
            compressed_size: task.compressed_size.map(|s| s.max(0) as u64),
            compressed_url: if downloadable {
                task.download_path()
            } else {
                None
            },
            target_format: task.target_format.clone(),
            output_format: task.output_format().map(str::to_string),
            quota_units: task.quota_units(),
            error_msg: task.error_msg.clone(),
            created_at: task.created_at.timestamp(),
            completed_at: task.completed_at.map(|t| t.timestamp()),
            expires_at: task.expires_at.map(|t| t.timestamp()),
            queue_position,
            downloadable,
        })
    }

    pub async fn status(&self, task_id: Uuid, wait: StdDuration) -> AppResult<TaskStatusView> {
        let deadline = tokio::time::Instant::now() + wait;
        loop {
            let task = self
                .tasks
                .get(task_id)
                .await?
                .ok_or_else(|| AppError::not_found(format!("任务不存在: {}", task_id)))?;
            if task.is_terminal() || tokio::time::Instant::now() >= deadline {
                return self.view(task).await;
            }
            tokio::time::sleep(StdDuration::from_millis(500)).await;
        }
    }

    pub async fn tasks_for(&self, subject: &Subject) -> AppResult<Vec<TaskStatusView>> {
        let records = self
            .tasks
            .list_for_subject(subject.kind.as_str(), subject.id, 50)
            .await?;
        let mut views = Vec::with_capacity(records.len());
        for record in records {
            views.push(self.view(record).await?);
        }
        Ok(views)
    }

    pub async fn download_url(&self, filename: &str) -> AppResult<String> {
        let task_id = filename
            .split_once('.')
            .map(|(stem, _)| stem)
            .and_then(|stem| Uuid::parse_str(stem).ok())
            .ok_or_else(|| AppError::not_found("文件不存在"))?;
        let task = self
            .tasks
            .get(task_id)
            .await?
            .filter(|task| {
                task.downloadable(Utc::now())
                    && task.download_filename().as_deref() == Some(filename)
            })
            .ok_or_else(|| AppError::not_found("文件不存在或已过期"))?;
        let key = task
            .output_key
            .ok_or_else(|| AppError::not_found("文件不存在"))?;
        self.storage
            .presigned_get_url(
                &key,
                StdDuration::from_secs(self.config.storage.presign_ttl_secs),
            )
            .await
    }

    async fn plan_for_task(&self, task: &TaskRecord) -> AppResult<Plan> {
        let plan_id = if task.subject_type == SubjectKind::Account.as_str() {
            self.identity
                .account(task.subject_id)
                .await?
                .map(|account| account.plan_id)
                .unwrap_or_else(|| "free".to_string())
        } else {
            "anonymous".to_string()
        };
        self.identity
            .plan(&plan_id)
            .await?
            .ok_or_else(|| AppError::internal(format!("套餐不存在: {}", plan_id)))
    }

    async fn run(&self, task: &TaskRecord) -> AppResult<()> {
        let input = self.storage.get(&task.input_key).await?;
        let format = detect_format(&input)?;
        let conversion = effective_conversion(format, task.conversion());
        let strategy = self.strategy(format)?;
        let config = self.config.clone();
        self.tasks.set_progress(task.id, 30).await?;

        let compression_input = input.clone();
        let result = tokio::task::spawn_blocking(move || match conversion {
            Some(request) => convert_image(&compression_input, format, request, &config),
            None => tokio::runtime::Handle::try_current()
                .map_err(|_| AppError::compression("无法获取运行时句柄"))?
                .block_on(strategy.compress(&compression_input, &config)),
        })
        .await
        .map_err(|e| AppError::compression(format!("任务执行失败: {}", e)))??;

        self.tasks.set_progress(task.id, 70).await?;
        let plan = self.plan_for_task(task).await?;
        let original_size = task.original_size.max(0);
        let compressed_size = result.data.len() as i64;
        let keep_original = conversion.is_none() && compressed_size >= original_size;
        let (payload, stored_size, extension) = if keep_original {
            (input, original_size, format_extension(format))
        } else {
            (
                Bytes::from(result.data),
                compressed_size,
                format_extension(result.format),
            )
        };
        let output_key = format!("{}/{}{}", plan.output_prefix(), task.id, extension);
        self.storage
            .put(
                &output_key,
                payload,
                content_type_for_extension(extension),
                Some(&task.original_name),
            )
            .await?;
        let expires_at: DateTime<Utc> = Utc::now() + Duration::hours(plan.retention_hours as i64);
        self.tasks
            .complete(task.id, stored_size, &output_key, expires_at)
            .await?;
        self.quota
            .settle(
                &task.subject_type,
                task.subject_id,
                &task.quota_period,
                task.id,
                task.quota_units(),
            )
            .await?;
        let _ = self.storage.delete(&task.input_key).await;
        Ok(())
    }

    pub async fn process(&self, task: TaskRecord) {
        if let Err(err) = self.run(&task).await {
            tracing::warn!(task_id = %task.id, error = %err, "compression task failed");
            if let Err(update_err) = self.tasks.fail(task.id, &err.message()).await {
                tracing::error!(task_id = %task.id, error = %update_err, "failed to mark task failed");
            }
            if let Err(refund_err) = self
                .quota
                .refund(
                    &task.subject_type,
                    task.subject_id,
                    &task.quota_period,
                    task.id,
                    task.quota_units(),
                )
                .await
            {
                tracing::error!(task_id = %task.id, error = %refund_err, "failed to refund quota");
            }
        }
    }
}
