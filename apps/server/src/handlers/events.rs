use crate::app::AppState;
use crate::domain::subject::Subject;
use crate::error::AppError;
use crate::handlers::auth::OkResponse;
use crate::handlers::extract::ClientMeta;
use crate::repositories::visit_repository::VisitInput;
use crate::response::{ApiResponse, ApiResponseError};
use axum::extract::State;
use axum::http::header::USER_AGENT;
use axum::http::HeaderMap;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::sync::Arc;
use utoipa::ToSchema;

#[derive(Deserialize, ToSchema)]
pub struct VisitRequest {
    #[schema(example = "/pricing")]
    pub path: String,
    #[schema(example = "www.v2ex.com")]
    pub referrer_host: Option<String>,
    #[schema(example = "v2ex")]
    pub utm_source: Option<String>,
    #[schema(example = "post")]
    pub utm_medium: Option<String>,
    #[schema(example = "cli-launch")]
    pub utm_campaign: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct WaitlistRequest {
    #[schema(example = "pro")]
    pub plan_id: String,
}

#[derive(Serialize, ToSchema)]
pub struct WaitlistView {
    #[schema(example = "pro")]
    pub plan_id: String,
    pub created_at: String,
}

fn clean(value: &str, max: usize) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(max).collect())
}

fn parse_ip(raw: &str) -> Option<String> {
    raw.trim().parse::<IpAddr>().ok().map(|ip| ip.to_string())
}

#[utoipa::path(
    post,
    path = "/v1/events/visit",
    tag = "埋点",
    request_body = VisitRequest,
    responses(
        (status = 200, description = "访问事件已记录", body = ApiResponse<OkResponse>),
        (status = 400, description = "参数错误", body = ApiResponseError),
    )
)]
pub async fn record_visit(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
    Extension(meta): Extension<ClientMeta>,
    headers: HeaderMap,
    Json(body): Json<VisitRequest>,
) -> Result<Json<ApiResponse<OkResponse>>, AppError> {
    let path = clean(&body.path, 512).ok_or_else(|| AppError::validation("path 不能为空"))?;
    let referrer_host = clean(body.referrer_host.as_deref().unwrap_or(""), 255);
    let utm_source = clean(body.utm_source.as_deref().unwrap_or(""), 255);
    let utm_medium = clean(body.utm_medium.as_deref().unwrap_or(""), 255);
    let utm_campaign = clean(body.utm_campaign.as_deref().unwrap_or(""), 255);
    let user_agent = headers
        .get(USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| clean(value, 512));
    let ip = parse_ip(&meta.ip);

    let input = VisitInput {
        path: &path,
        referrer_host: referrer_host.as_deref(),
        utm_source: utm_source.as_deref(),
        utm_medium: utm_medium.as_deref(),
        utm_campaign: utm_campaign.as_deref(),
    };
    state
        .visits
        .record(&subject, ip.as_deref(), user_agent.as_deref(), &input)
        .await?;
    Ok(Json(ApiResponse::success(OkResponse { ok: true })))
}

#[utoipa::path(
    post,
    path = "/v1/me/waitlist",
    tag = "账号",
    request_body = WaitlistRequest,
    responses(
        (status = 200, description = "已加入等待名单，重复提交幂等", body = ApiResponse<WaitlistView>),
        (status = 400, description = "plan_id 无效", body = ApiResponseError),
        (status = 401, description = "未登录", body = ApiResponseError),
    )
)]
pub async fn join_waitlist(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
    Json(body): Json<WaitlistRequest>,
) -> Result<Json<ApiResponse<WaitlistView>>, AppError> {
    if !subject.is_account() {
        return Err(AppError::unauthorized("请先登录"));
    }
    let plan_id =
        clean(&body.plan_id, 40).ok_or_else(|| AppError::validation("plan_id 不能为空"))?;
    let row = state.waitlist.upsert(subject.id, &plan_id).await?;
    Ok(Json(ApiResponse::success(WaitlistView {
        plan_id: row.plan_id,
        created_at: row.created_at.to_rfc3339(),
    })))
}
