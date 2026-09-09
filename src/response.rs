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
    pub const SUCCESS: i32 = 0;
    pub const PARAM_ERROR: i32 = 1001;
    pub const FILE_TOO_LARGE: i32 = 1004;
    pub const AUTH_FAILED: i32 = 1002;
    pub const PERMISSION_DENIED: i32 = 1003;
    pub const SERVER_ERROR: i32 = 2001;
    pub const THIRD_PARTY_ERROR: i32 = 2002;
    pub const USER_NOT_FOUND: i32 = 3001;
    pub const DATA_EXISTS: i32 = 3002;
    pub const TASK_NOT_FOUND: i32 = 3003;
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
}
