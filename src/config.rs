use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub imagequant: ImageQuantConfig,
    #[serde(default)]
    pub jpeg_smart: JpegSmartConfig,
    #[serde(default)]
    pub png_smart: PngSmartConfig,
    #[serde(default)]
    pub storage: StorageConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    #[serde(default = "default_max_upload_size")]
    pub max_upload_size: u64,
    #[serde(default = "default_max_concurrent_tasks")]
    pub max_concurrent_tasks: usize,
}

fn default_max_upload_size() -> u64 {
    50 * 1024 * 1024
}

fn default_max_concurrent_tasks() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(8)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageQuantConfig {
    pub min_quality: u8,
    pub max_quality: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JpegSmartConfig {
    pub enabled: bool,
    pub skip_low_quality_threshold: u8,
    pub safe_compress_threshold: u8,
    pub min_ssim_score: Option<f64>,
    pub adaptive_quality: bool,
}

static CONFIG: OnceLock<AppConfig> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    #[serde(default = "default_upload_dir")]
    pub upload_dir: String,
    #[serde(default = "default_output_dir")]
    pub output_dir: String,
}

fn default_upload_dir() -> String {
    "uploads".to_string()
}

fn default_output_dir() -> String {
    "outputs".to_string()
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            upload_dir: default_upload_dir(),
            output_dir: default_output_dir(),
        }
    }
}

impl AppConfig {
    pub fn load() -> Result<Self, config::ConfigError> {
        let defaults = config::Config::try_from(&Self::default())?;
        let config = config::Config::builder()
            .add_source(defaults)
            .add_source(config::File::with_name("config").required(false))
            .add_source(config::Environment::with_prefix("APP").separator("_"))
            .build()?;

        config.try_deserialize()
    }

    pub fn get() -> &'static AppConfig {
        CONFIG.get_or_init(|| {
            Self::load().unwrap_or_else(|e| {
                eprintln!("加载配置失败: {}，使用默认配置", e);
                Self::default()
            })
        })
    }

    pub fn init() -> Result<(), config::ConfigError> {
        if CONFIG.get().is_some() {
            return Ok(());
        }
        let cfg = Self::load()?;
        CONFIG.set(cfg).map_err(|_| {
            config::ConfigError::Message("配置已初始化".to_string())
        })?;
        Ok(())
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 3000,
                max_upload_size: default_max_upload_size(),
                max_concurrent_tasks: default_max_concurrent_tasks(),
            },
            imagequant: ImageQuantConfig {
                min_quality: 70,
                max_quality: 100,
            },
            jpeg_smart: JpegSmartConfig::default(),
            png_smart: PngSmartConfig::default(),
            storage: StorageConfig::default(),
        }
    }
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
