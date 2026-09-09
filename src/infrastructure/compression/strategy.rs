use crate::config::AppConfig;
use crate::domain::compression::CompressionResult;
use crate::error::AppResult;
use async_trait::async_trait;
use image::ImageFormat;

#[async_trait]
pub trait CompressionStrategy: Send + Sync {
    fn format(&self) -> ImageFormat;
    async fn compress(
        &self,
        input: &[u8],
        config: &AppConfig,
    ) -> AppResult<CompressionResult>;
}
