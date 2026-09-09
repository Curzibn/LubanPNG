use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use std::path::Path;
use tokio::fs;

#[async_trait]
pub trait FileStorage: Send + Sync {
    async fn save_upload(&self, task_id: &str, data: &[u8], extension: &str) -> AppResult<String>;
    async fn save_output(&self, task_id: &str, data: &[u8], extension: &str) -> AppResult<String>;
    async fn read_file(&self, path: &str) -> AppResult<Vec<u8>>;
    async fn ensure_directories(&self) -> AppResult<()>;
}

pub struct FileStorageImpl {
    upload_dir: String,
    output_dir: String,
}

impl FileStorageImpl {
    pub fn new(upload_dir: String, output_dir: String) -> Self {
        Self {
            upload_dir,
            output_dir,
        }
    }
}

#[async_trait]
impl FileStorage for FileStorageImpl {
    async fn save_upload(&self, task_id: &str, data: &[u8], extension: &str) -> AppResult<String> {
        fs::create_dir_all(&self.upload_dir).await
            .map_err(|e| AppError::internal(format!("创建上传目录失败: {}", e)))?;
        
        let path = format!("{}/{}{}", self.upload_dir, task_id, extension);
        fs::write(&path, data).await
            .map_err(|e| AppError::internal(format!("保存文件失败: {}", e)))?;
        
        Ok(path)
    }

    async fn save_output(&self, task_id: &str, data: &[u8], extension: &str) -> AppResult<String> {
        fs::create_dir_all(&self.output_dir).await
            .map_err(|e| AppError::internal(format!("创建输出目录失败: {}", e)))?;
        
        let path = format!("{}/compressed_{}{}", self.output_dir, task_id, extension);
        fs::write(&path, data).await
            .map_err(|e| AppError::internal(format!("保存文件失败: {}", e)))?;
        
        Ok(path)
    }

    async fn read_file(&self, path: &str) -> AppResult<Vec<u8>> {
        fs::read(path).await
            .map_err(|_| AppError::not_found(format!("文件不存在: {}", path)))
    }

    async fn ensure_directories(&self) -> AppResult<()> {
        fs::create_dir_all(&self.upload_dir).await
            .map_err(|e| AppError::internal(format!("创建上传目录失败: {}", e)))?;
        fs::create_dir_all(&self.output_dir).await
            .map_err(|e| AppError::internal(format!("创建输出目录失败: {}", e)))?;
        Ok(())
    }
}

pub fn get_format_extension(format: image::ImageFormat) -> &'static str {
    match format {
        image::ImageFormat::Png => ".png",
        image::ImageFormat::Jpeg => ".jpg",
        image::ImageFormat::Gif => ".gif",
        image::ImageFormat::WebP => ".webp",
        image::ImageFormat::Pnm => ".pnm",
        image::ImageFormat::Tiff => ".tiff",
        image::ImageFormat::Tga => ".tga",
        image::ImageFormat::Dds => ".dds",
        image::ImageFormat::Bmp => ".bmp",
        image::ImageFormat::Ico => ".ico",
        image::ImageFormat::Hdr => ".hdr",
        image::ImageFormat::OpenExr => ".exr",
        image::ImageFormat::Farbfeld => ".ff",
        image::ImageFormat::Avif => ".avif",
        image::ImageFormat::Qoi => ".qoi",
        _ => ".png",
    }
}
