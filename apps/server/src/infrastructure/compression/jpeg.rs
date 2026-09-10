use crate::config::{AppConfig, JpegSmartConfig};
use crate::domain::compression::CompressionResult;
use crate::error::AppResult;
use crate::infrastructure::compression::jpeg_smart::{
    decide_compression_strategy, estimate_jpeg_quality,
};
use crate::infrastructure::compression::quality::meets_floor;
use crate::infrastructure::compression::CompressionStrategy;
use async_trait::async_trait;
use image::{ImageFormat, RgbImage};
use mozjpeg::{ColorSpace, Compress};
use std::panic;

pub struct JpegCompressionStrategy;

#[async_trait]
impl CompressionStrategy for JpegCompressionStrategy {
    async fn compress(&self, input: &[u8], config: &AppConfig) -> AppResult<CompressionResult> {
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

        let rgb = image::load_from_memory(input)?.to_rgb8();
        let data = encode_jpeg_smart(
            &rgb,
            decision.target_quality,
            &config.jpeg_smart,
            config.imagequant.max_quality,
        )?;
        Ok(CompressionResult::new(data, ImageFormat::Jpeg))
    }
}

pub fn encode_jpeg_smart(
    rgb: &RgbImage,
    target_quality: u8,
    config: &JpegSmartConfig,
    max_quality: u8,
) -> AppResult<Vec<u8>> {
    let width = rgb.width() as usize;
    let height = rgb.height() as usize;
    let compressed = compress_jpeg_with_quality(rgb.as_raw(), width, height, target_quality)?;
    let Some(min_ssim) = config.min_ssim_score else {
        return Ok(compressed);
    };
    if meets_floor(rgb, &compressed, min_ssim) {
        return Ok(compressed);
    }
    let higher_quality = (target_quality as f32 * 1.1).min(max_quality as f32) as u8;
    compress_jpeg_with_quality(rgb.as_raw(), width, height, higher_quality)
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
        Ok(Err(e)) => Err(crate::error::AppError::compression(format!(
            "JPEG编码失败: {}",
            e
        ))),
        Err(_) => Err(crate::error::AppError::compression(
            "JPEG编码过程中发生panic",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, GenericImageView, RgbImage};

    fn photo_like_image(w: u32, h: u32) -> DynamicImage {
        let mut img = RgbImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(
                    x,
                    y,
                    image::Rgb([
                        ((x * x / 7 + y * 3) % 256) as u8,
                        ((x + y * y / 5) % 256) as u8,
                        ((x * y / 3) % 256) as u8,
                    ]),
                );
            }
        }
        DynamicImage::ImageRgb8(img)
    }

    #[tokio::test]
    async fn jpeg_strategy_compresses_and_keeps_dimensions() {
        let img = photo_like_image(256, 256);
        let mut original = Vec::new();
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut original, 90);
        img.write_with_encoder(encoder).unwrap();

        let config = crate::config::AppConfig::default();
        let result = JpegCompressionStrategy
            .compress(&original, &config)
            .await
            .unwrap();

        assert_eq!(result.format, ImageFormat::Jpeg);
        let decoded = image::load_from_memory(&result.data).unwrap();
        assert_eq!(decoded.width(), 256);
        assert_eq!(decoded.height(), 256);
        assert!(
            result.data.len() < original.len(),
            "compressed {} should be smaller than original {}",
            result.data.len(),
            original.len()
        );
    }

    #[test]
    fn smart_encoder_writes_a_decodable_jpeg() {
        let rgb = photo_like_image(64, 64).to_rgb8();
        let config = crate::config::JpegSmartConfig::default();
        let data = encode_jpeg_smart(&rgb, 80, &config, 100).unwrap();
        assert_eq!(&data[..2], &[0xFF, 0xD8]);
        assert_eq!(image::load_from_memory(&data).unwrap().dimensions(), (64, 64));
    }
}
