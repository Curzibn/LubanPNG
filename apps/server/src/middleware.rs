use axum::{
    extract::Request,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use tower_http::limit::RequestBodyLimitLayer;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::response::ApiResponseError;

pub fn create_body_limit_layer() -> RequestBodyLimitLayer {
    let max_size = AppConfig::get().server.max_upload_size;
    RequestBodyLimitLayer::new(max_size as usize)
}

pub async fn handle_body_limit_error(
    request: Request,
    next: axum::middleware::Next,
) -> Response {
    let response = next.run(request).await;
    
    if response.status() == StatusCode::PAYLOAD_TOO_LARGE {
        let max_size = AppConfig::get().server.max_upload_size;
        let error = AppError::file_too_large(0, max_size);
        let error_response = ApiResponseError::error(
            error.error_code(),
            error.message(),
        );
        return (StatusCode::PAYLOAD_TOO_LARGE, axum::Json(error_response)).into_response();
    }
    
    response
}
