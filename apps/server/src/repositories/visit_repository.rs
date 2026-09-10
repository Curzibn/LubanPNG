use crate::domain::subject::Subject;
use crate::error::AppResult;
use sqlx::PgPool;

pub struct VisitInput<'a> {
    pub path: &'a str,
    pub referrer_host: Option<&'a str>,
    pub utm_source: Option<&'a str>,
    pub utm_medium: Option<&'a str>,
    pub utm_campaign: Option<&'a str>,
}

pub struct VisitRepository {
    pool: PgPool,
}

impl VisitRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn record(
        &self,
        subject: &Subject,
        ip: Option<&str>,
        user_agent: Option<&str>,
        input: &VisitInput<'_>,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO visits
                (subject_type, subject_id, path, referrer_host, utm_source, utm_medium, utm_campaign, user_agent, ip)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::inet)",
        )
        .bind(subject.kind.as_str())
        .bind(subject.id)
        .bind(input.path)
        .bind(input.referrer_host)
        .bind(input.utm_source)
        .bind(input.utm_medium)
        .bind(input.utm_campaign)
        .bind(user_agent)
        .bind(ip)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
