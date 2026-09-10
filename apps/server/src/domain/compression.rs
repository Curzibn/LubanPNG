use image::ImageFormat;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OutputFormat {
    Png,
    Jpeg,
    WebP,
    Avif,
}

impl OutputFormat {
    pub fn parse(value: &str) -> Option<Self> {
        let normalized = value.trim().to_ascii_lowercase();
        let name = normalized.strip_prefix("image/").unwrap_or(&normalized);
        match name {
            "png" => Some(Self::Png),
            "jpeg" | "jpg" => Some(Self::Jpeg),
            "webp" => Some(Self::WebP),
            "avif" => Some(Self::Avif),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpeg",
            Self::WebP => "webp",
            Self::Avif => "avif",
        }
    }

    pub fn image_format(self) -> ImageFormat {
        match self {
            Self::Png => ImageFormat::Png,
            Self::Jpeg => ImageFormat::Jpeg,
            Self::WebP => ImageFormat::WebP,
            Self::Avif => ImageFormat::Avif,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Background {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Background {
    pub fn parse(value: &str) -> Option<Self> {
        let trimmed = value.trim();
        let hex = trimmed.strip_prefix('#').unwrap_or(trimmed);
        if hex.len() != 6 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        let channel = |start: usize| u8::from_str_radix(&hex[start..start + 2], 16).ok();
        Some(Self {
            r: channel(0)?,
            g: channel(2)?,
            b: channel(4)?,
        })
    }

    pub fn to_hex(self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.r, self.g, self.b)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConversionRequest {
    pub target: OutputFormat,
    pub background: Option<Background>,
}

pub struct CompressionResult {
    pub data: Vec<u8>,
    pub format: ImageFormat,
}

impl CompressionResult {
    pub fn new(data: Vec<u8>, format: ImageFormat) -> Self {
        Self { data, format }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_format_accepts_names_and_mime_types() {
        assert_eq!(OutputFormat::parse("webp"), Some(OutputFormat::WebP));
        assert_eq!(OutputFormat::parse(" image/AVIF "), Some(OutputFormat::Avif));
        assert_eq!(OutputFormat::parse("jpg"), Some(OutputFormat::Jpeg));
        assert_eq!(OutputFormat::parse("image/jpeg"), Some(OutputFormat::Jpeg));
        assert_eq!(OutputFormat::parse("gif"), None);
        assert_eq!(OutputFormat::parse("heic"), None);
    }

    #[test]
    fn background_parses_six_digit_hex_only() {
        assert_eq!(
            Background::parse("#FFcc00"),
            Some(Background {
                r: 255,
                g: 204,
                b: 0
            })
        );
        assert_eq!(Background::parse("ffffff").map(|b| b.to_hex()), Some("#ffffff".to_string()));
        assert_eq!(Background::parse("#fff"), None);
        assert_eq!(Background::parse("white"), None);
    }
}
