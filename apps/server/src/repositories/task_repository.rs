use crate::domain::task::TaskRecord;
use crate::error::AppResult;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct NewTask {
    pub id: Uuid,
    pub subject_type: String,
    pub subject_id: Uuid,
    pub source: String,
    pub original_name: String,
    pub original_size: i64,
    pub input_key: String,
    pub quota_period: String,
    pub quota_units: i16,
    pub target_format: Option<String>,
    pub background: Option<String>,
}

pub struct TaskRepository {
    pool: PgPool,
}

impl TaskRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, task: NewTask) -> AppResult<TaskRecord> {
        let record = sqlx::query_as::<_, TaskRecord>(
            "INSERT INTO tasks (id, subject_type, subject_id, source, status, original_name, original_size, input_key, quota_period, quota_units, target_format, background)
             VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11)
             RETURNING *",
        )
        .bind(task.id)
        .bind(&task.subject_type)
        .bind(task.subject_id)
        .bind(&task.source)
        .bind(&task.original_name)
        .bind(task.original_size)
        .bind(&task.input_key)
        .bind(&task.quota_period)
        .bind(task.quota_units)
        .bind(&task.target_format)
        .bind(&task.background)
        .fetch_one(&self.pool)
        .await?;
        Ok(record)
    }

    pub async fn get(&self, id: Uuid) -> AppResult<Option<TaskRecord>> {
        let record = sqlx::query_as::<_, TaskRecord>("SELECT * FROM tasks WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(record)
    }

    pub async fn claim_next(&self, worker_id: &str) -> AppResult<Option<TaskRecord>> {
        let record = sqlx::query_as::<_, TaskRecord>(
            "UPDATE tasks
             SET status = 'processing', locked_by = $1, locked_at = now(), started_at = now(), progress = 10
             WHERE id = (
                 SELECT id FROM tasks WHERE status = 'pending'
                 ORDER BY created_at
                 LIMIT 1
                 FOR UPDATE SKIP LOCKED
             )
             RETURNING *",
        )
        .bind(worker_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(record)
    }

    pub async fn set_progress(&self, id: Uuid, progress: i16) -> AppResult<()> {
        sqlx::query("UPDATE tasks SET progress = $2 WHERE id = $1")
            .bind(id)
            .bind(progress)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn complete(
        &self,
        id: Uuid,
        compressed_size: i64,
        output_key: &str,
        expires_at: DateTime<Utc>,
    ) -> AppResult<()> {
        sqlx::query(
            "UPDATE tasks
             SET status = 'completed', progress = 100, compressed_size = $2, output_key = $3,
                 completed_at = now(), expires_at = $4, locked_by = NULL, locked_at = NULL
             WHERE id = $1",
        )
        .bind(id)
        .bind(compressed_size)
        .bind(output_key)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn fail(&self, id: Uuid, error_msg: &str) -> AppResult<()> {
        sqlx::query(
            "UPDATE tasks
             SET status = 'failed', error_msg = $2, completed_at = now(), locked_by = NULL, locked_at = NULL
             WHERE id = $1",
        )
        .bind(id)
        .bind(error_msg)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn requeue_stale(&self, cutoff: DateTime<Utc>) -> AppResult<u64> {
        let result = sqlx::query(
            "UPDATE tasks
             SET status = 'pending', locked_by = NULL, locked_at = NULL, progress = 0
             WHERE status = 'processing' AND locked_at < $1",
        )
        .bind(cutoff)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn list_for_subject(
        &self,
        subject_type: &str,
        subject_id: Uuid,
        limit: i64,
    ) -> AppResult<Vec<TaskRecord>> {
        let records = sqlx::query_as::<_, TaskRecord>(
            "SELECT * FROM tasks WHERE subject_type = $1 AND subject_id = $2
             ORDER BY created_at DESC LIMIT $3",
        )
        .bind(subject_type)
        .bind(subject_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(records)
    }

    pub async fn queue_position(&self, task: &TaskRecord) -> AppResult<i64> {
        let ahead: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM tasks WHERE status = 'pending' AND created_at < $1",
        )
        .bind(task.created_at)
        .fetch_one(&self.pool)
        .await?;
        Ok(ahead + 1)
    }
}
