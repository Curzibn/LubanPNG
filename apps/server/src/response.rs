use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiResponse<T> {
    #[schema(example = 0)]
    pub code: i32,
    #[schema(example = "success")]
    pub msg: String,
    pub data: T,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            code: 0,
            msg: "success".to_string(),
            data,
        }
    }
}

pub mod codes {
    pub const PARAM_ERROR: i32 = 1001;
    pub const FILE_TOO_LARGE: i32 = 1004;
    pub const SERVER_ERROR: i32 = 2001;
    pub const THIRD_PARTY_ERROR: i32 = 2002;
    pub const SERVICE_UNAVAILABLE: i32 = 2003;
    pub const TASK_NOT_FOUND: i32 = 3003;
    pub const UNAUTHORIZED: i32 = 4001;
    pub const FORBIDDEN: i32 = 4002;
    pub const QUOTA_EXCEEDED: i32 = 4003;
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiResponseError {
    #[schema(example = 1001)]
    pub code: i32,
    #[schema(example = "错误信息")]
    pub msg: String,
    #[schema(nullable = true)]
    pub data: Option<serde_json::Value>,
}

impl ApiResponseError {
    pub fn error(code: i32, msg: String) -> Self {
        Self {
            code,
            msg,
            data: None,
        }
    }

    pub fn with_data(code: i32, msg: String, data: serde_json::Value) -> Self {
        Self {
            code,
            msg,
            data: Some(data),
        }
    }
}
