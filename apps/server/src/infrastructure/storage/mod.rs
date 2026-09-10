pub mod object_storage;

pub use object_storage::{ObjectStorage, S3Storage};

pub fn format_extension(format: image::ImageFormat) -> &'static str {
    match format {
        image::ImageFormat::Png => ".png",
        image::ImageFormat::Jpeg => ".jpg",
        image::ImageFormat::Gif => ".gif",
        image::ImageFormat::WebP => ".webp",
        image::ImageFormat::Avif => ".avif",
        image::ImageFormat::Bmp => ".bmp",
        image::ImageFormat::Tiff => ".tiff",
        _ => ".bin",
    }
}

pub fn content_type_for_extension(extension: &str) -> &'static str {
    match extension
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "tiff" | "tif" => "image/tiff",
        _ => "application/octet-stream",
    }
}
