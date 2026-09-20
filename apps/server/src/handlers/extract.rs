use crate::app::AppState;
use crate::error::AppError;
use crate::i18n::{Lang, Msg};
use axum::extract::{Request, State};
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderMap, HeaderValue, Method};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::net::IpAddr;
use std::sync::Arc;

pub const CLIENT_IP_HEADER: &str = "x-client-ip";

#[derive(Debug, Clone)]
pub struct ClientMeta {
    pub ip: String,
}

pub fn trusted_client_ip(headers: &HeaderMap) -> Option<IpAddr> {
    let raw = headers.get(CLIENT_IP_HEADER)?.to_str().ok()?.trim();
    raw.parse::<IpAddr>().ok()
}

pub fn client_ip(headers: &HeaderMap) -> String {
    trusted_client_ip(headers)
        .map(|ip| ip.to_string())
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
    let lang = Lang::from_headers(request.headers());
    let resolution = match state.auth.resolve(request.headers(), lang).await {
        Ok(resolution) => resolution,
        Err(err) => return err.into_response(),
    };
    let mutating = !matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    );
    if resolution.cookie_based && mutating && !has_request_marker(request.headers()) {
        return AppError::forbidden(Msg::MissingRequestMarker, lang).into_response();
    }
    let quota_path = {
        let path = request.uri().path();
        path.starts_with("/v1/images") || path.starts_with("/v1/me")
    };
    let subject = resolution.subject;
    let ip = client_ip(request.headers());
    request.extensions_mut().insert(subject.clone());
    request.extensions_mut().insert(ClientMeta { ip });
    request.extensions_mut().insert(lang);

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

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(
                axum::http::HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_str(value).unwrap(),
            );
        }
        map
    }

    #[test]
    fn trusted_client_ip_accepts_a_single_literal() {
        assert_eq!(
            trusted_client_ip(&headers(&[("x-client-ip", "203.0.113.7")])),
            Some("203.0.113.7".parse().unwrap())
        );
        assert_eq!(
            trusted_client_ip(&headers(&[("x-client-ip", "  203.0.113.7  ")])),
            Some("203.0.113.7".parse().unwrap())
        );
        assert_eq!(
            trusted_client_ip(&headers(&[("x-client-ip", "2001:db8::42")])),
            Some("2001:db8::42".parse().unwrap())
        );
    }

    #[test]
    fn trusted_client_ip_rejects_multi_value_port_and_garbage() {
        for raw in [
            "203.0.113.7, 198.51.100.9",
            "203.0.113.7,203.0.113.8",
            "203.0.113.7:443",
            "[2001:db8::1]:443",
            "not-an-ip",
            "",
            "1.2.3",
            "999.1.1.1",
            "203.0.113.7/24",
        ] {
            assert_eq!(
                trusted_client_ip(&headers(&[("x-client-ip", raw)])),
                None,
                "{raw} must not be trusted"
            );
        }
    }

    #[test]
    fn trusted_client_ip_ignores_forwarded_headers() {
        let spoofed = headers(&[
            ("x-forwarded-for", "198.51.100.9"),
            ("x-real-ip", "198.51.100.10"),
            ("forwarded", "for=198.51.100.11"),
        ]);
        assert_eq!(trusted_client_ip(&spoofed), None);
        assert_eq!(client_ip(&spoofed), "unknown");
    }

    #[test]
    fn client_ip_falls_back_to_unknown() {
        assert_eq!(client_ip(&headers(&[])), "unknown");
        assert_eq!(
            client_ip(&headers(&[("x-client-ip", "203.0.113.7")])),
            "203.0.113.7"
        );
        assert_eq!(
            client_ip(&headers(&[("x-client-ip", "2001:db8::42")])),
            "2001:db8::42"
        );
    }
}
