use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Validation(String),
    FileTooLarge { size: u64, max_size: u64 },
    NotFound(String),
    Unauthorized(String),
    Forbidden(String),
    QuotaExceeded { resets_at: DateTime<Utc> },
    RateLimited(String),
    Unavailable(String),
    Internal(String),
    Compression(String),
    Config(String),
}

impl AppError {
    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }

    pub fn file_too_large(size: u64, max_size: u64) -> Self {
        Self::FileTooLarge { size, max_size }
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }

    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self::Unauthorized(msg.into())
    }

    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self::Forbidden(msg.into())
    }

    pub fn rate_limited(msg: impl Into<String>) -> Self {
        Self::RateLimited(msg.into())
    }

    pub fn unavailable(msg: impl Into<String>) -> Self {
        Self::Unavailable(msg.into())
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }

    pub fn compression(msg: impl Into<String>) -> Self {
        Self::Compression(msg.into())
    }

    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            AppError::FileTooLarge { .. } => StatusCode::PAYLOAD_TOO_LARGE,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,
            AppError::QuotaExceeded { .. } | AppError::RateLimited(_) => {
                StatusCode::TOO_MANY_REQUESTS
            }
            AppError::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            AppError::Internal(_) | AppError::Compression(_) | AppError::Config(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    pub fn error_code(&self) -> i32 {
        use crate::response::codes;
        match self {
            AppError::Validation(_) => codes::PARAM_ERROR,
            AppError::FileTooLarge { .. } => codes::FILE_TOO_LARGE,
            AppError::NotFound(_) => codes::TASK_NOT_FOUND,
            AppError::Unauthorized(_) => codes::UNAUTHORIZED,
            AppError::Forbidden(_) => codes::FORBIDDEN,
            AppError::QuotaExceeded { .. } | AppError::RateLimited(_) => codes::QUOTA_EXCEEDED,
            AppError::Unavailable(_) => codes::SERVICE_UNAVAILABLE,
            AppError::Internal(_) => codes::SERVER_ERROR,
            AppError::Compression(_) => codes::THIRD_PARTY_ERROR,
            AppError::Config(_) => codes::SERVER_ERROR,
        }
    }

    pub fn message(&self) -> String {
        match self {
            AppError::Validation(msg) => msg.clone(),
            AppError::FileTooLarge { size, max_size } => {
                let size_mb = *size as f64 / (1024.0 * 1024.0);
                let max_size_mb = *max_size as f64 / (1024.0 * 1024.0);
                if *size == 0 {
                    format!(
                        "文件超过最大限制 {:.2} MB，请上传小于 {:.2} MB 的文件",
                        max_size_mb, max_size_mb
                    )
                } else {
                    format!(
                        "文件大小 {:.2} MB 超过最大限制 {:.2} MB，请上传小于 {:.2} MB 的文件",
                        size_mb, max_size_mb, max_size_mb
                    )
                }
            }
            AppError::NotFound(msg) => msg.clone(),
            AppError::Unauthorized(msg) => msg.clone(),
            AppError::Forbidden(msg) => msg.clone(),
            AppError::QuotaExceeded { resets_at } => {
                format!("本期额度已用完，{} 重置", resets_at.to_rfc3339())
            }
            AppError::RateLimited(msg) => msg.clone(),
            AppError::Unavailable(msg) => msg.clone(),
            AppError::Internal(msg) => format!("内部错误: {}", msg),
            AppError::Compression(msg) => format!("压缩失败: {}", msg),
            AppError::Config(msg) => format!("配置错误: {}", msg),
        }
    }

    fn data(&self) -> Option<serde_json::Value> {
        match self {
            AppError::QuotaExceeded { resets_at } => Some(serde_json::json!({
                "resets_at": resets_at.to_rfc3339(),
                "remaining": 0,
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
        let error_response = match self.data() {
            Some(data) => crate::response::ApiResponseError::with_data(
                self.error_code(),
                self.message(),
                data,
            ),
            None => crate::response::ApiResponseError::error(self.error_code(), self.message()),
        };
        (status, Json(error_response)).into_response()
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

impl From<image::ImageError> for AppError {
    fn from(err: image::ImageError) -> Self {
        AppError::compression(format!("图片处理错误: {}", err))
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
