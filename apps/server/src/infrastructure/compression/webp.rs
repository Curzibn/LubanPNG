use crate::config::{AppConfig, WebpSmartConfig};
use crate::domain::compression::CompressionResult;
use crate::error::{AppError, AppResult};
use crate::infrastructure::compression::probe;
use crate::infrastructure::compression::quality::meets_floor;
use crate::infrastructure::compression::CompressionStrategy;
use async_trait::async_trait;
use image::{DynamicImage, ImageFormat, RgbaImage};

pub struct WebpCompressionStrategy;

#[async_trait]
impl CompressionStrategy for WebpCompressionStrategy {
    async fn compress(&self, input: &[u8], config: &AppConfig) -> AppResult<CompressionResult> {
        let data = if probe::webp_is_animated(input) {
            compress_animated_webp(input, &config.webp_smart)?
        } else {
            compress_static_webp(input, &config.webp_smart)?
        };
        Ok(CompressionResult::new(data, ImageFormat::WebP))
    }
}

fn lossy_config(quality: u8, method: u8) -> AppResult<::webp::WebPConfig> {
    let mut config = ::webp::WebPConfig::new()
        .map_err(|_| AppError::compression("初始化 WebP 编码配置失败"))?;
    config.lossless = 0;
    config.quality = f32::from(quality.min(100));
    config.method = i32::from(method.min(6));
    config.alpha_compression = 1;
    config.alpha_quality = 100;
    Ok(config)
}

pub fn encode_webp_lossy(image: &RgbaImage, quality: u8, method: u8) -> AppResult<Vec<u8>> {
    let config = lossy_config(quality, method)?;
    let encoded = ::webp::Encoder::from_rgba(image.as_raw(), image.width(), image.height())
        .encode_advanced(&config)
        .map_err(|e| AppError::compression(format!("WebP 编码失败: {:?}", e)))?;
    Ok(encoded.to_vec())
}

pub fn encode_webp_lossless(image: &RgbaImage) -> AppResult<Vec<u8>> {
    let encoded = ::webp::Encoder::from_rgba(image.as_raw(), image.width(), image.height())
        .encode_simple(true, 100.0)
        .map_err(|e| AppError::compression(format!("WebP 无损编码失败: {:?}", e)))?;
    Ok(encoded.to_vec())
}

pub fn encode_webp_smart(image: &RgbaImage, config: &WebpSmartConfig) -> AppResult<Vec<u8>> {
    let candidate = encode_webp_lossy(image, config.quality, config.method)?;
    let Some(floor) = config.min_ssim_score else {
        return Ok(candidate);
    };
    let reference = DynamicImage::ImageRgba8(image.clone()).to_rgb8();
    if meets_floor(&reference, &candidate, floor) {
        return Ok(candidate);
    }
    let higher = (f32::from(config.quality) * 1.1).min(100.0) as u8;
    encode_webp_lossy(image, higher, config.method)
}

fn compress_static_webp(input: &[u8], config: &WebpSmartConfig) -> AppResult<Vec<u8>> {
    let image = image::load_from_memory(input)?.to_rgba8();
    let lossy = encode_webp_smart(&image, config)?;
    if !probe::webp_is_lossless(input) {
        return Ok(lossy);
    }
    let lossless = encode_webp_lossless(&image)?;
    Ok(if lossless.len() <= lossy.len() {
        lossless
    } else {
        lossy
    })
}

fn compress_animated_webp(input: &[u8], config: &WebpSmartConfig) -> AppResult<Vec<u8>> {
    let decoded = ::webp::AnimDecoder::new(input)
        .decode()
        .map_err(|e| AppError::compression(format!("解析动态 WebP 失败: {}", e)))?;
    let mut frames: Vec<(Vec<u8>, i32)> = Vec::with_capacity(decoded.len());
    let (mut width, mut height) = (0u32, 0u32);
    for index in 0..decoded.len() {
        let frame = decoded
            .get_frame(index)
            .ok_or_else(|| AppError::compression("读取动态 WebP 帧失败"))?;
        width = frame.width();
        height = frame.height();
        let pixels = match frame.get_layout() {
            ::webp::PixelLayout::Rgba => frame.get_image().to_vec(),
            ::webp::PixelLayout::Rgb => frame
                .get_image()
                .chunks_exact(3)
                .flat_map(|chunk| [chunk[0], chunk[1], chunk[2], 255])
                .collect(),
        };
        frames.push((pixels, frame.get_time_ms()));
    }
    if frames.is_empty() {
        return Err(AppError::compression("动态 WebP 没有帧"));
    }
    let encoder_config = lossy_config(config.quality, config.method)?;
    let mut encoder = ::webp::AnimEncoder::new(width, height, &encoder_config);
    let mut start = 0;
    for (pixels, end) in &frames {
        encoder.add_frame(::webp::AnimFrame::from_rgba(pixels, width, height, start));
        start = *end;
    }
    encoder.set_loop_count(decoded.loop_count as i32);
    let encoded = encoder
        .try_encode()
        .map_err(|e| AppError::compression(format!("动态 WebP 编码失败: {:?}", e)))?;
    Ok(encoded.to_vec())
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use image::{GenericImageView, ImageEncoder, RgbImage};

    fn photo_like(w: u32, h: u32, shift: u32) -> RgbaImage {
        let mut img = RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(
                    x,
                    y,
                    image::Rgba([
                        (((x + shift) * (x + shift) / 7 + y * 3) % 256) as u8,
                        ((x + y * y / 5) % 256) as u8,
                        ((x * y / 3) % 256) as u8,
                        255,
                    ]),
                );
            }
        }
        img
    }

    pub fn sample_lossless_webp(w: u32, h: u32) -> Vec<u8> {
        let image = DynamicImage::ImageRgba8(photo_like(w, h, 0)).to_rgb8();
        let mut out = Vec::new();
        image::codecs::webp::WebPEncoder::new_lossless(&mut out)
            .write_image(image.as_raw(), w, h, image::ExtendedColorType::Rgb8)
            .unwrap();
        out
    }

    pub fn sample_animated_webp(frames: usize) -> Vec<u8> {
        let config = lossy_config(90, 4).unwrap();
        let buffers: Vec<RgbaImage> = (0..frames).map(|i| photo_like(64, 64, i as u32 * 9)).collect();
        let mut encoder = ::webp::AnimEncoder::new(64, 64, &config);
        for (index, buffer) in buffers.iter().enumerate() {
            encoder.add_frame(::webp::AnimFrame::from_rgba(buffer.as_raw(), 64, 64, index as i32 * 100));
        }
        encoder.set_loop_count(0);
        encoder.try_encode().unwrap().to_vec()
    }

    #[test]
    fn lossless_source_is_recompressed_much_smaller() {
        let original = sample_lossless_webp(128, 128);
        let compressed = compress_static_webp(&original, &WebpSmartConfig::default()).unwrap();
        assert_eq!(&compressed[8..12], b"WEBP");
        let decoded = image::load_from_memory(&compressed).unwrap();
        assert_eq!(decoded.dimensions(), (128, 128));
        assert!(compressed.len() < original.len(), "{} < {}", compressed.len(), original.len());
    }

    #[test]
    fn animated_source_keeps_frame_count_and_loop() {
        let original = sample_animated_webp(3);
        assert!(probe::webp_is_animated(&original));
        let compressed = compress_animated_webp(&original, &WebpSmartConfig::default()).unwrap();
        let decoded = ::webp::AnimDecoder::new(&compressed).decode().unwrap();
        assert_eq!(decoded.len(), 3);
        assert_eq!(decoded.loop_count, 0);
        let first = decoded.get_frame(0).unwrap();
        assert_eq!((first.width(), first.height()), (64, 64));
        let last = decoded.get_frame(2).unwrap();
        assert!(last.get_time_ms() >= 200, "last frame ends at {}ms", last.get_time_ms());
    }

    #[test]
    fn smart_encoder_output_decodes_with_same_size() {
        let image = photo_like(96, 64, 3);
        let data = encode_webp_smart(&image, &WebpSmartConfig::default()).unwrap();
        let decoded = image::load_from_memory(&data).unwrap();
        assert_eq!(decoded.dimensions(), (96, 64));
        let rgb: RgbImage = decoded.to_rgb8();
        assert_eq!(rgb.dimensions(), (96, 64));
    }
}
