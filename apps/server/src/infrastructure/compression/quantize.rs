use anyhow::{anyhow, Result};
use image::RgbaImage;
use imagequant::{Attributes, Histogram, RGBA};

pub struct Quantized {
    pub palette: Vec<RGBA>,
    pub frames: Vec<Vec<u8>>,
}

fn liq_pixels(image: &RgbaImage) -> Vec<RGBA> {
    image
        .as_raw()
        .chunks_exact(4)
        .map(|chunk| RGBA {
            r: chunk[0],
            g: chunk[1],
            b: chunk[2],
            a: chunk[3],
        })
        .collect()
}

pub fn quantize_frames(
    frames: &[RgbaImage],
    min_quality: u8,
    max_quality: u8,
    dithering: f32,
    max_colors: u32,
    last_index_transparent: bool,
) -> Result<Quantized> {
    let first = frames.first().ok_or_else(|| anyhow!("没有可量化的帧"))?;
    let (width, height) = (first.width() as usize, first.height() as usize);
    if frames
        .iter()
        .any(|frame| frame.width() as usize != width || frame.height() as usize != height)
    {
        return Err(anyhow!("各帧尺寸不一致"));
    }
    let mut attributes = Attributes::new();
    attributes
        .set_quality(min_quality, max_quality)
        .map_err(|e| anyhow!("设置质量失败: {}", e))?;
    attributes
        .set_max_colors(max_colors)
        .map_err(|e| anyhow!("设置颜色数失败: {}", e))?;
    attributes.set_last_index_transparent(last_index_transparent);
    let pixels: Vec<Vec<RGBA>> = frames.iter().map(liq_pixels).collect();

    let mut result = if pixels.len() == 1 {
        let mut image = attributes
            .new_image_borrowed(&pixels[0], width, height, 0.0)
            .map_err(|e| anyhow!("创建图像失败: {}", e))?;
        attributes
            .quantize(&mut image)
            .map_err(|e| anyhow!("量化失败: {}", e))?
    } else {
        let mut histogram = Histogram::new(&attributes);
        for frame in &pixels {
            let mut image = attributes
                .new_image_borrowed(frame, width, height, 0.0)
                .map_err(|e| anyhow!("创建图像失败: {}", e))?;
            histogram
                .add_image(&attributes, &mut image)
                .map_err(|e| anyhow!("统计颜色失败: {}", e))?;
        }
        histogram
            .quantize(&attributes)
            .map_err(|e| anyhow!("量化失败: {}", e))?
    };
    result
        .set_dithering_level(dithering)
        .map_err(|e| anyhow!("设置抖动失败: {}", e))?;

    let mut palette: Option<Vec<RGBA>> = None;
    let mut remapped = Vec::with_capacity(pixels.len());
    for frame in &pixels {
        let mut image = attributes
            .new_image_borrowed(frame, width, height, 0.0)
            .map_err(|e| anyhow!("创建图像失败: {}", e))?;
        let (frame_palette, indices) = result
            .remapped(&mut image)
            .map_err(|e| anyhow!("重映射失败: {}", e))?;
        match &palette {
            None => palette = Some(frame_palette),
            Some(existing) if *existing != frame_palette => {
                return Err(anyhow!("多帧调色板不一致"));
            }
            Some(_) => {}
        }
        remapped.push(indices);
    }
    Ok(Quantized {
        palette: palette.unwrap_or_default(),
        frames: remapped,
    })
}

pub fn quantize_image(
    image: &RgbaImage,
    min_quality: u8,
    max_quality: u8,
    dithering: f32,
) -> Result<(Vec<RGBA>, Vec<u8>)> {
    let mut quantized = quantize_frames(
        std::slice::from_ref(image),
        min_quality,
        max_quality,
        dithering,
        256,
        false,
    )?;
    let indices = quantized.frames.pop().unwrap_or_default();
    Ok((quantized.palette, indices))
}

pub fn expand_to_rgba(palette: &[RGBA], indices: &[u8], width: u32, height: u32) -> Option<RgbaImage> {
    let mut data = Vec::with_capacity(indices.len() * 4);
    for &index in indices {
        let color = palette.get(index as usize)?;
        data.extend_from_slice(&[color.r, color.g, color.b, color.a]);
    }
    RgbaImage::from_raw(width, height, data)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(shift: u8) -> RgbaImage {
        let mut image = RgbaImage::new(32, 32);
        for (x, y, pixel) in image.enumerate_pixels_mut() {
            *pixel = image::Rgba([
                (x as u8 * 8).wrapping_add(shift),
                (y as u8 * 8),
                ((x + y) as u8 * 4),
                255,
            ]);
        }
        image
    }

    #[test]
    fn frames_share_one_palette() {
        let frames = vec![frame(0), frame(40), frame(90)];
        let quantized = quantize_frames(&frames, 0, 100, 0.0, 256, false).unwrap();
        assert_eq!(quantized.frames.len(), 3);
        assert!(quantized.palette.len() <= 256);
        for indices in &quantized.frames {
            assert_eq!(indices.len(), 32 * 32);
            assert!(indices.iter().all(|&i| (i as usize) < quantized.palette.len()));
        }
    }

    #[test]
    fn colour_cap_is_respected() {
        let quantized = quantize_frames(&[frame(0)], 0, 100, 1.0, 255, false).unwrap();
        assert!(quantized.palette.len() <= 255);
        let expanded = expand_to_rgba(&quantized.palette, &quantized.frames[0], 32, 32).unwrap();
        assert_eq!(expanded.dimensions(), (32, 32));
    }
}
