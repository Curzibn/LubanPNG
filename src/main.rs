mod config;
mod domain;
mod error;
mod handlers;
mod infrastructure;
mod middleware;
mod repositories;
mod response;
mod services;

use axum::{
    extract::DefaultBodyLimit,
    middleware::from_fn,
    routing::{get, post},
    Router,
};
use handlers::image::{AppState, TaskStatusResponseSchema, UploadResponse};
use infrastructure::compression::{CompressionStrategy, PngCompressionStrategy, JpegCompressionStrategy, GifCompressionStrategy};
use infrastructure::storage::{FileStorage, FileStorageImpl};
use repositories::task_repository::{TaskRepository, TaskRepositoryImpl, create_task_store};
use response::ApiResponseError;
use services::compression::{CompressionService, CompressionServiceImpl, TaskQueue, start_worker_pool};
use std::collections::HashMap;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use config::AppConfig;
use image::ImageFormat;

#[derive(OpenApi)]
#[openapi(
    paths(
        handlers::image::upload_image,
        handlers::image::get_task_status,
        handlers::download::download_file
    ),
    components(schemas(
        response::ApiResponse<UploadResponse>,
        response::ApiResponse<TaskStatusResponseSchema>,
        ApiResponseError,
        UploadResponse,
        TaskStatusResponseSchema,
        handlers::image::UploadForm
    )),
    tags(
        (name = "图片压缩", description = "图片压缩相关接口")
    ),
    info(
        title = "图片压缩服务 API",
        description = "提供图片上传、压缩和下载功能的 RESTful API",
        version = "1.0.0"
    )
)]
struct ApiDoc;

#[tokio::main]
async fn main() {
    AppConfig::init().expect("初始化配置失败");

    let config = AppConfig::get();
    let upload_dir = "uploads".to_string();
    let output_dir = "outputs".to_string();

    let task_store = create_task_store();
    let task_repo: Arc<dyn TaskRepository> = Arc::new(TaskRepositoryImpl::new(task_store));

    let mut compression_strategies: HashMap<ImageFormat, Arc<dyn CompressionStrategy>> = HashMap::new();
    compression_strategies.insert(ImageFormat::Png, Arc::new(PngCompressionStrategy));
    compression_strategies.insert(ImageFormat::Jpeg, Arc::new(JpegCompressionStrategy));
    compression_strategies.insert(ImageFormat::Gif, Arc::new(GifCompressionStrategy));

    let storage: Arc<dyn FileStorage> = Arc::new(FileStorageImpl::new(
        upload_dir.clone(),
        output_dir.clone(),
    ));

    storage.ensure_directories().await.expect("创建目录失败");

    let (task_queue, queue_receiver) = TaskQueue::new();
    let task_queue = Arc::new(task_queue);
    let max_concurrent = config.server.max_concurrent_tasks;

    let compression_service: Arc<CompressionServiceImpl> = Arc::new(
        CompressionServiceImpl::new(
            task_repo.clone(),
            compression_strategies.clone(),
            storage.clone(),
            task_queue.clone(),
            max_concurrent,
        )
    );

    let compression_service_trait: Arc<dyn CompressionService> = compression_service.clone();

    let _worker_handles = start_worker_pool(
        queue_receiver,
        compression_service,
        max_concurrent,
    );

    println!("Worker Pool 已启动，并发数: {}", max_concurrent);

    let app_state = Arc::new(AppState {
        compression_service: compression_service_trait,
    });

    let app = Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-doc/openapi.json", ApiDoc::openapi()))
        .route("/v1/images/compress", post(handlers::image::upload_image))
        .route("/v1/images/compress/{task_id}", get(handlers::image::get_task_status))
        .route("/v1/images/download/{filename}", get(handlers::download::download_file))
        .layer(DefaultBodyLimit::max(config.server.max_upload_size as usize))
        .layer(middleware::create_body_limit_layer())
        .layer(from_fn(middleware::handle_body_limit_error))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    let bind_addr = format!("{}:{}", config.server.host, config.server.port);
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .expect("绑定端口失败");

    println!("服务器启动在 http://{}", bind_addr);
    println!("Swagger UI 访问地址: http://localhost:{}/swagger-ui", config.server.port);
    println!("OpenAPI JSON 文档: http://localhost:{}/api-doc/openapi.json", config.server.port);
    axum::serve(listener, app)
        .await
        .expect("服务器启动失败");
}
