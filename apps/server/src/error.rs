use crate::i18n::{compression, CompressionDetail, Lang, Msg};
use axum::{
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Validation {
        message: Msg,
        lang: Lang,
    },
    FileTooLarge {
        size: u64,
        max_size: u64,
        lang: Lang,
    },
    NotFound {
        message: Msg,
        lang: Lang,
    },
    Unauthorized {
        message: Msg,
        lang: Lang,
    },
    Forbidden {
        message: Msg,
        lang: Lang,
    },
    QuotaExceeded {
        resets_at: DateTime<Utc>,
        lang: Lang,
    },
    RateLimited {
        message: Msg,
        lang: Lang,
    },
    Unavailable {
        message: Msg,
        lang: Lang,
    },
    Upscale {
        detail: String,
        lang: Lang,
    },
    UpscaleQueueFull {
        depth: i64,
        retry_after_secs: i64,
        lang: Lang,
    },
    UpscaleOutputTooLarge {
        size: u64,
        max_size: u64,
        lang: Lang,
    },
    Internal(String),
    Compression {
        detail: CompressionDetail,
        lang: Lang,
    },
    Config(String),
}

impl AppError {
    pub fn validation(message: Msg, lang: Lang) -> Self {
        Self::Validation { message, lang }
    }

    pub fn file_too_large(size: u64, max_size: u64, lang: Lang) -> Self {
        Self::FileTooLarge {
            size,
            max_size,
            lang,
        }
    }

    pub fn not_found(message: Msg, lang: Lang) -> Self {
        Self::NotFound { message, lang }
    }

    pub fn unauthorized(message: Msg, lang: Lang) -> Self {
        Self::Unauthorized { message, lang }
    }

    pub fn forbidden(message: Msg, lang: Lang) -> Self {
        Self::Forbidden { message, lang }
    }

    pub fn quota_exceeded(resets_at: DateTime<Utc>, lang: Lang) -> Self {
        Self::QuotaExceeded { resets_at, lang }
    }

    pub fn rate_limited(message: Msg, lang: Lang) -> Self {
        Self::RateLimited { message, lang }
    }

    pub fn unavailable(message: Msg, lang: Lang) -> Self {
        Self::Unavailable { message, lang }
    }

    pub fn upscale(detail: String, lang: Lang) -> Self {
        Self::Upscale { detail, lang }
    }

    pub fn upscale_queue_full(depth: i64, retry_after_secs: i64, lang: Lang) -> Self {
        Self::UpscaleQueueFull {
            depth,
            retry_after_secs,
            lang,
        }
    }

    pub fn upscale_output_too_large(size: u64, max_size: u64, lang: Lang) -> Self {
        Self::UpscaleOutputTooLarge {
            size,
            max_size,
            lang,
        }
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }

    pub fn compression(detail: CompressionDetail) -> Self {
        Self::Compression {
            detail,
            lang: Lang::default(),
        }
    }

    pub fn with_lang(self, lang: Lang) -> Self {
        match self {
            AppError::Validation { message, .. } => AppError::Validation { message, lang },
            AppError::FileTooLarge { size, max_size, .. } => AppError::FileTooLarge {
                size,
                max_size,
                lang,
            },
            AppError::NotFound { message, .. } => AppError::NotFound { message, lang },
            AppError::Unauthorized { message, .. } => AppError::Unauthorized { message, lang },
            AppError::Forbidden { message, .. } => AppError::Forbidden { message, lang },
            AppError::QuotaExceeded { resets_at, .. } => {
                AppError::QuotaExceeded { resets_at, lang }
            }
            AppError::RateLimited { message, .. } => AppError::RateLimited { message, lang },
            AppError::Unavailable { message, .. } => AppError::Unavailable { message, lang },
            AppError::Upscale { detail, .. } => AppError::Upscale { detail, lang },
            AppError::UpscaleQueueFull {
                depth,
                retry_after_secs,
                ..
            } => AppError::UpscaleQueueFull {
                depth,
                retry_after_secs,
                lang,
            },
            AppError::UpscaleOutputTooLarge { size, max_size, .. } => {
                AppError::UpscaleOutputTooLarge {
                    size,
                    max_size,
                    lang,
                }
            }
            AppError::Compression { detail, .. } => AppError::Compression { detail, lang },
            other => other,
        }
    }

    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::Validation { .. } => StatusCode::BAD_REQUEST,
            AppError::FileTooLarge { .. } => StatusCode::PAYLOAD_TOO_LARGE,
            AppError::NotFound { .. } => StatusCode::NOT_FOUND,
            AppError::Unauthorized { .. } => StatusCode::UNAUTHORIZED,
            AppError::Forbidden { .. } => StatusCode::FORBIDDEN,
            AppError::QuotaExceeded { .. } | AppError::RateLimited { .. } => {
                StatusCode::TOO_MANY_REQUESTS
            }
            AppError::Unavailable { .. } => StatusCode::SERVICE_UNAVAILABLE,
            AppError::Upscale { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::UpscaleQueueFull { .. } => StatusCode::TOO_MANY_REQUESTS,
            AppError::UpscaleOutputTooLarge { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Internal(_) | AppError::Compression { .. } | AppError::Config(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    pub fn error_code(&self) -> i32 {
        use crate::response::codes;
        match self {
            AppError::Validation { .. } => codes::PARAM_ERROR,
            AppError::FileTooLarge { .. } => codes::FILE_TOO_LARGE,
            AppError::NotFound { .. } => codes::TASK_NOT_FOUND,
            AppError::Unauthorized { .. } => codes::UNAUTHORIZED,
            AppError::Forbidden { .. } => codes::FORBIDDEN,
            AppError::QuotaExceeded { .. } | AppError::RateLimited { .. } => codes::QUOTA_EXCEEDED,
            AppError::Unavailable { .. } => codes::SERVICE_UNAVAILABLE,
            AppError::Upscale { .. } => codes::THIRD_PARTY_ERROR,
            AppError::UpscaleQueueFull { .. } => codes::UPSCALE_QUEUE_FULL,
            AppError::UpscaleOutputTooLarge { .. } => codes::UPSCALE_OUTPUT_TOO_LARGE,
            AppError::Internal(_) => codes::SERVER_ERROR,
            AppError::Compression { .. } => codes::THIRD_PARTY_ERROR,
            AppError::Config(_) => codes::SERVER_ERROR,
        }
    }

    pub fn message(&self) -> String {
        match self {
            AppError::Validation { message, lang } => message.render(*lang),
            AppError::FileTooLarge {
                size,
                max_size,
                lang,
            } => {
                let size_mb = *size as f64 / (1024.0 * 1024.0);
                let max_size_mb = *max_size as f64 / (1024.0 * 1024.0);
                if *size == 0 {
                    Msg::FileTooLargeMissingSize { max_size_mb }.render(*lang)
                } else {
                    Msg::FileTooLarge {
                        size_mb,
                        max_size_mb,
                    }
                    .render(*lang)
                }
            }
            AppError::NotFound { message, lang } => message.render(*lang),
            AppError::Unauthorized { message, lang } => message.render(*lang),
            AppError::Forbidden { message, lang } => message.render(*lang),
            AppError::QuotaExceeded { resets_at, lang } => Msg::QuotaExceeded {
                resets_at: resets_at.to_rfc3339(),
            }
            .render(*lang),
            AppError::RateLimited { message, lang } => message.render(*lang),
            AppError::Unavailable { message, lang } => message.render(*lang),
            AppError::Upscale { detail, lang } => Msg::UpscaleFailed {
                detail: detail.clone(),
            }
            .render(*lang),
            AppError::UpscaleQueueFull {
                depth,
                retry_after_secs,
                lang,
            } => Msg::UpscaleQueueFull {
                depth: *depth,
                retry_after_secs: *retry_after_secs,
            }
            .render(*lang),
            AppError::UpscaleOutputTooLarge {
                size,
                max_size,
                lang,
            } => Msg::UpscaleOutputTooLarge {
                size_mb: *size as f64 / (1024.0 * 1024.0),
                max_size_mb: *max_size as f64 / (1024.0 * 1024.0),
            }
            .render(*lang),
            AppError::Internal(msg) => format!("内部错误: {}", msg),
            AppError::Compression { detail, lang } => Msg::CompressionFailed {
                detail: detail.render(*lang),
            }
            .render(*lang),
            AppError::Config(msg) => format!("配置错误: {}", msg),
        }
    }

    fn data(&self) -> Option<serde_json::Value> {
        match self {
            AppError::QuotaExceeded { resets_at, .. } => Some(serde_json::json!({
                "resets_at": resets_at.to_rfc3339(),
                "remaining": 0,
            })),
            AppError::UpscaleQueueFull {
                depth,
                retry_after_secs,
                ..
            } => Some(serde_json::json!({
                "queue_depth": depth,
                "retry_after": retry_after_secs,
            })),
            _ => None,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        if matches!(self, AppError::Internal(_) | AppError::Config(_)) {
            tracing::error!(error = %self.message(), "request failed");
        }
        let retry_after = match self {
            AppError::UpscaleQueueFull {
                retry_after_secs, ..
            } => Some(retry_after_secs),
            _ => None,
        };
        let error_response = match self.data() {
            Some(data) => crate::response::ApiResponseError::with_data(
                self.error_code(),
                self.message(),
                data,
            ),
            None => crate::response::ApiResponseError::error(self.error_code(), self.message()),
        };
        let mut response = (status, Json(error_response)).into_response();
        if let Some(secs) = retry_after {
            if let Ok(value) = HeaderValue::from_str(&secs.to_string()) {
                response.headers_mut().insert(header::RETRY_AFTER, value);
            }
        }
        response
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Internal(format!("IO错误: {}", err))
    }
}

impl From<config::ConfigError> for AppError {
    fn from(err: config::ConfigError) -> Self {
        AppError::Config(err.to_string())
    }
}

impl From<CompressionDetail> for AppError {
    fn from(detail: CompressionDetail) -> Self {
        AppError::compression(detail)
    }
}

impl From<image::ImageError> for AppError {
    fn from(err: image::ImageError) -> Self {
        AppError::compression(compression::image_process(err))
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Internal(format!("数据库错误: {}", err))
    }
}

impl From<object_store::Error> for AppError {
    fn from(err: object_store::Error) -> Self {
        AppError::Internal(format!("对象存储错误: {}", err))
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message())
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_too_large_messages_follow_language() {
        let zh = AppError::file_too_large(6 * 1024 * 1024, 5 * 1024 * 1024, Lang::Zh).message();
        assert_eq!(
            zh,
            "文件大小 6.00 MB 超过最大限制 5.00 MB，请上传小于 5.00 MB 的文件"
        );
        let en = AppError::file_too_large(6 * 1024 * 1024, 5 * 1024 * 1024, Lang::En).message();
        assert_eq!(
            en,
            "The file is 6.00 MB, over the 5.00 MB limit; please upload a file smaller than 5.00 MB"
        );
        let unknown = AppError::file_too_large(0, 50 * 1024 * 1024, Lang::En).message();
        assert!(unknown.contains("The file exceeds the 50.00 MB limit"));
    }

    #[test]
    fn with_lang_relocalizes_user_facing_variants_only() {
        let resets_at = DateTime::parse_from_rfc3339("2026-10-01T00:00:00+08:00")
            .unwrap()
            .with_timezone(&Utc);
        let en = AppError::quota_exceeded(resets_at, Lang::Zh)
            .with_lang(Lang::En)
            .message();
        assert!(en.contains("resets at 2026-09-30T16:00:00+00:00"), "{en}");

        let internal = AppError::internal("数据库错误: boom")
            .with_lang(Lang::En)
            .message();
        assert_eq!(internal, "内部错误: 数据库错误: boom");

        let zh_compression = AppError::compression(compression::gif_encode("boom")).message();
        assert_eq!(zh_compression, "压缩失败: GIF 编码失败: boom");

        let en_compression = AppError::compression(compression::gif_quantize(
            compression::quantize_palette_mismatch(),
        ))
        .with_lang(Lang::En)
        .message();
        assert_eq!(
            en_compression,
            "Compression failed: GIF quantization failed: Frames produced inconsistent palettes"
        );

        let nested = AppError::compression(compression::png_encode(compression::png_smart_encode(
            "unexpected end of file",
        )))
        .with_lang(Lang::En)
        .message();
        assert_eq!(
            nested,
            "Compression failed: PNG encoding failed: PNG encoding failed: unexpected end of file"
        );
        assert!(!nested
            .chars()
            .any(|c| matches!(c, '\u{3000}'..='\u{303f}' | '\u{4e00}'..='\u{9fff}' | '\u{ff00}'..='\u{ffef}')));
    }
}
