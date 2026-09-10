use crate::app::AppState;
use crate::error::AppError;
use crate::response::ApiResponseError;
use axum::extract::{Path, State};
use axum::response::Redirect;
use std::sync::Arc;

#[utoipa::path(
    get,
    path = "/v1/images/download/{filename}",
    tag = "图片压缩",
    params(
        ("filename" = String, Path, description = "任务状态里 compressed_url 的文件名")
    ),
    responses(
        (status = 302, description = "跳转到 10 分钟内有效的对象存储地址"),
        (status = 404, description = "文件不存在或已过期", body = ApiResponseError)
    ),
    security(("api_key" = []))
)]
pub async fn download_file(
    State(state): State<Arc<AppState>>,
    Path(filename): Path<String>,
) -> Result<Redirect, AppError> {
    let url = state.compression.download_url(&filename).await?;
    Ok(Redirect::temporary(&url))
}
