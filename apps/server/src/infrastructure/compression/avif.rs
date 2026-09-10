use crate::config::{AppConfig, AvifSmartConfig};
use crate::domain::compression::CompressionResult;
use crate::error::AppResult;
use crate::infrastructure::compression::quality::meets_floor;
use crate::infrastructure::compression::CompressionStrategy;
use async_trait::async_trait;
use image::codecs::avif::AvifEncoder;
use image::{DynamicImage, ExtendedColorType, ImageEncoder, ImageFormat, RgbaImage};

pub struct AvifCompressionStrategy;

#[async_trait]
impl CompressionStrategy for AvifCompressionStrategy {
    async fn compress(&self, input: &[u8], config: &AppConfig) -> AppResult<CompressionResult> {
        let image = image::load_from_memory(input)?.to_rgba8();
        let data = encode_avif_smart(&image, &config.avif_smart)?;
        Ok(CompressionResult::new(data, ImageFormat::Avif))
    }
}

pub fn encode_avif(image: &RgbaImage, quality: u8, speed: u8) -> AppResult<Vec<u8>> {
    let mut out = Vec::new();
    AvifEncoder::new_with_speed_quality(&mut out, speed.clamp(1, 10), quality.clamp(1, 100))
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )?;
    Ok(out)
}

pub fn encode_avif_smart(image: &RgbaImage, config: &AvifSmartConfig) -> AppResult<Vec<u8>> {
    let candidate = encode_avif(image, config.quality, config.speed)?;
    let Some(floor) = config.min_ssim_score else {
        return Ok(candidate);
    };
    let reference = DynamicImage::ImageRgba8(image.clone()).to_rgb8();
    if meets_floor(&reference, &candidate, floor) {
        return Ok(candidate);
    }
    let higher = (f32::from(config.quality) * 1.1).min(100.0) as u8;
    encode_avif(image, higher, config.speed)
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use image::GenericImageView;

    fn photo_like(w: u32, h: u32) -> RgbaImage {
        let mut img = RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(
                    x,
                    y,
                    image::Rgba([
                        ((x * x / 7 + y * 3) % 256) as u8,
                        ((x + y * y / 5) % 256) as u8,
                        ((x * y / 3) % 256) as u8,
                        255,
                    ]),
                );
            }
        }
        img
    }

    pub fn sample_avif(w: u32, h: u32, quality: u8) -> Vec<u8> {
        encode_avif(&photo_like(w, h), quality, 10).unwrap()
    }

    #[test]
    fn avif_round_trip_decodes_with_native_decoder() {
        let original = sample_avif(64, 48, 90);
        let decoded = image::load_from_memory(&original).unwrap();
        assert_eq!(decoded.dimensions(), (64, 48));
    }

    #[tokio::test]
    async fn high_quality_avif_gets_smaller() {
        let original = sample_avif(128, 128, 95);
        let result = AvifCompressionStrategy
            .compress(&original, &AppConfig::default())
            .await
            .unwrap();
        assert_eq!(result.format, ImageFormat::Avif);
        assert_eq!(image::load_from_memory(&result.data).unwrap().dimensions(), (128, 128));
        assert!(result.data.len() < original.len(), "{} < {}", result.data.len(), original.len());
    }
}
