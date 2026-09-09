use crate::config::JpegSmartConfig;
use anyhow::Result;
use img_parts::{jpeg::Jpeg, Bytes};

const STANDARD_LUMINANCE_QT: [u8; 64] = [
    16, 11, 10, 16, 24, 40, 51, 61,
    12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77,
    24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101,
    72, 92, 95, 98, 112, 100, 103, 99,
];

fn estimate_quality_from_qt(qt: &[u8; 64]) -> u8 {
    let mut sum_diff = 0u32;
    for i in 0..64 {
        let diff = if STANDARD_LUMINANCE_QT[i] > 0 && qt[i] > 0 {
            let ratio = (qt[i] as f32) / (STANDARD_LUMINANCE_QT[i] as f32);
            if ratio > 1.0 {
                ((ratio - 1.0) * 100.0) as u32
            } else {
                ((1.0 - ratio) * 100.0) as u32
            }
        } else {
            100
        };
        sum_diff += diff;
    }
    
    let avg_diff = sum_diff / 64;
    let estimated_quality = if avg_diff < 5 {
        95
    } else if avg_diff < 10 {
        90
    } else if avg_diff < 20 {
        85
    } else if avg_diff < 30 {
        80
    } else if avg_diff < 40 {
        75
    } else if avg_diff < 50 {
        70
    } else if avg_diff < 60 {
        65
    } else if avg_diff < 70 {
        60
    } else if avg_diff < 80 {
        55
    } else {
        50
    };
    
    estimated_quality
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
            if contents.len() >= 67 {
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
    pub reason: String,
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
            reason: "智能压缩已禁用，使用默认质量".to_string(),
        };
    }
    
    match original_quality {
        Some(quality) => {
            if quality < config.skip_low_quality_threshold {
                SmartCompressDecision {
                    should_compress: false,
                    target_quality: quality,
                    reason: format!(
                        "原图质量过低({})，跳过压缩以避免世代损失",
                        quality
                    ),
                }
            } else if quality >= config.safe_compress_threshold {
                let target_quality = if config.adaptive_quality {
                    (quality as f32 * 0.9).max(min_quality as f32).min(max_quality as f32) as u8
                } else {
                    ((min_quality + max_quality) / 2) as u8
                };
                SmartCompressDecision {
                    should_compress: true,
                    target_quality,
                    reason: format!(
                        "原图质量较高({})，安全压缩到{}",
                        quality, target_quality
                    ),
                }
            } else {
                let target_quality = if config.adaptive_quality {
                    (quality as f32 * 0.85).max(min_quality as f32).min(max_quality as f32) as u8
                } else {
                    ((min_quality + max_quality) / 2) as u8
                };
                SmartCompressDecision {
                    should_compress: true,
                    target_quality,
                    reason: format!(
                        "原图质量中等({})，适度压缩到{}",
                        quality, target_quality
                    ),
                }
            }
        }
        None => {
            let target_quality = ((min_quality + max_quality) / 2) as u8;
            SmartCompressDecision {
                should_compress: true,
                target_quality,
                reason: "无法估算原图质量，使用默认质量进行压缩".to_string(),
            }
        }
    }
}

pub fn calculate_ssim(
    original: &image::RgbImage,
    compressed: &image::RgbImage,
) -> Result<f64> {
    use image_compare::rgb_hybrid_compare;
    
    if original.width() != compressed.width() || original.height() != compressed.height() {
        return Err(anyhow::anyhow!("图像尺寸不匹配"));
    }
    
    let similarity = rgb_hybrid_compare(original, compressed)?;
    Ok(1.0 - similarity.score)
}
