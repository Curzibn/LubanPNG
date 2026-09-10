use async_trait::async_trait;
use axum::body::{to_bytes, Body};
use axum::http::{header, HeaderMap, Method, Request, StatusCode};
use axum::Router;
use image::GenericImageView;
use lubanpng::app::{build_router, build_state, start_workers};
use lubanpng::config::AppConfig;
use lubanpng::error::AppResult;
use lubanpng::infrastructure::db;
use lubanpng::infrastructure::mail::{DisabledMailer, Mailer};
use lubanpng::infrastructure::storage::{ObjectStorage, S3Storage};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::runtime::Runtime;
use tower::ServiceExt;

fn runtime() -> &'static Runtime {
    static RUNTIME: std::sync::OnceLock<Runtime> = std::sync::OnceLock::new();
    RUNTIME.get_or_init(|| Runtime::new().expect("tokio runtime"))
}

fn run<F: std::future::Future<Output = ()>>(future: F) {
    runtime().block_on(future)
}

struct CapturingMailer {
    codes: Mutex<Vec<(String, String)>>,
}

#[async_trait]
impl Mailer for CapturingMailer {
    fn enabled(&self) -> bool {
        true
    }

    async fn send_login_code(&self, to: &str, code: &str, _ttl_minutes: i64) -> AppResult<()> {
        self.codes
            .lock()
            .unwrap()
            .push((to.to_string(), code.to_string()));
        Ok(())
    }
}

impl CapturingMailer {
    fn last_code_for(&self, email: &str) -> String {
        self.codes
            .lock()
            .unwrap()
            .iter()
            .rev()
            .find(|(to, _)| to == email)
            .map(|(_, code)| code.clone())
            .expect("a login code was sent")
    }
}

fn test_config() -> AppConfig {
    let mut config = AppConfig::default();
    config.database.url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| {
        let user = std::env::var("USER").unwrap_or_else(|_| "postgres".to_string());
        format!("postgres://{}@127.0.0.1:5432/lubanpng_test", user)
    });
    config.storage.endpoint =
        std::env::var("TEST_S3_ENDPOINT").unwrap_or_else(|_| "http://127.0.0.1:9000".to_string());
    config.storage.bucket =
        std::env::var("TEST_S3_BUCKET").unwrap_or_else(|_| "lubanpng-test".to_string());
    config.storage.access_key =
        std::env::var("TEST_S3_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string());
    config.storage.secret_key =
        std::env::var("TEST_S3_SECRET_KEY").unwrap_or_else(|_| "minioadmin".to_string());
    config.auth.secure_cookies = false;
    config.auth.cookie_secret = "test-secret".to_string();
    config.server.max_concurrent_tasks = 2;
    config.database.max_connections = 3;
    config
}

struct TestApp {
    router: Router,
    storage: Arc<S3Storage>,
    mailer: Arc<CapturingMailer>,
    cookies: Mutex<HashMap<String, String>>,
    client_ip: String,
}

async fn test_app_with(mailer: Arc<dyn Mailer>, capturing: Arc<CapturingMailer>) -> TestApp {
    let config = test_config();
    let pool = db::connect(&config.database)
        .await
        .expect("TEST_DATABASE_URL must point at a reachable PostgreSQL database");
    let storage = Arc::new(S3Storage::from_config(&config.storage).expect("storage config"));
    let state = build_state(config, pool, storage.clone(), mailer);
    let _workers = start_workers(&state, 2);
    let octet = rand_octet();
    TestApp {
        router: build_router(state),
        storage,
        mailer: capturing,
        cookies: Mutex::new(HashMap::new()),
        client_ip: format!("10.{}.{}.{}", octet, rand_octet(), rand_octet()),
    }
}

async fn test_app() -> TestApp {
    let mailer = Arc::new(CapturingMailer {
        codes: Mutex::new(Vec::new()),
    });
    test_app_with(mailer.clone(), mailer).await
}

fn rand_octet() -> u8 {
    (uuid::Uuid::new_v4().as_u128() % 254) as u8 + 1
}

struct Reply {
    status: StatusCode,
    headers: HeaderMap,
    body: Vec<u8>,
}

impl Reply {
    fn json(&self) -> serde_json::Value {
        serde_json::from_slice(&self.body).unwrap_or_else(|_| {
            panic!(
                "expected JSON body, got: {}",
                String::from_utf8_lossy(&self.body)
            )
        })
    }
}

impl TestApp {
    fn cookie_header(&self) -> Option<String> {
        let jar = self.cookies.lock().unwrap();
        if jar.is_empty() {
            None
        } else {
            Some(
                jar.iter()
                    .map(|(k, v)| format!("{}={}", k, v))
                    .collect::<Vec<_>>()
                    .join("; "),
            )
        }
    }

    fn absorb_cookies(&self, headers: &HeaderMap) {
        let mut jar = self.cookies.lock().unwrap();
        for value in headers.get_all(header::SET_COOKIE) {
            let raw = value.to_str().unwrap();
            let mut parts = raw.split(';').map(|p| p.trim());
            let (name, value) = parts.next().unwrap().split_once('=').unwrap();
            let expired = parts.any(|p| p.eq_ignore_ascii_case("Max-Age=0"));
            if expired || value.is_empty() {
                jar.remove(name);
            } else {
                jar.insert(name.to_string(), value.to_string());
            }
        }
    }

    async fn send(
        &self,
        method: Method,
        uri: &str,
        content_type: Option<&str>,
        body: Body,
        bearer: Option<&str>,
    ) -> Reply {
        let mut builder = Request::builder()
            .method(method.clone())
            .uri(uri)
            .header("x-forwarded-for", &self.client_ip);
        if let Some(token) = bearer {
            builder = builder.header(header::AUTHORIZATION, format!("Bearer {}", token));
        } else if let Some(cookies) = self.cookie_header() {
            builder = builder.header(header::COOKIE, cookies);
        }
        if method != Method::GET {
            builder = builder.header("x-requested-with", "LubanPNG");
        }
        if let Some(ct) = content_type {
            builder = builder.header(header::CONTENT_TYPE, ct);
        }
        let response = self
            .router
            .clone()
            .oneshot(builder.body(body).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        if bearer.is_none() {
            self.absorb_cookies(&headers);
        }
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec();
        Reply {
            status,
            headers,
            body,
        }
    }

    async fn get(&self, uri: &str) -> Reply {
        self.send(Method::GET, uri, None, Body::empty(), None).await
    }

    async fn post_json(&self, uri: &str, body: serde_json::Value) -> Reply {
        self.send(
            Method::POST,
            uri,
            Some("application/json"),
            Body::from(body.to_string()),
            None,
        )
        .await
    }

    async fn upload(&self, filename: &str, content: &[u8], bearer: Option<&str>) -> Reply {
        let (content_type, body) = multipart_body("file", filename, content);
        self.send(
            Method::POST,
            "/v1/images/compress",
            Some(&content_type),
            body,
            bearer,
        )
        .await
    }

    async fn upload_with(&self, filename: &str, content: &[u8], fields: &[(&str, &str)]) -> Reply {
        let (content_type, body) = multipart_with_fields(filename, content, fields);
        self.send(
            Method::POST,
            "/v1/images/compress",
            Some(&content_type),
            body,
            None,
        )
        .await
    }

    async fn upload_with_ok(
        &self,
        filename: &str,
        content: &[u8],
        fields: &[(&str, &str)],
    ) -> String {
        let reply = self.upload_with(filename, content, fields).await;
        assert_eq!(
            reply.status,
            StatusCode::OK,
            "upload should succeed: {}",
            String::from_utf8_lossy(&reply.body)
        );
        reply.json()["data"]["task_id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    async fn upload_ok(&self, filename: &str, content: &[u8], bearer: Option<&str>) -> String {
        let reply = self.upload(filename, content, bearer).await;
        assert_eq!(
            reply.status,
            StatusCode::OK,
            "upload should succeed: {}",
            String::from_utf8_lossy(&reply.body)
        );
        reply.json()["data"]["task_id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    async fn wait_final(&self, task_id: &str) -> serde_json::Value {
        for _ in 0..12 {
            let reply = self
                .get(&format!("/v1/images/compress/{}?wait=5", task_id))
                .await;
            assert_eq!(reply.status, StatusCode::OK);
            let data = reply.json()["data"].clone();
            let status = data["status"].as_str().unwrap();
            if status == "completed" || status == "failed" {
                return data;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        panic!("task {} did not reach a final state in time", task_id);
    }
}

fn gradient_png(w: u32, h: u32) -> Vec<u8> {
    let mut img = image::RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            img.put_pixel(
                x,
                y,
                image::Rgba([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8, 255]),
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

fn multipart_with_fields(
    filename: &str,
    content: &[u8],
    fields: &[(&str, &str)],
) -> (String, Body) {
    let boundary = "----LubanPNGTestBoundary";
    let mut body = Vec::new();
    for (name, value) in fields {
        body.extend_from_slice(
            format!(
                "--{}\r\nContent-Disposition: form-data; name=\"{}\"\r\n\r\n{}\r\n",
                boundary, name, value
            )
            .as_bytes(),
        );
    }
    body.extend_from_slice(
        format!(
            "--{}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{}\"\r\nContent-Type: application/octet-stream\r\n\r\n",
            boundary, filename
        )
        .as_bytes(),
    );
    body.extend_from_slice(content);
    body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());
    (
        format!("multipart/form-data; boundary={}", boundary),
        Body::from(body),
    )
}

fn photo_rgba(w: u32, h: u32, shift: u32) -> image::RgbaImage {
    let mut img = image::RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            img.put_pixel(
                x,
                y,
                image::Rgba([
                    (((x + shift) * (x + shift) / 7 + y * 3) % 256) as u8,
                    ((x + y * y / 5) % 256) as u8,
                    ((x * y / 3) % 256) as u8,
                    255,
                ]),
            );
        }
    }
    img
}

fn lossless_webp(w: u32, h: u32) -> Vec<u8> {
    use image::ImageEncoder;
    let rgb = image::DynamicImage::ImageRgba8(photo_rgba(w, h, 0)).to_rgb8();
    let mut out = Vec::new();
    image::codecs::webp::WebPEncoder::new_lossless(&mut out)
        .write_image(rgb.as_raw(), w, h, image::ExtendedColorType::Rgb8)
        .unwrap();
    out
}

fn sample_avif(w: u32, h: u32, quality: u8) -> Vec<u8> {
    use image::ImageEncoder;
    let img = photo_rgba(w, h, 0);
    let mut out = Vec::new();
    image::codecs::avif::AvifEncoder::new_with_speed_quality(&mut out, 10, quality)
        .write_image(img.as_raw(), w, h, image::ExtendedColorType::Rgba8)
        .unwrap();
    out
}

fn transparent_png(w: u32, h: u32) -> Vec<u8> {
    let mut img = image::RgbaImage::new(w, h);
    for (x, y, pixel) in img.enumerate_pixels_mut() {
        *pixel = image::Rgba([
            (x * 4) as u8,
            (y * 4) as u8,
            120,
            if x < w / 2 { 0 } else { 255 },
        ]);
    }
    let mut buf = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .unwrap();
    buf
}

fn animated_gif(frames: u32) -> Vec<u8> {
    use image::codecs::gif::{GifEncoder, Repeat};
    let mut out = Vec::new();
    {
        let mut encoder = GifEncoder::new(&mut out);
        encoder.set_repeat(Repeat::Infinite).unwrap();
        for step in 0..frames {
            let mut img = image::RgbaImage::from_pixel(64, 64, image::Rgba([240, 240, 230, 255]));
            for y in 0..16 {
                for x in 0..16 {
                    img.put_pixel(8 + step * 12 + x, 20 + y, image::Rgba([200, 30, 30, 255]));
                }
            }
            encoder
                .encode_frame(image::Frame::from_parts(
                    img,
                    0,
                    0,
                    image::Delay::from_numer_denom_ms(100, 1),
                ))
                .unwrap();
        }
    }
    out
}

fn animated_png(frames: u32) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, 48, 48);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_animated(frames, 0).unwrap();
        encoder.set_frame_delay(1, 10).unwrap();
        let mut writer = encoder.write_header().unwrap();
        for step in 0..frames {
            let mut img = image::RgbaImage::from_pixel(48, 48, image::Rgba([20, 40, 90, 255]));
            for y in 0..12 {
                for x in 0..12 {
                    img.put_pixel(4 + step * 10 + x, 18 + y, image::Rgba([250, 200, 40, 255]));
                }
            }
            writer.write_image_data(img.as_raw()).unwrap();
        }
        writer.finish().unwrap();
    }
    out
}

fn gif_frame_count(data: &[u8]) -> usize {
    use image::AnimationDecoder;
    image::codecs::gif::GifDecoder::new(std::io::Cursor::new(data))
        .unwrap()
        .into_frames()
        .collect_frames()
        .unwrap()
        .len()
}

fn apng_frame_count(data: &[u8]) -> usize {
    use image::AnimationDecoder;
    image::codecs::png::PngDecoder::new(std::io::Cursor::new(data))
        .unwrap()
        .apng()
        .unwrap()
        .into_frames()
        .collect_frames()
        .unwrap()
        .len()
}

fn unique_email() -> String {
    format!("user-{}@example.com", uuid::Uuid::new_v4().simple())
}

async fn login(app: &TestApp) -> String {
    let email = unique_email();
    let sent = app
        .post_json("/v1/auth/otp", serde_json::json!({ "email": email }))
        .await;
    assert_eq!(
        sent.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&sent.body)
    );
    let code = app.mailer.last_code_for(&email);
    let verified = app
        .post_json(
            "/v1/auth/verify",
            serde_json::json!({ "email": email, "code": code }),
        )
        .await;
    assert_eq!(
        verified.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&verified.body)
    );
    assert!(app.cookies.lock().unwrap().contains_key("lp_session"));
    email
}

#[test]
fn anonymous_visit_mints_device_and_reports_daily_quota() {
    run(async {
        let app = test_app().await;
        let reply = app.get("/v1/me").await;
        assert_eq!(reply.status, StatusCode::OK);
        let data = reply.json()["data"].clone();
        assert_eq!(data["subject"], "device");
        assert_eq!(data["plan"]["id"], "anonymous");
        assert_eq!(data["quota"]["limit"], 5);
        assert_eq!(data["quota"]["remaining"], 5);
        assert!(data["quota"]["resets_at"].as_str().unwrap().contains('T'));
        assert_eq!(reply.headers.get("x-quota-limit").unwrap(), "5");
        assert!(app.cookies.lock().unwrap().contains_key("lp_device"));

        let again = app.get("/v1/me").await;
        assert!(again.headers.get(header::SET_COOKIE).is_none());
    });
}

#[test]
fn png_full_pipeline_compress_then_download() {
    run(async {
        let app = test_app().await;
        let png = gradient_png(512, 512);
        let task_id = app.upload_ok("photo.png", &png, None).await;

        let data = app.wait_final(&task_id).await;
        assert_eq!(
            data["status"], "completed",
            "task should complete: {}",
            data
        );
        let compressed_size = data["compressed_size"].as_u64().unwrap() as usize;
        assert!(
            compressed_size < png.len(),
            "compressed {} should be smaller than {}",
            compressed_size,
            png.len()
        );
        assert_eq!(data["original_name"], "photo.png");
        assert_eq!(data["downloadable"], true);
        assert!(data["expires_at"].as_i64().unwrap() > data["completed_at"].as_i64().unwrap());

        let url = data["compressed_url"].as_str().unwrap().to_string();
        assert_eq!(url, format!("/v1/images/download/{}.png", task_id));
        let redirect = app.get(&url).await;
        assert_eq!(redirect.status, StatusCode::TEMPORARY_REDIRECT);
        let location = redirect
            .headers
            .get(header::LOCATION)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(
            location.contains(&format!("/lubanpng-test/outputs/free/{}.png", task_id)),
            "{}",
            location
        );
        assert!(location.contains("X-Amz-Signature"), "{}", location);

        let stored = app
            .storage
            .get(&format!("outputs/free/{}.png", task_id))
            .await
            .unwrap();
        let decoded = image::load_from_memory(&stored).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (512, 512));

        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["used"], 1);
        assert_eq!(me["quota"]["remaining"], 4);
    });
}

#[test]
fn jpeg_full_pipeline_compresses() {
    run(async {
        let app = test_app().await;
        let jpeg = gradient_jpeg(256, 256, 90);
        let task_id = app.upload_ok("photo.jpg", &jpeg, None).await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(
            data["status"], "completed",
            "task should complete: {}",
            data
        );
        assert!(data["compressed_size"].as_u64().unwrap() < jpeg.len() as u64);
    });
}

#[test]
fn non_image_is_rejected_without_consuming_quota() {
    run(async {
        let app = test_app().await;
        let reply = app
            .upload("notes.txt", b"this is definitely not an image", None)
            .await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST);
        assert_eq!(reply.json()["code"], 1001);
        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["remaining"], 5);
    });
}

#[test]
fn anonymous_quota_exhausts_after_five_uploads() {
    run(async {
        let app = test_app().await;
        let png = gradient_png(24, 24);
        for _ in 0..5 {
            app.upload_ok("tiny.png", &png, None).await;
        }
        let sixth = app.upload("tiny.png", &png, None).await;
        assert_eq!(sixth.status, StatusCode::TOO_MANY_REQUESTS);
        let body = sixth.json();
        assert_eq!(body["code"], 4003);
        assert!(body["data"]["resets_at"].as_str().is_some());
        assert_eq!(sixth.headers.get("x-quota-remaining").unwrap(), "0");
    });
}

#[test]
fn login_api_keys_and_task_history() {
    run(async {
        let app = test_app().await;
        let email = login(&app).await;

        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["subject"], "account");
        assert_eq!(me["email"], email);
        assert_eq!(me["plan"]["id"], "free");
        assert_eq!(me["quota"]["limit"], 50);

        let created = app
            .post_json("/v1/me/api-keys", serde_json::json!({ "name": "本机 CLI" }))
            .await;
        assert_eq!(
            created.status,
            StatusCode::OK,
            "{}",
            String::from_utf8_lossy(&created.body)
        );
        let created = created.json()["data"].clone();
        let key = created["key"].as_str().unwrap().to_string();
        assert!(key.starts_with("lp_live_"));
        assert_eq!(created["prefix"], key[..12]);
        assert_eq!(created["suffix"], key[key.len() - 4..]);

        let listed = app.get("/v1/me/api-keys").await.json()["data"].clone();
        assert_eq!(listed.as_array().unwrap().len(), 1);
        assert!(listed[0]["key"].is_null());

        let over_limit = app
            .post_json("/v1/me/api-keys", serde_json::json!({ "name": "second" }))
            .await;
        assert_eq!(over_limit.status, StatusCode::BAD_REQUEST);

        let png = gradient_png(64, 64);
        let task_id = app.upload_ok("api.png", &png, Some(&key)).await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(data["status"], "completed", "{}", data);
        assert_eq!(data["source"], "api");

        let tasks = app.get("/v1/me/tasks").await.json()["data"].clone();
        assert!(tasks
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["task_id"] == task_id));

        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["used"], 1);

        let key_id = created["id"].as_str().unwrap();
        let revoked = app
            .send(
                Method::DELETE,
                &format!("/v1/me/api-keys/{}", key_id),
                None,
                Body::empty(),
                None,
            )
            .await;
        assert_eq!(revoked.status, StatusCode::OK);
        let rejected = app.upload("api.png", &png, Some(&key)).await;
        assert_eq!(rejected.status, StatusCode::UNAUTHORIZED);
        assert_eq!(rejected.json()["code"], 4001);

        let logout = app
            .post_json("/v1/auth/logout", serde_json::json!({}))
            .await;
        assert_eq!(logout.status, StatusCode::OK);
        assert!(!app.cookies.lock().unwrap().contains_key("lp_session"));
        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["subject"], "device");
    });
}

#[test]
fn wrong_code_is_rejected_then_correct_code_logs_in() {
    run(async {
        let app = test_app().await;
        let email = unique_email();
        app.post_json("/v1/auth/otp", serde_json::json!({ "email": email }))
            .await;
        let wrong = app
            .post_json(
                "/v1/auth/verify",
                serde_json::json!({ "email": email, "code": "000000" }),
            )
            .await;
        assert_eq!(wrong.status, StatusCode::BAD_REQUEST);
        let code = app.mailer.last_code_for(&email);
        let right = app
            .post_json(
                "/v1/auth/verify",
                serde_json::json!({ "email": email, "code": code }),
            )
            .await;
        assert_eq!(right.status, StatusCode::OK);
        assert_eq!(right.json()["data"]["created"], true);
    });
}

#[test]
fn otp_is_unavailable_when_mail_is_not_configured() {
    run(async {
        let capturing = Arc::new(CapturingMailer {
            codes: Mutex::new(Vec::new()),
        });
        let app = test_app_with(Arc::new(DisabledMailer), capturing).await;
        let reply = app
            .post_json(
                "/v1/auth/otp",
                serde_json::json!({ "email": unique_email() }),
            )
            .await;
        assert_eq!(reply.status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(reply.json()["code"], 2003);
    });
}

#[test]
fn cookie_authenticated_post_without_marker_is_forbidden() {
    run(async {
        let app = test_app().await;
        app.get("/v1/me").await;
        let request = Request::builder()
            .method(Method::POST)
            .uri("/v1/auth/otp")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, app.cookie_header().unwrap())
            .body(Body::from(
                serde_json::json!({ "email": unique_email() }).to_string(),
            ))
            .unwrap();
        let response = app.router.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["code"], 4002);
    });
}

#[test]
fn unknown_task_returns_404() {
    run(async {
        let app = test_app().await;
        let reply = app
            .get("/v1/images/compress/00000000-0000-0000-0000-000000000000")
            .await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND);
        let malformed = app.get("/v1/images/compress/not-a-uuid").await;
        assert_eq!(malformed.status, StatusCode::NOT_FOUND);
    });
}

#[test]
fn download_rejects_path_traversal_and_unknown_files() {
    run(async {
        let app = test_app().await;
        for uri in [
            "/v1/images/download/..%2F..%2FCargo.toml",
            "/v1/images/download/..",
            "/v1/images/download/00000000-0000-0000-0000-000000000000.png",
        ] {
            let reply = app.get(uri).await;
            assert_eq!(reply.status, StatusCode::NOT_FOUND, "uri: {}", uri);
        }
    });
}

#[test]
fn unknown_api_path_returns_json_404() {
    run(async {
        let app = test_app().await;
        let reply = app.get("/v1/nope").await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND);
        assert_eq!(reply.json()["code"], 3003);
    });
}

#[test]
fn missing_file_field_returns_400() {
    run(async {
        let app = test_app().await;
        let (content_type, body) = multipart_body("not_file", "x.png", &gradient_png(32, 32));
        let reply = app
            .send(
                Method::POST,
                "/v1/images/compress",
                Some(&content_type),
                body,
                None,
            )
            .await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    });
}

fn device_id(app: &TestApp) -> uuid::Uuid {
    let jar = app.cookies.lock().unwrap();
    let raw = jar.get("lp_device").expect("device cookie");
    let id = raw.split('.').next().unwrap();
    uuid::Uuid::parse_str(id).unwrap()
}

#[test]
fn visit_events_record_device_and_account_paths() {
    run(async {
        let app = test_app().await;
        app.get("/v1/me").await;
        let device = device_id(&app);

        let device_reply = app
            .post_json(
                "/v1/events/visit",
                serde_json::json!({
                    "path": "/pricing",
                    "referrer_host": "www.v2ex.com",
                    "utm_source": "v2ex",
                    "utm_medium": "post",
                    "utm_campaign": "cli-launch"
                }),
            )
            .await;
        assert_eq!(device_reply.status, StatusCode::OK);
        assert_eq!(device_reply.json()["code"], 0);

        let email = login(&app).await;
        let account_reply = app
            .post_json(
                "/v1/events/visit",
                serde_json::json!({ "path": "/dashboard" }),
            )
            .await;
        assert_eq!(account_reply.status, StatusCode::OK);

        let pool = db::connect(&test_config().database).await.unwrap();
        let device_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM visits WHERE subject_type = 'device' AND subject_id = $1",
        )
        .bind(device)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(device_count, 1);
        let (referrer, source): (Option<String>, Option<String>) = sqlx::query_as(
            "SELECT referrer_host, utm_source FROM visits
             WHERE subject_type = 'device' AND subject_id = $1",
        )
        .bind(device)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(referrer.as_deref(), Some("www.v2ex.com"));
        assert_eq!(source.as_deref(), Some("v2ex"));

        let account_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM visits v JOIN accounts a ON a.id = v.subject_id
             WHERE v.subject_type = 'account' AND a.email = $1",
        )
        .bind(&email)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(account_count, 1);
    });
}

#[test]
fn verify_records_first_touch_signup_source_once() {
    run(async {
        let app = test_app().await;
        app.get("/v1/me").await;
        let device = device_id(&app);

        let first = app
            .post_json(
                "/v1/events/visit",
                serde_json::json!({
                    "path": "/",
                    "referrer_host": "juejin.cn",
                    "utm_source": "juejin",
                    "utm_medium": "article",
                    "utm_campaign": "launch"
                }),
            )
            .await;
        assert_eq!(first.status, StatusCode::OK);
        let second = app
            .post_json(
                "/v1/events/visit",
                serde_json::json!({
                    "path": "/pricing",
                    "referrer_host": "other.example",
                    "utm_source": "other"
                }),
            )
            .await;
        assert_eq!(second.status, StatusCode::OK);

        let email = login(&app).await;
        let pool = db::connect(&test_config().database).await.unwrap();
        let row: (
            Option<uuid::Uuid>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        ) = sqlx::query_as(
            "SELECT signup_device_id, signup_referrer_host, signup_utm_source,
                    signup_utm_medium, signup_utm_campaign
             FROM accounts WHERE email = $1",
        )
        .bind(&email)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0, Some(device));
        assert_eq!(row.1.as_deref(), Some("juejin.cn"));
        assert_eq!(row.2.as_deref(), Some("juejin"));
        assert_eq!(row.3.as_deref(), Some("article"));
        assert_eq!(row.4.as_deref(), Some("launch"));
        let ip: Option<String> =
            sqlx::query_scalar("SELECT host(signup_ip) FROM accounts WHERE email = $1")
                .bind(&email)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(ip.is_some());

        let logout = app
            .post_json("/v1/auth/logout", serde_json::json!({}))
            .await;
        assert_eq!(logout.status, StatusCode::OK);
        app.post_json(
            "/v1/events/visit",
            serde_json::json!({
                "path": "/later",
                "referrer_host": "later.example",
                "utm_source": "later"
            }),
        )
        .await;
        app.post_json("/v1/auth/otp", serde_json::json!({ "email": email }))
            .await;
        let code = app.mailer.last_code_for(&email);
        let again = app
            .post_json(
                "/v1/auth/verify",
                serde_json::json!({ "email": email, "code": code }),
            )
            .await;
        assert_eq!(again.status, StatusCode::OK);
        assert_eq!(again.json()["data"]["created"], false);
        let after: (Option<String>, Option<String>) = sqlx::query_as(
            "SELECT signup_referrer_host, signup_utm_source FROM accounts WHERE email = $1",
        )
        .bind(&email)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(after.0.as_deref(), Some("juejin.cn"));
        assert_eq!(after.1.as_deref(), Some("juejin"));
    });
}

#[test]
fn waitlist_join_requires_account_and_is_idempotent() {
    run(async {
        let app = test_app().await;
        app.get("/v1/me").await;
        let anonymous = app
            .post_json("/v1/me/waitlist", serde_json::json!({ "plan_id": "pro" }))
            .await;
        assert_eq!(anonymous.status, StatusCode::UNAUTHORIZED);
        assert_eq!(anonymous.json()["code"], 4001);

        let email = login(&app).await;
        let first = app
            .post_json("/v1/me/waitlist", serde_json::json!({ "plan_id": "pro" }))
            .await;
        assert_eq!(first.status, StatusCode::OK);
        assert_eq!(first.json()["data"]["plan_id"], "pro");
        let created_at = first.json()["data"]["created_at"]
            .as_str()
            .unwrap()
            .to_string();

        let second = app
            .post_json("/v1/me/waitlist", serde_json::json!({ "plan_id": "pro" }))
            .await;
        assert_eq!(second.status, StatusCode::OK);
        assert_eq!(second.json()["data"]["created_at"], created_at);

        let invalid = app
            .post_json(
                "/v1/me/waitlist",
                serde_json::json!({ "plan_id": "enterprise" }),
            )
            .await;
        assert_eq!(invalid.status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid.json()["code"], 1001);

        let metered = app
            .post_json(
                "/v1/me/waitlist",
                serde_json::json!({ "plan_id": "metered" }),
            )
            .await;
        assert_eq!(metered.status, StatusCode::OK);
        assert_eq!(metered.json()["data"]["plan_id"], "metered");

        let pool = db::connect(&test_config().database).await.unwrap();
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM waitlist_signups w JOIN accounts a ON a.id = w.account_id
             WHERE a.email = $1 AND w.plan_id = 'pro'",
        )
        .bind(&email)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1);
    });
}

#[test]
fn analytics_views_are_queryable_and_consistent() {
    run(async {
        let app = test_app().await;
        app.get("/v1/me").await;
        let email = login(&app).await;
        let png = gradient_png(64, 64);
        let task_id = app.upload_ok("metric.png", &png, None).await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(data["status"], "completed", "{}", data);
        app.post_json(
            "/v1/events/visit",
            serde_json::json!({ "path": "/", "referrer_host": "example.com" }),
        )
        .await;

        let pool = db::connect(&test_config().database).await.unwrap();
        let applied: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM _sqlx_migrations WHERE version = 2 AND success",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(applied, 1);

        let view_counts: (i64, i64, i64, i64, i64) = sqlx::query_as(
            "SELECT (SELECT count(*) FROM analytics.daily_visits),
                    (SELECT count(*) FROM analytics.daily_funnel),
                    (SELECT count(*) FROM analytics.daily_source_tasks),
                    (SELECT count(*) FROM analytics.cohort_retention),
                    (SELECT count(*) FROM analytics.account_acquisition)",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            view_counts.0 >= 1
                && view_counts.1 >= 1
                && view_counts.2 >= 1
                && view_counts.3 >= 1
                && view_counts.4 >= 1
        );

        let signup_mismatch: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM analytics.daily_funnel f
             WHERE f.signups <> (
                 SELECT count(*) FROM accounts a
                 WHERE a.signup_device_id IS NOT NULL
                   AND date(a.created_at AT TIME ZONE 'Asia/Shanghai') = f.day
             )",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(signup_mismatch, 0);

        let totals: (i64, i64) = sqlx::query_as(
            "SELECT COALESCE(sum(created), 0)::bigint, COALESCE(sum(completed), 0)::bigint
             FROM analytics.daily_source_tasks",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            totals.1 <= totals.0,
            "completed {} > created {}",
            totals.1,
            totals.0
        );

        let attributed: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM analytics.account_acquisition
             WHERE email = $1 AND signup_device_id IS NOT NULL",
        )
        .bind(&email)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(attributed, 1);
    });
}

#[test]
fn visit_events_are_rate_limited_per_device() {
    run(async {
        let app = test_app().await;
        app.get("/v1/me").await;
        for index in 0..30 {
            let reply = app
                .post_json("/v1/events/visit", serde_json::json!({ "path": "/" }))
                .await;
            assert_eq!(reply.status, StatusCode::OK, "request {index} should pass");
        }
        let limited = app
            .post_json("/v1/events/visit", serde_json::json!({ "path": "/" }))
            .await;
        assert_eq!(limited.status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(limited.json()["code"], 4003);
    });
}

#[test]
fn visit_user_agent_is_truncated_to_256() {
    run(async {
        let app = test_app().await;
        app.get("/v1/me").await;
        let device = device_id(&app);
        let long_agent = "A".repeat(400);
        let request = Request::builder()
            .method(Method::POST)
            .uri("/v1/events/visit")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::USER_AGENT, &long_agent)
            .header("x-forwarded-for", &app.client_ip)
            .header(header::COOKIE, app.cookie_header().unwrap())
            .header("x-requested-with", "LubanPNG")
            .body(Body::from(serde_json::json!({ "path": "/" }).to_string()))
            .unwrap();
        let response = app.router.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let pool = db::connect(&test_config().database).await.unwrap();
        let stored: Option<String> = sqlx::query_scalar(
            "SELECT user_agent FROM visits
             WHERE subject_type = 'device' AND subject_id = $1
             ORDER BY id DESC LIMIT 1",
        )
        .bind(device)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(stored.unwrap().chars().count(), 256);
    });
}

#[test]
fn funnel_signups_only_count_device_attributed_accounts() {
    run(async {
        let app = test_app().await;
        app.get("/v1/me").await;
        let pool = db::connect(&test_config().database).await.unwrap();
        let legacy_id = uuid::Uuid::new_v4();
        let legacy_email = format!("legacy-{}@example.com", uuid::Uuid::new_v4().simple());
        sqlx::query(
            "INSERT INTO accounts (id, email, plan_id, signup_device_id)
             VALUES ($1, $2, 'free', NULL)",
        )
        .bind(legacy_id)
        .bind(&legacy_email)
        .execute(&pool)
        .await
        .unwrap();

        let funnel: i64 = sqlx::query_scalar(
            "SELECT COALESCE((
                 SELECT signups FROM analytics.daily_funnel
                 WHERE day = date(now() AT TIME ZONE 'Asia/Shanghai')
             ), 0)",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let attributable: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM accounts
             WHERE signup_device_id IS NOT NULL
               AND date(created_at AT TIME ZONE 'Asia/Shanghai') = date(now() AT TIME ZONE 'Asia/Shanghai')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(funnel, attributable);
        let legacy_present: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM accounts
             WHERE id = $1 AND signup_device_id IS NULL
               AND date(created_at AT TIME ZONE 'Asia/Shanghai') = date(now() AT TIME ZONE 'Asia/Shanghai')",
        )
        .bind(legacy_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(legacy_present, 1);
    });
}

#[test]
fn visit_retention_cleanup_removes_only_expired_rows() {
    run(async {
        let pool = db::connect(&test_config().database).await.unwrap();
        let repo = lubanpng::repositories::visit_repository::VisitRepository::new(pool.clone());
        let subject = uuid::Uuid::new_v4();
        sqlx::query(
            "INSERT INTO visits (occurred_at, subject_type, subject_id, path)
             VALUES (now() - interval '200 days', 'device', $1, '/old')",
        )
        .bind(subject)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO visits (subject_type, subject_id, path) VALUES ('device', $1, '/new')",
        )
        .bind(subject)
        .execute(&pool)
        .await
        .unwrap();

        let removed = repo.cleanup().await.unwrap();
        assert!(removed >= 1);
        let remaining: i64 =
            sqlx::query_scalar("SELECT count(*) FROM visits WHERE subject_id = $1")
                .bind(subject)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(remaining, 1);
    });
}

#[test]
fn recompressing_never_grows_the_artifact() {
    run(async {
        let app = test_app().await;
        let png = gradient_png(128, 128);
        let first_id = app.upload_ok("first.png", &png, None).await;
        let first = app.wait_final(&first_id).await;
        assert_eq!(first["status"], "completed", "{}", first);
        let first_bytes = app
            .storage
            .get(&format!("outputs/free/{}.png", first_id))
            .await
            .unwrap();

        let second_id = app.upload_ok("second.png", &first_bytes, None).await;
        let second = app.wait_final(&second_id).await;
        assert_eq!(second["status"], "completed", "{}", second);
        let original_size = second["original_size"].as_u64().unwrap();
        let compressed_size = second["compressed_size"].as_u64().unwrap();
        assert!(
            compressed_size <= original_size,
            "compressed {} exceeded original {}",
            compressed_size,
            original_size
        );
        let artifact = app
            .storage
            .get(&format!("outputs/free/{}.png", second_id))
            .await
            .unwrap();
        if compressed_size == original_size {
            assert_eq!(artifact, first_bytes);
        } else {
            assert_eq!(artifact.len() as u64, compressed_size);
        }
    });
}

#[test]
fn webp_full_pipeline_recompresses_lossless_source() {
    run(async {
        let app = test_app().await;
        let webp = lossless_webp(128, 128);
        let task_id = app.upload_ok("shot.webp", &webp, None).await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(data["status"], "completed", "{}", data);
        assert!(data["compressed_size"].as_u64().unwrap() < webp.len() as u64);
        assert_eq!(data["output_format"], "webp");
        assert_eq!(data["quota_units"], 1);
        let url = data["compressed_url"].as_str().unwrap();
        assert!(url.ends_with(".webp"), "{}", url);
        let stored = app
            .storage
            .get(&format!("outputs/free/{}.webp", task_id))
            .await
            .unwrap();
        assert_eq!(&stored[8..12], b"WEBP");
        assert_eq!(
            image::load_from_memory(&stored).unwrap().dimensions(),
            (128, 128)
        );
    });
}

#[test]
fn avif_full_pipeline_decodes_and_recompresses() {
    run(async {
        let app = test_app().await;
        let avif = sample_avif(128, 96, 95);
        let task_id = app.upload_ok("shot.avif", &avif, None).await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(data["status"], "completed", "{}", data);
        assert!(data["compressed_size"].as_u64().unwrap() <= avif.len() as u64);
        assert!(data["compressed_url"].as_str().unwrap().ends_with(".avif"));
        let stored = app
            .storage
            .get(&format!("outputs/free/{}.avif", task_id))
            .await
            .unwrap();
        assert_eq!(
            image::load_from_memory(&stored).unwrap().dimensions(),
            (128, 96)
        );
    });
}

#[test]
fn converting_png_to_webp_costs_two_units() {
    run(async {
        let app = test_app().await;
        let png = gradient_png(96, 96);
        let task_id = app
            .upload_with_ok("logo.png", &png, &[("convert", "webp")])
            .await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(data["status"], "completed", "{}", data);
        assert_eq!(data["target_format"], "webp");
        assert_eq!(data["output_format"], "webp");
        assert_eq!(data["quota_units"], 2);
        let url = data["compressed_url"].as_str().unwrap();
        assert_eq!(url, &format!("/v1/images/download/{}.webp", task_id));
        let stored = app
            .storage
            .get(&format!("outputs/free/{}.webp", task_id))
            .await
            .unwrap();
        assert_eq!(&stored[8..12], b"WEBP");
        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["used"], 2);
        assert_eq!(me["quota"]["remaining"], 3);
    });
}

#[test]
fn converting_to_the_same_format_counts_once() {
    run(async {
        let app = test_app().await;
        let png = gradient_png(64, 64);
        let task_id = app
            .upload_with_ok("same.png", &png, &[("convert", "image/png")])
            .await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(data["status"], "completed", "{}", data);
        assert_eq!(data["quota_units"], 1);
        assert!(data["target_format"].is_null());
        assert!(data["compressed_url"].as_str().unwrap().ends_with(".png"));
        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["used"], 1);
    });
}

#[test]
fn transparent_png_to_jpeg_needs_background_and_refunds_both_units() {
    run(async {
        let app = test_app().await;
        let png = transparent_png(64, 64);
        let failed_id = app
            .upload_with_ok("cutout.png", &png, &[("convert", "jpeg")])
            .await;
        let failed = app.wait_final(&failed_id).await;
        assert_eq!(failed["status"], "failed", "{}", failed);
        assert!(
            failed["error_msg"].as_str().unwrap().contains("背景色"),
            "{}",
            failed
        );
        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["used"], 0);
        assert_eq!(me["quota"]["remaining"], 5);

        let ok_id = app
            .upload_with_ok(
                "cutout.png",
                &png,
                &[("convert", "jpeg"), ("background", "#ffffff")],
            )
            .await;
        let done = app.wait_final(&ok_id).await;
        assert_eq!(done["status"], "completed", "{}", done);
        assert!(done["compressed_url"].as_str().unwrap().ends_with(".jpg"));
        let stored = app
            .storage
            .get(&format!("outputs/free/{}.jpg", ok_id))
            .await
            .unwrap();
        let decoded = image::load_from_memory(&stored).unwrap().to_rgb8();
        let corner = decoded.get_pixel(0, 0);
        assert!(
            corner[0] > 230 && corner[1] > 230 && corner[2] > 230,
            "{:?}",
            corner
        );
        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["used"], 2);
    });
}

#[test]
fn invalid_conversion_fields_are_rejected_before_quota() {
    run(async {
        let app = test_app().await;
        let png = gradient_png(32, 32);
        let bad_target = app.upload_with("a.png", &png, &[("convert", "gif")]).await;
        assert_eq!(bad_target.status, StatusCode::BAD_REQUEST);
        assert_eq!(bad_target.json()["code"], 1001);
        let bad_background = app
            .upload_with(
                "a.png",
                &png,
                &[("convert", "jpeg"), ("background", "white")],
            )
            .await;
        assert_eq!(bad_background.status, StatusCode::BAD_REQUEST);
        assert_eq!(bad_background.json()["code"], 1001);
        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["remaining"], 5);
    });
}

#[test]
fn animated_gif_keeps_every_frame() {
    run(async {
        let app = test_app().await;
        let gif = animated_gif(3);
        let task_id = app.upload_ok("loop.gif", &gif, None).await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(data["status"], "completed", "{}", data);
        let stored = app
            .storage
            .get(&format!("outputs/free/{}.gif", task_id))
            .await
            .unwrap();
        assert_eq!(gif_frame_count(&stored), 3);
    });
}

#[test]
fn animated_png_keeps_every_frame() {
    run(async {
        let app = test_app().await;
        let apng = animated_png(3);
        let task_id = app.upload_ok("loop.png", &apng, None).await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(data["status"], "completed", "{}", data);
        let stored = app
            .storage
            .get(&format!("outputs/free/{}.png", task_id))
            .await
            .unwrap();
        assert_eq!(apng_frame_count(&stored), 3);
    });
}

#[test]
fn converting_an_animation_fails_clearly_and_refunds() {
    run(async {
        let app = test_app().await;
        let gif = animated_gif(2);
        let task_id = app
            .upload_with_ok("loop.gif", &gif, &[("convert", "webp")])
            .await;
        let data = app.wait_final(&task_id).await;
        assert_eq!(data["status"], "failed", "{}", data);
        assert!(
            data["error_msg"].as_str().unwrap().contains("动图"),
            "{}",
            data
        );
        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["remaining"], 5);
    });
}

#[test]
fn heic_uploads_get_a_specific_rejection() {
    run(async {
        let app = test_app().await;
        let mut heic = 24u32.to_be_bytes().to_vec();
        heic.extend_from_slice(b"ftypheic");
        heic.extend_from_slice(&[0, 0, 0, 0]);
        heic.extend_from_slice(b"mif1heic");
        heic.extend_from_slice(&[0u8; 64]);
        let reply = app.upload("IMG_0001.HEIC", &heic, None).await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST);
        let body = reply.json();
        assert_eq!(body["code"], 1001);
        assert!(body["msg"].as_str().unwrap().contains("HEIC"), "{}", body);
        let me = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(me["quota"]["remaining"], 5);
    });
}

#[test]
fn no_gain_task_refunds_quota_while_compressing_task_settles() {
    run(async {
        let app = test_app().await;
        let pool = db::connect(&test_config().database).await.unwrap();

        let low = gradient_jpeg(64, 64, 25);
        let low_id = app.upload_ok("low.jpg", &low, None).await;
        let low_task = app.wait_final(&low_id).await;
        assert_eq!(low_task["status"], "completed", "{}", low_task);
        assert_eq!(low_task["no_gain"], true, "{}", low_task);
        assert_eq!(
            low_task["compressed_size"].as_u64().unwrap(),
            low.len() as u64
        );
        assert_eq!(low_task["downloadable"], true);

        let after_low = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(after_low["quota"]["used"], 0);
        assert_eq!(after_low["quota"]["remaining"], 5);
        let period_key = after_low["quota"]["period_key"]
            .as_str()
            .unwrap()
            .to_string();

        let low_uuid = uuid::Uuid::parse_str(&low_id).unwrap();
        let low_ledger: (i64, i64, i64) = sqlx::query_as(
            "SELECT count(*) FILTER (WHERE kind = 'reserve'),
                    count(*) FILTER (WHERE kind = 'refund'),
                    count(*) FILTER (WHERE kind = 'settle')
             FROM quota_ledger WHERE task_id = $1",
        )
        .bind(low_uuid)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(low_ledger, (1, 1, 0));
        let (used, held): (i32, i32) = sqlx::query_as(
            "SELECT used, held FROM quota_balances
             WHERE subject_type = 'device' AND subject_id = $1 AND period_key = $2",
        )
        .bind(device_id(&app))
        .bind(&period_key)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!((used, held), (0, 0));

        let high = gradient_jpeg(256, 256, 90);
        let high_id = app.upload_ok("high.jpg", &high, None).await;
        let high_task = app.wait_final(&high_id).await;
        assert_eq!(high_task["status"], "completed", "{}", high_task);
        assert_eq!(high_task["no_gain"], false, "{}", high_task);
        assert!(high_task["compressed_size"].as_u64().unwrap() < high.len() as u64);

        let after_high = app.get("/v1/me").await.json()["data"].clone();
        assert_eq!(after_high["quota"]["used"], 1);
        assert_eq!(after_high["quota"]["remaining"], 4);
        let high_uuid = uuid::Uuid::parse_str(&high_id).unwrap();
        let high_ledger: (i64, i64, i64) = sqlx::query_as(
            "SELECT count(*) FILTER (WHERE kind = 'reserve'),
                    count(*) FILTER (WHERE kind = 'refund'),
                    count(*) FILTER (WHERE kind = 'settle')
             FROM quota_ledger WHERE task_id = $1",
        )
        .bind(high_uuid)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(high_ledger, (1, 0, 1));
    });
}
