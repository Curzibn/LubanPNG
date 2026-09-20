use crate::config::{AppConfig, UpscalerConfig};
use crate::domain::subject::Subject;
use crate::domain::task::{TaskKind, TaskRecord, UpscaleScale};
use crate::error::{AppError, AppResult};
use crate::i18n::{Lang, Msg};
use crate::infrastructure::compression::probe;
use crate::infrastructure::storage::format_extension;
use crate::infrastructure::storage::ObjectStorage;
use crate::infrastructure::upscale::{UpscaleFailure, Upscaler};
use crate::repositories::identity_repository::IdentityRepository;
use crate::repositories::task_repository::{NewTask, TaskRepository};
use crate::services::quota::QuotaService;
use bytes::Bytes;
use chrono::{Duration, Utc};
use image::ImageFormat;
use std::sync::Arc;
use std::time::Duration as StdDuration;
use uuid::Uuid;

const BUSY_BACKOFF_SECS: [u64; 3] = [2, 5, 10];
const QUEUE_FULL_RETRY_AFTER_SECS: i64 = 30;

pub struct UpscaleService {
    tasks: Arc<TaskRepository>,
    identity: Arc<IdentityRepository>,
    quota: Arc<QuotaService>,
    storage: Arc<dyn ObjectStorage>,
    upscaler: Arc<dyn Upscaler>,
    config: AppConfig,
}

fn detect_dimensions(data: &[u8], lang: Lang) -> AppResult<(u32, u32)> {
    let reader = image::ImageReader::new(std::io::Cursor::new(data))
        .with_guessed_format()
        .map_err(|_| AppError::validation(Msg::UnsupportedFormats, lang))?;
    match reader.into_dimensions() {
        Ok(dimensions) => Ok(dimensions),
        Err(_) => {
            if probe::is_heif(data) {
                Err(AppError::validation(Msg::HeifUnsupported, lang))
            } else {
                Err(AppError::validation(Msg::UnsupportedFormats, lang))
            }
        }
    }
}

fn validate_upscale_input(
    data: &[u8],
    limits: &UpscalerConfig,
    lang: Lang,
) -> AppResult<(u32, u32)> {
    let (width, height) = detect_dimensions(data, lang)?;
    let format = probe::sniff_format(data)
        .ok_or_else(|| AppError::validation(Msg::UnsupportedFormats, lang))?;
    if !matches!(format, ImageFormat::Png | ImageFormat::Jpeg) {
        return Err(AppError::validation(Msg::UpscaleFormatUnsupported, lang));
    }
    if probe::is_animated(data, format) {
        return Err(AppError::validation(Msg::UpscaleAnimatedUnsupported, lang));
    }
    if width.max(height) > limits.max_input_side {
        return Err(AppError::validation(
            Msg::UpscaleSideTooLong {
                side: i64::from(width.max(height)),
                max_side: i64::from(limits.max_input_side),
            },
            lang,
        ));
    }
    let pixels = i64::from(width) * i64::from(height);
    if pixels > limits.max_input_pixels {
        return Err(AppError::validation(
            Msg::UpscalePixelsTooLarge {
                megapixels: pixels as f64 / 1_000_000.0,
                max_megapixels: limits.max_input_pixels as f64 / 1_000_000.0,
            },
            lang,
        ));
    }
    Ok((width, height))
}

impl UpscaleService {
    pub fn new(
        tasks: Arc<TaskRepository>,
        identity: Arc<IdentityRepository>,
        quota: Arc<QuotaService>,
        storage: Arc<dyn ObjectStorage>,
        upscaler: Arc<dyn Upscaler>,
        config: AppConfig,
    ) -> Self {
        Self {
            tasks,
            identity,
            quota,
            storage,
            upscaler,
            config,
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.config.upscaler.enabled
    }

    pub async fn submit(
        &self,
        subject: &Subject,
        data: Bytes,
        filename: &str,
        scale: UpscaleScale,
        lang: Lang,
    ) -> AppResult<TaskRecord> {
        if !self.config.upscaler.enabled {
            return Err(AppError::unavailable(Msg::UpscaleUnavailable, lang));
        }
        let size = data.len() as i64;
        if size == 0 {
            return Err(AppError::validation(Msg::FileEmpty, lang));
        }
        if size > self.config.upscaler.max_input_bytes {
            return Err(AppError::file_too_large(
                size as u64,
                self.config.upscaler.max_input_bytes as u64,
                lang,
            ));
        }
        let (width, height) = validate_upscale_input(&data, &self.config.upscaler, lang)?;
        self.upscaler
            .health()
            .await
            .map_err(|_| AppError::unavailable(Msg::UpscaleUnavailable, lang))?;
        let depth = self.tasks.upscale_queue_depth().await?;
        if depth >= i64::from(self.config.upscaler.queue_depth_limit) {
            return Err(AppError::upscale_queue_full(
                depth,
                QUEUE_FULL_RETRY_AFTER_SECS,
                lang,
            ));
        }
        let task_id = Uuid::new_v4();
        let snapshot = self.quota.reserve(subject, task_id, 1, lang).await?;
        let format = probe::sniff_format(&data)
            .ok_or_else(|| AppError::validation(Msg::UnsupportedFormats, lang))?;
        let extension = format_extension(format);
        let input_key = format!("uploads/{}{}", task_id, extension);
        let subject_type = subject.kind.as_str();
        if let Err(err) = self
            .storage
            .put(&input_key, data, "application/octet-stream", None)
            .await
        {
            self.quota
                .refund(subject_type, subject.id, &snapshot.period_key, task_id, 1)
                .await?;
            return Err(err);
        }
        let created = self
            .tasks
            .create(NewTask {
                id: task_id,
                subject_type: subject_type.to_string(),
                subject_id: subject.id,
                source: subject.source.as_str().to_string(),
                original_name: crate::services::compression::sanitize_name(filename),
                original_size: size,
                input_key: input_key.clone(),
                quota_period: snapshot.period_key.clone(),
                quota_units: 1,
                kind: TaskKind::Upscale,
                upscale_scale: Some(scale.stored()),
                target_format: None,
                background: None,
                lang: lang.as_str().to_string(),
            })
            .await;
        match created {
            Ok(record) => {
                tracing::info!(
                    task_id = %task_id,
                    width,
                    height,
                    scale = scale.as_str(),
                    queue_depth = depth,
                    "upscale task queued"
                );
                Ok(record)
            }
            Err(err) => {
                self.quota
                    .refund(subject_type, subject.id, &snapshot.period_key, task_id, 1)
                    .await?;
                let _ = self.storage.delete(&input_key).await;
                Err(err)
            }
        }
    }

    async fn settle_completed(&self, task: &TaskRecord) -> AppResult<()> {
        self.quota
            .settle(
                &task.subject_type,
                task.subject_id,
                &task.quota_period,
                task.id,
                task.quota_units(),
            )
            .await
    }

    async fn run(&self, task: &TaskRecord) -> AppResult<()> {
        let lang = Lang::from_stored(&task.lang);
        let scale = task
            .scale()
            .ok_or_else(|| AppError::internal(format!("upscale task {} missing scale", task.id)))?;
        let input = self.storage.get(&task.input_key).await?;
        let deadline = tokio::time::Instant::now()
            + StdDuration::from_secs(self.config.upscaler.task_timeout_secs.max(1));
        let mut attempt: usize = 0;
        let output = loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return Err(AppError::upscale(
                    UpscaleFailure::InferenceTimeout("task budget exhausted".to_string())
                        .render(lang),
                    lang,
                ));
            }
            match self
                .upscaler
                .upscale(input.clone(), scale.factor(), remaining)
                .await
            {
                Ok(output) => break output,
                Err(UpscaleFailure::Busy) => {
                    let backoff = StdDuration::from_secs(
                        BUSY_BACKOFF_SECS[attempt.min(BUSY_BACKOFF_SECS.len() - 1)],
                    );
                    attempt += 1;
                    if backoff >= deadline.saturating_duration_since(tokio::time::Instant::now()) {
                        return Err(AppError::upscale(
                            UpscaleFailure::InferenceTimeout(
                                "gave up waiting for the GPU slot".to_string(),
                            )
                            .render(lang),
                            lang,
                        ));
                    }
                    tracing::warn!(
                        task_id = %task.id,
                        attempt,
                        backoff_secs = backoff.as_secs(),
                        "upscale busy, backing off"
                    );
                    tokio::time::sleep(backoff).await;
                }
                Err(failure) => {
                    return Err(AppError::upscale(failure.render(lang), lang));
                }
            }
        };
        tracing::info!(
            task_id = %task.id,
            output_width = ?output.width,
            output_height = ?output.height,
            output_bytes = output.data.len(),
            "upscale inference finished"
        );
        if output.data.len() > self.config.upscaler.max_output_bytes {
            return Err(AppError::upscale_output_too_large(
                output.data.len() as u64,
                self.config.upscaler.max_output_bytes as u64,
                lang,
            ));
        }
        self.tasks.set_progress(task.id, 70).await?;
        let plan = self
            .identity
            .plan_for_task(&task.subject_type, task.subject_id)
            .await?;
        let output_size = output.data.len() as i64;
        let output_key = format!("{}/{}.png", plan.output_prefix(), task.id);
        self.storage
            .put(
                &output_key,
                output.data,
                "image/png",
                Some(&task.original_name),
            )
            .await?;
        let expires_at = Utc::now() + Duration::hours(plan.retention_hours as i64);
        self.tasks
            .complete(task.id, output_size, &output_key, expires_at)
            .await?;
        self.settle_completed(task).await?;
        let _ = self.storage.delete(&task.input_key).await;
        Ok(())
    }

    pub async fn process(&self, task: TaskRecord) {
        let lang = Lang::from_stored(&task.lang);
        if let Err(err) = self.run(&task).await {
            let err = err.with_lang(lang);
            tracing::warn!(task_id = %task.id, error = %err, "upscale task failed");
            if let Err(update_err) = self.tasks.fail(task.id, &err.message()).await {
                tracing::error!(task_id = %task.id, error = %update_err, "failed to mark task failed");
            }
            if let Err(refund_err) = self
                .quota
                .refund(
                    &task.subject_type,
                    task.subject_id,
                    &task.quota_period,
                    task.id,
                    task.quota_units(),
                )
                .await
            {
                tracing::error!(task_id = %task.id, error = %refund_err, "failed to refund quota");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn limits() -> UpscalerConfig {
        UpscalerConfig::default()
    }

    #[test]
    fn input_limits_reject_oversized_dimensions() {
        let exact = gradient_png(1500, 1500);
        assert!(validate_upscale_input(&exact, &limits(), Lang::Zh).is_ok());

        let max_side = gradient_png(2048, 8);
        assert!(validate_upscale_input(&max_side, &limits(), Lang::Zh).is_ok());

        let too_tall = gradient_png(8, 2049);
        let err = validate_upscale_input(&too_tall, &limits(), Lang::Zh).unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));

        let just_over = gradient_png(1500, 1501);
        assert!(validate_upscale_input(&just_over, &limits(), Lang::Zh).is_err());

        let over_pixels = gradient_png(1600, 1600);
        let err = validate_upscale_input(&over_pixels, &limits(), Lang::Zh).unwrap_err();
        match err {
            AppError::Validation { message, .. } => {
                assert!(matches!(message, Msg::UpscalePixelsTooLarge { .. }));
            }
            other => panic!("unexpected error: {:?}", other),
        }

        let mut tight = limits();
        tight.max_input_side = 512;
        let wide = gradient_png(513, 4);
        let err = validate_upscale_input(&wide, &tight, Lang::Zh).unwrap_err();
        match err {
            AppError::Validation { message, .. } => {
                assert!(matches!(message, Msg::UpscaleSideTooLong { .. }));
            }
            other => panic!("unexpected error: {:?}", other),
        }
    }

    #[test]
    fn only_png_and_jpeg_pass_the_whitelist() {
        let png = gradient_png(64, 64);
        assert!(validate_upscale_input(&png, &limits(), Lang::Zh).is_ok());

        let jpeg = gradient_jpeg_bytes(64, 64);
        assert!(validate_upscale_input(&jpeg, &limits(), Lang::Zh).is_ok());

        let gif = static_gif(64, 64);
        match validate_upscale_input(&gif, &limits(), Lang::Zh).unwrap_err() {
            AppError::Validation { message, .. } => {
                assert!(matches!(message, Msg::UpscaleFormatUnsupported { .. }));
            }
            other => panic!("unexpected error: {:?}", other),
        }
    }

    fn static_gif(w: u32, h: u32) -> Vec<u8> {
        let mut buf = Vec::new();
        image::DynamicImage::ImageRgba8(image::RgbaImage::new(w, h))
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Gif)
            .unwrap();
        buf
    }

    fn gradient_jpeg_bytes(w: u32, h: u32) -> Vec<u8> {
        let mut img = image::RgbImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(x, y, image::Rgb([(x % 256) as u8, (y % 256) as u8, 90]));
            }
        }
        let mut buf = Vec::new();
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 80);
        image::DynamicImage::ImageRgb8(img)
            .write_with_encoder(encoder)
            .unwrap();
        buf
    }

    fn gradient_png(w: u32, h: u32) -> Vec<u8> {
        let mut img = image::RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(
                    x,
                    y,
                    image::Rgba([(x % 256) as u8, (y % 256) as u8, 200, 255]),
                );
            }
        }
        let mut buf = Vec::new();
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        buf
    }
}
