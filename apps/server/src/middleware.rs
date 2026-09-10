use crate::app::AppState;
use crate::error::AppError;
use crate::response::ApiResponseError;
use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::sync::Arc;
use tower_http::limit::RequestBodyLimitLayer;

pub fn create_body_limit_layer(max_size: u64) -> RequestBodyLimitLayer {
    RequestBodyLimitLayer::new(max_size as usize)
}

fn is_body_layer_rejection(response: &Response) -> bool {
    response.status() == StatusCode::PAYLOAD_TOO_LARGE
        && response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("text/plain"))
}

pub async fn handle_body_limit_error(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Response {
    let response = next.run(request).await;
    if is_body_layer_rejection(&response) {
        let error = AppError::file_too_large(0, state.config.server.max_upload_size);
        let error_response = ApiResponseError::error(error.error_code(), error.message());
        return (StatusCode::PAYLOAD_TOO_LARGE, axum::Json(error_response)).into_response();
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response_with(status: StatusCode, content_type: Option<&str>) -> Response {
        let mut response = Response::new(axum::body::Body::empty());
        *response.status_mut() = status;
        if let Some(value) = content_type {
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, value.parse().unwrap());
        }
        response
    }

    #[test]
    fn body_layer_rejection_is_rewritten() {
        assert!(is_body_layer_rejection(&response_with(
            StatusCode::PAYLOAD_TOO_LARGE,
            Some("text/plain; charset=utf-8")
        )));
    }

    #[test]
    fn business_rejection_survives() {
        assert!(!is_body_layer_rejection(&response_with(
            StatusCode::PAYLOAD_TOO_LARGE,
            Some("application/json")
        )));
        assert!(!is_body_layer_rejection(&response_with(
            StatusCode::BAD_REQUEST,
            Some("text/plain; charset=utf-8")
        )));
    }
}
