use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressTask {
    pub id: String,
    pub status: TaskStatus,
    pub progress: u8,
    pub original_size: u64,
    pub compressed_size: Option<u64>,
    pub original_path: String,
    pub original_filename: Option<String>,
    pub compressed_path: Option<String>,
    pub error_msg: Option<String>,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub queue_position: Option<usize>,
}

impl CompressTask {
    pub fn new(original_path: String, original_size: u64) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            status: TaskStatus::Pending,
            progress: 0,
            original_size,
            compressed_size: None,
            original_path,
            original_filename: None,
            compressed_path: None,
            error_msg: None,
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            completed_at: None,
            queue_position: None,
        }
    }

    pub fn mark_processing(&mut self) {
        self.status = TaskStatus::Processing;
        self.progress = 10;
    }

    pub fn update_progress(&mut self, progress: u8) {
        self.progress = progress.min(100);
    }

    pub fn mark_completed(&mut self, compressed_size: u64, compressed_path: String) {
        self.status = TaskStatus::Completed;
        self.progress = 100;
        self.compressed_size = Some(compressed_size);
        self.compressed_path = Some(compressed_path);
        self.completed_at = Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        );
    }

    pub fn mark_failed(&mut self, error_msg: String) {
        self.status = TaskStatus::Failed;
        self.error_msg = Some(error_msg);
        self.completed_at = Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        );
    }
}
