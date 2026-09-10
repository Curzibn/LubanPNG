use crate::error::AppResult;
use sqlx::PgPool;

pub struct RateLimitRepository {
    pool: PgPool,
}

impl RateLimitRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn hit(&self, key: &str, window_secs: i64, max: i64) -> AppResult<bool> {
        let count: i32 = sqlx::query_scalar(
            "INSERT INTO rate_limits (key, window_start, count)
             VALUES ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
             ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
             RETURNING count",
        )
        .bind(key)
        .bind(window_secs as f64)
        .fetch_one(&self.pool)
        .await?;
        Ok(count as i64 <= max)
    }

    pub async fn cleanup(&self) -> AppResult<()> {
        sqlx::query("DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'")
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
