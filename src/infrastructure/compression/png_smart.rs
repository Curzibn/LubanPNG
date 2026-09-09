use crate::config::PngSmartConfig;
use anyhow::Result;
use image::{DynamicImage, ColorType};

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
    
    let mut options = Options::from_preset(level.min(6) as u8);
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

fn try_imagequant(
    img: &DynamicImage,
    min_quality: u8,
    max_quality: u8,
) -> Result<Vec<u8>> {
    use image::{ImageFormat, DynamicImage};
    use std::io::Cursor;
    
    let rgba = img.to_rgba8();
    let raw_data = rgba.as_raw();
    let pixels: Vec<imagequant::RGBA> = raw_data
        .chunks_exact(4)
        .map(|chunk| imagequant::RGBA {
            r: chunk[0],
            g: chunk[1],
            b: chunk[2],
            a: chunk[3],
        })
        .collect();
    
    let mut liq = imagequant::new();
    liq.set_quality(min_quality, max_quality)
        .map_err(|e| anyhow::anyhow!("设置质量失败: {}", e))?;
    
    let mut img_liq = liq.new_image(
        pixels.into_boxed_slice(),
        rgba.width() as usize,
        rgba.height() as usize,
        0.0,
    )
    .map_err(|e| anyhow::anyhow!("创建图像失败: {}", e))?;
    
    let mut res = liq.quantize(&mut img_liq)
        .map_err(|e| anyhow::anyhow!("量化失败: {}", e))?;
    
    res.set_dithering_level(1.0)
        .map_err(|e| anyhow::anyhow!("设置抖动失败: {}", e))?;
    
    let (palette, pixels) = res.remapped(&mut img_liq)
        .map_err(|e| anyhow::anyhow!("重映射失败: {}", e))?;
    
    let mut indexed_data = Vec::new();
    for pixel in pixels.iter() {
        let color = palette[*pixel as usize];
        indexed_data.push(color.r);
        indexed_data.push(color.g);
        indexed_data.push(color.b);
        indexed_data.push(color.a);
    }
    
    let quantized_img = DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(
            rgba.width(),
            rgba.height(),
            indexed_data,
        ).ok_or_else(|| anyhow::anyhow!("创建图像失败"))?
    );
    
    let mut data = Vec::new();
    quantized_img.write_to(&mut Cursor::new(&mut data), ImageFormat::Png)
        .map_err(|e| anyhow::anyhow!("PNG编码失败: {}", e))?;

    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, RgbaImage};

    fn gradient_image(w: u32, h: u32) -> DynamicImage {
        let mut img = RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(
                    x,
                    y,
                    image::Rgba([
                        (x % 256) as u8,
                        (y % 256) as u8,
                        ((x + y) % 256) as u8,
                        255,
                    ]),
                );
            }
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn smart_png_compresses_and_keeps_dimensions() {
        let img = gradient_image(512, 512);
        let mut original = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut original), image::ImageFormat::Png)
            .unwrap();

        let config = crate::config::PngSmartConfig::default();
        let compressed = compress_png_smart(
            img,
            original.clone(),
            &config,
            70,
            100,
        )
        .unwrap();

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
        img.write_to(&mut std::io::Cursor::new(&mut original), image::ImageFormat::Png)
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
        img.write_to(&mut std::io::Cursor::new(&mut original), image::ImageFormat::Png)
            .unwrap();

        let config = crate::config::PngSmartConfig {
            enabled: false,
            ..Default::default()
        };
        let compressed = compress_png_smart(img, original.clone(), &config, 70, 100).unwrap();
        assert!(compressed.len() < original.len());
    }
}
