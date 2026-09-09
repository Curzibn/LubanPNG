use crate::config::AppConfig;
use crate::domain::compression::CompressionResult;
use crate::error::AppResult;
use crate::infrastructure::compression::CompressionStrategy;
use crate::infrastructure::compression::jpeg_smart::{decide_compression_strategy, estimate_jpeg_quality, calculate_ssim};
use async_trait::async_trait;
use image::ImageFormat;
use mozjpeg::{Compress, ColorSpace};
use std::panic;

pub struct JpegCompressionStrategy;

#[async_trait]
impl CompressionStrategy for JpegCompressionStrategy {
    fn format(&self) -> ImageFormat {
        ImageFormat::Jpeg
    }

    async fn compress(
        &self,
        input: &[u8],
        config: &AppConfig,
    ) -> AppResult<CompressionResult> {
        let estimated_quality = estimate_jpeg_quality(input).unwrap_or(None);
        
        let decision = decide_compression_strategy(
            estimated_quality,
            &config.jpeg_smart,
            config.imagequant.min_quality,
            config.imagequant.max_quality,
        );
        
        if !decision.should_compress {
            return Ok(CompressionResult::new(input.to_vec(), ImageFormat::Jpeg));
        }
        
        let img = image::load_from_memory(input)?;
        let rgb = img.to_rgb8();
        let width = rgb.width() as usize;
        let height = rgb.height() as usize;
        let rgb_data = rgb.as_raw();
        let target_quality = decision.target_quality;
        
        let compressed_data = compress_jpeg_with_quality(rgb_data, width, height, target_quality)?;
        
        if let Some(min_ssim) = config.jpeg_smart.min_ssim_score {
            if let Ok(compressed_img) = image::load_from_memory(&compressed_data) {
                let compressed_rgb = compressed_img.to_rgb8();
                
                if compressed_rgb.width() == rgb.width() && compressed_rgb.height() == rgb.height() {
                    match calculate_ssim(&rgb, &compressed_rgb) {
                        Ok(ssim_score) => {
                            if ssim_score < min_ssim {
                                let higher_quality = (target_quality as f32 * 1.1)
                                    .min(config.imagequant.max_quality as f32) as u8;
                                
                                let retry_data = compress_jpeg_with_quality(
                                    rgb_data,
                                    width,
                                    height,
                                    higher_quality,
                                )?;
                                return Ok(CompressionResult::new(retry_data, ImageFormat::Jpeg));
                            }
                        }
                        Err(_) => {}
                    }
                }
            }
        }
        
        Ok(CompressionResult::new(compressed_data, ImageFormat::Jpeg))
    }
}

fn compress_jpeg_with_quality(
    rgb_data: &[u8],
    width: usize,
    height: usize,
    quality: u8,
) -> AppResult<Vec<u8>> {
    let result = panic::catch_unwind(|| -> std::io::Result<Vec<u8>> {
        let mut comp = Compress::new(ColorSpace::JCS_RGB);
        comp.set_quality(quality as f32);
        comp.set_size(width, height);
        
        let mut comp = comp.start_compress(Vec::new())?;
        comp.write_scanlines(rgb_data)?;
        comp.finish()
    });
    
    match result {
        Ok(Ok(data)) => Ok(data),
        Ok(Err(e)) => Err(crate::error::AppError::compression(format!("JPEG编码失败: {}", e))),
        Err(_) => Err(crate::error::AppError::compression("JPEG编码过程中发生panic")),
    }
}
