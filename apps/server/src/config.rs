use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub imagequant: ImageQuantConfig,
    pub jpeg_smart: JpegSmartConfig,
    pub png_smart: PngSmartConfig,
    pub database: DatabaseConfig,
    pub storage: StorageConfig,
    pub auth: AuthConfig,
    pub mail: MailConfig,
    pub web: WebConfig,
    pub limits: LimitsConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub max_upload_size: u64,
    pub max_concurrent_tasks: usize,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 3000,
            max_upload_size: 50 * 1024 * 1024,
            max_concurrent_tasks: std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(8),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ImageQuantConfig {
    pub min_quality: u8,
    pub max_quality: u8,
}

impl Default for ImageQuantConfig {
    fn default() -> Self {
        Self {
            min_quality: 70,
            max_quality: 100,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct JpegSmartConfig {
    pub enabled: bool,
    pub skip_low_quality_threshold: u8,
    pub safe_compress_threshold: u8,
    pub min_ssim_score: Option<f64>,
    pub adaptive_quality: bool,
}

impl Default for JpegSmartConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            skip_low_quality_threshold: 70,
            safe_compress_threshold: 85,
            min_ssim_score: Some(0.90),
            adaptive_quality: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PngSmartConfig {
    pub enabled: bool,
    pub skip_palette: bool,
    pub use_oxipng: bool,
    pub oxipng_level: u8,
}

impl Default for PngSmartConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            skip_palette: true,
            use_oxipng: true,
            oxipng_level: 4,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            url: "postgres://localhost/lubanpng".to_string(),
            max_connections: 8,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct StorageConfig {
    pub endpoint: String,
    pub public_endpoint: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    pub region: String,
    pub presign_ttl_secs: u64,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            endpoint: "http://127.0.0.1:9000".to_string(),
            public_endpoint: String::new(),
            bucket: "lubanpng".to_string(),
            access_key: String::new(),
            secret_key: String::new(),
            region: "us-east-1".to_string(),
            presign_ttl_secs: 600,
        }
    }
}

impl StorageConfig {
    pub fn public_endpoint_or_internal(&self) -> &str {
        if self.public_endpoint.is_empty() {
            &self.endpoint
        } else {
            &self.public_endpoint
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AuthConfig {
    pub cookie_secret: String,
    pub secure_cookies: bool,
    pub session_ttl_days: i64,
    pub otp_ttl_secs: i64,
    pub otp_max_attempts: i32,
    pub otp_resend_secs: i64,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            cookie_secret: String::new(),
            secure_cookies: true,
            session_ttl_days: 30,
            otp_ttl_secs: 600,
            otp_max_attempts: 5,
            otp_resend_secs: 60,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct MailConfig {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    pub password: String,
    pub from: String,
}

impl Default for MailConfig {
    fn default() -> Self {
        Self {
            smtp_host: String::new(),
            smtp_port: 465,
            username: String::new(),
            password: String::new(),
            from: "LubanPNG <noreply@example.com>".to_string(),
        }
    }
}

impl MailConfig {
    pub fn enabled(&self) -> bool {
        !self.smtp_host.is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WebConfig {
    pub static_dir: String,
}

impl Default for WebConfig {
    fn default() -> Self {
        Self {
            static_dir: "web".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LimitsConfig {
    pub anonymous_uploads_per_ip_per_day: u32,
    pub otp_per_email_per_10min: u32,
    pub otp_per_ip_per_hour: u32,
    pub visit_per_device_per_minute: u32,
    pub visit_per_ip_per_minute: u32,
    pub status_wait_max_secs: u64,
    pub worker_stale_secs: i64,
}

impl Default for LimitsConfig {
    fn default() -> Self {
        Self {
            anonymous_uploads_per_ip_per_day: 30,
            otp_per_email_per_10min: 3,
            otp_per_ip_per_hour: 20,
            visit_per_device_per_minute: 30,
            visit_per_ip_per_minute: 120,
            status_wait_max_secs: 30,
            worker_stale_secs: 600,
        }
    }
}

impl AppConfig {
    pub fn load() -> Result<Self, config::ConfigError> {
        let defaults = config::Config::try_from(&Self::default())?;
        let config = config::Config::builder()
            .add_source(defaults)
            .add_source(config::File::with_name("config").required(false))
            .add_source(
                config::Environment::with_prefix("APP")
                    .prefix_separator("_")
                    .separator("__")
                    .try_parsing(true),
            )
            .build()?;

        config.try_deserialize()
    }
}

#[cfg(test)]
mod tests {
    use super::AppConfig;

    #[test]
    fn environment_overrides_nested_keys_with_double_underscore() {
        std::env::set_var("APP_DATABASE__URL", "postgres://probe@127.0.0.1:5432/probe");
        std::env::set_var("APP_SERVER__PORT", "3456");
        std::env::set_var("APP_AUTH__SECURE_COOKIES", "false");
        let config = AppConfig::load().unwrap();
        assert_eq!(config.database.url, "postgres://probe@127.0.0.1:5432/probe");
        assert_eq!(config.server.port, 3456);
        assert!(!config.auth.secure_cookies);
        assert_eq!(config.storage.bucket, "lubanpng");
    }
}
