pub mod gif;
pub mod jpeg;
pub mod jpeg_smart;
pub mod png;
pub mod png_smart;
pub mod strategy;

pub use gif::GifCompressionStrategy;
pub use jpeg::JpegCompressionStrategy;
pub use png::PngCompressionStrategy;
pub use strategy::CompressionStrategy;
