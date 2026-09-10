use crate::error::AppResult;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, sqlx::FromRow)]
pub struct BalanceRow {
    pub granted: i32,
    pub purchased: i32,
    pub used: i32,
    pub held: i32,
}

impl BalanceRow {
    pub fn remaining(&self) -> i32 {
        (self.granted + self.purchased - self.used - self.held).max(0)
    }
}

pub struct QuotaRepository {
    pool: PgPool,
}

impl QuotaRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn ensure_period(
        &self,
        subject_type: &str,
        subject_id: Uuid,
        period_key: &str,
        quota: i32,
    ) -> AppResult<BalanceRow> {
        let mut tx = self.pool.begin().await?;
        let inserted = sqlx::query(
            "INSERT INTO quota_balances (subject_type, subject_id, period_key, granted)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (subject_type, subject_id, period_key) DO NOTHING",
        )
        .bind(subject_type)
        .bind(subject_id)
        .bind(period_key)
        .bind(quota)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if inserted == 1 {
            sqlx::query(
                "INSERT INTO quota_ledger (subject_type, subject_id, kind, delta, period_key)
                 VALUES ($1, $2, 'grant', $3, $4)",
            )
            .bind(subject_type)
            .bind(subject_id)
            .bind(quota)
            .bind(period_key)
            .execute(&mut *tx)
            .await?;
        }
        let row = sqlx::query_as::<_, BalanceRow>(
            "SELECT granted, purchased, used, held FROM quota_balances
             WHERE subject_type = $1 AND subject_id = $2 AND period_key = $3",
        )
        .bind(subject_type)
        .bind(subject_id)
        .bind(period_key)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(row)
    }

    pub async fn reserve(
        &self,
        subject_type: &str,
        subject_id: Uuid,
        period_key: &str,
        task_id: Uuid,
        units: i32,
    ) -> AppResult<Option<BalanceRow>> {
        let units = units.max(1);
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query_as::<_, BalanceRow>(
            "UPDATE quota_balances SET held = held + $4
             WHERE subject_type = $1 AND subject_id = $2 AND period_key = $3
               AND granted + purchased - used - held >= $4
             RETURNING granted, purchased, used, held",
        )
        .bind(subject_type)
        .bind(subject_id)
        .bind(period_key)
        .bind(units)
        .fetch_optional(&mut *tx)
        .await?;
        if row.is_some() {
            sqlx::query(
                "INSERT INTO quota_ledger (subject_type, subject_id, kind, delta, period_key, task_id)
                 VALUES ($1, $2, 'reserve', $5, $3, $4)",
            )
            .bind(subject_type)
            .bind(subject_id)
            .bind(period_key)
            .bind(task_id)
            .bind(-units)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(row)
    }

    pub async fn settle(
        &self,
        subject_type: &str,
        subject_id: Uuid,
        period_key: &str,
        task_id: Uuid,
        units: i32,
    ) -> AppResult<()> {
        let units = units.max(1);
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "UPDATE quota_balances SET held = greatest(held - $4, 0), used = used + $4
             WHERE subject_type = $1 AND subject_id = $2 AND period_key = $3",
        )
        .bind(subject_type)
        .bind(subject_id)
        .bind(period_key)
        .bind(units)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO quota_ledger (subject_type, subject_id, kind, delta, period_key, task_id)
             VALUES ($1, $2, 'settle', 0, $3, $4)",
        )
        .bind(subject_type)
        .bind(subject_id)
        .bind(period_key)
        .bind(task_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn refund(
        &self,
        subject_type: &str,
        subject_id: Uuid,
        period_key: &str,
        task_id: Uuid,
        units: i32,
    ) -> AppResult<()> {
        let units = units.max(1);
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "UPDATE quota_balances SET held = greatest(held - $4, 0)
             WHERE subject_type = $1 AND subject_id = $2 AND period_key = $3",
        )
        .bind(subject_type)
        .bind(subject_id)
        .bind(period_key)
        .bind(units)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO quota_ledger (subject_type, subject_id, kind, delta, period_key, task_id)
             VALUES ($1, $2, 'refund', $5, $3, $4)",
        )
        .bind(subject_type)
        .bind(subject_id)
        .bind(period_key)
        .bind(task_id)
        .bind(units)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
}
