use crate::config::UpscalerConfig;
use async_trait::async_trait;
use axum::http::{header, Method, Request, Response, StatusCode, Uri};
use bytes::Bytes;
use http_body_util::Full;
use http_body_util::{BodyExt, Limited};
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub enum UpscaleFailure {
    Busy,
    SourceInvalid(String),
    PlatformUnavailable(String),
    InferenceTimeout(String),
    OutputTooLarge(String),
}

impl UpscaleFailure {
    pub fn render(&self, lang: crate::i18n::Lang) -> String {
        use crate::i18n::Lang;
        match (self, lang) {
            (UpscaleFailure::Busy, Lang::Zh) => "GPU 繁忙".to_string(),
            (UpscaleFailure::Busy, Lang::En) => "GPU busy".to_string(),
            (UpscaleFailure::SourceInvalid(detail), Lang::Zh) => {
                format!("输入图片无效: {}", detail)
            }
            (UpscaleFailure::SourceInvalid(detail), Lang::En) => {
                format!("Invalid source image: {}", detail)
            }
            (UpscaleFailure::PlatformUnavailable(detail), Lang::Zh) => {
                format!("放大服务不可用: {}", detail)
            }
            (UpscaleFailure::PlatformUnavailable(detail), Lang::En) => {
                format!("Upscaling service unavailable: {}", detail)
            }
            (UpscaleFailure::InferenceTimeout(detail), Lang::Zh) => {
                format!("放大推理超时: {}", detail)
            }
            (UpscaleFailure::InferenceTimeout(detail), Lang::En) => {
                format!("Upscaling inference timed out: {}", detail)
            }
            (UpscaleFailure::OutputTooLarge(detail), Lang::Zh) => {
                format!("放大产物超过大小上限: {}", detail)
            }
            (UpscaleFailure::OutputTooLarge(detail), Lang::En) => {
                format!("The upscaled image exceeds the size limit: {}", detail)
            }
        }
    }

    pub fn is_busy(&self) -> bool {
        matches!(self, UpscaleFailure::Busy)
    }
}

pub struct UpscaleOutput {
    pub data: Bytes,
    pub width: Option<u64>,
    pub height: Option<u64>,
}

#[async_trait]
pub trait Upscaler: Send + Sync {
    async fn health(&self) -> Result<(), UpscaleFailure>;
    async fn upscale(
        &self,
        data: Bytes,
        factor: u32,
        timeout: Duration,
    ) -> Result<UpscaleOutput, UpscaleFailure>;
}

pub struct DisabledUpscaler;

#[async_trait]
impl Upscaler for DisabledUpscaler {
    async fn health(&self) -> Result<(), UpscaleFailure> {
        Err(UpscaleFailure::PlatformUnavailable(
            "upscaler disabled".to_string(),
        ))
    }

    async fn upscale(
        &self,
        _data: Bytes,
        _factor: u32,
        _timeout: Duration,
    ) -> Result<UpscaleOutput, UpscaleFailure> {
        Err(UpscaleFailure::PlatformUnavailable(
            "upscaler disabled".to_string(),
        ))
    }
}

pub struct Mg2Upscaler {
    client: Client<hyper_util::client::legacy::connect::HttpConnector, Full<Bytes>>,
    endpoint: String,
    token: String,
    health_timeout: Duration,
    max_output_bytes: usize,
}

impl Mg2Upscaler {
    pub fn new(config: &UpscalerConfig) -> Self {
        Self {
            client: Client::builder(TokioExecutor::new()).build_http(),
            endpoint: config.endpoint.trim_end_matches('/').to_string(),
            token: config.token.clone(),
            health_timeout: Duration::from_secs(config.health_timeout_secs.max(1)),
            max_output_bytes: config.max_output_bytes,
        }
    }

    async fn send(
        &self,
        request: Request<Full<Bytes>>,
        timeout: Duration,
    ) -> Result<Response<hyper::body::Incoming>, UpscaleFailure> {
        let mut attempt = self.client.request(request);
        match tokio::time::timeout(timeout, &mut attempt).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(err)) => Err(UpscaleFailure::PlatformUnavailable(err.to_string())),
            Err(_) => Err(UpscaleFailure::InferenceTimeout(format!(
                "no response within {}s",
                timeout.as_secs()
            ))),
        }
    }
}

fn error_code(body: &[u8]) -> Option<String> {
    serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("error")?
                .get("code")?
                .as_str()
                .map(str::to_string)
        })
}

#[async_trait]
impl Upscaler for Mg2Upscaler {
    async fn health(&self) -> Result<(), UpscaleFailure> {
        let uri = format!("{}/healthz", self.endpoint)
            .parse::<Uri>()
            .map_err(|err| UpscaleFailure::PlatformUnavailable(err.to_string()))?;
        let request = Request::builder()
            .method(Method::GET)
            .uri(uri)
            .header(header::AUTHORIZATION, format!("Bearer {}", self.token))
            .body(Full::new(Bytes::new()))
            .map_err(|err| UpscaleFailure::PlatformUnavailable(err.to_string()))?;
        let response = self.send(request, self.health_timeout).await?;
        if response.status() != StatusCode::OK {
            return Err(UpscaleFailure::PlatformUnavailable(format!(
                "healthz returned {}",
                response.status()
            )));
        }
        let body = response
            .into_body()
            .collect()
            .await
            .map_err(|err| UpscaleFailure::PlatformUnavailable(err.to_string()))?
            .to_bytes();
        let ok = serde_json::from_slice::<serde_json::Value>(&body)
            .ok()
            .and_then(|value| value.get("ok").and_then(serde_json::Value::as_bool))
            .unwrap_or(false);
        if ok {
            Ok(())
        } else {
            Err(UpscaleFailure::PlatformUnavailable(
                "healthz reported not ok".to_string(),
            ))
        }
    }

    async fn upscale(
        &self,
        data: Bytes,
        factor: u32,
        timeout: Duration,
    ) -> Result<UpscaleOutput, UpscaleFailure> {
        let uri = format!("{}/upscale?scale={}", self.endpoint, factor)
            .parse::<Uri>()
            .map_err(|err| UpscaleFailure::PlatformUnavailable(err.to_string()))?;
        let request = Request::builder()
            .method(Method::POST)
            .uri(uri)
            .header(header::AUTHORIZATION, format!("Bearer {}", self.token))
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .header(header::ACCEPT, "image/png")
            .body(Full::new(data))
            .map_err(|err| UpscaleFailure::PlatformUnavailable(err.to_string()))?;
        let response = self.send(request, timeout).await?;
        let status = response.status();
        if status != StatusCode::OK {
            let body = response
                .into_body()
                .collect()
                .await
                .map_err(|err| UpscaleFailure::PlatformUnavailable(err.to_string()))?
                .to_bytes();
            let code = error_code(&body).unwrap_or_else(|| status.to_string());
            return Err(match status {
                StatusCode::SERVICE_UNAVAILABLE => UpscaleFailure::Busy,
                StatusCode::BAD_REQUEST => UpscaleFailure::SourceInvalid(code),
                StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT => {
                    UpscaleFailure::InferenceTimeout(code)
                }
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                    UpscaleFailure::PlatformUnavailable(code)
                }
                other => UpscaleFailure::PlatformUnavailable(format!("{} {}", other, code)),
            });
        }
        let width = response
            .headers()
            .get("x-output-width")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        let height = response
            .headers()
            .get("x-output-height")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        let capped = Limited::new(
            response.into_body(),
            self.max_output_bytes.saturating_add(1),
        );
        let data = match capped.collect().await {
            Ok(collected) => {
                let data = collected.to_bytes();
                if data.len() > self.max_output_bytes {
                    return Err(UpscaleFailure::OutputTooLarge(format!(
                        "{} bytes",
                        data.len()
                    )));
                }
                data
            }
            Err(err) => {
                return Err(UpscaleFailure::OutputTooLarge(format!(
                    "response body read failed at the size cap: {}",
                    err
                )))
            }
        };
        Ok(UpscaleOutput {
            data,
            width,
            height,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::Lang;

    #[test]
    fn failure_rendering_follows_language() {
        let zh = UpscaleFailure::SourceInvalid("invalid_source".to_string()).render(Lang::Zh);
        assert_eq!(zh, "输入图片无效: invalid_source");
        let en = UpscaleFailure::InferenceTimeout("inference_timeout".to_string()).render(Lang::En);
        assert_eq!(en, "Upscaling inference timed out: inference_timeout");
        assert!(UpscaleFailure::Busy.is_busy());
        assert!(!UpscaleFailure::PlatformUnavailable("x".to_string()).is_busy());
    }

    #[test]
    fn error_code_reads_nested_code_field() {
        let body = br#"{"error":{"code":"gpu_unavailable"}}"#;
        assert_eq!(error_code(body).as_deref(), Some("gpu_unavailable"));
        assert_eq!(error_code(b"not json"), None);
    }
}
