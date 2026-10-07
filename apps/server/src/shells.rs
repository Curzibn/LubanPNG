use crate::config::WebConfig;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use percent_encoding::percent_decode_str;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

const SHELL_ROUTES: [(&str, &str); 10] = [
    ("/", "zh/home.html"),
    ("/en", "en/home.html"),
    ("/pricing", "zh/pricing.html"),
    ("/en/pricing", "en/pricing.html"),
    ("/developers", "zh/developers.html"),
    ("/en/developers", "en/developers.html"),
    ("/terms", "zh/terms.html"),
    ("/en/terms", "en/terms.html"),
    ("/privacy", "zh/privacy.html"),
    ("/en/privacy", "en/privacy.html"),
];

const APP_ROUTES: [&str; 4] = ["/login", "/en/login", "/dashboard", "/en/dashboard"];

const NOT_FOUND_SHELLS: [(&str, &str); 2] = [("zh", "zh/not-found.html"), ("en", "en/not-found.html")];

const SHELL_FILE_COUNT: usize = SHELL_ROUTES.len() + NOT_FOUND_SHELLS.len();

pub struct ShellTable {
    shells: HashMap<&'static str, Bytes>,
    not_found: HashMap<&'static str, Bytes>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellLoadReport {
    pub root: String,
    pub loaded: usize,
    pub total: usize,
    pub missing: Vec<&'static str>,
}

impl ShellLoadReport {
    pub fn complete(&self) -> bool {
        self.missing.is_empty()
    }
}

impl ShellTable {
    pub fn load(static_dir: &Path, extra_head: &str) -> Self {
        Self::load_reporting(static_dir, extra_head).0
    }

    pub fn load_reporting(static_dir: &Path, extra_head: &str) -> (Self, ShellLoadReport) {
        let root = static_dir.join("shells");
        let mut shells = HashMap::new();
        let mut not_found = HashMap::new();
        let mut missing = Vec::new();
        for (route, file) in SHELL_ROUTES {
            match read_shell(&root, file, extra_head) {
                Some(html) => {
                    shells.insert(route, html);
                }
                None => missing.push(file),
            }
        }
        for (lang, file) in NOT_FOUND_SHELLS {
            match read_shell(&root, file, extra_head) {
                Some(html) => {
                    not_found.insert(lang, html);
                }
                None => missing.push(file),
            }
        }
        let report = ShellLoadReport {
            root: root.display().to_string(),
            loaded: shells.len() + not_found.len(),
            total: SHELL_FILE_COUNT,
            missing,
        };
        if report.complete() {
            tracing::info!(
                loaded = report.loaded,
                total = report.total,
                root = %report.root,
                "static shells loaded"
            );
        } else {
            tracing::warn!(
                loaded = report.loaded,
                total = report.total,
                root = %report.root,
                "static shells incomplete, pre-rendered first byte is degraded"
            );
        }
        (Self { shells, not_found }, report)
    }

    fn get(&self, route: &str) -> Option<&Bytes> {
        self.shells.get(route)
    }

    fn not_found_page(&self, path: &str) -> Response {
        match self.not_found.get(not_found_language(path)) {
            Some(html) => not_found_shell_response(html),
            None => not_found_response(),
        }
    }
}

fn read_shell(root: &Path, file: &'static str, extra_head: &str) -> Option<Bytes> {
    match std::fs::read(root.join(file)) {
        Ok(raw) => {
            let html = String::from_utf8_lossy(&raw);
            Some(Bytes::from(inject_head_extras(&html, extra_head)))
        }
        Err(err) => {
            tracing::warn!(
                file,
                root = %root.display(),
                error = %err,
                "static shell missing, requests degrade to their fallback"
            );
            None
        }
    }
}

pub fn verification_meta_block(web: &WebConfig) -> String {
    let entries = [
        ("google-site-verification", &web.google_site_verification),
        ("msvalidate.01", &web.bing_site_verification),
        ("baidu-site-verification", &web.baidu_site_verification),
    ];
    let lines: Vec<String> = entries
        .iter()
        .filter(|(_, value)| !value.is_empty())
        .map(|(name, value)| format!("    <meta name=\"{name}\" content=\"{}\" />", escape_html(value)))
        .collect();
    if lines.is_empty() {
        return String::new();
    }
    format!("{}\n", lines.join("\n"))
}

pub fn inject_head_extras(html: &str, block: &str) -> String {
    if block.is_empty() {
        return html.to_string();
    }
    match html.find("</head>") {
        Some(index) => {
            let mut out = String::with_capacity(html.len() + block.len());
            out.push_str(&html[..index]);
            out.push_str(block);
            out.push_str(&html[index..]);
            out
        }
        None => {
            tracing::warn!("document is missing </head>, head extras were not injected");
            html.to_string()
        }
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub async fn serve_static_shell(
    State(shells): State<Arc<ShellTable>>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    if is_shells_asset_path(path) {
        return not_found_response();
    }
    let route = normalize_route(path);
    if let Some(html) = shells.get(route) {
        return shell_response(html);
    }
    if is_known_route(route) || has_file_extension(route) {
        return next.run(request).await;
    }
    shells.not_found_page(path)
}

fn normalize_route(path: &str) -> &str {
    if path == "/" {
        return "/";
    }
    path.trim_end_matches('/')
}

fn is_known_route(route: &str) -> bool {
    SHELL_ROUTES.iter().any(|(path, _)| *path == route) || APP_ROUTES.contains(&route)
}

fn has_file_extension(route: &str) -> bool {
    Path::new(route).extension().is_some()
}

fn not_found_language(path: &str) -> &'static str {
    if path == "/en" || path.starts_with("/en/") {
        "en"
    } else {
        "zh"
    }
}

fn is_shells_asset_path(path: &str) -> bool {
    let Ok(decoded) = percent_decode_str(path.trim_start_matches('/')).decode_utf8() else {
        return false;
    };
    let mut segments: Vec<&str> = Vec::new();
    for segment in decoded.split('/') {
        match segment {
            "" | "." => continue,
            ".." => {
                segments.pop();
            }
            other => segments.push(other),
        }
    }
    segments.first() == Some(&"shells")
}

fn shell_response(html: &Bytes) -> Response {
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        Body::from(html.clone()),
    )
        .into_response()
}

fn not_found_shell_response(html: &Bytes) -> Response {
    (
        StatusCode::NOT_FOUND,
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        Body::from(html.clone()),
    )
        .into_response()
}

fn not_found_response() -> Response {
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "Not Found",
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    fn fixture_root(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "lubanpng-shells-unit-{}-{}",
            label,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_shell_file(root: &Path, file: &str, html: &str) {
        let path = root.join("shells").join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, html).unwrap();
    }

    #[test]
    fn loads_only_shell_files_that_exist() {
        let root = fixture_root("partial");
        write_shell_file(&root, "zh/home.html", "<html lang=\"zh-CN\"></html>");

        let table = ShellTable::load(&root, "");
        assert_eq!(
            table.get("/").map(|html| html.as_ref()),
            Some("<html lang=\"zh-CN\"></html>".as_bytes())
        );
        assert!(table.get("/pricing").is_none());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn loads_every_mapped_shell_file_and_the_not_found_pages() {
        let root = fixture_root("full");
        for (route, file) in SHELL_ROUTES {
            write_shell_file(&root, file, &format!("<html data-route=\"{}\"></html>", route));
        }
        for (_lang, file) in NOT_FOUND_SHELLS {
            write_shell_file(&root, file, "<html data-shell=\"not-found\"></html>");
        }

        let table = ShellTable::load(&root, "");
        for (route, _) in SHELL_ROUTES {
            assert!(table.get(route).is_some(), "missing shell for {route}");
        }
        assert!(table.not_found.get("zh").is_some(), "missing zh not-found shell");
        assert!(table.not_found.get("en").is_some(), "missing en not-found shell");

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn missing_shells_directory_loads_empty() {
        let root = fixture_root("absent");
        let table = ShellTable::load(&root, "");
        assert!(table.get("/").is_none());
        assert!(table.get("/en/pricing").is_none());
        assert!(table.not_found.get("zh").is_none());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn complete_shells_load_reports_the_loaded_count() {
        let root = fixture_root("logged-full");
        for (route, file) in SHELL_ROUTES {
            write_shell_file(&root, file, &format!("<html data-route=\"{}\"></html>", route));
        }
        for (_lang, file) in NOT_FOUND_SHELLS {
            write_shell_file(&root, file, "<html></html>");
        }

        let (table, report) = ShellTable::load_reporting(&root, "");
        assert!(report.complete());
        assert_eq!(report.loaded, 12);
        assert_eq!(report.total, 12);
        assert_eq!(report.missing, Vec::<&str>::new());
        assert_eq!(report.root, root.join("shells").display().to_string());
        for (route, _) in SHELL_ROUTES {
            assert!(table.get(route).is_some(), "missing shell for {route}");
        }

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn partial_shells_load_warns_per_missing_file() {
        let root = fixture_root("logged-partial");
        write_shell_file(&root, "zh/home.html", "<html lang=\"zh-CN\"></html>");

        let (table, report) = ShellTable::load_reporting(&root, "");
        assert!(!report.complete());
        assert_eq!(report.loaded, 1);
        assert_eq!(report.total, 12);
        assert_eq!(report.missing.len(), 11);
        assert!(report.missing.contains(&"zh/pricing.html"), "{report:?}");
        assert!(report.missing.contains(&"en/home.html"), "{report:?}");
        assert!(report.missing.contains(&"zh/not-found.html"), "{report:?}");
        assert!(!report.missing.contains(&"zh/home.html"), "{report:?}");
        assert!(table.get("/").is_some());
        assert!(table.get("/pricing").is_none());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn normalizes_trailing_slashes_to_canonical_routes() {
        assert_eq!(normalize_route("/"), "/");
        assert_eq!(normalize_route("/en/"), "/en");
        assert_eq!(normalize_route("/pricing/"), "/pricing");
        assert_eq!(normalize_route("/developers///"), "/developers");
        assert_eq!(normalize_route("/en"), "/en");
    }

    #[test]
    fn detects_file_like_paths() {
        assert!(!has_file_extension("/pricing"));
        assert!(!has_file_extension("/en"));
        assert!(has_file_extension("/robots.txt"));
        assert!(has_file_extension("/googleae2154dccfab6ae1.html"));
        assert!(has_file_extension("/BingSiteAuth.xml"));
        assert!(has_file_extension("/assets/index-abc.js"));
    }

    #[test]
    fn classifies_known_routes_and_app_routes() {
        for route in [
            "/",
            "/en",
            "/pricing",
            "/en/pricing",
            "/developers",
            "/en/developers",
            "/terms",
            "/en/terms",
            "/privacy",
            "/en/privacy",
            "/login",
            "/en/login",
            "/dashboard",
            "/en/dashboard",
        ] {
            assert!(is_known_route(route), "{route} should be known");
        }
        assert!(!is_known_route("/nope"));
        assert!(!is_known_route("/en/nope"));
    }

    #[test]
    fn picks_the_not_found_language_from_the_path() {
        assert_eq!(not_found_language("/nope"), "zh");
        assert_eq!(not_found_language("/en"), "en");
        assert_eq!(not_found_language("/en/nope"), "en");
        assert_eq!(not_found_language("/english/nope"), "zh");
    }

    #[test]
    fn verification_block_is_empty_without_values() {
        assert_eq!(verification_meta_block(&WebConfig::default()), "");
    }

    #[test]
    fn verification_block_renders_escaped_meta_lines() {
        let mut web = WebConfig::default();
        web.google_site_verification = "tok-google".to_string();
        web.bing_site_verification = "abc\"def".to_string();
        let block = verification_meta_block(&web);
        assert!(block.contains("<meta name=\"google-site-verification\" content=\"tok-google\" />"));
        assert!(block.contains("<meta name=\"msvalidate.01\" content=\"abc&quot;def\" />"));
        assert!(!block.contains("baidu-site-verification"));
    }

    #[test]
    fn inject_head_extras_inserts_before_head_close() {
        let html = "<html><head>\n    <title>t</title>\n  </head><body></body></html>";
        let out = inject_head_extras(html, "    <meta name=\"x\" content=\"y\" />\n");
        assert!(
            out.contains("\n      <meta name=\"x\" content=\"y\" />\n</head>"),
            "{out}"
        );
        assert!(out.find("<meta").unwrap() < out.find("</head>").unwrap());
    }

    #[test]
    fn inject_head_extras_keeps_documents_untouched_when_not_needed() {
        let html = "<html><body></body></html>";
        assert_eq!(inject_head_extras(html, ""), html);
        assert_eq!(inject_head_extras(html, "    <meta name=\"x\" content=\"y\" />\n"), html);
    }

    #[test]
    fn loads_shells_with_verification_metas_when_configured() {
        let root = fixture_root("verification");
        write_shell_file(&root, "zh/home.html", "<html><head></head><body></body></html>");

        let table = ShellTable::load(&root, "    <meta name=\"google-site-verification\" content=\"tok\" />\n");
        let html = table.get("/").unwrap();
        assert!(std::str::from_utf8(html).unwrap().contains("google-site-verification"));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[tokio::test]
    async fn not_found_page_serves_localized_shells_with_404() {
        let root = fixture_root("nf-page");
        write_shell_file(&root, "zh/not-found.html", "<html data-shell=\"zh\"></html>");
        write_shell_file(&root, "en/not-found.html", "<html data-shell=\"en\"></html>");
        let table = ShellTable::load(&root, "");

        let response = table.not_found_page("/nope");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-cache");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(body.as_ref(), b"<html data-shell=\"zh\"></html>");

        let response = table.not_found_page("/en/nope");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(body.as_ref(), b"<html data-shell=\"en\"></html>");

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[tokio::test]
    async fn not_found_page_falls_back_to_plain_text_without_shells() {
        let root = fixture_root("nf-plain");
        let table = ShellTable::load(&root, "");

        let response = table.not_found_page("/nope");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert!(response.headers()[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("text/plain"));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn blocks_every_path_that_resolves_into_the_shells_tree() {
        for path in [
            "/shells",
            "/shells/",
            "/shells/zh/home.html",
            "/shells/en/pricing.html",
            "//shells/zh/home.html",
            "/./shells/terms.html",
            "/%73hells/en/home.html",
            "/shells/../shells/privacy.html",
            "/assets/../shells/zh/home.html",
            "/%2e%2e/shells/en/home.html",
            "/a/b/../../shells/zh/home.html",
            "/././shells/zh/home.html",
        ] {
            assert!(is_shells_asset_path(path), "{path} should be blocked");
        }
    }

    #[test]
    fn keeps_regular_static_and_spa_paths_available() {
        for path in [
            "/",
            "/en",
            "/en/",
            "/pricing",
            "/en/pricing",
            "/developers",
            "/terms",
            "/privacy",
            "/robots.txt",
            "/assets/app.js",
            "/shell",
            "/shells-page",
            "/login",
            "/dashboard",
        ] {
            assert!(!is_shells_asset_path(path), "{path} should not be blocked");
        }
    }

    #[tokio::test]
    async fn shell_response_carries_html_and_no_cache_headers() {
        let html = Bytes::from_static(b"<html data-shell=\"zh:home\"></html>");
        let response = shell_response(&html);

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-cache");

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(body.as_ref(), b"<html data-shell=\"zh:home\"></html>");
    }
}
