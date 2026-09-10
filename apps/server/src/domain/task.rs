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
    pub target_format: Option<String>,
    pub background: Option<String>,
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
