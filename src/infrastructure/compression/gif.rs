use crate::config::AppConfig;
use crate::domain::compression::CompressionResult;
use crate::error::AppResult;
use crate::infrastructure::compression::CompressionStrategy;
use async_trait::async_trait;
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;

pub struct GifCompressionStrategy;

#[async_trait]
impl CompressionStrategy for GifCompressionStrategy {
    fn format(&self) -> ImageFormat {
        ImageFormat::Gif
    }

    async fn compress(
        &self,
        input: &[u8],
        config: &AppConfig,
    ) -> AppResult<CompressionResult> {
        let img = image::load_from_memory(input)?;
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
        liq.set_quality(
            config.imagequant.min_quality,
            config.imagequant.max_quality,
        )
        .map_err(|e| crate::error::AppError::compression(format!("设置质量失败: {}", e)))?;
        
        let mut img_liq = liq.new_image(
            pixels.into_boxed_slice(),
            rgba.width() as usize,
            rgba.height() as usize,
            0.0,
        )
        .map_err(|e| crate::error::AppError::compression(format!("创建图像失败: {}", e)))?;
        
        let mut res = liq.quantize(&mut img_liq)
            .map_err(|e| crate::error::AppError::compression(format!("量化失败: {}", e)))?;
        
        res.set_dithering_level(1.0)
            .map_err(|e| crate::error::AppError::compression(format!("设置抖动失败: {}", e)))?;
        
        let (palette, pixels) = res.remapped(&mut img_liq)
            .map_err(|e| crate::error::AppError::compression(format!("重映射失败: {}", e)))?;
        
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
            ).ok_or_else(|| crate::error::AppError::compression("创建图像失败"))?
        );
        
        let mut data = Vec::new();
        quantized_img.write_to(&mut Cursor::new(&mut data), ImageFormat::Gif)
            .map_err(|e| crate::error::AppError::compression(format!("图片编码失败: {}", e)))?;
        
        Ok(CompressionResult::new(data, ImageFormat::Gif))
    }
}
