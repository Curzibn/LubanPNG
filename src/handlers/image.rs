use crate::error::AppError;
use crate::response::{ApiResponse, ApiResponseError};
use crate::services::CompressionService;
use axum::{
    extract::{Multipart, Path, State},
    response::Json,
};
use std::sync::Arc;
use utoipa::ToSchema;

#[derive(Clone)]
pub struct AppState {
    pub compression_service: Arc<dyn CompressionService>,
}

#[derive(utoipa::ToSchema)]
pub struct UploadForm {
    #[schema(value_type = String, format = Binary)]
    #[allow(dead_code)]
    pub file: String,
}

#[utoipa::path(
    post,
    path = "/v1/images/compress",
    tag = "图片压缩",
    request_body(
        content = UploadForm,
        content_type = "multipart/form-data",
        description = "上传图片文件进行压缩",
    ),
    responses(
        (status = 200, description = "上传成功", body = ApiResponse<UploadResponse>),
        (status = 400, description = "参数错误", body = ApiResponseError),
        (status = 500, description = "服务器错误", body = ApiResponseError),
    )
)]
pub async fn upload_image(
    State(state): State<Arc<AppState>>,
    multipart: Multipart,
) -> Result<Json<ApiResponse<UploadResponse>>, AppError> {
    let (file_data, filename) = parse_multipart(multipart).await?;
    
    let task_id = state
        .compression_service
        .compress_image(file_data, filename)
        .await?;
    
    Ok(Json(ApiResponse::success(UploadResponse { task_id })))
}

#[utoipa::path(
    get,
    path = "/v1/images/compress/{task_id}",
    tag = "图片压缩",
    params(
        ("task_id" = String, Path, description = "任务ID")
    ),
    responses(
        (status = 200, description = "获取成功", body = ApiResponse<TaskStatusResponseSchema>),
        (status = 404, description = "任务不存在", body = ApiResponseError),
    )
)]
pub async fn get_task_status(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
) -> Result<Json<ApiResponse<TaskStatusResponseSchema>>, AppError> {
    let status = state
        .compression_service
        .get_task_status(&task_id)
        .await?;
    
    let response = TaskStatusResponseSchema {
        task_id: status.task_id,
        status: status.status,
        progress: status.progress,
        original_size: status.original_size,
        compressed_size: status.compressed_size,
        compressed_url: status.compressed_url,
        error_msg: status.error_msg,
        created_at: status.created_at,
        completed_at: status.completed_at,
        queue_position: status.queue_position,
    };
    
    Ok(Json(ApiResponse::success(response)))
}

async fn parse_multipart(mut multipart: Multipart) -> Result<(Vec<u8>, String), AppError> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut filename: Option<String> = None;

    while let Some(field) = multipart.next_field().await
        .map_err(|e| {
            let error_msg = e.to_string().to_lowercase();
            let max_size = crate::config::AppConfig::get().server.max_upload_size;
            if error_msg.contains("limit") || error_msg.contains("too large") || error_msg.contains("size") 
                || error_msg.contains("payload too large") || error_msg.contains("413")
                || error_msg.contains("parsing multipart") || error_msg.contains("body limit exceeded")
                || error_msg.contains("parsing `multipart/form-data`")
                || (error_msg.contains("parsing") && error_msg.contains("multipart"))
                || (error_msg.contains("parsing") && error_msg.contains("form-data")) {
                AppError::file_too_large(0, max_size)
            } else {
                AppError::validation(format!("解析表单数据失败: {}", e))
            }
        })?
    {
        let name = field.name().unwrap_or("");
        if name == "file" {
            filename = field.file_name().map(|s| s.to_string());
            let data = field.bytes().await
                .map_err(|e| {
                    let error_msg = e.to_string().to_lowercase();
                    let max_size = crate::config::AppConfig::get().server.max_upload_size;
                    if error_msg.contains("limit") || error_msg.contains("too large") || error_msg.contains("size")
                        || error_msg.contains("payload too large") || error_msg.contains("413")
                        || error_msg.contains("parsing multipart") || error_msg.contains("body limit exceeded")
                        || error_msg.contains("parsing `multipart/form-data`")
                        || (error_msg.contains("parsing") && error_msg.contains("multipart"))
                        || (error_msg.contains("parsing") && error_msg.contains("form-data")) {
                        AppError::file_too_large(0, max_size)
                    } else {
                        AppError::validation(format!("读取文件数据失败: {}", e))
                    }
                })?;
            file_data = Some(data.to_vec());
        }
    }

    let file_data = file_data.ok_or_else(|| AppError::validation("文件不能为空".to_string()))?;
    let filename = filename.unwrap_or_else(|| "image".to_string());

    Ok((file_data, filename))
}

#[derive(serde::Serialize, ToSchema)]
pub struct UploadResponse {
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub task_id: String,
}

#[derive(serde::Serialize, ToSchema)]
pub struct TaskStatusResponseSchema {
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub task_id: String,
    #[schema(example = "completed")]
    pub status: String,
    #[schema(example = 100)]
    pub progress: u8,
    #[schema(example = 1024000)]
    pub original_size: u64,
    #[schema(example = 512000)]
    pub compressed_size: Option<u64>,
    #[schema(example = "/v1/images/download/compressed.png")]
    pub compressed_url: Option<String>,
    pub error_msg: Option<String>,
    #[schema(example = 1691234567)]
    pub created_at: u64,
    #[schema(example = 1691234600)]
    pub completed_at: Option<u64>,
    #[schema(example = 5)]
    pub queue_position: Option<usize>,
}
