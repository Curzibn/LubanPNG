use crate::app::AppState;
use crate::domain::subject::Subject;
use crate::error::AppError;
use crate::handlers::auth::OkResponse;
use crate::repositories::identity_repository::ApiKeyRow;
use crate::response::{ApiResponse, ApiResponseError};
use crate::services::compression::TaskStatusView;
use axum::extract::{Path, State};
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, ToSchema)]
pub struct PlanView {
    #[schema(example = "free")]
    pub id: String,
    #[schema(example = "免费")]
    pub name: String,
    #[schema(example = "month")]
    pub period: String,
    #[schema(example = 50)]
    pub quota: i32,
    #[schema(example = 5242880)]
    pub max_file_size: i64,
    #[schema(example = 24)]
    pub retention_hours: i32,
    #[schema(example = 1)]
    pub max_api_keys: i32,
}

#[derive(Serialize, ToSchema)]
pub struct QuotaView {
    #[schema(example = "2026-09")]
    pub period_key: String,
    #[schema(example = 50)]
    pub limit: i32,
    #[schema(example = 7)]
    pub used: i32,
    #[schema(example = 0)]
    pub held: i32,
    #[schema(example = 43)]
    pub remaining: i32,
    #[schema(example = "2026-10-01T00:00:00+08:00")]
    pub resets_at: String,
}

#[derive(Serialize, ToSchema)]
pub struct MeView {
    #[schema(example = "account")]
    pub subject: String,
    pub email: Option<String>,
    pub plan: PlanView,
    pub quota: QuotaView,
}

#[derive(Serialize, ToSchema)]
pub struct ApiKeyView {
    pub id: String,
    pub name: String,
    #[schema(example = "lp_live_a8f3")]
    pub prefix: String,
    #[schema(example = "k2q9")]
    pub suffix: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct CreatedApiKeyView {
    pub id: String,
    pub name: String,
    pub key: String,
    pub prefix: String,
    pub suffix: String,
    pub created_at: String,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateApiKeyRequest {
    #[schema(example = "本机 CLI")]
    pub name: String,
}

fn api_key_view(row: &ApiKeyRow) -> ApiKeyView {
    ApiKeyView {
        id: row.id.to_string(),
        name: row.name.clone(),
        prefix: row.prefix.clone(),
        suffix: row.suffix.clone(),
        created_at: row.created_at.to_rfc3339(),
        last_used_at: row.last_used_at.map(|t| t.to_rfc3339()),
    }
}

#[utoipa::path(
    get,
    path = "/v1/me",
    tag = "账号",
    responses(
        (status = 200, description = "当前身份、套餐与本期额度；未登录时返回匿名设备额度", body = ApiResponse<MeView>),
    ),
    security(("api_key" = []))
)]
pub async fn me(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
) -> Result<Json<ApiResponse<MeView>>, AppError> {
    let quota = state.quota.snapshot(&subject).await?;
    Ok(Json(ApiResponse::success(MeView {
        subject: subject.kind.as_str().to_string(),
        email: subject.email.clone(),
        plan: PlanView {
            id: subject.plan.id.clone(),
            name: subject.plan.name.clone(),
            period: subject.plan.period.clone(),
            quota: subject.plan.quota,
            max_file_size: subject.plan.max_file_size,
            retention_hours: subject.plan.retention_hours,
            max_api_keys: subject.plan.max_api_keys,
        },
        quota: QuotaView {
            period_key: quota.period_key,
            limit: quota.limit,
            used: quota.used,
            held: quota.held,
            remaining: quota.remaining,
            resets_at: quota.resets_at.to_rfc3339(),
        },
    })))
}

#[utoipa::path(
    get,
    path = "/v1/me/api-keys",
    tag = "账号",
    responses(
        (status = 200, description = "可用的 API Key 列表", body = ApiResponse<Vec<ApiKeyView>>),
        (status = 401, description = "未登录", body = ApiResponseError),
    )
)]
pub async fn list_api_keys(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
) -> Result<Json<ApiResponse<Vec<ApiKeyView>>>, AppError> {
    let rows = state.auth.list_api_keys(&subject).await?;
    Ok(Json(ApiResponse::success(
        rows.iter().map(api_key_view).collect(),
    )))
}

#[utoipa::path(
    post,
    path = "/v1/me/api-keys",
    tag = "账号",
    request_body = CreateApiKeyRequest,
    responses(
        (status = 200, description = "新建成功，完整 Key 只在此响应里出现一次", body = ApiResponse<CreatedApiKeyView>),
        (status = 400, description = "名称无效或已达套餐上限", body = ApiResponseError),
        (status = 401, description = "未登录", body = ApiResponseError),
    )
)]
pub async fn create_api_key(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
    Json(body): Json<CreateApiKeyRequest>,
) -> Result<Json<ApiResponse<CreatedApiKeyView>>, AppError> {
    let (row, key) = state.auth.create_api_key(&subject, &body.name).await?;
    Ok(Json(ApiResponse::success(CreatedApiKeyView {
        id: row.id.to_string(),
        name: row.name,
        key,
        prefix: row.prefix,
        suffix: row.suffix,
        created_at: row.created_at.to_rfc3339(),
    })))
}

#[utoipa::path(
    delete,
    path = "/v1/me/api-keys/{id}",
    tag = "账号",
    params(("id" = String, Path, description = "Key ID")),
    responses(
        (status = 200, description = "已吊销", body = ApiResponse<OkResponse>),
        (status = 404, description = "Key 不存在或已吊销", body = ApiResponseError),
    )
)]
pub async fn revoke_api_key(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<OkResponse>>, AppError> {
    let id = Uuid::parse_str(&id).map_err(|_| AppError::not_found("Key 不存在"))?;
    state.auth.revoke_api_key(&subject, id).await?;
    Ok(Json(ApiResponse::success(OkResponse { ok: true })))
}

#[utoipa::path(
    get,
    path = "/v1/me/tasks",
    tag = "账号",
    responses(
        (status = 200, description = "当前身份最近的压缩任务，最多 50 条", body = ApiResponse<Vec<TaskStatusView>>),
    ),
    security(("api_key" = []))
)]
pub async fn list_tasks(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
) -> Result<Json<ApiResponse<Vec<TaskStatusView>>>, AppError> {
    let views = state.compression.tasks_for(&subject).await?;
    Ok(Json(ApiResponse::success(views)))
}
