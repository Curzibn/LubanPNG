use async_trait::async_trait;
use axum::body::{to_bytes, Body};
use axum::http::{header, HeaderMap, Method, Request, StatusCode};
use axum::Router;
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
