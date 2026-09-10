use crate::config::AppConfig;
use crate::error::{AppError, AppResult};
use crate::infrastructure::compression::png_smart::optimize_with_oxipng;
use crate::infrastructure::compression::probe;
use crate::infrastructure::compression::quantize::{quantize_frames, Quantized};
use image::codecs::png::PngDecoder;
use image::{AnimationDecoder, Frame, RgbaImage};
use std::io::Cursor;

pub fn frame_delay_millis(frame: &Frame) -> f64 {
    let (numerator, denominator) = frame.delay().numer_denom_ms();
    numerator as f64 / denominator.max(1) as f64
}

fn png_error(err: ::png::EncodingError) -> AppError {
    AppError::compression(format!("APNG 编码失败: {}", err))
}

pub fn compress_apng(input: &[u8], config: &AppConfig) -> AppResult<Vec<u8>> {
    let frames = PngDecoder::new(Cursor::new(input))?
        .apng()?
        .into_frames()
        .collect_frames()?;
    let level = config.png_smart.oxipng_level;
    let lossless = optimize_with_oxipng(input, level).unwrap_or_else(|_| input.to_vec());
    let Some(first) = frames.first() else {
        return Ok(lossless);
    };
    let (width, height) = first.buffer().dimensions();
    let buffers: Vec<RgbaImage> = frames.iter().map(|frame| frame.buffer().clone()).collect();
    let delays: Vec<u16> = frames
        .iter()
        .map(|frame| frame_delay_millis(frame).round().clamp(0.0, f64::from(u16::MAX)) as u16)
        .collect();
    let plays = probe::png_animation(input)
        .map(|animation| animation.plays)
        .unwrap_or(0);
    let quantized = match quantize_frames(
        &buffers,
        config.imagequant.min_quality,
        config.imagequant.max_quality,
        0.0,
        256,
        false,
    ) {
        Ok(quantized) => quantized,
        Err(_) => return Ok(lossless),
    };
    let encoded = encode_apng(&quantized, &delays, width, height, plays)?;
    let optimized = optimize_with_oxipng(&encoded, level).unwrap_or(encoded);
    Ok(if optimized.len() < lossless.len() {
        optimized
    } else {
        lossless
    })
}

pub fn encode_apng(
    quantized: &Quantized,
    delays_ms: &[u16],
    width: u32,
    height: u32,
    plays: u32,
) -> AppResult<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut encoder = ::png::Encoder::new(&mut out, width, height);
        encoder.set_color(::png::ColorType::Indexed);
        encoder.set_depth(::png::BitDepth::Eight);
        encoder.set_compression(::png::Compression::High);
        let palette: Vec<u8> = quantized
            .palette
            .iter()
            .flat_map(|color| [color.r, color.g, color.b])
            .collect();
        encoder.set_palette(palette);
        if quantized.palette.iter().any(|color| color.a < 255) {
            let alpha: Vec<u8> = quantized.palette.iter().map(|color| color.a).collect();
            encoder.set_trns(alpha);
        }
        encoder
            .set_animated(quantized.frames.len() as u32, plays)
            .map_err(png_error)?;
        let mut writer = encoder.write_header().map_err(png_error)?;
        for (indices, delay) in quantized.frames.iter().zip(delays_ms) {
            writer.set_frame_delay(*delay, 1000).map_err(png_error)?;
            writer.write_image_data(indices).map_err(png_error)?;
        }
        writer.finish().map_err(png_error)?;
    }
    Ok(out)
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use image::{Delay, RgbaImage};
    use std::time::Duration;

    fn frame_image(step: u32) -> RgbaImage {
        let mut image = RgbaImage::new(48, 48);
        for (x, y, pixel) in image.enumerate_pixels_mut() {
            let on = (x / 8 + y / 8 + step) % 3 == 0;
            *pixel = if on {
                image::Rgba([200, 40, 30, 255])
            } else {
                image::Rgba([(x * 5) as u8, (y * 5) as u8, 90, 255])
            };
        }
        image
    }

    pub fn sample_apng(frames: u32) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut encoder = ::png::Encoder::new(&mut out, 48, 48);
            encoder.set_color(::png::ColorType::Rgba);
            encoder.set_depth(::png::BitDepth::Eight);
            encoder.set_animated(frames, 0).unwrap();
            encoder.set_frame_delay(8, 100).unwrap();
            let mut writer = encoder.write_header().unwrap();
            for step in 0..frames {
                writer.write_image_data(frame_image(step).as_raw()).unwrap();
            }
            writer.finish().unwrap();
        }
        out
    }

    pub fn decode_frames(data: &[u8]) -> Vec<Frame> {
        PngDecoder::new(Cursor::new(data))
            .unwrap()
            .apng()
            .unwrap()
            .into_frames()
            .collect_frames()
            .unwrap()
    }

    #[test]
    fn animated_png_keeps_every_frame_and_timing() {
        let original = sample_apng(4);
        let config = AppConfig::default();
        let compressed = compress_apng(&original, &config).unwrap();
        let frames = decode_frames(&compressed);
        assert_eq!(frames.len(), 4);
        for frame in &frames {
            assert_eq!(frame.buffer().dimensions(), (48, 48));
            let millis = frame_delay_millis(frame);
            assert!((millis - 80.0).abs() < 1.5, "delay {} should stay near 80ms", millis);
        }
        assert!(compressed.len() < original.len(), "{} < {}", compressed.len(), original.len());
        let expected: Duration = Delay::from_numer_denom_ms(80, 1).into();
        assert_eq!(expected, Duration::from_millis(80));
    }
}
