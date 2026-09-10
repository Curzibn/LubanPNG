use crate::app::AppState;
use crate::error::AppError;
use crate::response::ApiResponseError;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::sync::Arc;
use tower_http::limit::RequestBodyLimitLayer;

pub fn create_body_limit_layer(max_size: u64) -> RequestBodyLimitLayer {
    RequestBodyLimitLayer::new(max_size as usize)
}

pub async fn handle_body_limit_error(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Response {
    let response = next.run(request).await;
    if response.status() == StatusCode::PAYLOAD_TOO_LARGE {
        let error = AppError::file_too_large(0, state.config.server.max_upload_size);
        let error_response = ApiResponseError::error(error.error_code(), error.message());
        return (StatusCode::PAYLOAD_TOO_LARGE, axum::Json(error_response)).into_response();
    }
    response
}
