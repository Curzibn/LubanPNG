use crate::config::PngSmartConfig;
use crate::infrastructure::compression::quantize::{expand_to_rgba, quantize_image};
use anyhow::Result;
use image::{ColorType, DynamicImage, ImageFormat};
use std::io::Cursor;

pub fn should_use_imagequant(img: &DynamicImage, config: &PngSmartConfig) -> bool {
    if !config.enabled {
        return false;
    }

    match img.color() {
        ColorType::L8 | ColorType::La8 | ColorType::Rgb8 | ColorType::Rgba8 => true,
        ColorType::L16 | ColorType::La16 | ColorType::Rgb16 | ColorType::Rgba16 => true,
        ColorType::Rgb32F | ColorType::Rgba32F => true,
        _ => false,
    }
}

pub fn optimize_with_oxipng(png_data: &[u8], level: u8) -> Result<Vec<u8>> {
    use oxipng::{optimize_from_memory, Options, StripChunks};

    let mut options = Options::from_preset(level.min(6));
    options.strip = StripChunks::Safe;

    let optimized = optimize_from_memory(png_data, &options)
        .map_err(|e| anyhow::anyhow!("OxiPNG优化失败: {}", e))?;

    Ok(optimized)
}

pub fn compress_png_smart(
    img: DynamicImage,
    original_data: Vec<u8>,
    config: &PngSmartConfig,
    min_quality: u8,
    max_quality: u8,
) -> Result<Vec<u8>> {
    let mut data_to_optimize = original_data;

    if should_use_imagequant(&img, config) {
        if let Ok(quantized_data) = try_imagequant(&img, min_quality, max_quality) {
            data_to_optimize = quantized_data;
        }
    }

    if config.use_oxipng {
        if let Ok(optimized) = optimize_with_oxipng(&data_to_optimize, config.oxipng_level) {
            data_to_optimize = optimized;
        }
    }

    Ok(data_to_optimize)
}

pub fn encode_png_smart(
    img: DynamicImage,
    config: &PngSmartConfig,
    min_quality: u8,
    max_quality: u8,
) -> Result<Vec<u8>> {
    let mut baseline = Vec::new();
    img.write_to(&mut Cursor::new(&mut baseline), ImageFormat::Png)?;
    compress_png_smart(img, baseline, config, min_quality, max_quality)
}

fn try_imagequant(img: &DynamicImage, min_quality: u8, max_quality: u8) -> Result<Vec<u8>> {
    let rgba = img.to_rgba8();
    let (palette, indices) = quantize_image(&rgba, min_quality, max_quality, 1.0)?;
    let quantized = expand_to_rgba(&palette, &indices, rgba.width(), rgba.height())
        .ok_or_else(|| anyhow::anyhow!("创建图像失败"))?;

    let mut data = Vec::new();
    DynamicImage::ImageRgba8(quantized)
        .write_to(&mut Cursor::new(&mut data), ImageFormat::Png)
        .map_err(|e| anyhow::anyhow!("PNG编码失败: {}", e))?;

    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, GenericImageView, RgbaImage};

    fn gradient_image(w: u32, h: u32) -> DynamicImage {
        let mut img = RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(
                    x,
                    y,
                    image::Rgba([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8, 255]),
                );
            }
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn smart_png_compresses_and_keeps_dimensions() {
        let img = gradient_image(512, 512);
        let mut original = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut original),
            image::ImageFormat::Png,
        )
        .unwrap();

        let config = crate::config::PngSmartConfig::default();
        let compressed = compress_png_smart(img, original.clone(), &config, 70, 100).unwrap();

        let decoded = image::load_from_memory(&compressed).unwrap();
        assert_eq!(decoded.width(), 512);
        assert_eq!(decoded.height(), 512);
        assert!(
            compressed.len() < original.len(),
            "compressed {} should be smaller than original {}",
            compressed.len(),
            original.len()
        );
    }

    #[test]
    fn oxipng_alone_shrinks_losslessly() {
        let img = gradient_image(256, 256);
        let mut original = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut original),
            image::ImageFormat::Png,
        )
        .unwrap();

        let optimized = optimize_with_oxipng(&original, 4).unwrap();
        assert!(optimized.len() < original.len());

        let a = image::load_from_memory(&original).unwrap().to_rgba8();
        let b = image::load_from_memory(&optimized).unwrap().to_rgba8();
        assert_eq!(a, b, "oxipng must be lossless");
    }

    #[test]
    fn imagequant_disabled_falls_back_to_oxipng() {
        let img = gradient_image(128, 128);
        let mut original = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut original),
            image::ImageFormat::Png,
        )
        .unwrap();

        let config = crate::config::PngSmartConfig {
            enabled: false,
            ..Default::default()
        };
        let compressed = compress_png_smart(img, original.clone(), &config, 70, 100).unwrap();
        assert!(compressed.len() < original.len());
    }

    #[test]
    fn encode_from_decoded_image_produces_png() {
        let img = gradient_image(64, 64);
        let config = crate::config::PngSmartConfig::default();
        let encoded = encode_png_smart(img, &config, 70, 100).unwrap();
        assert_eq!(&encoded[1..4], b"PNG");
        let decoded = image::load_from_memory(&encoded).unwrap();
        assert_eq!(decoded.dimensions(), (64, 64));
    }
}
