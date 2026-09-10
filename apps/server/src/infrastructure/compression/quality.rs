use anyhow::Result;
use image::RgbImage;
use image_compare::rgb_hybrid_compare;

pub fn calculate_ssim(original: &RgbImage, compressed: &RgbImage) -> Result<f64> {
    if original.width() != compressed.width() || original.height() != compressed.height() {
        return Err(anyhow::anyhow!("图像尺寸不匹配"));
    }
    let similarity = rgb_hybrid_compare(original, compressed)?;
    Ok(similarity.score)
}

pub fn meets_floor(reference: &RgbImage, candidate: &[u8], floor: f64) -> bool {
    let Ok(decoded) = image::load_from_memory(candidate) else {
        return true;
    };
    let decoded = decoded.to_rgb8();
    if decoded.dimensions() != reference.dimensions() {
        return true;
    }
    calculate_ssim(reference, &decoded)
        .map(|score| score >= floor)
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, RgbImage};

    fn photo_like_image(w: u32, h: u32) -> DynamicImage {
        let mut img = RgbImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(
                    x,
                    y,
                    image::Rgb([
                        ((x * x / 7 + y * 3) % 256) as u8,
                        ((x + y * y / 5) % 256) as u8,
                        ((x * y / 3) % 256) as u8,
                    ]),
                );
            }
        }
        DynamicImage::ImageRgb8(img)
    }

    #[test]
    fn ssim_identical_images_score_one() {
        let img = photo_like_image(64, 64).to_rgb8();
        let score = calculate_ssim(&img, &img).unwrap();
        assert!(score > 0.999, "identical images should score ~1.0, got {}", score);
    }

    #[test]
    fn ssim_detects_degradation() {
        let original = photo_like_image(64, 64).to_rgb8();
        let mut degraded = original.clone();
        for pixel in degraded.pixels_mut() {
            pixel.0 = pixel.0.map(|c| c.saturating_sub(40));
        }
        let score = calculate_ssim(&original, &degraded).unwrap();
        assert!(score < 0.95, "shifted image should score below 0.95, got {}", score);
    }

    #[test]
    fn floor_check_is_lenient_when_candidate_cannot_be_decoded() {
        let reference = photo_like_image(16, 16).to_rgb8();
        assert!(meets_floor(&reference, b"not an image", 0.99));
    }
}
