use image::ImageFormat;

pub struct CompressionConfig {
    pub min_quality: u8,
    pub max_quality: u8,
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
