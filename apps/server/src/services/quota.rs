use crate::domain::subject::{QuotaSnapshot, Subject};
use crate::error::{AppError, AppResult};
use crate::repositories::quota_repository::{BalanceRow, QuotaRepository};
use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc};
use chrono_tz::Asia::Shanghai;
use uuid::Uuid;

pub fn period_for(plan_period: &str, now: DateTime<Utc>) -> (String, DateTime<Utc>) {
    let today = now.with_timezone(&Shanghai).date_naive();
    let (key, next_start) = if plan_period == "day" {
        (today.format("%Y-%m-%d").to_string(), today.succ_opt())
    } else {
        let first_of_next = if today.month() == 12 {
            NaiveDate::from_ymd_opt(today.year() + 1, 1, 1)
        } else {
            NaiveDate::from_ymd_opt(today.year(), today.month() + 1, 1)
        };
        (today.format("%Y-%m").to_string(), first_of_next)
    };
    let resets_at = next_start
        .and_then(|date| date.and_hms_opt(0, 0, 0))
        .and_then(|naive| Shanghai.from_local_datetime(&naive).single())
        .map(|local| local.with_timezone(&Utc))
        .unwrap_or(now + chrono::Duration::days(1));
    (key, resets_at)
}

pub struct QuotaService {
    repo: QuotaRepository,
}

impl QuotaService {
    pub fn new(repo: QuotaRepository) -> Self {
        Self { repo }
    }

    fn snapshot_from(
        &self,
        period_key: String,
        resets_at: DateTime<Utc>,
        row: BalanceRow,
    ) -> QuotaSnapshot {
        QuotaSnapshot {
            period_key,
            limit: row.granted + row.purchased,
            used: row.used,
            held: row.held,
            remaining: row.remaining(),
            resets_at,
        }
    }

    pub async fn snapshot(&self, subject: &Subject) -> AppResult<QuotaSnapshot> {
        let (period_key, resets_at) = period_for(&subject.plan.period, Utc::now());
        let row = self
            .repo
            .ensure_period(
                subject.kind.as_str(),
                subject.id,
                &period_key,
                subject.plan.quota,
            )
            .await?;
        Ok(self.snapshot_from(period_key, resets_at, row))
    }

    pub async fn reserve(&self, subject: &Subject, task_id: Uuid) -> AppResult<QuotaSnapshot> {
        let (period_key, resets_at) = period_for(&subject.plan.period, Utc::now());
        self.repo
            .ensure_period(
                subject.kind.as_str(),
                subject.id,
                &period_key,
                subject.plan.quota,
            )
            .await?;
        match self
            .repo
            .reserve(subject.kind.as_str(), subject.id, &period_key, task_id)
            .await?
        {
            Some(row) => Ok(self.snapshot_from(period_key, resets_at, row)),
            None => Err(AppError::QuotaExceeded { resets_at }),
        }
    }

    pub async fn settle(
        &self,
        subject_type: &str,
        subject_id: Uuid,
        period_key: &str,
        task_id: Uuid,
    ) -> AppResult<()> {
        self.repo
            .settle(subject_type, subject_id, period_key, task_id)
            .await
    }

    pub async fn refund(
        &self,
        subject_type: &str,
        subject_id: Uuid,
        period_key: &str,
        task_id: Uuid,
    ) -> AppResult<()> {
        self.repo
            .refund(subject_type, subject_id, period_key, task_id)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::period_for;
    use chrono::{TimeZone, Utc};

    #[test]
    fn day_period_resets_at_next_midnight_shanghai() {
        let now = Utc.with_ymd_and_hms(2026, 9, 10, 15, 30, 0).unwrap();
        let (key, resets_at) = period_for("day", now);
        assert_eq!(key, "2026-09-10");
        assert_eq!(
            resets_at,
            Utc.with_ymd_and_hms(2026, 9, 10, 16, 0, 0).unwrap()
        );
    }

    #[test]
    fn day_period_key_follows_shanghai_date_after_utc_midnight_gap() {
        let now = Utc.with_ymd_and_hms(2026, 9, 10, 17, 0, 0).unwrap();
        let (key, resets_at) = period_for("day", now);
        assert_eq!(key, "2026-09-11");
        assert_eq!(
            resets_at,
            Utc.with_ymd_and_hms(2026, 9, 11, 16, 0, 0).unwrap()
        );
    }

    #[test]
    fn month_period_resets_on_first_of_next_month() {
        let now = Utc.with_ymd_and_hms(2026, 12, 20, 0, 0, 0).unwrap();
        let (key, resets_at) = period_for("month", now);
        assert_eq!(key, "2026-12");
        assert_eq!(
            resets_at,
            Utc.with_ymd_and_hms(2026, 12, 31, 16, 0, 0).unwrap()
        );
    }
}
