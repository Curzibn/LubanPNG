use crate::config::JpegSmartConfig;
use anyhow::Result;
use img_parts::{jpeg::Jpeg, Bytes};

const STANDARD_LUMINANCE_QT: [u8; 64] = [
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
    92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

fn estimate_quality_from_qt(qt: &[u8; 64]) -> u8 {
    let mut sum_ratio = 0.0f32;
    for i in 0..64 {
        let standard = STANDARD_LUMINANCE_QT[i] as f32;
        let value = qt[i] as f32;
        if standard <= 0.0 || value <= 0.0 {
            return 50;
        }
        sum_ratio += value / standard;
    }
    let ratio = sum_ratio / 64.0;

    let quality = if ratio < 0.8 {
        100.0 - 50.0 * ratio
    } else {
        50.0 / ratio
    };

    quality.round().clamp(1.0, 100.0) as u8
}

pub fn estimate_jpeg_quality(jpeg_data: &[u8]) -> Result<Option<u8>> {
    let bytes = Bytes::from(jpeg_data.to_vec());
    let jpeg = match Jpeg::from_bytes(bytes) {
        Ok(jpeg) => jpeg,
        Err(_) => return Ok(None),
    };

    const DQT_MARKER: u8 = 0xDB;
    let segments = jpeg.segments();
    for segment in segments.iter() {
        if segment.marker() == DQT_MARKER {
            let contents = segment.contents();
            if contents.len() >= 65 {
                let precision = (contents[0] >> 4) & 0x0F;
                let table_id = contents[0] & 0x0F;

                if precision == 0 && table_id == 0 {
                    let qt_bytes = &contents[1..65];
                    if qt_bytes.len() == 64 {
                        let mut qt = [0u8; 64];
                        qt.copy_from_slice(qt_bytes);
                        let quality = estimate_quality_from_qt(&qt);
                        return Ok(Some(quality));
                    }
                }
            }
        }
    }

    Ok(None)
}

pub struct SmartCompressDecision {
    pub should_compress: bool,
    pub target_quality: u8,
}

pub fn decide_compression_strategy(
    original_quality: Option<u8>,
    config: &JpegSmartConfig,
    min_quality: u8,
    max_quality: u8,
) -> SmartCompressDecision {
    if !config.enabled {
        let target_quality = ((min_quality + max_quality) / 2) as u8;
        return SmartCompressDecision {
            should_compress: true,
            target_quality,
        };
    }

    match original_quality {
        Some(quality) => {
            if quality < config.skip_low_quality_threshold {
                SmartCompressDecision {
                    should_compress: false,
                    target_quality: quality,
                }
            } else if quality >= config.safe_compress_threshold {
                let target_quality = if config.adaptive_quality {
                    (quality as f32 * 0.9)
                        .max(min_quality as f32)
                        .min(max_quality as f32) as u8
                } else {
                    ((min_quality + max_quality) / 2) as u8
                };
                SmartCompressDecision {
                    should_compress: true,
                    target_quality,
                }
            } else {
                let target_quality = if config.adaptive_quality {
                    (quality as f32 * 0.85)
                        .max(min_quality as f32)
                        .min(max_quality as f32) as u8
                } else {
                    ((min_quality + max_quality) / 2) as u8
                };
                SmartCompressDecision {
                    should_compress: true,
                    target_quality,
                }
            }
        }
        None => {
            let target_quality = ((min_quality + max_quality) / 2) as u8;
            SmartCompressDecision {
                should_compress: true,
                target_quality,
            }
        }
    }
}

pub fn calculate_ssim(original: &image::RgbImage, compressed: &image::RgbImage) -> Result<f64> {
    use image_compare::rgb_hybrid_compare;

    if original.width() != compressed.width() || original.height() != compressed.height() {
        return Err(anyhow::anyhow!("图像尺寸不匹配"));
    }

    let similarity = rgb_hybrid_compare(original, compressed)?;
    Ok(similarity.score)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::JpegSmartConfig;
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

    fn encode_jpeg(img: &DynamicImage, quality: u8) -> Vec<u8> {
        let mut buf = Vec::new();
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
        img.write_with_encoder(encoder).unwrap();
        buf
    }

    #[test]
    fn quality_estimation_recovers_high_quality() {
        let img = photo_like_image(128, 128);
        let jpeg = encode_jpeg(&img, 90);
        let estimated = estimate_jpeg_quality(&jpeg).unwrap();
        assert!(estimated.is_some(), "DQT table should be parseable");
        let q = estimated.unwrap();
        assert!(
            q >= 75 && q <= 95,
            "estimated quality {} should be near 90",
            q
        );
    }

    #[test]
    fn quality_estimation_rejects_non_jpeg() {
        assert!(estimate_jpeg_quality(b"not a jpeg").unwrap().is_none());
    }

    #[test]
    fn decision_skips_low_quality_originals() {
        let config = JpegSmartConfig::default();
        let decision = decide_compression_strategy(Some(50), &config, 70, 100);
        assert!(!decision.should_compress);
    }

    #[test]
    fn decision_compresses_high_quality_originals() {
        let config = JpegSmartConfig::default();
        let decision = decide_compression_strategy(Some(95), &config, 70, 100);
        assert!(decision.should_compress);
        assert_eq!(decision.target_quality, 85);
    }

    #[test]
    fn decision_falls_back_to_default_when_unknown() {
        let config = JpegSmartConfig::default();
        let decision = decide_compression_strategy(None, &config, 70, 100);
        assert!(decision.should_compress);
        assert_eq!(decision.target_quality, 85);
    }

    #[test]
    fn ssim_identical_images_score_one() {
        let img = photo_like_image(64, 64).to_rgb8();
        let score = calculate_ssim(&img, &img).unwrap();
        assert!(
            score > 0.999,
            "identical images should score ~1.0, got {}",
            score
        );
    }

    #[test]
    fn ssim_detects_degradation() {
        let original = photo_like_image(64, 64).to_rgb8();
        let mut degraded = original.clone();
        for pixel in degraded.pixels_mut() {
            pixel.0 = pixel.0.map(|c| c.saturating_sub(40));
        }
        let score = calculate_ssim(&original, &degraded).unwrap();
        assert!(
            score < 0.95,
            "shifted image should score below 0.95, got {}",
            score
        );
    }
}
