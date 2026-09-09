pub mod strategy;
pub mod png;
pub mod jpeg;
pub mod gif;
pub mod jpeg_smart;
pub mod png_smart;

pub use strategy::CompressionStrategy;
pub use png::PngCompressionStrategy;
pub use jpeg::JpegCompressionStrategy;
pub use gif::GifCompressionStrategy;
