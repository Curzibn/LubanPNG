use crate::app::AppState;
use crate::error::AppError;
use crate::handlers::extract::ClientMeta;
use crate::response::{ApiResponse, ApiResponseError};
use axum::extract::State;
use axum::http::header::SET_COOKIE;
use axum::http::HeaderMap;
use axum::response::{AppendHeaders, IntoResponse, Response};
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

#[derive(Deserialize, ToSchema)]
pub struct OtpRequest {
    #[schema(example = "you@example.com")]
    pub email: String,
}

#[derive(Serialize, ToSchema)]
pub struct OtpResponse {
    pub sent: bool,
    #[schema(example = 600)]
    pub expires_in: i64,
    #[schema(example = 60)]
    pub resend_after: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct VerifyRequest {
    #[schema(example = "you@example.com")]
    pub email: String,
    #[schema(example = "482913")]
    pub code: String,
}

#[derive(Serialize, ToSchema)]
pub struct VerifyResponse {
    pub email: String,
    #[schema(example = "free")]
    pub plan_id: String,
    pub created: bool,
}

#[derive(Serialize, ToSchema)]
pub struct OkResponse {
    pub ok: bool,
}

#[utoipa::path(
    post,
    path = "/v1/auth/otp",
    tag = "账号",
    request_body = OtpRequest,
    responses(
        (status = 200, description = "验证码已发送", body = ApiResponse<OtpResponse>),
        (status = 400, description = "邮箱无效", body = ApiResponseError),
        (status = 429, description = "发送过于频繁", body = ApiResponseError),
        (status = 503, description = "邮件服务未配置", body = ApiResponseError),
    )
)]
pub async fn request_otp(
    State(state): State<Arc<AppState>>,
    Extension(meta): Extension<ClientMeta>,
    Json(body): Json<OtpRequest>,
) -> Result<Json<ApiResponse<OtpResponse>>, AppError> {
    let issued = state.auth.request_code(&body.email, &meta.ip).await?;
    Ok(Json(ApiResponse::success(OtpResponse {
        sent: true,
        expires_in: issued.expires_in,
        resend_after: issued.resend_after,
    })))
}

#[utoipa::path(
    post,
    path = "/v1/auth/verify",
    tag = "账号",
    request_body = VerifyRequest,
    responses(
        (status = 200, description = "登录成功，响应设置会话 Cookie", body = ApiResponse<VerifyResponse>),
        (status = 400, description = "验证码错误或过期", body = ApiResponseError),
        (status = 429, description = "错误次数过多", body = ApiResponseError),
    )
)]
pub async fn verify_otp(
    State(state): State<Arc<AppState>>,
    Json(body): Json<VerifyRequest>,
) -> Result<Response, AppError> {
    let (token, account, created) = state.auth.verify_code(&body.email, &body.code).await?;
    let response = ApiResponse::success(VerifyResponse {
        email: account.email,
        plan_id: account.plan_id,
        created,
    });
    Ok((
        AppendHeaders([(SET_COOKIE, state.auth.session_cookie(&token))]),
        Json(response),
    )
        .into_response())
}

#[utoipa::path(
    post,
    path = "/v1/auth/logout",
    tag = "账号",
    responses(
        (status = 200, description = "已注销", body = ApiResponse<OkResponse>),
    )
)]
pub async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    state.auth.logout(&headers).await?;
    Ok((
        AppendHeaders([(SET_COOKIE, state.auth.clear_session_cookie())]),
        Json(ApiResponse::success(OkResponse { ok: true })),
    )
        .into_response())
}
