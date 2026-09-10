use crate::error::AppResult;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct WaitlistRow {
    pub id: i64,
    pub account_id: Uuid,
    pub plan_id: String,
    pub created_at: DateTime<Utc>,
}

pub struct WaitlistRepository {
    pool: PgPool,
}

impl WaitlistRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, account_id: Uuid, plan_id: &str) -> AppResult<WaitlistRow> {
        let row = sqlx::query_as::<_, WaitlistRow>(
            "INSERT INTO waitlist_signups (account_id, plan_id) VALUES ($1, $2)
             ON CONFLICT (account_id, plan_id)
             DO UPDATE SET plan_id = waitlist_signups.plan_id
             RETURNING *",
        )
        .bind(account_id)
        .bind(plan_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn count_for(&self, account_id: Uuid) -> AppResult<i64> {
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM waitlist_signups WHERE account_id = $1")
                .bind(account_id)
                .fetch_one(&self.pool)
                .await?;
        Ok(count)
    }
}
