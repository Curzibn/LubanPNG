use crate::app::AppState;
use crate::domain::subject::Subject;
use crate::error::AppError;
use crate::handlers::extract::ClientMeta;
use crate::response::{ApiResponse, ApiResponseError};
use crate::services::compression::TaskStatusView;
use axum::extract::{Multipart, Path, Query, State};
use axum::{Extension, Json};
use bytes::Bytes;
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

#[derive(ToSchema)]
pub struct UploadForm {
    #[schema(value_type = String, format = Binary)]
    #[allow(dead_code)]
    pub file: String,
}

#[derive(serde::Serialize, ToSchema)]
pub struct UploadResponse {
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub task_id: String,
}

#[derive(Deserialize, IntoParams)]
pub struct StatusQuery {
    #[param(example = 30)]
    pub wait: Option<u64>,
}

#[utoipa::path(
    post,
    path = "/v1/images/compress",
    tag = "图片压缩",
    request_body(
        content = UploadForm,
        content_type = "multipart/form-data",
        description = "上传一张 PNG / JPEG / GIF 图片，入队压缩并扣减 1 次额度",
    ),
    responses(
        (status = 200, description = "已入队", body = ApiResponse<UploadResponse>),
        (status = 400, description = "参数错误或不支持的格式", body = ApiResponseError),
        (status = 413, description = "文件超过当前套餐上限", body = ApiResponseError),
        (status = 429, description = "本期额度用尽或触发限速", body = ApiResponseError),
    ),
    security(("api_key" = []))
)]
pub async fn upload_image(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
    Extension(meta): Extension<ClientMeta>,
    multipart: Multipart,
) -> Result<Json<ApiResponse<UploadResponse>>, AppError> {
    let (data, filename) = parse_multipart(multipart, state.config.server.max_upload_size).await?;
    if !subject.is_account() {
        let allowed = state
            .rate_limits
            .hit(
                &format!("upload:ip:{}", meta.ip),
                86_400,
                state.config.limits.anonymous_uploads_per_ip_per_day as i64,
            )
            .await?;
        if !allowed {
            return Err(AppError::rate_limited(
                "该网络今日的匿名压缩次数已用完，登录后可继续使用",
            ));
        }
    }
    let task = state.compression.submit(&subject, data, &filename).await?;
    Ok(Json(ApiResponse::success(UploadResponse {
        task_id: task.id.to_string(),
    })))
}

#[utoipa::path(
    get,
    path = "/v1/images/compress/{task_id}",
    tag = "图片压缩",
    params(
        ("task_id" = String, Path, description = "任务 ID"),
        StatusQuery,
    ),
    responses(
        (status = 200, description = "任务状态；带 wait 时最多等待该秒数直到终态", body = ApiResponse<TaskStatusView>),
        (status = 404, description = "任务不存在", body = ApiResponseError),
    ),
    security(("api_key" = []))
)]
pub async fn get_task_status(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
    Query(query): Query<StatusQuery>,
) -> Result<Json<ApiResponse<TaskStatusView>>, AppError> {
    let task_id = Uuid::parse_str(&task_id).map_err(|_| AppError::not_found("任务不存在"))?;
    let wait = query
        .wait
        .unwrap_or(0)
        .min(state.config.limits.status_wait_max_secs);
    let view = state
        .compression
        .status(task_id, Duration::from_secs(wait))
        .await?;
    Ok(Json(ApiResponse::success(view)))
}

fn multipart_error(err: axum::extract::multipart::MultipartError, max_size: u64) -> AppError {
    let text = err.to_string().to_lowercase();
    let size_related = ["limit", "too large", "payload too large", "413", "length"]
        .iter()
        .any(|needle| text.contains(needle));
    if size_related {
        AppError::file_too_large(0, max_size)
    } else {
        AppError::validation(format!("解析表单数据失败: {}", err))
    }
}

async fn parse_multipart(
    mut multipart: Multipart,
    max_size: u64,
) -> Result<(Bytes, String), AppError> {
    let mut file_data: Option<Bytes> = None;
    let mut filename: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| multipart_error(e, max_size))?
    {
        if field.name() == Some("file") {
            filename = field.file_name().map(|s| s.to_string());
            let data = field
                .bytes()
                .await
                .map_err(|e| multipart_error(e, max_size))?;
            file_data = Some(data);
        }
    }

    let file_data = file_data.ok_or_else(|| AppError::validation("文件不能为空"))?;
    Ok((file_data, filename.unwrap_or_else(|| "image".to_string())))
}
