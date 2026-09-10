use crate::config::AppConfig;
use crate::domain::compression::CompressionResult;
use crate::error::{AppError, AppResult};
use crate::infrastructure::compression::apng::frame_delay_millis;
use crate::infrastructure::compression::probe;
use crate::infrastructure::compression::quantize::quantize_frames;
use crate::infrastructure::compression::CompressionStrategy;
use async_trait::async_trait;
use image::codecs::gif::GifDecoder;
use image::{AnimationDecoder, Frame, ImageFormat, RgbaImage};
use imagequant::RGBA;
use std::io::Cursor;

pub struct GifCompressionStrategy;

#[async_trait]
impl CompressionStrategy for GifCompressionStrategy {
    async fn compress(&self, input: &[u8], config: &AppConfig) -> AppResult<CompressionResult> {
        Ok(CompressionResult::new(
            compress_gif(input, config)?,
            ImageFormat::Gif,
        ))
    }
}

fn gif_error(err: ::gif::EncodingError) -> AppError {
    AppError::compression(format!("GIF 编码失败: {}", err))
}

fn binarize_alpha(image: &RgbaImage) -> RgbaImage {
    let mut copy = image.clone();
    for pixel in copy.pixels_mut() {
        if pixel[3] < 128 {
            pixel.0 = [0, 0, 0, 0];
        } else {
            pixel[3] = 255;
        }
    }
    copy
}

fn delay_centiseconds(frame: &Frame) -> u16 {
    (frame_delay_millis(frame) / 10.0)
        .round()
        .clamp(0.0, f64::from(u16::MAX)) as u16
}

fn transparent_index(palette: &mut [RGBA], frames: &mut [Vec<u8>]) -> Option<u8> {
    let transparent: Vec<u8> = palette
        .iter()
        .enumerate()
        .filter(|(_, color)| color.a < 128)
        .map(|(index, _)| index as u8)
        .collect();
    let canonical = *transparent.first()?;
    if transparent.len() > 1 {
        for indices in frames.iter_mut() {
            for index in indices.iter_mut() {
                if transparent.contains(index) {
                    *index = canonical;
                }
            }
        }
    }
    for color in palette.iter_mut() {
        if color.a >= 128 {
            color.a = 255;
        }
    }
    Some(canonical)
}

fn full_frame(
    indices: &[u8],
    width: u32,
    height: u32,
    delay: u16,
    transparent: Option<u8>,
    dispose: ::gif::DisposalMethod,
) -> ::gif::Frame<'static> {
    let mut frame =
        ::gif::Frame::from_indexed_pixels(width as u16, height as u16, indices.to_vec(), transparent);
    frame.delay = delay;
    frame.dispose = dispose;
    frame
}

fn changed_bounds(previous: &[u8], current: &[u8], width: usize) -> Option<(usize, usize, usize, usize)> {
    let mut bounds: Option<(usize, usize, usize, usize)> = None;
    for (position, (before, after)) in previous.iter().zip(current).enumerate() {
        if before == after {
            continue;
        }
        let (x, y) = (position % width, position / width);
        bounds = Some(match bounds {
            None => (x, y, x, y),
            Some((x0, y0, x1, y1)) => (x0.min(x), y0.min(y), x1.max(x), y1.max(y)),
        });
    }
    bounds
}

fn diff_frames(
    frames: &[Vec<u8>],
    delays: &[u16],
    width: u32,
    height: u32,
    transparent: u8,
) -> Vec<::gif::Frame<'static>> {
    let stride = width as usize;
    let mut out: Vec<::gif::Frame<'static>> = Vec::with_capacity(frames.len());
    for (index, indices) in frames.iter().enumerate() {
        let delay = delays[index];
        if index == 0 {
            out.push(full_frame(indices, width, height, delay, None, ::gif::DisposalMethod::Keep));
            continue;
        }
        let previous = &frames[index - 1];
        let Some((x0, y0, x1, y1)) = changed_bounds(previous, indices, stride) else {
            if let Some(last) = out.last_mut() {
                last.delay = last.delay.saturating_add(delay);
            }
            continue;
        };
        let (frame_width, frame_height) = (x1 - x0 + 1, y1 - y0 + 1);
        let mut buffer = Vec::with_capacity(frame_width * frame_height);
        for y in y0..=y1 {
            for x in x0..=x1 {
                let position = y * stride + x;
                buffer.push(if indices[position] == previous[position] {
                    transparent
                } else {
                    indices[position]
                });
            }
        }
        let mut frame = ::gif::Frame::from_indexed_pixels(
            frame_width as u16,
            frame_height as u16,
            buffer,
            Some(transparent),
        );
        frame.left = x0 as u16;
        frame.top = y0 as u16;
        frame.delay = delay;
        frame.dispose = ::gif::DisposalMethod::Keep;
        out.push(frame);
    }
    out
}

fn encode_gif(
    width: u32,
    height: u32,
    palette: &[RGBA],
    loop_count: Option<u16>,
    frames: &[::gif::Frame<'static>],
) -> AppResult<Vec<u8>> {
    let palette_bytes: Vec<u8> = palette
        .iter()
        .flat_map(|color| [color.r, color.g, color.b])
        .collect();
    let mut out = Vec::new();
    {
        let mut encoder = ::gif::Encoder::new(&mut out, width as u16, height as u16, &palette_bytes)
            .map_err(gif_error)?;
        if let Some(count) = loop_count {
            let repeat = if count == 0 {
                ::gif::Repeat::Infinite
            } else {
                ::gif::Repeat::Finite(count)
            };
            encoder.set_repeat(repeat).map_err(gif_error)?;
        }
        for frame in frames {
            encoder.write_frame(frame).map_err(gif_error)?;
        }
    }
    Ok(out)
}

pub fn compress_gif(input: &[u8], config: &AppConfig) -> AppResult<Vec<u8>> {
    let frames = GifDecoder::new(Cursor::new(input))?
        .into_frames()
        .collect_frames()?;
    let first = frames
        .first()
        .ok_or_else(|| AppError::compression("GIF 没有可用的帧"))?;
    let (width, height) = first.buffer().dimensions();
    if width > u32::from(u16::MAX) || height > u32::from(u16::MAX) {
        return Err(AppError::compression("GIF 尺寸超出格式上限"));
    }
    let buffers: Vec<RgbaImage> = frames
        .iter()
        .map(|frame| binarize_alpha(frame.buffer()))
        .collect();
    let delays: Vec<u16> = frames.iter().map(delay_centiseconds).collect();
    let animated = buffers.len() > 1;
    let transparent_source = buffers
        .iter()
        .any(|buffer| buffer.pixels().any(|pixel| pixel[3] == 0));
    let reserve_transparent = animated && !transparent_source;
    let mut quantized = quantize_frames(
        &buffers,
        config.imagequant.min_quality,
        config.imagequant.max_quality,
        if animated { 0.0 } else { 1.0 },
        if reserve_transparent { 255 } else { 256 },
        transparent_source,
    )
    .map_err(|e| AppError::compression(format!("GIF 量化失败: {}", e)))?;
    let mut palette = std::mem::take(&mut quantized.palette);
    let transparent = if reserve_transparent {
        palette.push(RGBA {
            r: 0,
            g: 0,
            b: 0,
            a: 0,
        });
        Some((palette.len() - 1) as u8)
    } else {
        transparent_index(&mut palette, &mut quantized.frames)
    };
    let loop_count = probe::gif_loop_count(input);
    let gif_frames = if !animated {
        vec![full_frame(
            &quantized.frames[0],
            width,
            height,
            delays[0],
            transparent,
            ::gif::DisposalMethod::Any,
        )]
    } else if let (false, Some(index)) = (transparent_source, transparent) {
        diff_frames(&quantized.frames, &delays, width, height, index)
    } else {
        quantized
            .frames
            .iter()
            .zip(&delays)
            .map(|(indices, &delay)| {
                full_frame(
                    indices,
                    width,
                    height,
                    delay,
                    transparent,
                    ::gif::DisposalMethod::Background,
                )
            })
            .collect()
    };
    encode_gif(width, height, &palette, loop_count, &gif_frames)
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use image::codecs::gif::{GifEncoder, Repeat};
    use image::{Delay, DynamicImage};

    fn palette_image(w: u32, h: u32, shift: u32) -> RgbaImage {
        let mut img = RgbaImage::new(w, h);
        let palette = [
            (255, 0, 0),
            (0, 255, 0),
            (0, 0, 255),
            (255, 255, 0),
            (255, 0, 255),
            (0, 255, 255),
            (128, 128, 128),
            (0, 0, 0),
        ];
        for y in 0..h {
            for x in 0..w {
                let c = palette[((x / 8 + y / 8 + shift) % 8) as usize];
                img.put_pixel(x, y, image::Rgba([c.0, c.1, c.2, 255]));
            }
        }
        img
    }

    pub fn sample_animated_gif(frames: u32) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut encoder = GifEncoder::new(&mut out);
            encoder.set_repeat(Repeat::Infinite).unwrap();
            for step in 0..frames {
                let mut image = palette_image(64, 64, 0);
                for y in 0..16 {
                    for x in 0..16 {
                        image.put_pixel(8 + step * 8 + x, 8 + y, image::Rgba([10, 200, 10, 255]));
                    }
                }
                let frame = Frame::from_parts(image, 0, 0, Delay::from_numer_denom_ms(120, 1));
                encoder.encode_frame(frame).unwrap();
            }
        }
        out
    }

    pub fn decode_gif_frames(data: &[u8]) -> Vec<Frame> {
        GifDecoder::new(Cursor::new(data))
            .unwrap()
            .into_frames()
            .collect_frames()
            .unwrap()
    }

    #[tokio::test]
    async fn gif_strategy_produces_valid_gif() {
        let img = DynamicImage::ImageRgba8(palette_image(64, 64, 0));
        let mut original = Vec::new();
        img.write_to(&mut Cursor::new(&mut original), ImageFormat::Gif)
            .unwrap();

        let config = AppConfig::default();
        let result = GifCompressionStrategy
            .compress(&original, &config)
            .await
            .unwrap();

        assert_eq!(result.format, ImageFormat::Gif);
        assert_eq!(&result.data[..3], b"GIF");
        let decoded = image::load_from_memory(&result.data).unwrap();
        assert_eq!(decoded.width(), 64);
        assert_eq!(decoded.height(), 64);
    }

    #[test]
    fn animated_gif_keeps_frames_timing_and_pixels() {
        let original = sample_animated_gif(4);
        let config = AppConfig::default();
        let compressed = compress_gif(&original, &config).unwrap();
        let before = decode_gif_frames(&original);
        let after = decode_gif_frames(&compressed);
        assert_eq!(after.len(), 4);
        for (a, b) in before.iter().zip(&after) {
            assert_eq!(b.buffer().dimensions(), (64, 64));
            assert_eq!(delay_centiseconds(b), 12);
            let mismatched = a
                .buffer()
                .pixels()
                .zip(b.buffer().pixels())
                .filter(|(x, y)| x != y)
                .count();
            assert_eq!(mismatched, 0, "frame pixels should survive the round trip");
        }
        assert_eq!(probe::gif_loop_count(&compressed), Some(0));
        assert!(compressed.len() < original.len(), "{} < {}", compressed.len(), original.len());
    }

    #[test]
    fn transparent_animation_keeps_transparency() {
        let mut out = Vec::new();
        {
            let mut encoder = GifEncoder::new(&mut out);
            for step in 0..3u32 {
                let mut image = RgbaImage::from_pixel(32, 32, image::Rgba([0, 0, 0, 0]));
                for y in 0..8 {
                    for x in 0..8 {
                        image.put_pixel(step * 8 + x, 4 + y, image::Rgba([220, 30, 30, 255]));
                    }
                }
                encoder
                    .encode_frame(Frame::from_parts(image, 0, 0, Delay::from_numer_denom_ms(50, 1)))
                    .unwrap();
            }
        }
        let compressed = compress_gif(&out, &AppConfig::default()).unwrap();
        let frames = decode_gif_frames(&compressed);
        assert_eq!(frames.len(), 3);
        let last = frames.last().unwrap().buffer();
        assert_eq!(last.get_pixel(0, 0)[3], 0);
        assert_eq!(last.get_pixel(20, 8)[3], 255);
        assert_eq!(last.get_pixel(2, 8)[3], 0);
    }
}
