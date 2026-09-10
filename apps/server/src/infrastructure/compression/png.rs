use crate::config::AppConfig;
use crate::domain::compression::CompressionResult;
use crate::error::AppResult;
use crate::infrastructure::compression::apng::compress_apng;
use crate::infrastructure::compression::png_smart::compress_png_smart;
use crate::infrastructure::compression::probe;
use crate::infrastructure::compression::CompressionStrategy;
use async_trait::async_trait;
use image::ImageFormat;

pub struct PngCompressionStrategy;

#[async_trait]
impl CompressionStrategy for PngCompressionStrategy {
    async fn compress(&self, input: &[u8], config: &AppConfig) -> AppResult<CompressionResult> {
        if probe::is_animated(input, ImageFormat::Png) {
            let data = compress_apng(input, config)?;
            return Ok(CompressionResult::new(data, ImageFormat::Png));
        }
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
