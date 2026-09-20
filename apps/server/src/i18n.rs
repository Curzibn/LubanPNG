use axum::http::header::ACCEPT_LANGUAGE;
use axum::http::HeaderMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Lang {
    #[default]
    Zh,
    En,
}

impl Lang {
    pub fn from_headers(headers: &HeaderMap) -> Self {
        headers
            .get(ACCEPT_LANGUAGE)
            .and_then(|value| value.to_str().ok())
            .map(Self::from_accept_language)
            .unwrap_or_default()
    }

    pub fn from_accept_language(value: &str) -> Self {
        let first_tag = value
            .split(',')
            .next()
            .and_then(|part| part.split(';').next())
            .map(str::trim)
            .unwrap_or_default();
        if first_tag.to_ascii_lowercase().starts_with("en") {
            Self::En
        } else {
            Self::Zh
        }
    }

    pub fn from_stored(value: &str) -> Self {
        if value.eq_ignore_ascii_case("en") {
            Self::En
        } else {
            Self::Zh
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Zh => "zh",
            Self::En => "en",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Msg {
    InvalidEmail,
    InvalidEmailDetail { detail: String },
    MailUnavailable,
    MailSendFailed { detail: String },
    OtpTooFrequent,
    OtpExpired,
    OtpTooManyAttempts,
    OtpIncorrect,
    LoginRequired,
    ApiKeyInvalid,
    ApiKeyRevoked,
    KeyNameInvalid,
    KeyLimitReached { max: i32 },
    KeyNotFound,
    KeyMissingOrRevoked,
    TaskNotFound,
    TaskNotFoundWithId { id: String },
    FileNotFound,
    FileNotFoundOrExpired,
    FileEmpty,
    UnsupportedFormats,
    HeifUnsupported,
    ConvertTargetInvalid,
    BackgroundInvalid,
    MissingRequestMarker,
    VisitTooFrequent,
    PathRequired,
    PlanIdRequired,
    PlanIdInvalid,
    EndpointNotFound,
    ParseFormFailed { detail: String },
    AnonymousDailyQuotaUsed,
    AnimatedConversionUnsupported,
    BackgroundRequired,
    FileTooLarge { size_mb: f64, max_size_mb: f64 },
    FileTooLargeMissingSize { max_size_mb: f64 },
    QuotaExceeded { resets_at: String },
    CompressionFailed { detail: String },
}

impl Msg {
    pub fn render(&self, lang: Lang) -> String {
        match lang {
            Lang::Zh => self.zh(),
            Lang::En => self.en(),
        }
    }

    fn zh(&self) -> String {
        match self {
            Msg::InvalidEmail => "邮箱地址无效".to_string(),
            Msg::InvalidEmailDetail { detail } => format!("邮箱地址无效: {}", detail),
            Msg::MailUnavailable => "邮件服务未配置，暂时无法发送验证码".to_string(),
            Msg::MailSendFailed { detail } => format!("邮件发送失败: {}", detail),
            Msg::OtpTooFrequent => "验证码发送过于频繁，请稍后再试".to_string(),
            Msg::OtpExpired => "验证码不存在或已过期，请重新获取".to_string(),
            Msg::OtpTooManyAttempts => "验证码错误次数过多，请重新获取".to_string(),
            Msg::OtpIncorrect => "验证码不正确".to_string(),
            Msg::LoginRequired => "请先登录".to_string(),
            Msg::ApiKeyInvalid => "API Key 无效".to_string(),
            Msg::ApiKeyRevoked => "API Key 无效或已吊销".to_string(),
            Msg::KeyNameInvalid => "Key 名称需为 1 到 40 个字符".to_string(),
            Msg::KeyLimitReached { max } => {
                format!("当前套餐最多 {} 个可用 Key，吊销后可再新建", max)
            }
            Msg::KeyNotFound => "Key 不存在".to_string(),
            Msg::KeyMissingOrRevoked => "Key 不存在或已吊销".to_string(),
            Msg::TaskNotFound => "任务不存在".to_string(),
            Msg::TaskNotFoundWithId { id } => format!("任务不存在: {}", id),
            Msg::FileNotFound => "文件不存在".to_string(),
            Msg::FileNotFoundOrExpired => "文件不存在或已过期".to_string(),
            Msg::FileEmpty => "文件不能为空".to_string(),
            Msg::UnsupportedFormats => "只支持 PNG、JPEG、GIF、WebP、AVIF 图片".to_string(),
            Msg::HeifUnsupported => {
                "暂不支持 HEIC/HEIF，请先在设备上导出为 JPEG 再上传".to_string()
            }
            Msg::ConvertTargetInvalid => "convert 只支持 png、jpeg、webp、avif".to_string(),
            Msg::BackgroundInvalid => "background 需要是 #RRGGBB 形式的颜色".to_string(),
            Msg::MissingRequestMarker => "缺少 X-Requested-With 头".to_string(),
            Msg::VisitTooFrequent => "访问上报过于频繁，请稍后再试".to_string(),
            Msg::PathRequired => "path 不能为空".to_string(),
            Msg::PlanIdRequired => "plan_id 不能为空".to_string(),
            Msg::PlanIdInvalid => "plan_id 仅支持 pro 或 metered".to_string(),
            Msg::EndpointNotFound => "接口不存在".to_string(),
            Msg::ParseFormFailed { detail } => format!("解析表单数据失败: {}", detail),
            Msg::AnonymousDailyQuotaUsed => {
                "该网络今日的匿名压缩次数已用完，登录后可继续使用".to_string()
            }
            Msg::AnimatedConversionUnsupported => {
                "动图暂不支持格式转换，请保持原格式压缩".to_string()
            }
            Msg::BackgroundRequired => {
                "透明图转 JPEG 需要指定背景色 background，例如 #ffffff".to_string()
            }
            Msg::FileTooLarge {
                size_mb,
                max_size_mb,
            } => format!(
                "文件大小 {:.2} MB 超过最大限制 {:.2} MB，请上传小于 {:.2} MB 的文件",
                size_mb, max_size_mb, max_size_mb
            ),
            Msg::FileTooLargeMissingSize { max_size_mb } => format!(
                "文件超过最大限制 {:.2} MB，请上传小于 {:.2} MB 的文件",
                max_size_mb, max_size_mb
            ),
            Msg::QuotaExceeded { resets_at } => {
                format!("本期额度已用完，{} 重置", resets_at)
            }
            Msg::CompressionFailed { detail } => format!("压缩失败: {}", detail),
        }
    }

    fn en(&self) -> String {
        match self {
            Msg::InvalidEmail => "Invalid email address".to_string(),
            Msg::InvalidEmailDetail { detail } => format!("Invalid email address: {}", detail),
            Msg::MailUnavailable => {
                "Email service is temporarily unavailable, please try again later".to_string()
            }
            Msg::MailSendFailed { detail } => format!("Failed to send the email: {}", detail),
            Msg::OtpTooFrequent => {
                "Too many verification code requests, please try again later".to_string()
            }
            Msg::OtpExpired => {
                "The verification code is missing or expired, please request a new one".to_string()
            }
            Msg::OtpTooManyAttempts => {
                "Too many incorrect attempts, please request a new code".to_string()
            }
            Msg::OtpIncorrect => "Incorrect verification code".to_string(),
            Msg::LoginRequired => "Please sign in first".to_string(),
            Msg::ApiKeyInvalid => "Invalid API key".to_string(),
            Msg::ApiKeyRevoked => "Invalid or revoked API key".to_string(),
            Msg::KeyNameInvalid => "Key name must be between 1 and 40 characters".to_string(),
            Msg::KeyLimitReached { max } => format!(
                "Your plan supports at most {} active API key(s); revoke one to create another",
                max
            ),
            Msg::KeyNotFound => "Key not found".to_string(),
            Msg::KeyMissingOrRevoked => "Key not found or already revoked".to_string(),
            Msg::TaskNotFound => "Task not found".to_string(),
            Msg::TaskNotFoundWithId { id } => format!("Task not found: {}", id),
            Msg::FileNotFound => "File not found".to_string(),
            Msg::FileNotFoundOrExpired => "File not found or expired".to_string(),
            Msg::FileEmpty => "The uploaded file is empty".to_string(),
            Msg::UnsupportedFormats => {
                "Only PNG, JPEG, GIF, WebP and AVIF images are supported".to_string()
            }
            Msg::HeifUnsupported => {
                "HEIC/HEIF is not supported yet; export the image to JPEG and upload again"
                    .to_string()
            }
            Msg::ConvertTargetInvalid => {
                "convert only supports png, jpeg, webp and avif".to_string()
            }
            Msg::BackgroundInvalid => "background must be a color like #RRGGBB".to_string(),
            Msg::MissingRequestMarker => "Missing X-Requested-With header".to_string(),
            Msg::VisitTooFrequent => "Too many visit reports, please try again later".to_string(),
            Msg::PathRequired => "path must not be empty".to_string(),
            Msg::PlanIdRequired => "plan_id must not be empty".to_string(),
            Msg::PlanIdInvalid => "plan_id must be pro or metered".to_string(),
            Msg::EndpointNotFound => "Endpoint not found".to_string(),
            Msg::ParseFormFailed { detail } => {
                format!("Failed to parse the form data: {}", detail)
            }
            Msg::AnonymousDailyQuotaUsed => {
                "This network has used up today's free compressions; sign in to keep using LubanPNG"
                    .to_string()
            }
            Msg::AnimatedConversionUnsupported => {
                "Animated images cannot be converted yet; compress them in their original format"
                    .to_string()
            }
            Msg::BackgroundRequired => {
                "Converting a transparent image to JPEG requires a background color, for example #ffffff"
                    .to_string()
            }
            Msg::FileTooLarge {
                size_mb,
                max_size_mb,
            } => format!(
                "The file is {:.2} MB, over the {:.2} MB limit; please upload a file smaller than {:.2} MB",
                size_mb, max_size_mb, max_size_mb
            ),
            Msg::FileTooLargeMissingSize { max_size_mb } => format!(
                "The file exceeds the {:.2} MB limit; please upload a file smaller than {:.2} MB",
                max_size_mb, max_size_mb
            ),
            Msg::QuotaExceeded { resets_at } => {
                format!("Your quota for this period is used up; it resets at {}", resets_at)
            }
            Msg::CompressionFailed { detail } => format!("Compression failed: {}", detail),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct CompressionDetail {
    zh: &'static str,
    en: &'static str,
    source: CompressionSource,
}

#[derive(Debug, Clone, PartialEq)]
enum CompressionSource {
    None,
    Text(String),
    Nested(Box<CompressionDetail>),
}

impl CompressionDetail {
    fn new(zh: &'static str, en: &'static str) -> Self {
        Self {
            zh,
            en,
            source: CompressionSource::None,
        }
    }

    fn text(detail: impl std::fmt::Display) -> Self {
        Self {
            zh: "",
            en: "",
            source: CompressionSource::Text(detail.to_string()),
        }
    }

    fn external(zh: &'static str, en: &'static str, detail: impl std::fmt::Display) -> Self {
        Self::nested(zh, en, Self::text(detail))
    }

    fn nested(zh: &'static str, en: &'static str, source: CompressionDetail) -> Self {
        Self {
            zh,
            en,
            source: CompressionSource::Nested(Box::new(source)),
        }
    }

    pub fn render(&self, lang: Lang) -> String {
        match &self.source {
            CompressionSource::Text(detail) => detail.clone(),
            CompressionSource::None => match lang {
                Lang::Zh => self.zh.to_string(),
                Lang::En => self.en.to_string(),
            },
            CompressionSource::Nested(source) => match lang {
                Lang::Zh => format!("{}: {}", self.zh, source.render(lang)),
                Lang::En => format!("{}: {}", self.en, source.render(lang)),
            },
        }
    }
}

pub mod compression {
    use super::CompressionDetail;

    pub fn text(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::text(detail)
    }

    pub fn image_process(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("图片处理错误", "Image processing failed", detail)
    }

    pub fn unsupported_format(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("不支持的图片格式", "Unsupported image format", detail)
    }

    pub fn task_execution(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("任务执行失败", "Task execution failed", detail)
    }

    pub fn runtime_handle() -> CompressionDetail {
        CompressionDetail::new(
            "无法获取运行时句柄",
            "Failed to get the async runtime handle",
        )
    }

    pub fn webp_config_init() -> CompressionDetail {
        CompressionDetail::new(
            "初始化 WebP 编码配置失败",
            "Failed to initialize the WebP encoder configuration",
        )
    }

    pub fn webp_encode(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("WebP 编码失败", "WebP encoding failed", detail)
    }

    pub fn webp_lossless_encode(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("WebP 无损编码失败", "WebP lossless encoding failed", detail)
    }

    pub fn webp_animated_decode(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external(
            "解析动态 WebP 失败",
            "Failed to decode the animated WebP",
            detail,
        )
    }

    pub fn webp_frame_read() -> CompressionDetail {
        CompressionDetail::new(
            "读取动态 WebP 帧失败",
            "Failed to read an animated WebP frame",
        )
    }

    pub fn webp_no_frames() -> CompressionDetail {
        CompressionDetail::new("动态 WebP 没有帧", "The animated WebP contains no frames")
    }

    pub fn webp_animated_encode(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external(
            "动态 WebP 编码失败",
            "Animated WebP encoding failed",
            detail,
        )
    }

    pub fn apng_encode(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("APNG 编码失败", "APNG encoding failed", detail)
    }

    pub fn gif_encode(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("GIF 编码失败", "GIF encoding failed", detail)
    }

    pub fn gif_no_frames() -> CompressionDetail {
        CompressionDetail::new("GIF 没有可用的帧", "The GIF contains no usable frames")
    }

    pub fn gif_too_large() -> CompressionDetail {
        CompressionDetail::new(
            "GIF 尺寸超出格式上限",
            "The GIF exceeds the format's size limit",
        )
    }

    pub fn gif_quantize(source: CompressionDetail) -> CompressionDetail {
        CompressionDetail::nested("GIF 量化失败", "GIF quantization failed", source)
    }

    pub fn png_encode(source: CompressionDetail) -> CompressionDetail {
        CompressionDetail::nested("PNG 编码失败", "PNG encoding failed", source)
    }

    pub fn png_smart_encode(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("PNG编码失败", "PNG encoding failed", detail)
    }

    pub fn jpeg_encode(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("JPEG编码失败", "JPEG encoding failed", detail)
    }

    pub fn jpeg_panic() -> CompressionDetail {
        CompressionDetail::new("JPEG编码过程中发生panic", "JPEG encoding panicked")
    }

    pub fn oxipng_optimize(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("OxiPNG优化失败", "OxiPNG optimization failed", detail)
    }

    pub fn image_create() -> CompressionDetail {
        CompressionDetail::new("创建图像失败", "Failed to create the image")
    }

    pub fn ssim_size_mismatch() -> CompressionDetail {
        CompressionDetail::new("图像尺寸不匹配", "Image dimensions do not match")
    }

    pub fn quantize_no_frames() -> CompressionDetail {
        CompressionDetail::new("没有可量化的帧", "No frames to quantize")
    }

    pub fn quantize_size_mismatch() -> CompressionDetail {
        CompressionDetail::new("各帧尺寸不一致", "Frame sizes do not match")
    }

    pub fn quantize_set_quality(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("设置质量失败", "Failed to set the quality range", detail)
    }

    pub fn quantize_set_colors(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("设置颜色数失败", "Failed to set the colour count", detail)
    }

    pub fn quantize_create_image(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("创建图像失败", "Failed to create the image", detail)
    }

    pub fn quantize_run(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("量化失败", "Quantization failed", detail)
    }

    pub fn quantize_histogram(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external(
            "统计颜色失败",
            "Failed to build the colour histogram",
            detail,
        )
    }

    pub fn quantize_dithering(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("设置抖动失败", "Failed to set the dithering level", detail)
    }

    pub fn quantize_remap(detail: impl std::fmt::Display) -> CompressionDetail {
        CompressionDetail::external("重映射失败", "Failed to remap the image", detail)
    }

    pub fn quantize_palette_mismatch() -> CompressionDetail {
        CompressionDetail::new("多帧调色板不一致", "Frames produced inconsistent palettes")
    }
}

pub struct LoginCodeEmail {
    pub subject: String,
    pub body: String,
}

pub fn login_code_email(lang: Lang, code: &str, ttl_minutes: i64) -> LoginCodeEmail {
    match lang {
        Lang::Zh => LoginCodeEmail {
            subject: format!("{} 是你的 LubanPNG 登录验证码", code),
            body: format!(
                "你的 LubanPNG 登录验证码是 {}，{} 分钟内有效。\n\n如果不是你本人操作，忽略这封邮件即可。",
                code, ttl_minutes
            ),
        },
        Lang::En => LoginCodeEmail {
            subject: format!("{} is your LubanPNG login code", code),
            body: format!(
                "Your LubanPNG login code is {}. It is valid for {} minutes.\n\nIf you didn't request this, you can safely ignore this email.",
                code, ttl_minutes
            ),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_language_tag_decides_layout() {
        assert_eq!(Lang::from_accept_language("en-US,en;q=0.9"), Lang::En);
        assert_eq!(Lang::from_accept_language("EN"), Lang::En);
        assert_eq!(Lang::from_accept_language(" en;q=0.8 "), Lang::En);
        assert_eq!(
            Lang::from_accept_language("zh-CN,zh;q=0.9,en;q=0.8"),
            Lang::Zh
        );
        assert_eq!(Lang::from_accept_language("fr-FR,en;q=0.9"), Lang::Zh);
        assert_eq!(Lang::from_accept_language("*"), Lang::Zh);
        assert_eq!(Lang::from_accept_language(""), Lang::Zh);
    }

    #[test]
    fn headers_without_accept_language_default_to_chinese() {
        let headers = HeaderMap::new();
        assert_eq!(Lang::from_headers(&headers), Lang::Zh);
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT_LANGUAGE, "en-GB".parse().unwrap());
        assert_eq!(Lang::from_headers(&headers), Lang::En);
    }

    #[test]
    fn stored_language_round_trips() {
        assert_eq!(Lang::from_stored(Lang::En.as_str()), Lang::En);
        assert_eq!(Lang::from_stored(Lang::Zh.as_str()), Lang::Zh);
        assert_eq!(Lang::from_stored("anything-else"), Lang::Zh);
    }

    #[test]
    fn key_messages_render_in_both_languages() {
        let too_large = Msg::FileTooLarge {
            size_mb: 6.0,
            max_size_mb: 5.0,
        };
        assert!(too_large
            .render(Lang::Zh)
            .contains("文件大小 6.00 MB 超过最大限制 5.00 MB"));
        assert!(too_large
            .render(Lang::En)
            .contains("The file is 6.00 MB, over the 5.00 MB limit"));
        assert!(!too_large.render(Lang::En).contains('超'));

        let quota = Msg::QuotaExceeded {
            resets_at: "2026-10-01T00:00:00+08:00".to_string(),
        };
        assert!(quota.render(Lang::Zh).contains("2026-10-01T00:00:00+08:00"));
        assert!(quota
            .render(Lang::En)
            .contains("resets at 2026-10-01T00:00:00+08:00"));

        assert_eq!(
            Msg::OtpTooFrequent.render(Lang::Zh),
            "验证码发送过于频繁，请稍后再试"
        );
        assert_eq!(
            Msg::OtpTooFrequent.render(Lang::En),
            "Too many verification code requests, please try again later"
        );
        assert_eq!(Msg::LoginRequired.render(Lang::En), "Please sign in first");
        assert_eq!(Msg::ApiKeyInvalid.render(Lang::En), "Invalid API key");
        assert_eq!(Msg::TaskNotFound.render(Lang::En), "Task not found");
        assert_eq!(
            Msg::ConvertTargetInvalid.render(Lang::En),
            "convert only supports png, jpeg, webp and avif"
        );
        assert_eq!(
            Msg::KeyLimitReached { max: 1 }.render(Lang::Zh),
            "当前套餐最多 1 个可用 Key，吊销后可再新建"
        );
        assert!(Msg::KeyLimitReached { max: 1 }
            .render(Lang::En)
            .contains("at most 1 active API key"));
    }

    fn has_cjk(value: &str) -> bool {
        value.chars().any(|c| {
            matches!(
                c,
                '\u{3000}'..='\u{303f}' | '\u{4e00}'..='\u{9fff}' | '\u{ff00}'..='\u{ffef}'
            )
        })
    }

    #[test]
    fn compression_details_keep_chinese_wording() {
        let detail = compression::gif_quantize(compression::quantize_palette_mismatch());
        assert_eq!(detail.render(Lang::Zh), "GIF 量化失败: 多帧调色板不一致");
        assert_eq!(
            detail.render(Lang::En),
            "GIF quantization failed: Frames produced inconsistent palettes"
        );

        let nested = compression::png_encode(compression::png_smart_encode("boom"));
        assert_eq!(nested.render(Lang::Zh), "PNG 编码失败: PNG编码失败: boom");
        assert_eq!(
            nested.render(Lang::En),
            "PNG encoding failed: PNG encoding failed: boom"
        );

        let external = compression::quantize_set_quality("bad range");
        assert_eq!(external.render(Lang::Zh), "设置质量失败: bad range");
        assert_eq!(
            external.render(Lang::En),
            "Failed to set the quality range: bad range"
        );

        let raw = compression::text("unexpected end of file");
        assert_eq!(raw.render(Lang::Zh), "unexpected end of file");
        assert_eq!(raw.render(Lang::En), "unexpected end of file");
    }

    #[test]
    fn english_compression_details_have_no_chinese_residue() {
        let details = [
            compression::image_process("decode error"),
            compression::unsupported_format("Rgb8"),
            compression::task_execution("task panicked"),
            compression::runtime_handle(),
            compression::webp_config_init(),
            compression::webp_encode("error"),
            compression::webp_lossless_encode("error"),
            compression::webp_animated_decode("error"),
            compression::webp_frame_read(),
            compression::webp_no_frames(),
            compression::webp_animated_encode("error"),
            compression::apng_encode("error"),
            compression::gif_encode("error"),
            compression::gif_no_frames(),
            compression::gif_too_large(),
            compression::gif_quantize(compression::quantize_histogram("error")),
            compression::png_encode(compression::png_smart_encode("error")),
            compression::jpeg_encode("error"),
            compression::jpeg_panic(),
            compression::oxipng_optimize("error"),
            compression::image_create(),
            compression::ssim_size_mismatch(),
            compression::quantize_no_frames(),
            compression::quantize_size_mismatch(),
            compression::quantize_set_quality("error"),
            compression::quantize_set_colors("error"),
            compression::quantize_create_image("error"),
            compression::quantize_run("error"),
            compression::quantize_dithering("error"),
            compression::quantize_remap("error"),
            compression::quantize_palette_mismatch(),
        ];
        for detail in details {
            let rendered = detail.render(Lang::En);
            assert!(
                !has_cjk(&rendered),
                "English detail contains CJK: {rendered}"
            );
        }
    }

    #[test]
    fn login_code_email_matches_request_language() {
        let zh = login_code_email(Lang::Zh, "482913", 10);
        assert_eq!(zh.subject, "482913 是你的 LubanPNG 登录验证码");
        assert!(zh
            .body
            .contains("你的 LubanPNG 登录验证码是 482913，10 分钟内有效。"));

        let en = login_code_email(Lang::En, "482913", 10);
        assert_eq!(en.subject, "482913 is your LubanPNG login code");
        assert!(en.body.contains("Your LubanPNG login code is 482913."));
        assert!(en.body.contains("valid for 10 minutes"));
        assert!(en.body.contains("If you didn't request this"));
    }
}
