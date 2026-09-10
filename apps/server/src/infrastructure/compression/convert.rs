use crate::config::AppConfig;
use crate::domain::compression::{Background, CompressionResult, ConversionRequest, OutputFormat};
use crate::error::{AppError, AppResult};
use crate::infrastructure::compression::avif::encode_avif_smart;
use crate::infrastructure::compression::jpeg::encode_jpeg_smart;
use crate::infrastructure::compression::jpeg_smart::decide_compression_strategy;
use crate::infrastructure::compression::png_smart::encode_png_smart;
use crate::infrastructure::compression::probe;
use crate::infrastructure::compression::webp::encode_webp_smart;
use image::{DynamicImage, ImageFormat, RgbaImage};

fn has_transparency(image: &RgbaImage) -> bool {
    image.pixels().any(|pixel| pixel[3] < 255)
}

fn flatten(image: &mut RgbaImage, background: Background) {
    let base = [background.r, background.g, background.b];
    for pixel in image.pixels_mut() {
        let alpha = u32::from(pixel[3]);
        for channel in 0..3 {
            let blended = (u32::from(pixel[channel]) * alpha + u32::from(base[channel]) * (255 - alpha)) / 255;
            pixel[channel] = blended as u8;
        }
        pixel[3] = 255;
    }
}

pub fn convert_image(
    input: &[u8],
    source: ImageFormat,
    request: ConversionRequest,
    config: &AppConfig,
) -> AppResult<CompressionResult> {
    if probe::is_animated(input, source) {
        return Err(AppError::validation("动图暂不支持格式转换，请保持原格式压缩"));
    }
    let decoded = image::load_from_memory(input)?;
    let data = match request.target {
        OutputFormat::Jpeg => {
            let mut rgba = decoded.to_rgba8();
            if has_transparency(&rgba) {
                let background = request.background.ok_or_else(|| {
                    AppError::validation("透明图转 JPEG 需要指定背景色 background，例如 #ffffff")
                })?;
                flatten(&mut rgba, background);
            }
            let rgb = DynamicImage::ImageRgba8(rgba).to_rgb8();
            let decision = decide_compression_strategy(
                None,
                &config.jpeg_smart,
                config.imagequant.min_quality,
                config.imagequant.max_quality,
            );
            encode_jpeg_smart(
                &rgb,
                decision.target_quality,
                &config.jpeg_smart,
                config.imagequant.max_quality,
            )?
        }
        OutputFormat::Png => encode_png_smart(
            decoded,
            &config.png_smart,
            config.imagequant.min_quality,
            config.imagequant.max_quality,
        )
        .map_err(|e| AppError::compression(format!("PNG 编码失败: {}", e)))?,
        OutputFormat::WebP => encode_webp_smart(&decoded.to_rgba8(), &config.webp_smart)?,
        OutputFormat::Avif => encode_avif_smart(&decoded.to_rgba8(), &config.avif_smart)?,
    };
    Ok(CompressionResult::new(data, request.target.image_format()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::GenericImageView;
    use std::io::Cursor;

    fn transparent_png() -> Vec<u8> {
        let mut image = RgbaImage::new(40, 40);
        for (x, y, pixel) in image.enumerate_pixels_mut() {
            *pixel = image::Rgba([(x * 6) as u8, (y * 6) as u8, 120, if x < 20 { 0 } else { 255 }]);
        }
        let mut out = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn png_converts_to_every_target() {
        let png = transparent_png();
        let config = AppConfig::default();
        for target in [OutputFormat::WebP, OutputFormat::Avif, OutputFormat::Png] {
            let result = convert_image(
                &png,
                ImageFormat::Png,
                ConversionRequest {
                    target,
                    background: None,
                },
                &config,
            )
            .unwrap();
            assert_eq!(result.format, target.image_format());
            let decoded = image::load_from_memory(&result.data).unwrap();
            assert_eq!(decoded.dimensions(), (40, 40));
            assert_eq!(decoded.to_rgba8().get_pixel(0, 0)[3], 0, "{:?} keeps alpha", target);
        }
    }

    #[test]
    fn transparent_to_jpeg_needs_background_then_flattens() {
        let png = transparent_png();
        let config = AppConfig::default();
        let missing = convert_image(
            &png,
            ImageFormat::Png,
            ConversionRequest {
                target: OutputFormat::Jpeg,
                background: None,
            },
            &config,
        );
        assert!(matches!(missing, Err(AppError::Validation(_))));
        let flattened = convert_image(
            &png,
            ImageFormat::Png,
            ConversionRequest {
                target: OutputFormat::Jpeg,
                background: Background::parse("#ffffff"),
            },
            &config,
        )
        .unwrap();
        assert_eq!(flattened.format, ImageFormat::Jpeg);
        let decoded = image::load_from_memory(&flattened.data).unwrap().to_rgb8();
        let corner = decoded.get_pixel(0, 0);
        assert!(corner[0] > 230 && corner[1] > 230 && corner[2] > 230, "{:?}", corner);
    }

    #[test]
    fn animated_sources_are_refused() {
        let gif = crate::infrastructure::compression::gif::tests::sample_animated_gif(2);
        let result = convert_image(
            &gif,
            ImageFormat::Gif,
            ConversionRequest {
                target: OutputFormat::WebP,
                background: None,
            },
            &AppConfig::default(),
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
    }
}
