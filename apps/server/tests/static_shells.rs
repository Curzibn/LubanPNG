use axum::body::{to_bytes, Body};
use axum::http::{header, HeaderMap, Request, StatusCode};
use axum::Router;
use lubanpng::app::{build_router, build_state};
use lubanpng::config::AppConfig;
use lubanpng::infrastructure::mail::DisabledMailer;
use lubanpng::infrastructure::storage::S3Storage;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tower::ServiceExt;

const SPA_INDEX: &str = "<!doctype html><html data-spa-index=\"true\"><body>spa</body></html>";

const SHELL_CASES: [(&str, &str, &str); 11] = [
    ("/", "zh", "home"),
    ("/en", "en", "home"),
    ("/en/", "en", "home"),
    ("/pricing", "zh", "pricing"),
    ("/en/pricing", "en", "pricing"),
    ("/developers", "zh", "developers"),
    ("/en/developers", "en", "developers"),
    ("/terms", "zh", "terms"),
    ("/en/terms", "en", "terms"),
    ("/privacy", "zh", "privacy"),
    ("/en/privacy", "en", "privacy"),
];

static FIXTURE_SEQ: AtomicUsize = AtomicUsize::new(0);

fn fixture_dir(label: &str) -> PathBuf {
    let seq = FIXTURE_SEQ.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "lubanpng-shells-it-{}-{}-{}",
        label,
        std::process::id(),
        seq
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn canonical_path(lang: &str, page: &str) -> String {
    match (lang, page) {
        ("zh", "home") => "/".to_string(),
        ("en", "home") => "/en".to_string(),
        ("zh", page) => format!("/{page}"),
        ("en", page) => format!("/en/{page}"),
        _ => panic!("unsupported shell case {lang}:{page}"),
    }
}

fn shell_html(lang: &str, page: &str) -> String {
    let lang_attr = if lang == "zh" { "zh-CN" } else { "en" };
    format!(
        "<!doctype html><html lang=\"{lang_attr}\"><head><link rel=\"canonical\" href=\"https://lubanpng.wizthink.cn{}\"></head><body data-shell=\"{lang}:{page}\"></body></html>",
        canonical_path(lang, page)
    )
}

fn write_shell(root: &Path, lang: &str, page: &str) {
    let dir = root.join("shells").join(lang);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(format!("{page}.html")), shell_html(lang, page)).unwrap();
}

fn write_all_shells(root: &Path) {
    for (_, lang, page) in SHELL_CASES {
        write_shell(root, lang, page);
    }
}

fn write_not_found_shells(root: &Path) {
    for lang in ["zh", "en"] {
        let dir = root.join("shells").join(lang);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("not-found.html"),
            format!(
                "<!doctype html><html lang=\"{lang}\"><head><meta name=\"robots\" content=\"noindex\"></head><body data-shell=\"{lang}:not-found\"></body></html>"
            ),
        )
        .unwrap();
    }
}

fn router_with_static_and(static_dir: &Path, configure: impl FnOnce(&mut AppConfig)) -> Router {
    let mut config = AppConfig::default();
    config.web.static_dir = static_dir.to_string_lossy().into_owned();
    config.database.url = "postgres://127.0.0.1:1/lubanpng_offline".to_string();
    configure(&mut config);
    let pool = sqlx::PgPool::connect_lazy(&config.database.url).expect("lazy postgres pool");
    let storage = Arc::new(S3Storage::from_config(&config.storage).expect("storage config"));
    let state = build_state(
        config,
        pool,
        storage,
        Arc::new(DisabledMailer),
        Arc::new(lubanpng::infrastructure::upscale::DisabledUpscaler),
    );
    build_router(state)
}

fn router_with_static(static_dir: &Path) -> Router {
    router_with_static_and(static_dir, |_| {})
}

async fn fetch(router: &Router, path: &str) -> (StatusCode, HeaderMap, Vec<u8>) {
    let request = Request::builder().uri(path).body(Body::empty()).unwrap();
    let response = router.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, headers, body.to_vec())
}

fn text(body: &[u8]) -> String {
    String::from_utf8(body.to_vec()).unwrap()
}

#[tokio::test]
async fn serves_generated_shell_for_every_mapped_route() {
    let dir = fixture_dir("full");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    write_all_shells(&dir);
    let router = router_with_static(&dir);

    for (path, lang, page) in SHELL_CASES {
        let (status, headers, body) = fetch(&router, path).await;
        assert_eq!(status, StatusCode::OK, "{path}");
        assert_eq!(
            headers[header::CONTENT_TYPE],
            "text/html; charset=utf-8",
            "{path}"
        );
        assert_eq!(headers[header::CACHE_CONTROL], "no-cache", "{path}");

        let html = text(&body);
        assert!(
            html.contains(&format!("data-shell=\"{lang}:{page}\"")),
            "{path}: {html}"
        );
        assert!(!html.contains("data-spa-index"), "{path}: {html}");
        assert!(
            html.contains(&format!(
                "canonical\" href=\"https://lubanpng.wizthink.cn{}\"",
                canonical_path(lang, page)
            )),
            "{path}: {html}"
        );
    }

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn serves_shells_for_trailing_slash_routes() {
    let dir = fixture_dir("trailing");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    write_all_shells(&dir);
    let router = router_with_static(&dir);

    let (status, _, body) = fetch(&router, "/pricing/").await;
    assert_eq!(status, StatusCode::OK);
    assert!(text(&body).contains("data-shell=\"zh:pricing\""));

    let (status, _, body) = fetch(&router, "/en/").await;
    assert_eq!(status, StatusCode::OK);
    assert!(text(&body).contains("data-shell=\"en:home\""));

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn falls_back_to_spa_when_a_shell_file_is_missing() {
    let dir = fixture_dir("partial");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    write_shell(&dir, "zh", "pricing");
    let router = router_with_static(&dir);

    let (status, _, body) = fetch(&router, "/pricing").await;
    assert_eq!(status, StatusCode::OK);
    assert!(text(&body).contains("data-shell=\"zh:pricing\""));

    for path in ["/en/pricing", "/", "/en"] {
        let (status, _, body) = fetch(&router, path).await;
        assert_eq!(status, StatusCode::OK, "{path}");
        assert!(text(&body).contains("data-spa-index"), "{path}");
    }

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn keeps_spa_when_the_shells_directory_is_absent() {
    let dir = fixture_dir("absent");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    let router = router_with_static(&dir);

    for path in ["/", "/en", "/en/", "/pricing", "/en/pricing", "/terms"] {
        let (status, _, body) = fetch(&router, path).await;
        assert_eq!(status, StatusCode::OK, "{path}");
        assert!(text(&body).contains("data-spa-index"), "{path}");
    }

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn serves_the_localized_not_found_shell_with_404_status() {
    let dir = fixture_dir("not-found");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    write_all_shells(&dir);
    write_not_found_shells(&dir);
    let router = router_with_static(&dir);

    let (status, headers, body) = fetch(&router, "/definitely-missing").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(headers[header::CONTENT_TYPE], "text/html; charset=utf-8");
    assert_eq!(headers[header::CACHE_CONTROL], "no-cache");
    assert!(text(&body).contains("data-shell=\"zh:not-found\""));

    let (status, _, body) = fetch(&router, "/en/definitely-missing").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(text(&body).contains("data-shell=\"en:not-found\""));

    let (status, _, body) = fetch(&router, "/missing-file.png").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(text(&body), "Not Found");

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn serves_root_verification_files_before_the_spa_fallback() {
    let dir = fixture_dir("verify-file");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    write_not_found_shells(&dir);
    std::fs::write(
        dir.join("googleae2154dccfab6ae1.html"),
        "google-site-verification: googleae2154dccfab6ae1.html",
    )
    .unwrap();
    std::fs::write(
        dir.join("BingSiteAuth.xml"),
        "<?xml version=\"1.0\"?><users><user>ABC</user></users>",
    )
    .unwrap();
    let router = router_with_static(&dir);

    let (status, headers, body) = fetch(&router, "/googleae2154dccfab6ae1.html").await;
    assert_eq!(status, StatusCode::OK);
    assert!(headers[header::CONTENT_TYPE]
        .to_str()
        .unwrap()
        .starts_with("text/html"));
    assert_eq!(
        text(&body),
        "google-site-verification: googleae2154dccfab6ae1.html"
    );

    let (status, headers, body) = fetch(&router, "/BingSiteAuth.xml").await;
    assert_eq!(status, StatusCode::OK);
    assert!(headers[header::CONTENT_TYPE].to_str().unwrap().contains("xml"));
    assert_eq!(
        text(&body),
        "<?xml version=\"1.0\"?><users><user>ABC</user></users>"
    );

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn injects_site_verification_meta_into_shells_and_the_index() {
    let dir = fixture_dir("verification-meta");
    std::fs::write(
        dir.join("index.html"),
        "<!doctype html><html><head><title>idx</title></head><body>spa</body></html>",
    )
    .unwrap();
    write_all_shells(&dir);
    write_not_found_shells(&dir);
    let router = router_with_static_and(&dir, |config| {
        config.web.google_site_verification = "tok-google".to_string();
        config.web.bing_site_verification = "tok-bing".to_string();
    });

    let (status, _, body) = fetch(&router, "/").await;
    assert_eq!(status, StatusCode::OK);
    let html = text(&body);
    assert!(
        html.contains("<meta name=\"google-site-verification\" content=\"tok-google\" />"),
        "{html}"
    );
    assert!(html.contains("<meta name=\"msvalidate.01\" content=\"tok-bing\" />"), "{html}");

    let (status, _, body) = fetch(&router, "/login").await;
    assert_eq!(status, StatusCode::OK);
    assert!(text(&body).contains("google-site-verification"));

    let (status, _, body) = fetch(&router, "/definitely-missing").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(text(&body).contains("google-site-verification"));

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn omits_site_verification_meta_without_values() {
    let dir = fixture_dir("verification-off");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    write_all_shells(&dir);
    let router = router_with_static(&dir);

    let (_, _, body) = fetch(&router, "/").await;
    assert!(!text(&body).contains("verification"));

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn blocks_shell_asset_paths_from_outside() {
    let dir = fixture_dir("blocked");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    write_all_shells(&dir);
    let router = router_with_static(&dir);

    for path in [
        "/shells",
        "/shells/",
        "/shells/zh/home.html",
        "/shells/en/pricing.html",
        "//shells/zh/home.html",
        "/%73hells/en/home.html",
        "/./shells/terms.html",
    ] {
        let (status, headers, body) = fetch(&router, path).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
        assert!(
            headers[header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .starts_with("text/plain"),
            "{path}"
        );
        assert_eq!(text(&body), "Not Found", "{path}");
    }

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn never_serves_shell_files_through_dot_segment_paths() {
    let dir = fixture_dir("dot-segments");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    write_all_shells(&dir);
    let router = router_with_static(&dir);

    for path in [
        "/x/../shells/zh/home.html",
        "/x/y/../../shells/en/pricing.html",
        "/%2e%2e/shells/zh/terms.html",
        "/%2E%2E/shells/en/home.html",
        "/assets/%2e%2e/shells/zh/privacy.html",
        "/./shells/en/developers.html",
        "/x/..//shells/zh/home.html",
    ] {
        let (status, _, body) = fetch(&router, path).await;
        let html = text(&body);
        assert!(
            !html.contains("data-shell="),
            "{path} leaked a static shell: {status} {html}"
        );
        assert_eq!(status, StatusCode::NOT_FOUND, "{path}: {html}");
    }

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn keeps_spa_for_app_routes_and_404s_unknown_pages() {
    let dir = fixture_dir("regression");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    std::fs::write(dir.join("robots.txt"), "User-agent: *\nAllow: /\n").unwrap();
    write_all_shells(&dir);
    let router = router_with_static(&dir);

    for path in ["/login", "/dashboard"] {
        let (status, headers, body) = fetch(&router, path).await;
        assert_eq!(status, StatusCode::OK, "{path}");
        assert_eq!(
            headers[header::CONTENT_TYPE],
            "text/html; charset=utf-8",
            "{path}"
        );
        assert!(text(&body).contains("data-spa-index"), "{path}");
    }

    let (status, headers, body) = fetch(&router, "/totally-unknown-page").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(headers[header::CONTENT_TYPE]
        .to_str()
        .unwrap()
        .starts_with("text/plain"));
    assert_eq!(text(&body), "Not Found");

    let (status, _, body) = fetch(&router, "/robots.txt").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(text(&body), "User-agent: *\nAllow: /\n");

    let (status, _, _) = fetch(&router, "/missing-image.png").await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _, body) = fetch(&router, "/healthz").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(text(&body), "ok");

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn serves_llms_txt_as_markdown_when_present() {
    let dir = fixture_dir("llms");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    std::fs::write(
        dir.join("llms.txt"),
        "# LubanPNG\n\n> compression and upscaling · 压缩与放大\n",
    )
    .unwrap();
    let router = router_with_static(&dir);

    let (status, headers, body) = fetch(&router, "/llms.txt").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers[header::CONTENT_TYPE],
        "text/markdown; charset=utf-8"
    );
    assert_eq!(
        text(&body),
        "# LubanPNG\n\n> compression and upscaling · 压缩与放大\n"
    );

    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn keeps_not_found_semantics_for_llms_txt_when_absent() {
    let dir = fixture_dir("llms-absent");
    std::fs::write(dir.join("index.html"), SPA_INDEX).unwrap();
    let router = router_with_static(&dir);

    let (status, headers, body) = fetch(&router, "/llms.txt").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(headers[header::CONTENT_TYPE]
        .to_str()
        .unwrap()
        .starts_with("text/plain"));
    assert_eq!(text(&body), "Not Found");

    std::fs::remove_dir_all(&dir).unwrap();
}
