use crate::config::AppConfig;
use crate::domain::compression::CompressionResult;
use crate::error::AppResult;
use crate::infrastructure::compression::CompressionStrategy;
use crate::infrastructure::compression::png_smart::compress_png_smart;
use async_trait::async_trait;
use image::ImageFormat;

pub struct PngCompressionStrategy;

#[async_trait]
impl CompressionStrategy for PngCompressionStrategy {
    async fn compress(
        &self,
        input: &[u8],
        config: &AppConfig,
    ) -> AppResult<CompressionResult> {
        let img = image::load_from_memory(input)?;
        let data = compress_png_smart(
            img,
            input.to_vec(),
            &config.png_smart,
            config.imagequant.min_quality,
            config.imagequant.max_quality,
        )?;
        Ok(CompressionResult::new(data, ImageFormat::Png))
    }
}
