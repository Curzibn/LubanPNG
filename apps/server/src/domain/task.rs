use crate::domain::compression::{Background, ConversionRequest, OutputFormat};
use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Pending => "pending",
            TaskStatus::Processing => "processing",
            TaskStatus::Completed => "completed",
            TaskStatus::Failed => "failed",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(TaskStatus::Pending),
            "processing" => Some(TaskStatus::Processing),
            "completed" => Some(TaskStatus::Completed),
            "failed" => Some(TaskStatus::Failed),
            _ => None,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, TaskStatus::Completed | TaskStatus::Failed)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskKind {
    Compress,
    Upscale,
}

impl TaskKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskKind::Compress => "compress",
            TaskKind::Upscale => "upscale",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "compress" => Some(TaskKind::Compress),
            "upscale" => Some(TaskKind::Upscale),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpscaleScale {
    X2,
    X4,
}

impl UpscaleScale {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "x2" => Some(UpscaleScale::X2),
            "x4" => Some(UpscaleScale::X4),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            UpscaleScale::X2 => "x2",
            UpscaleScale::X4 => "x4",
        }
    }

    pub fn factor(&self) -> u32 {
        match self {
            UpscaleScale::X2 => 2,
            UpscaleScale::X4 => 4,
        }
    }

    pub fn from_stored(value: i16) -> Option<Self> {
        match value {
            2 => Some(UpscaleScale::X2),
            4 => Some(UpscaleScale::X4),
            _ => None,
        }
    }

    pub fn stored(&self) -> i16 {
        match self {
            UpscaleScale::X2 => 2,
            UpscaleScale::X4 => 4,
        }
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TaskRecord {
    pub id: Uuid,
    pub subject_type: String,
    pub subject_id: Uuid,
    pub source: String,
    pub status: String,
    pub progress: i16,
    pub original_name: String,
    pub original_size: i64,
    pub compressed_size: Option<i64>,
    pub input_key: String,
    pub output_key: Option<String>,
    pub error_msg: Option<String>,
    pub quota_period: String,
    pub quota_units: i16,
    pub kind: String,
    pub upscale_scale: Option<i16>,
    pub target_format: Option<String>,
    pub background: Option<String>,
    pub lang: String,
    pub locked_by: Option<String>,
    pub locked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
}

impl TaskRecord {
    pub fn status(&self) -> TaskStatus {
        TaskStatus::parse(&self.status).unwrap_or(TaskStatus::Failed)
    }

    pub fn kind(&self) -> TaskKind {
        TaskKind::parse(&self.kind).unwrap_or(TaskKind::Compress)
    }

    pub fn scale(&self) -> Option<UpscaleScale> {
        self.upscale_scale.and_then(UpscaleScale::from_stored)
    }

    pub fn is_terminal(&self) -> bool {
        self.status().is_terminal()
    }

    pub fn downloadable(&self, now: DateTime<Utc>) -> bool {
        self.status() == TaskStatus::Completed
            && self.output_key.is_some()
            && self.expires_at.map(|at| at > now).unwrap_or(false)
    }

    pub fn quota_units(&self) -> i32 {
        i32::from(self.quota_units.max(1))
    }

    pub fn conversion(&self) -> Option<ConversionRequest> {
        let target = OutputFormat::parse(self.target_format.as_deref()?)?;
        let background = self.background.as_deref().and_then(Background::parse);
        Some(ConversionRequest { target, background })
    }

    pub fn no_gain(&self) -> bool {
        match self.kind() {
            TaskKind::Upscale => self.status() == TaskStatus::Failed,
            TaskKind::Compress => match self.status() {
                TaskStatus::Failed => true,
                TaskStatus::Completed => self
                    .compressed_size
                    .is_some_and(|size| size >= self.original_size),
                TaskStatus::Pending | TaskStatus::Processing => false,
            },
        }
    }

    pub fn billed_units(&self) -> i32 {
        if self.no_gain() {
            0
        } else {
            self.quota_units()
        }
    }

    pub fn output_format(&self) -> Option<&'static str> {
        let key = self.output_key.as_ref()?;
        match key.rsplit_once('.')?.1 {
            "png" => Some("png"),
            "jpg" | "jpeg" => Some("jpeg"),
            "gif" => Some("gif"),
            "webp" => Some("webp"),
            "avif" => Some("avif"),
            _ => None,
        }
    }

    pub fn download_filename(&self) -> Option<String> {
        let key = self.output_key.as_ref()?;
        let extension = key.rsplit_once('.').map(|(_, ext)| ext)?;
        Some(format!("{}.{}", self.id, extension))
    }

    pub fn download_path(&self) -> Option<String> {
        self.download_filename()
            .map(|name| format!("/v1/images/download/{}", name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(
        status: &str,
        original_size: i64,
        compressed_size: Option<i64>,
        units: i16,
    ) -> TaskRecord {
        TaskRecord {
            id: Uuid::nil(),
            subject_type: "device".to_string(),
            subject_id: Uuid::nil(),
            source: "web".to_string(),
            status: status.to_string(),
            progress: 0,
            original_name: "image.png".to_string(),
            original_size,
            compressed_size,
            input_key: "uploads/x.png".to_string(),
            output_key: compressed_size.map(|_| "outputs/free/x.png".to_string()),
            error_msg: None,
            quota_period: "2026-09-20".to_string(),
            quota_units: units,
            kind: TaskKind::Compress.as_str().to_string(),
            upscale_scale: None,
            target_format: None,
            background: None,
            lang: "zh".to_string(),
            locked_by: None,
            locked_at: None,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            expires_at: None,
        }
    }

    fn upscale_task(
        status: &str,
        original_size: i64,
        compressed_size: Option<i64>,
        units: i16,
    ) -> TaskRecord {
        let mut record = task(status, original_size, compressed_size, units);
        record.kind = TaskKind::Upscale.as_str().to_string();
        record.upscale_scale = Some(UpscaleScale::X4.stored());
        record
    }

    #[test]
    fn non_terminal_tasks_report_the_reserved_units() {
        for status in ["pending", "processing"] {
            let record = task(status, 1024, None, 2);
            assert_eq!(record.billed_units(), 2, "{status} keeps the reservation");
            assert_eq!(record.quota_units(), 2);
            assert!(!record.no_gain(), "{status} is not settled yet");
        }
    }

    #[test]
    fn no_gain_matches_never_counted() {
        let completed_gain = task("completed", 1024, Some(512), 2);
        assert!(!completed_gain.no_gain());
        assert_eq!(completed_gain.billed_units(), 2);

        let completed_equal = task("completed", 1024, Some(1024), 1);
        assert!(completed_equal.no_gain());
        assert_eq!(completed_equal.billed_units(), 0);

        let completed_grown = task("completed", 1024, Some(2048), 2);
        assert!(completed_grown.no_gain());
        assert_eq!(completed_grown.billed_units(), 0);

        let failed = task("failed", 1024, None, 2);
        assert!(failed.no_gain());
        assert_eq!(failed.billed_units(), 0);
    }

    #[test]
    fn upscale_billing_ignores_size_comparison() {
        let grown = upscale_task("completed", 1024, Some(4096), 1);
        assert!(!grown.no_gain());
        assert_eq!(grown.billed_units(), 1);

        let failed = upscale_task("failed", 1024, None, 1);
        assert!(failed.no_gain());
        assert_eq!(failed.billed_units(), 0);

        for status in ["pending", "processing"] {
            let running = upscale_task(status, 1024, None, 1);
            assert_eq!(running.billed_units(), 1, "{status} keeps the reservation");
            assert!(!running.no_gain(), "{status} is not settled yet");
        }

        let without_output = upscale_task("completed", 1024, None, 1);
        assert!(!without_output.no_gain());
        assert_eq!(without_output.billed_units(), 1);
    }

    #[test]
    fn scale_parses_external_and_stored_forms() {
        assert_eq!(UpscaleScale::parse("x2"), Some(UpscaleScale::X2));
        assert_eq!(UpscaleScale::parse(" X4 "), Some(UpscaleScale::X4));
        assert_eq!(UpscaleScale::parse("2"), None);
        assert_eq!(UpscaleScale::parse("x8"), None);
        assert_eq!(UpscaleScale::X4.factor(), 4);
        assert_eq!(UpscaleScale::X2.as_str(), "x2");
        assert_eq!(
            UpscaleScale::from_stored(UpscaleScale::X4.stored()),
            Some(UpscaleScale::X4)
        );
        assert_eq!(UpscaleScale::from_stored(3), None);
    }
}
