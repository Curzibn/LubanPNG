use crate::domain::subject::Plan;
use crate::error::AppResult;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AccountRow {
    pub id: Uuid,
    pub email: String,
    pub plan_id: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OtpRow {
    pub id: i64,
    pub email: String,
    pub code_hash: String,
    pub attempts: i32,
    pub expires_at: DateTime<Utc>,
    pub consumed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ApiKeyRow {
    pub id: Uuid,
    pub account_id: Uuid,
    pub name: String,
    pub prefix: String,
    pub suffix: String,
    pub key_hash: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
}

pub struct IdentityRepository {
    pool: PgPool,
}

impl IdentityRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn plan(&self, id: &str) -> AppResult<Option<Plan>> {
        let plan = sqlx::query_as::<_, Plan>("SELECT * FROM plans WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(plan)
    }

    pub async fn touch_device(&self, id: Uuid) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO devices (id) VALUES ($1)
             ON CONFLICT (id) DO UPDATE SET last_seen_at = now()",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn find_or_create_account(&self, email: &str) -> AppResult<(AccountRow, bool)> {
        if let Some(existing) =
            sqlx::query_as::<_, AccountRow>("SELECT * FROM accounts WHERE email = $1")
                .bind(email)
                .fetch_optional(&self.pool)
                .await?
        {
            return Ok((existing, false));
        }
        let created = sqlx::query_as::<_, AccountRow>(
            "INSERT INTO accounts (id, email, plan_id) VALUES ($1, $2, 'free')
             ON CONFLICT (email) DO UPDATE SET status = accounts.status
             RETURNING *",
        )
        .bind(Uuid::new_v4())
        .bind(email)
        .fetch_one(&self.pool)
        .await?;
        Ok((created, true))
    }

    pub async fn account(&self, id: Uuid) -> AppResult<Option<AccountRow>> {
        let account = sqlx::query_as::<_, AccountRow>("SELECT * FROM accounts WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(account)
    }

    pub async fn create_otp(
        &self,
        email: &str,
        code_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> AppResult<()> {
        sqlx::query("INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)")
            .bind(email)
            .bind(code_hash)
            .bind(expires_at)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn latest_otp(&self, email: &str) -> AppResult<Option<OtpRow>> {
        let row = sqlx::query_as::<_, OtpRow>(
            "SELECT * FROM otp_codes WHERE email = $1 AND consumed_at IS NULL
             ORDER BY created_at DESC LIMIT 1",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn record_otp_attempt(&self, id: i64) -> AppResult<i32> {
        let attempts: i32 = sqlx::query_scalar(
            "UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        Ok(attempts)
    }

    pub async fn consume_otp(&self, id: i64) -> AppResult<()> {
        sqlx::query("UPDATE otp_codes SET consumed_at = now() WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn create_session(
        &self,
        token_hash: &str,
        account_id: Uuid,
        ttl_secs: i64,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO sessions (token_hash, account_id, expires_at)
             VALUES ($1, $2, now() + make_interval(secs => $3))",
        )
        .bind(token_hash)
        .bind(account_id)
        .bind(ttl_secs as f64)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn account_by_session(
        &self,
        token_hash: &str,
        ttl_secs: i64,
    ) -> AppResult<Option<AccountRow>> {
        let account = sqlx::query_as::<_, AccountRow>(
            "UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(secs => $2)
             FROM accounts
             WHERE sessions.token_hash = $1 AND sessions.expires_at > now() AND accounts.id = sessions.account_id
             RETURNING accounts.id, accounts.email, accounts.plan_id, accounts.status, accounts.created_at",
        )
        .bind(token_hash)
        .bind(ttl_secs as f64)
        .fetch_optional(&self.pool)
        .await?;
        Ok(account)
    }

    pub async fn delete_session(&self, token_hash: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(token_hash)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn create_api_key(
        &self,
        account_id: Uuid,
        name: &str,
        prefix: &str,
        suffix: &str,
        key_hash: &str,
    ) -> AppResult<ApiKeyRow> {
        let row = sqlx::query_as::<_, ApiKeyRow>(
            "INSERT INTO api_keys (id, account_id, name, prefix, suffix, key_hash)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *",
        )
        .bind(Uuid::new_v4())
        .bind(account_id)
        .bind(name)
        .bind(prefix)
        .bind(suffix)
        .bind(key_hash)
        .fetch_one(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn active_api_keys(&self, account_id: Uuid) -> AppResult<Vec<ApiKeyRow>> {
        let rows = sqlx::query_as::<_, ApiKeyRow>(
            "SELECT * FROM api_keys WHERE account_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC",
        )
        .bind(account_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn revoke_api_key(&self, account_id: Uuid, id: Uuid) -> AppResult<bool> {
        let result = sqlx::query(
            "UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL",
        )
        .bind(id)
        .bind(account_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn account_by_api_key(&self, key_hash: &str) -> AppResult<Option<AccountRow>> {
        let account = sqlx::query_as::<_, AccountRow>(
            "UPDATE api_keys SET last_used_at = now()
             FROM accounts
             WHERE api_keys.key_hash = $1 AND api_keys.revoked_at IS NULL AND accounts.id = api_keys.account_id
             RETURNING accounts.id, accounts.email, accounts.plan_id, accounts.status, accounts.created_at",
        )
        .bind(key_hash)
        .fetch_optional(&self.pool)
        .await?;
        Ok(account)
    }
}
