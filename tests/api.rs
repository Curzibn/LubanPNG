use axum::body::{to_bytes, Body};
use axum::extract::DefaultBodyLimit;
use axum::http::{header, Request, StatusCode};
use axum::routing::{get, post};
use axum::Router;
use image::ImageFormat;
use lubanpng::handlers::image::AppState;
use lubanpng::infrastructure::compression::{
    CompressionStrategy, GifCompressionStrategy, JpegCompressionStrategy, PngCompressionStrategy,
};
use lubanpng::infrastructure::storage::{FileStorage, FileStorageImpl};
use lubanpng::repositories::task_repository::{create_task_store, TaskRepository, TaskRepositoryImpl};
use lubanpng::services::compression::{
    start_worker_pool, CompressionService, CompressionServiceImpl, TaskQueue,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::CorsLayer;
use tower::ServiceExt;

const MAX_CONCURRENT: usize = 2;

async fn build_app() -> Router {
    let task_store = create_task_store();
    let task_repo: Arc<dyn TaskRepository> = Arc::new(TaskRepositoryImpl::new(task_store));

    let mut compression_strategies: HashMap<ImageFormat, Arc<dyn CompressionStrategy>> =
        HashMap::new();
    compression_strategies.insert(ImageFormat::Png, Arc::new(PngCompressionStrategy));
    compression_strategies.insert(ImageFormat::Jpeg, Arc::new(JpegCompressionStrategy));
    compression_strategies.insert(ImageFormat::Gif, Arc::new(GifCompressionStrategy));

    let storage: Arc<dyn FileStorage> = Arc::new(FileStorageImpl::new(
        "uploads".to_string(),
        "outputs".to_string(),
    ));
    storage.ensure_directories().await.unwrap();

    let (task_queue, queue_receiver) = TaskQueue::new();
    let task_queue = Arc::new(task_queue);

    let compression_service = Arc::new(CompressionServiceImpl::new(
        task_repo.clone(),
        compression_strategies.clone(),
        storage.clone(),
        task_queue.clone(),
        MAX_CONCURRENT,
    ));
    let compression_service_trait: Arc<dyn CompressionService> = compression_service.clone();

    let _ = start_worker_pool(queue_receiver, compression_service, MAX_CONCURRENT);

    let app_state = Arc::new(AppState {
        compression_service: compression_service_trait,
    });

    Router::new()
        .route(
            "/v1/images/compress",
            post(lubanpng::handlers::image::upload_image),
        )
        .route(
            "/v1/images/compress/{task_id}",
            get(lubanpng::handlers::image::get_task_status),
        )
        .route(
            "/v1/images/download/{filename}",
            get(lubanpng::handlers::download::download_file),
        )
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(CorsLayer::permissive())
        .with_state(app_state)
}

fn gradient_png(w: u32, h: u32) -> Vec<u8> {
    let mut img = image::RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            img.put_pixel(
                x,
                y,
                image::Rgba([
                    (x % 256) as u8,
                    (y % 256) as u8,
                    ((x + y) % 256) as u8,
                    255,
                ]),
            );
        }
    }
    let mut buf = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .unwrap();
    buf
}

fn gradient_jpeg(w: u32, h: u32, quality: u8) -> Vec<u8> {
    let mut img = image::RgbImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            img.put_pixel(
                x,
                y,
                image::Rgb([
                    ((x * x / 7 + y * 3) % 256) as u8,
                    ((x + y * y / 5) % 256) as u8,
                    ((x * y / 3) % 256) as u8,
                ]),
            );
        }
    }
    let mut buf = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    image::DynamicImage::ImageRgb8(img)
        .write_with_encoder(encoder)
        .unwrap();
    buf
}

fn multipart_body(field: &str, filename: &str, content: &[u8]) -> (String, Body) {
    let boundary = "----LubanPNGTestBoundary";
    let head = format!(
        "--{}\r\nContent-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\nContent-Type: application/octet-stream\r\n\r\n",
        boundary, field, filename
    );
    let mut body = head.into_bytes();
    body.extend_from_slice(content);
    body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());
    (
        format!("multipart/form-data; boundary={}", boundary),
        Body::from(body),
    )
}

async fn json_body(response: axum::response::Response) -> serde_json::Value {
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

async fn upload(app: &Router, filename: &str, content: &[u8]) -> String {
    let (content_type, body) = multipart_body("file", filename, content);
    let request = Request::builder()
        .method("POST")
        .uri("/v1/images/compress")
        .header(header::CONTENT_TYPE, content_type)
        .body(body)
        .unwrap();
    let json = json_body(app.clone().oneshot(request).await.unwrap()).await;
    assert_eq!(json["code"], 0, "upload should succeed: {}", json);
    json["data"]["task_id"].as_str().unwrap().to_string()
}

async fn wait_final(app: &Router, task_id: &str) -> serde_json::Value {
    for _ in 0..200 {
        let request = Request::builder()
            .uri(format!("/v1/images/compress/{}", task_id))
            .body(Body::empty())
            .unwrap();
        let json = json_body(app.clone().oneshot(request).await.unwrap()).await;
        let status = json["data"]["status"].as_str().unwrap().to_string();
        if status == "completed" || status == "failed" {
            return json["data"].clone();
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("task {} did not reach a final state in time", task_id);
}

#[tokio::test]
async fn png_full_pipeline_compress_then_download() {
    let app = build_app().await;
    let png = gradient_png(512, 512);
    let task_id = upload(&app, "photo.png", &png).await;

    let data = wait_final(&app, &task_id).await;
    assert_eq!(data["status"], "completed", "task should complete: {}", data);
    let compressed_size = data["compressed_size"].as_u64().unwrap() as usize;
    assert!(
        compressed_size < png.len(),
        "compressed {} should be smaller than original {}",
        compressed_size,
        png.len()
    );

    let url = data["compressed_url"].as_str().unwrap();
    let request = Request::builder()
        .uri(url)
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "image/png"
    );
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    assert_eq!(&bytes[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    let decoded = image::load_from_memory(&bytes).unwrap();
    assert_eq!(decoded.width(), 512);
    assert_eq!(decoded.height(), 512);
}

#[tokio::test]
async fn jpeg_full_pipeline_compresses() {
    let app = build_app().await;
    let jpeg = gradient_jpeg(256, 256, 90);
    let task_id = upload(&app, "photo.jpg", &jpeg).await;

    let data = wait_final(&app, &task_id).await;
    assert_eq!(data["status"], "completed", "task should complete: {}", data);
    let compressed_size = data["compressed_size"].as_u64().unwrap() as usize;
    assert!(
        compressed_size < jpeg.len(),
        "compressed {} should be smaller than original {}",
        compressed_size,
        jpeg.len()
    );
}

#[tokio::test]
async fn invalid_file_marks_task_failed() {
    let app = build_app().await;
    let task_id = upload(&app, "notes.txt", b"this is definitely not an image").await;

    let data = wait_final(&app, &task_id).await;
    assert_eq!(data["status"], "failed", "non-image should fail: {}", data);
    assert!(data["error_msg"].as_str().is_some());
}

#[tokio::test]
async fn unknown_task_returns_404() {
    let app = build_app().await;
    let request = Request::builder()
        .uri("/v1/images/compress/00000000-0000-0000-0000-000000000000")
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn download_rejects_path_traversal() {
    let app = build_app().await;
    for uri in [
        "/v1/images/download/..%2F..%2FCargo.toml",
        "/v1/images/download/..",
    ] {
        let request = Request::builder().uri(uri).body(Body::empty()).unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "uri: {}", uri);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(
            !bytes.windows(4).any(|w| w == b"name"),
            "must not leak Cargo.toml content"
        );
    }
}

#[tokio::test]
async fn missing_file_field_returns_400() {
    let app = build_app().await;
    let (content_type, body) = multipart_body("not_file", "x.png", &gradient_png(32, 32));
    let request = Request::builder()
        .method("POST")
        .uri("/v1/images/compress")
        .header(header::CONTENT_TYPE, content_type)
        .body(body)
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
