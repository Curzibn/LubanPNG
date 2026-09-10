use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubjectKind {
    Account,
    Device,
}

impl SubjectKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SubjectKind::Account => "account",
            SubjectKind::Device => "device",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Web,
    Api,
    Cli,
}

impl Source {
    pub fn as_str(&self) -> &'static str {
        match self {
            Source::Web => "web",
            Source::Api => "api",
            Source::Cli => "cli",
        }
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Plan {
    pub id: String,
    pub name: String,
    pub period: String,
    pub quota: i32,
    pub max_file_size: i64,
    pub retention_hours: i32,
    pub max_api_keys: i32,
}

impl Plan {
    pub fn output_prefix(&self) -> &'static str {
        if self.retention_hours > 24 {
            "outputs/pro"
        } else {
            "outputs/free"
        }
    }
}

#[derive(Debug, Clone)]
pub struct Subject {
    pub kind: SubjectKind,
    pub id: Uuid,
    pub email: Option<String>,
    pub plan: Plan,
    pub source: Source,
}

impl Subject {
    pub fn is_account(&self) -> bool {
        self.kind == SubjectKind::Account
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct QuotaSnapshot {
    pub period_key: String,
    pub limit: i32,
    pub used: i32,
    pub held: i32,
    pub remaining: i32,
    pub resets_at: DateTime<Utc>,
}
