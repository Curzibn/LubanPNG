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

pub struct PngCompressResult {
    pub data: Vec<u8>,
    pub used_imagequant: bool,
    pub used_oxipng: bool,
}

pub fn compress_png_smart(
    img: DynamicImage,
    original_data: Vec<u8>,
    config: &PngSmartConfig,
    min_quality: u8,
    max_quality: u8,
) -> Result<PngCompressResult> {
    let mut used_imagequant = false;
    let mut data_to_optimize = original_data;
    
    if should_use_imagequant(&img, config) {
        match try_imagequant(&img, min_quality, max_quality) {
            Ok(quantized_data) => {
                data_to_optimize = quantized_data;
                used_imagequant = true;
            }
            Err(_) => {
            }
        }
    }
    
    let mut final_data = data_to_optimize;
    let mut used_oxipng = false;
    
    if config.use_oxipng {
        match optimize_with_oxipng(&final_data, config.oxipng_level) {
            Ok(optimized) => {
                final_data = optimized;
                used_oxipng = true;
            }
            Err(e) => {
                eprintln!("OxiPNG优化失败，使用原数据: {}", e);
            }
        }
    }
    
    Ok(PngCompressResult {
        data: final_data,
        used_imagequant,
        used_oxipng,
    })
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
