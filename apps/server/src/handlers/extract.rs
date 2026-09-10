use crate::app::AppState;
use crate::error::AppError;
use axum::extract::{Request, State};
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderMap, HeaderValue, Method};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct ClientMeta {
    pub ip: String,
}

pub fn client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.trim().to_string())
        })
        .unwrap_or_else(|| "unknown".to_string())
}

fn has_request_marker(headers: &HeaderMap) -> bool {
    headers
        .get("x-requested-with")
        .and_then(|v| v.to_str().ok())
        .map(|v| v == "LubanPNG")
        .unwrap_or(false)
}

pub async fn subject_layer(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let resolution = match state.auth.resolve(request.headers()).await {
        Ok(resolution) => resolution,
        Err(err) => return err.into_response(),
    };
    let mutating = !matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    );
    if resolution.cookie_based && mutating && !has_request_marker(request.headers()) {
        return AppError::forbidden("缺少 X-Requested-With 头").into_response();
    }
    let quota_path = {
        let path = request.uri().path();
        path.starts_with("/v1/images") || path.starts_with("/v1/me")
    };
    let subject = resolution.subject;
    let ip = client_ip(request.headers());
    request.extensions_mut().insert(subject.clone());
    request.extensions_mut().insert(ClientMeta { ip });

    let mut response = next.run(request).await;

    if let Some(cookie) = resolution.set_cookie {
        if let Ok(value) = HeaderValue::from_str(&cookie) {
            response.headers_mut().append(SET_COOKIE, value);
        }
    }
    if quota_path {
        if let Ok(snapshot) = state.quota.snapshot(&subject).await {
            let headers = response.headers_mut();
            if let Ok(value) = HeaderValue::from_str(&snapshot.limit.to_string()) {
                headers.insert("x-quota-limit", value);
            }
            if let Ok(value) = HeaderValue::from_str(&snapshot.remaining.to_string()) {
                headers.insert("x-quota-remaining", value);
            }
            if let Ok(value) = HeaderValue::from_str(&snapshot.resets_at.to_rfc3339()) {
                headers.insert("x-quota-reset", value);
            }
        }
    }
    response
}
