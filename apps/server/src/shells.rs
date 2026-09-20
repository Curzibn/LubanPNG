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

const SHELL_ROUTES: [(&str, &str); 11] = [
    ("/", "zh/home.html"),
    ("/en", "en/home.html"),
    ("/en/", "en/home.html"),
    ("/pricing", "zh/pricing.html"),
    ("/en/pricing", "en/pricing.html"),
    ("/developers", "zh/developers.html"),
    ("/en/developers", "en/developers.html"),
    ("/terms", "zh/terms.html"),
    ("/en/terms", "en/terms.html"),
    ("/privacy", "zh/privacy.html"),
    ("/en/privacy", "en/privacy.html"),
];

pub struct ShellTable {
    shells: HashMap<&'static str, Bytes>,
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
    pub fn load(static_dir: &Path) -> Self {
        Self::load_reporting(static_dir).0
    }

    pub fn load_reporting(static_dir: &Path) -> (Self, ShellLoadReport) {
        let root = static_dir.join("shells");
        let mut shells = HashMap::new();
        let mut missing = Vec::new();
        for (route, file) in SHELL_ROUTES {
            match std::fs::read(root.join(file)) {
                Ok(html) => {
                    shells.insert(route, Bytes::from(html));
                }
                Err(err) => {
                    missing.push(file);
                    tracing::warn!(
                        route,
                        file,
                        root = %root.display(),
                        error = %err,
                        "static shell missing, requests fall back to the SPA index"
                    );
                }
            }
        }
        let report = ShellLoadReport {
            root: root.display().to_string(),
            loaded: shells.len(),
            total: SHELL_ROUTES.len(),
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
        (Self { shells }, report)
    }

    fn get(&self, path: &str) -> Option<&Bytes> {
        self.shells.get(path)
    }
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
    if let Some(html) = shells.get(path) {
        return shell_response(html);
    }
    next.run(request).await
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

    #[test]
    fn loads_only_shell_files_that_exist() {
        let root = fixture_root("partial");
        let zh = root.join("shells/zh");
        std::fs::create_dir_all(&zh).unwrap();
        std::fs::write(zh.join("home.html"), "<html lang=\"zh-CN\"></html>").unwrap();

        let table = ShellTable::load(&root);
        assert_eq!(
            table.get("/").map(|html| html.as_ref()),
            Some("<html lang=\"zh-CN\"></html>".as_bytes())
        );
        assert!(table.get("/pricing").is_none());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn loads_every_mapped_shell_file() {
        let root = fixture_root("full");
        for (route, file) in SHELL_ROUTES {
            let path = root.join("shells").join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, format!("<html data-route=\"{}\"></html>", route)).unwrap();
        }

        let table = ShellTable::load(&root);
        for (route, _) in SHELL_ROUTES {
            assert!(table.get(route).is_some(), "missing shell for {route}");
        }

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn missing_shells_directory_loads_empty() {
        let root = fixture_root("absent");
        let table = ShellTable::load(&root);
        assert!(table.get("/").is_none());
        assert!(table.get("/en/pricing").is_none());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn complete_shells_load_reports_the_loaded_count() {
        let root = fixture_root("logged-full");
        for (route, file) in SHELL_ROUTES {
            let path = root.join("shells").join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, format!("<html data-route=\"{}\"></html>", route)).unwrap();
        }

        let (table, report) = ShellTable::load_reporting(&root);
        assert!(report.complete());
        assert_eq!(report.loaded, 11);
        assert_eq!(report.total, 11);
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
        let zh = root.join("shells/zh");
        std::fs::create_dir_all(&zh).unwrap();
        std::fs::write(zh.join("home.html"), "<html lang=\"zh-CN\"></html>").unwrap();

        let (table, report) = ShellTable::load_reporting(&root);
        assert!(!report.complete());
        assert_eq!(report.loaded, 1);
        assert_eq!(report.total, 11);
        assert_eq!(report.missing.len(), 10);
        assert!(report.missing.contains(&"zh/pricing.html"), "{report:?}");
        assert!(report.missing.contains(&"en/home.html"), "{report:?}");
        assert!(!report.missing.contains(&"zh/home.html"), "{report:?}");
        assert!(table.get("/").is_some());
        assert!(table.get("/pricing").is_none());

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
