use image::ImageFormat;

pub struct CompressionResult {
    pub data: Vec<u8>,
    pub format: ImageFormat,
}

impl CompressionResult {
    pub fn new(data: Vec<u8>, format: ImageFormat) -> Self {
        Self { data, format }
    }
}
