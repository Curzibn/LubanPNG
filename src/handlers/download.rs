use crate::handlers::image::AppState;
use crate::response::{ApiResponseError, codes};
use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

#[utoipa::path(
    get,
    path = "/v1/images/download/{filename}",
    tag = "图片压缩",
    params(
        ("filename" = String, Path, description = "压缩后的文件名")
    ),
    responses(
        (status = 200, description = "下载成功", content_type = "image/png"),
        (status = 404, description = "文件不存在", body = ApiResponseError)
    )
)]
pub async fn download_file(
    State(_state): State<Arc<AppState>>,
    Path(filename): Path<String>,
) -> impl IntoResponse {
    let file_path = format!("outputs/{}", filename);

    match tokio::fs::read(&file_path).await {
        Ok(data) => {
            let content_type = if filename.ends_with(".png") {
                "image/png"
            } else if filename.ends_with(".jpg") || filename.ends_with(".jpeg") {
                "image/jpeg"
            } else if filename.ends_with(".gif") {
                "image/gif"
            } else {
                "application/octet-stream"
            };

            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, content_type)],
                data,
            )
                .into_response()
        }
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponseError::error(
                codes::TASK_NOT_FOUND,
                "文件不存在".to_string(),
            )),
        )
            .into_response(),
    }
}
