use crate::app::AppState;
use crate::domain::compression::{Background, ConversionRequest, OutputFormat};
use crate::domain::subject::Subject;
use crate::domain::task::UpscaleScale;
use crate::error::AppError;
use crate::handlers::extract::ClientMeta;
use crate::i18n::{Lang, Msg};
use crate::response::{ApiResponse, ApiResponseError};
use crate::services::compression::TaskStatusView;
use axum::extract::{Multipart, Path, Query, State};
use axum::{Extension, Json};
use bytes::Bytes;
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

#[derive(ToSchema)]
pub struct UploadForm {
    #[schema(value_type = String, format = Binary)]
    #[allow(dead_code)]
    pub file: String,
    #[schema(example = "webp")]
    #[allow(dead_code)]
    pub convert: Option<String>,
    #[schema(example = "#ffffff")]
    #[allow(dead_code)]
    pub background: Option<String>,
}

#[derive(serde::Serialize, ToSchema)]
pub struct UploadResponse {
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub task_id: String,
}

#[derive(ToSchema)]
pub struct UpscaleForm {
    #[schema(value_type = String, format = Binary)]
    #[allow(dead_code)]
    pub file: String,
    #[schema(example = "x4")]
    #[allow(dead_code)]
    pub scale: String,
}

#[derive(Deserialize, IntoParams)]
pub struct StatusQuery {
    #[param(example = 30)]
    pub wait: Option<u64>,
}

#[utoipa::path(
    post,
    path = "/v1/images/compress",
    tag = "图片压缩",
    request_body(
        content = UploadForm,
        content_type = "multipart/form-data",
        description = "上传一张 PNG / JPEG / GIF / WebP / AVIF 图片，入队压缩并扣减 1 次额度；可选 convert 指定输出格式（png、jpeg、webp、avif），转换额外扣减 1 次；透明图转 JPEG 时需用 background 指定 #RRGGBB 背景色",
    ),
    responses(
        (status = 200, description = "已入队", body = ApiResponse<UploadResponse>),
        (status = 400, description = "参数错误或不支持的格式", body = ApiResponseError),
        (status = 413, description = "文件超过当前套餐上限", body = ApiResponseError),
        (status = 429, description = "本期额度用尽或触发限速", body = ApiResponseError),
    ),
    security(("api_key" = []))
)]
pub async fn upload_image(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
    Extension(meta): Extension<ClientMeta>,
    Extension(lang): Extension<Lang>,
    multipart: Multipart,
) -> Result<Json<ApiResponse<UploadResponse>>, AppError> {
    let upload = parse_multipart(multipart, state.config.server.max_upload_size, lang).await?;
    if !subject.is_account() {
        let allowed = state
            .rate_limits
            .hit(
                &format!("upload:ip:{}", meta.ip),
                86_400,
                state.config.limits.anonymous_uploads_per_ip_per_day as i64,
            )
            .await?;
        if !allowed {
            return Err(AppError::rate_limited(Msg::AnonymousDailyQuotaUsed, lang));
        }
    }
    let task = state
        .compression
        .submit(
            &subject,
            upload.data,
            &upload.filename,
            upload.conversion,
            lang,
        )
        .await?;
    Ok(Json(ApiResponse::success(UploadResponse {
        task_id: task.id.to_string(),
    })))
}

#[utoipa::path(
    post,
    path = "/v1/images/upscale",
    tag = "图片放大",
    request_body(
        content = UpscaleForm,
        content_type = "multipart/form-data",
        description = "上传一张静态 PNG 或 JPEG 图片，按 scale（x2 或 x4）放大，输出固定为 PNG 并计减 1 次额度；输入上限 2.25MP、单边 2048、20MB；失败或超时不计次；排队上限 10，超限返回 429",
    ),
    responses(
        (status = 200, description = "已入队", body = ApiResponse<UploadResponse>),
        (status = 400, description = "参数错误、尺寸超限或格式不支持（仅 PNG/JPEG）", body = ApiResponseError),
        (status = 413, description = "文件超过放大输入上限（20MB）", body = ApiResponseError),
        (status = 429, description = "本期额度用尽、触发限速或放大队列已满", body = ApiResponseError),
        (status = 503, description = "放大服务不可用", body = ApiResponseError),
    ),
    security(("api_key" = []))
)]
pub async fn upscale_image(
    State(state): State<Arc<AppState>>,
    Extension(subject): Extension<Subject>,
    Extension(meta): Extension<ClientMeta>,
    Extension(lang): Extension<Lang>,
    multipart: Multipart,
) -> Result<Json<ApiResponse<UploadResponse>>, AppError> {
    let upload =
        parse_upscale_multipart(multipart, state.config.server.max_upload_size, lang).await?;
    if !subject.is_account() {
        let allowed = state
            .rate_limits
            .hit(
                &format!("upscale:ip:{}", meta.ip),
                86_400,
                state.config.limits.upscale_anonymous_per_ip_per_day as i64,
            )
            .await?;
        if !allowed {
            return Err(AppError::rate_limited(Msg::AnonymousDailyQuotaUsed, lang));
        }
    }
    let task = state
        .upscale
        .submit(&subject, upload.data, &upload.filename, upload.scale, lang)
        .await?;
    Ok(Json(ApiResponse::success(UploadResponse {
        task_id: task.id.to_string(),
    })))
}

#[utoipa::path(
    get,
    path = "/v1/images/compress/{task_id}",
    tag = "图片压缩",
    params(
        ("task_id" = String, Path, description = "任务 ID"),
        StatusQuery,
    ),
    responses(
        (status = 200, description = "任务状态；带 wait 时最多等待该秒数直到终态", body = ApiResponse<TaskStatusView>),
        (status = 404, description = "任务不存在", body = ApiResponseError),
    ),
    security(("api_key" = []))
)]
pub async fn get_task_status(
    State(state): State<Arc<AppState>>,
    Extension(lang): Extension<Lang>,
    Path(task_id): Path<String>,
    Query(query): Query<StatusQuery>,
) -> Result<Json<ApiResponse<TaskStatusView>>, AppError> {
    let task_id =
        Uuid::parse_str(&task_id).map_err(|_| AppError::not_found(Msg::TaskNotFound, lang))?;
    let wait = query
        .wait
        .unwrap_or(0)
        .min(state.config.limits.status_wait_max_secs);
    let view = state
        .compression
        .status(task_id, Duration::from_secs(wait), lang)
        .await?;
    Ok(Json(ApiResponse::success(view)))
}

fn multipart_error(
    err: axum::extract::multipart::MultipartError,
    max_size: u64,
    lang: Lang,
) -> AppError {
    if err.status() == axum::http::StatusCode::PAYLOAD_TOO_LARGE {
        AppError::file_too_large(0, max_size, lang)
    } else {
        AppError::validation(
            Msg::ParseFormFailed {
                detail: err.to_string(),
            },
            lang,
        )
    }
}

pub struct UploadRequest {
    pub data: Bytes,
    pub filename: String,
    pub conversion: Option<ConversionRequest>,
}

pub struct UpscaleRequest {
    pub data: Bytes,
    pub filename: String,
    pub scale: UpscaleScale,
}

async fn parse_upscale_multipart(
    mut multipart: Multipart,
    max_size: u64,
    lang: Lang,
) -> Result<UpscaleRequest, AppError> {
    let mut file_data: Option<Bytes> = None;
    let mut filename: Option<String> = None;
    let mut scale: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| multipart_error(e, max_size, lang))?
    {
        match field.name() {
            Some("file") => {
                filename = field.file_name().map(|s| s.to_string());
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| multipart_error(e, max_size, lang))?;
                file_data = Some(data);
            }
            Some("scale") => {
                scale = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| multipart_error(e, max_size, lang))?,
                );
            }
            Some("convert") | Some("background") => {
                return Err(AppError::validation(Msg::UpscaleConvertUnsupported, lang));
            }
            _ => {}
        }
    }

    let data = file_data.ok_or_else(|| AppError::validation(Msg::FileEmpty, lang))?;
    let scale = UpscaleScale::parse(scale.as_deref().unwrap_or(""))
        .ok_or_else(|| AppError::validation(Msg::UpscaleScaleInvalid, lang))?;
    Ok(UpscaleRequest {
        data,
        filename: filename.unwrap_or_else(|| "image".to_string()),
        scale,
    })
}

pub fn parse_conversion(
    convert: Option<&str>,
    background: Option<&str>,
    lang: Lang,
) -> Result<Option<ConversionRequest>, AppError> {
    let Some(raw_target) = convert.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let target = OutputFormat::parse(raw_target)
        .ok_or_else(|| AppError::validation(Msg::ConvertTargetInvalid, lang))?;
    let background = match background.map(str::trim).filter(|value| !value.is_empty()) {
        None => None,
        Some(raw) => Some(
            Background::parse(raw)
                .ok_or_else(|| AppError::validation(Msg::BackgroundInvalid, lang))?,
        ),
    };
    Ok(Some(ConversionRequest { target, background }))
}

async fn parse_multipart(
    mut multipart: Multipart,
    max_size: u64,
    lang: Lang,
) -> Result<UploadRequest, AppError> {
    let mut file_data: Option<Bytes> = None;
    let mut filename: Option<String> = None;
    let mut convert: Option<String> = None;
    let mut background: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| multipart_error(e, max_size, lang))?
    {
        match field.name() {
            Some("file") => {
                filename = field.file_name().map(|s| s.to_string());
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| multipart_error(e, max_size, lang))?;
                file_data = Some(data);
            }
            Some("convert") => {
                convert = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| multipart_error(e, max_size, lang))?,
                );
            }
            Some("background") => {
                background = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| multipart_error(e, max_size, lang))?,
                );
            }
            _ => {}
        }
    }

    let data = file_data.ok_or_else(|| AppError::validation(Msg::FileEmpty, lang))?;
    let conversion = parse_conversion(convert.as_deref(), background.as_deref(), lang)?;
    Ok(UploadRequest {
        data,
        filename: filename.unwrap_or_else(|| "image".to_string()),
        conversion,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversion_fields_are_validated() {
        assert!(parse_conversion(None, Some("#ffffff"), Lang::Zh)
            .unwrap()
            .is_none());
        assert!(parse_conversion(Some("  "), None, Lang::Zh)
            .unwrap()
            .is_none());
        let webp = parse_conversion(Some("WebP"), None, Lang::Zh)
            .unwrap()
            .unwrap();
        assert_eq!(webp.target, OutputFormat::WebP);
        assert_eq!(webp.background, None);
        let jpeg = parse_conversion(Some("image/jpeg"), Some("#FFCC00"), Lang::Zh)
            .unwrap()
            .unwrap();
        assert_eq!(jpeg.target, OutputFormat::Jpeg);
        assert_eq!(
            jpeg.background.map(|b| b.to_hex()),
            Some("#ffcc00".to_string())
        );
        assert!(matches!(
            parse_conversion(Some("gif"), None, Lang::Zh),
            Err(AppError::Validation { .. })
        ));
        assert!(matches!(
            parse_conversion(Some("png"), Some("white"), Lang::Zh),
            Err(AppError::Validation { .. })
        ));
    }

    #[test]
    fn conversion_messages_follow_language() {
        let zh = parse_conversion(Some("gif"), None, Lang::Zh)
            .unwrap_err()
            .message();
        assert_eq!(zh, "convert 只支持 png、jpeg、webp、avif");
        let en = parse_conversion(Some("gif"), None, Lang::En)
            .unwrap_err()
            .message();
        assert_eq!(en, "convert only supports png, jpeg, webp and avif");
        let en_background = parse_conversion(Some("jpeg"), Some("white"), Lang::En)
            .unwrap_err()
            .message();
        assert_eq!(en_background, "background must be a color like #RRGGBB");
    }
}
