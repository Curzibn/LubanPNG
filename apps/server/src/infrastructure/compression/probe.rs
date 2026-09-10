use image::ImageFormat;

const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

fn ftyp_brands(data: &[u8]) -> Option<Vec<&[u8]>> {
    if data.len() < 12 || &data[4..8] != b"ftyp" {
        return None;
    }
    let size = u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;
    let end = size.clamp(12, data.len());
    let mut brands = vec![&data[8..12]];
    let mut offset = 16;
    while offset + 4 <= end {
        brands.push(&data[offset..offset + 4]);
        offset += 4;
    }
    Some(brands)
}

pub fn sniff_format(data: &[u8]) -> Option<ImageFormat> {
    if let Some(brands) = ftyp_brands(data) {
        return brands
            .iter()
            .any(|brand| matches!(*brand, b"avif" | b"avis"))
            .then_some(ImageFormat::Avif);
    }
    image::guess_format(data).ok()
}

pub fn is_heif(data: &[u8]) -> bool {
    ftyp_brands(data)
        .map(|brands| {
            brands.iter().any(|brand| {
                matches!(
                    *brand,
                    b"heic" | b"heix" | b"hevc" | b"hevx" | b"heim" | b"heis" | b"mif1" | b"msf1"
                )
            })
        })
        .unwrap_or(false)
}

pub struct PngAnimation {
    pub frames: u32,
    pub plays: u32,
}

pub fn png_animation(data: &[u8]) -> Option<PngAnimation> {
    if data.len() < 8 || &data[..8] != PNG_SIGNATURE {
        return None;
    }
    let mut offset = 8;
    while offset + 8 <= data.len() {
        let length = u32::from_be_bytes(data[offset..offset + 4].try_into().ok()?) as usize;
        match &data[offset + 4..offset + 8] {
            b"acTL" if offset + 16 <= data.len() => {
                let frames = u32::from_be_bytes(data[offset + 8..offset + 12].try_into().ok()?);
                let plays = u32::from_be_bytes(data[offset + 12..offset + 16].try_into().ok()?);
                return Some(PngAnimation { frames, plays });
            }
            b"IDAT" | b"IEND" => return None,
            _ => {}
        }
        offset = offset.checked_add(12 + length)?;
    }
    None
}

pub fn gif_loop_count(data: &[u8]) -> Option<u16> {
    let marker = b"NETSCAPE2.0";
    let position = data
        .windows(marker.len())
        .position(|window| window == marker)?;
    let block = data.get(position + marker.len()..position + marker.len() + 4)?;
    (block[0] == 3 && block[1] == 1).then(|| u16::from_le_bytes([block[2], block[3]]))
}

pub fn gif_frame_count(data: &[u8], limit: usize) -> usize {
    let mut options = ::gif::DecodeOptions::new();
    options.set_color_output(::gif::ColorOutput::Indexed);
    let Ok(mut decoder) = options.read_info(std::io::Cursor::new(data)) else {
        return 0;
    };
    let mut count = 0;
    while count < limit {
        match decoder.read_next_frame() {
            Ok(Some(_)) => count += 1,
            _ => break,
        }
    }
    count
}

pub fn webp_chunk_types(data: &[u8]) -> Vec<[u8; 4]> {
    if data.len() < 12 || &data[..4] != b"RIFF" || &data[8..12] != b"WEBP" {
        return Vec::new();
    }
    let mut types = Vec::new();
    let mut offset = 12;
    while offset + 8 <= data.len() {
        let mut fourcc = [0u8; 4];
        fourcc.copy_from_slice(&data[offset..offset + 4]);
        let size = u32::from_le_bytes([
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7],
        ]) as usize;
        types.push(fourcc);
        offset += 8 + size + (size & 1);
    }
    types
}

pub fn webp_is_animated(data: &[u8]) -> bool {
    webp_chunk_types(data).iter().any(|chunk| chunk == b"ANIM")
}

pub fn webp_is_lossless(data: &[u8]) -> bool {
    webp_chunk_types(data).iter().any(|chunk| chunk == b"VP8L")
}

pub fn is_animated(data: &[u8], format: ImageFormat) -> bool {
    match format {
        ImageFormat::Png => png_animation(data)
            .map(|animation| animation.frames > 1)
            .unwrap_or(false),
        ImageFormat::Gif => gif_frame_count(data, 2) > 1,
        ImageFormat::WebP => webp_is_animated(data),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ftyp(major: &[u8], compatible: &[&[u8]]) -> Vec<u8> {
        let size = 16 + 4 * compatible.len();
        let mut data = (size as u32).to_be_bytes().to_vec();
        data.extend_from_slice(b"ftyp");
        data.extend_from_slice(major);
        data.extend_from_slice(&[0, 0, 0, 0]);
        for brand in compatible {
            data.extend_from_slice(brand);
        }
        data.extend_from_slice(&[0u8; 32]);
        data
    }

    #[test]
    fn sniffs_avif_by_major_or_compatible_brand() {
        assert_eq!(sniff_format(&ftyp(b"avif", &[b"mif1"])), Some(ImageFormat::Avif));
        assert_eq!(sniff_format(&ftyp(b"mif1", &[b"avif"])), Some(ImageFormat::Avif));
        assert_eq!(sniff_format(&ftyp(b"avis", &[])), Some(ImageFormat::Avif));
    }

    #[test]
    fn recognises_heif_containers_without_treating_them_as_avif() {
        let heic = ftyp(b"heic", &[b"mif1", b"heix"]);
        assert_eq!(sniff_format(&heic), None);
        assert!(is_heif(&heic));
        assert!(!is_heif(b"\x89PNG\r\n\x1a\n"));
    }

    #[test]
    fn reads_png_animation_control() {
        let mut png = PNG_SIGNATURE.to_vec();
        png.extend_from_slice(&13u32.to_be_bytes());
        png.extend_from_slice(b"IHDR");
        png.extend_from_slice(&[0u8; 17]);
        png.extend_from_slice(&8u32.to_be_bytes());
        png.extend_from_slice(b"acTL");
        png.extend_from_slice(&3u32.to_be_bytes());
        png.extend_from_slice(&0u32.to_be_bytes());
        png.extend_from_slice(&[0u8; 4]);
        let animation = png_animation(&png).expect("acTL present");
        assert_eq!(animation.frames, 3);
        assert_eq!(animation.plays, 0);
        assert!(is_animated(&png, ImageFormat::Png));
    }

    #[test]
    fn parses_gif_loop_count() {
        let mut gif = b"GIF89a".to_vec();
        gif.extend_from_slice(&[0x21, 0xFF, 0x0B]);
        gif.extend_from_slice(b"NETSCAPE2.0");
        gif.extend_from_slice(&[0x03, 0x01, 0x05, 0x00, 0x00]);
        assert_eq!(gif_loop_count(&gif), Some(5));
        assert_eq!(gif_loop_count(b"GIF89a"), None);
    }

    #[test]
    fn scans_webp_chunks() {
        let mut webp = b"RIFF".to_vec();
        webp.extend_from_slice(&30u32.to_le_bytes());
        webp.extend_from_slice(b"WEBP");
        webp.extend_from_slice(b"VP8X");
        webp.extend_from_slice(&10u32.to_le_bytes());
        webp.extend_from_slice(&[0u8; 10]);
        webp.extend_from_slice(b"ANIM");
        webp.extend_from_slice(&6u32.to_le_bytes());
        webp.extend_from_slice(&[0u8; 6]);
        assert!(webp_is_animated(&webp));
        assert!(!webp_is_lossless(&webp));
        assert!(is_animated(&webp, ImageFormat::WebP));
    }
}
