use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Validation(String),
    FileTooLarge { size: u64, max_size: u64 },
    NotFound(String),
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
            AppError::Internal(_) | AppError::Compression(_) | AppError::Config(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    pub fn error_code(&self) -> i32 {
        match self {
            AppError::Validation(_) => crate::response::codes::PARAM_ERROR,
            AppError::FileTooLarge { .. } => crate::response::codes::FILE_TOO_LARGE,
            AppError::NotFound(_) => crate::response::codes::TASK_NOT_FOUND,
            AppError::Internal(_) => crate::response::codes::SERVER_ERROR,
            AppError::Compression(_) => crate::response::codes::THIRD_PARTY_ERROR,
            AppError::Config(_) => crate::response::codes::SERVER_ERROR,
        }
    }

    pub fn message(&self) -> String {
        match self {
            AppError::Validation(msg) => msg.clone(),
            AppError::FileTooLarge { size, max_size } => {
                let size_mb = *size as f64 / (1024.0 * 1024.0);
                let max_size_mb = *max_size as f64 / (1024.0 * 1024.0);
                format!(
                    "文件大小 {} MB 超过最大限制 {} MB，请上传小于 {} MB 的文件",
                    format!("{:.2}", size_mb),
                    format!("{:.2}", max_size_mb),
                    format!("{:.2}", max_size_mb)
                )
            }
            AppError::NotFound(msg) => msg.clone(),
            AppError::Internal(msg) => format!("内部错误: {}", msg),
            AppError::Compression(msg) => format!("压缩失败: {}", msg),
            AppError::Config(msg) => format!("配置错误: {}", msg),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let error_response = crate::response::ApiResponseError::error(
            self.error_code(),
            self.message(),
        );
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

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message())
    }
}

pub type AppResult<T> = Result<T, AppError>;
