use crate::config::AppConfig;
use crate::error::AppError;
use crate::handlers;
use crate::infrastructure::compression::{
    AvifCompressionStrategy, CompressionStrategy, GifCompressionStrategy, JpegCompressionStrategy,
    PngCompressionStrategy, WebpCompressionStrategy,
};
use crate::infrastructure::mail::Mailer;
use crate::infrastructure::storage::ObjectStorage;
use crate::middleware;
use crate::repositories::identity_repository::IdentityRepository;
use crate::repositories::quota_repository::QuotaRepository;
use crate::repositories::rate_limit_repository::RateLimitRepository;
use crate::repositories::task_repository::TaskRepository;
use crate::repositories::visit_repository::VisitRepository;
use crate::repositories::waitlist_repository::WaitlistRepository;
use crate::response;
use crate::services::auth::AuthService;
use crate::services::compression::CompressionService;
use crate::services::quota::QuotaService;
use crate::services::worker;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{header, StatusCode, Uri};
use axum::middleware::from_fn_with_state;
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, post};
use axum::Router;
use image::ImageFormat;
use sqlx::PgPool;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::task::JoinHandle;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};
use utoipa::{Modify, OpenApi};
use utoipa_swagger_ui::SwaggerUi;

async fn unknown_api_path() -> AppError {
    AppError::not_found("接口不存在")
}

type SpaIndex = Arc<String>;

async fn serve_spa(uri: Uri, State(index): State<SpaIndex>) -> Response {
    let last_segment = uri.path().rsplit('/').next().unwrap_or_default();
    if last_segment.contains('.') {
        (
            StatusCode::NOT_FOUND,
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            String::from("Not Found"),
        )
            .into_response()
    } else {
        (
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CACHE_CONTROL, "no-cache"),
            ],
            index.as_ref().clone(),
        )
            .into_response()
    }
}

pub struct AppState {
    pub config: AppConfig,
    pub compression: Arc<CompressionService>,
    pub auth: Arc<AuthService>,
    pub quota: Arc<QuotaService>,
    pub tasks: Arc<TaskRepository>,
    pub rate_limits: Arc<RateLimitRepository>,
    pub visits: Arc<VisitRepository>,
    pub waitlist: Arc<WaitlistRepository>,
}

pub fn build_state(
    config: AppConfig,
    pool: PgPool,
    storage: Arc<dyn ObjectStorage>,
    mailer: Arc<dyn Mailer>,
) -> Arc<AppState> {
    let tasks = Arc::new(TaskRepository::new(pool.clone()));
    let identity = Arc::new(IdentityRepository::new(pool.clone()));
    let rate_limits = Arc::new(RateLimitRepository::new(pool.clone()));
    let visits = Arc::new(VisitRepository::new(pool.clone()));
    let waitlist = Arc::new(WaitlistRepository::new(pool.clone()));
    let quota = Arc::new(QuotaService::new(QuotaRepository::new(pool)));

    let mut strategies: HashMap<ImageFormat, Arc<dyn CompressionStrategy>> = HashMap::new();
    strategies.insert(ImageFormat::Png, Arc::new(PngCompressionStrategy));
    strategies.insert(ImageFormat::Jpeg, Arc::new(JpegCompressionStrategy));
    strategies.insert(ImageFormat::Gif, Arc::new(GifCompressionStrategy));
    strategies.insert(ImageFormat::WebP, Arc::new(WebpCompressionStrategy));
    strategies.insert(ImageFormat::Avif, Arc::new(AvifCompressionStrategy));

    let compression = Arc::new(CompressionService::new(
        tasks.clone(),
        identity.clone(),
        quota.clone(),
        storage,
        strategies,
        config.clone(),
    ));
    let auth = Arc::new(AuthService::new(
        identity,
        rate_limits.clone(),
        mailer,
        config.auth.clone(),
        config.limits.clone(),
    ));

    Arc::new(AppState {
        config,
        compression,
        auth,
        quota,
        tasks,
        rate_limits,
        visits,
        waitlist,
    })
}

pub fn start_workers(state: &Arc<AppState>, worker_count: usize) -> Vec<JoinHandle<()>> {
    worker::spawn_workers(
        state.compression.clone(),
        state.tasks.clone(),
        state.rate_limits.clone(),
        state.visits.clone(),
        worker_count,
        state.config.limits.worker_stale_secs,
    )
}

struct ApiKeySecurity;

impl Modify for ApiKeySecurity {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "api_key",
                SecurityScheme::Http(
                    HttpBuilder::new()
                        .scheme(HttpAuthScheme::Bearer)
                        .bearer_format("lp_live_…")
                        .build(),
                ),
            );
        }
    }
}

#[derive(OpenApi)]
#[openapi(
    paths(
        handlers::image::upload_image,
        handlers::image::get_task_status,
        handlers::download::download_file,
        handlers::me::me,
        handlers::me::list_tasks,
        handlers::me::list_api_keys,
        handlers::me::create_api_key,
        handlers::me::revoke_api_key,
        handlers::auth::request_otp,
        handlers::auth::verify_otp,
        handlers::auth::logout,
        handlers::events::record_visit,
        handlers::events::join_waitlist,
    ),
    components(schemas(
        response::ApiResponse<handlers::image::UploadResponse>,
        response::ApiResponse<crate::services::compression::TaskStatusView>,
        response::ApiResponse<handlers::me::MeView>,
        response::ApiResponseError,
        handlers::image::UploadForm,
        handlers::image::UploadResponse,
        crate::services::compression::TaskStatusView,
        handlers::me::MeView,
        handlers::me::PlanView,
        handlers::me::QuotaView,
        handlers::me::ApiKeyView,
        handlers::me::CreatedApiKeyView,
        handlers::me::CreateApiKeyRequest,
        handlers::auth::OtpRequest,
        handlers::auth::OtpResponse,
        handlers::auth::VerifyRequest,
        handlers::auth::VerifyResponse,
        handlers::auth::OkResponse,
        response::ApiResponse<handlers::events::WaitlistView>,
        handlers::events::VisitRequest,
        handlers::events::WaitlistRequest,
        handlers::events::WaitlistView,
    )),
    modifiers(&ApiKeySecurity),
    tags(
        (name = "图片压缩", description = "上传、状态查询与下载；网页、API、CLI 共用一份额度"),
        (name = "账号", description = "邮箱验证码登录、API Key 与本期额度"),
        (name = "埋点", description = "网页访问事件，服务端补齐身份、IP 与 UA")
    ),
    info(
        title = "LubanPNG API",
        description = "TinyPNG 式图片压缩服务。API Key 放在 Authorization: Bearer 头；每个响应带 X-Quota-Limit / X-Quota-Remaining / X-Quota-Reset。",
        version = "1.0.0"
    )
)]
pub struct ApiDoc;

pub fn build_router(state: Arc<AppState>) -> Router {
    let max_upload = state.config.server.max_upload_size;
    let api = Router::new()
        .route("/v1/images/compress", post(handlers::image::upload_image))
        .route(
            "/v1/images/compress/{task_id}",
            get(handlers::image::get_task_status),
        )
        .route(
            "/v1/images/download/{filename}",
            get(handlers::download::download_file),
        )
        .route("/v1/me", get(handlers::me::me))
        .route("/v1/me/tasks", get(handlers::me::list_tasks))
        .route(
            "/v1/me/api-keys",
            get(handlers::me::list_api_keys).post(handlers::me::create_api_key),
        )
        .route(
            "/v1/me/api-keys/{id}",
            axum::routing::delete(handlers::me::revoke_api_key),
        )
        .route("/v1/auth/otp", post(handlers::auth::request_otp))
        .route("/v1/auth/verify", post(handlers::auth::verify_otp))
        .route("/v1/auth/logout", post(handlers::auth::logout))
        .route("/v1/events/visit", post(handlers::events::record_visit))
        .route("/v1/me/waitlist", post(handlers::events::join_waitlist))
        .layer(from_fn_with_state(
            state.clone(),
            handlers::extract::subject_layer,
        ))
        .layer(DefaultBodyLimit::max(max_upload as usize + 64 * 1024))
        .layer(middleware::create_body_limit_layer(max_upload + 64 * 1024))
        .layer(from_fn_with_state(
            state.clone(),
            middleware::handle_body_limit_error,
        ));

    let mut router = Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-doc/openapi.json", ApiDoc::openapi()))
        .route("/healthz", get(handlers::health::healthz))
        .merge(api)
        .route("/v1/{*rest}", any(unknown_api_path));

    let static_dir = Path::new(&state.config.web.static_dir);
    if static_dir.is_dir() {
        let index_path = static_dir.join("index.html");
        let index = std::fs::read_to_string(&index_path).unwrap_or_default();
        let spa = Router::new().fallback(serve_spa).with_state(Arc::new(index));
        router = router.fallback_service(ServeDir::new(static_dir).fallback(spa));
    }

    router
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn spa_fallback_serves_index_for_extensionless_routes() {
        let index: SpaIndex = Arc::new("<html>lubanpng</html>".to_string());
        let response = serve_spa("/dashboard".parse().unwrap(), State(index)).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
    }

    #[tokio::test]
    async fn spa_fallback_rejects_missing_files_instead_of_serving_index() {
        let index: SpaIndex = Arc::new("<html>lubanpng</html>".to_string());
        let response = serve_spa("/robots.txt".parse().unwrap(), State(index)).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn static_service_serves_real_files_with_their_content_type() {
        let dir = std::env::temp_dir().join(format!("lubanpng-static-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("index.html"), "<html>lubanpng</html>").unwrap();
        std::fs::write(dir.join("robots.txt"), "User-agent: *\nAllow: /\n").unwrap();
        std::fs::write(dir.join("sitemap.xml"), "<urlset></urlset>").unwrap();

        let index = std::fs::read_to_string(dir.join("index.html")).unwrap();
        let spa = Router::new()
            .fallback(serve_spa)
            .with_state(Arc::new(index));
        let service = ServeDir::new(&dir).fallback(spa);

        let fetch = |path: &str| {
            let service = service.clone();
            let request = Request::builder()
                .uri(path)
                .body(Body::empty())
                .unwrap();
            async move { service.oneshot(request).await.unwrap() }
        };

        let robots = fetch("/robots.txt").await;
        assert_eq!(robots.status(), StatusCode::OK);
        assert!(
            robots.headers()[header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .starts_with("text/plain")
        );

        let sitemap = fetch("/sitemap.xml").await;
        assert_eq!(sitemap.status(), StatusCode::OK);
        assert!(
            sitemap.headers()[header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .contains("xml")
        );

        let page = fetch("/pricing").await;
        assert_eq!(page.status(), StatusCode::OK);
        assert_eq!(
            page.headers()[header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );

        let missing = fetch("/og.png").await;
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
