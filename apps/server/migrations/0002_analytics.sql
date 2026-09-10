CREATE TABLE visits (
    id bigserial PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    path text NOT NULL,
    referrer_host text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    user_agent text,
    ip inet
);

CREATE INDEX visits_occurred_at_idx ON visits (occurred_at);
CREATE INDEX visits_subject_idx ON visits (subject_type, subject_id, occurred_at DESC);

ALTER TABLE accounts
    ADD COLUMN signup_device_id uuid,
    ADD COLUMN signup_referrer_host text,
    ADD COLUMN signup_utm_source text,
    ADD COLUMN signup_utm_medium text,
    ADD COLUMN signup_utm_campaign text,
    ADD COLUMN signup_ip inet;

CREATE INDEX accounts_signup_device_idx ON accounts (signup_device_id);

CREATE TABLE waitlist_signups (
    id bigserial PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    plan_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, plan_id)
);

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE VIEW analytics.daily_visits AS
WITH ordered AS (
    SELECT
        subject_type,
        subject_id,
        occurred_at,
        lag(occurred_at) OVER (
            PARTITION BY subject_type, subject_id
            ORDER BY occurred_at, id
        ) AS previous_at
    FROM visits
),
sessions AS (
    SELECT subject_type, subject_id, occurred_at
    FROM ordered
    WHERE previous_at IS NULL
       OR occurred_at - previous_at > interval '30 minutes'
)
SELECT
    date(occurred_at AT TIME ZONE 'Asia/Shanghai') AS day,
    count(*) AS visits,
    count(DISTINCT subject_id) AS uids
FROM sessions
GROUP BY day;

CREATE VIEW analytics.daily_funnel AS
WITH days AS (
    SELECT day FROM analytics.daily_visits
    UNION
    SELECT date(created_at AT TIME ZONE 'Asia/Shanghai')
    FROM tasks
    WHERE source = 'web'
    UNION
    SELECT date(completed_at AT TIME ZONE 'Asia/Shanghai')
    FROM tasks
    WHERE source = 'web' AND status = 'completed' AND compressed_size IS NOT NULL
    UNION
    SELECT date(created_at AT TIME ZONE 'Asia/Shanghai')
    FROM accounts
),
visits_by_day AS (
    SELECT day, visits FROM analytics.daily_visits
),
uploads_by_day AS (
    SELECT date(created_at AT TIME ZONE 'Asia/Shanghai') AS day, count(*) AS uploads
    FROM tasks
    WHERE source = 'web'
    GROUP BY day
),
completed_by_day AS (
    SELECT date(completed_at AT TIME ZONE 'Asia/Shanghai') AS day, count(*) AS completed
    FROM tasks
    WHERE source = 'web' AND status = 'completed' AND compressed_size IS NOT NULL
    GROUP BY day
),
signups_by_day AS (
    SELECT date(created_at AT TIME ZONE 'Asia/Shanghai') AS day, count(*) AS signups
    FROM accounts
    GROUP BY day
)
SELECT
    days.day,
    COALESCE(visits_by_day.visits, 0) AS visits,
    COALESCE(uploads_by_day.uploads, 0) AS uploads,
    COALESCE(completed_by_day.completed, 0) AS completed,
    COALESCE(signups_by_day.signups, 0) AS signups
FROM days
LEFT JOIN visits_by_day ON visits_by_day.day = days.day
LEFT JOIN uploads_by_day ON uploads_by_day.day = days.day
LEFT JOIN completed_by_day ON completed_by_day.day = days.day
LEFT JOIN signups_by_day ON signups_by_day.day = days.day
ORDER BY 1;

CREATE VIEW analytics.daily_source_tasks AS
WITH created AS (
    SELECT
        date(created_at AT TIME ZONE 'Asia/Shanghai') AS day,
        source,
        count(*) AS created,
        count(DISTINCT subject_id) AS uids
    FROM tasks
    GROUP BY day, source
),
completed AS (
    SELECT
        date(completed_at AT TIME ZONE 'Asia/Shanghai') AS day,
        source,
        count(*) AS completed
    FROM tasks
    WHERE status = 'completed' AND compressed_size IS NOT NULL
    GROUP BY day, source
)
SELECT
    COALESCE(created.day, completed.day) AS day,
    COALESCE(created.source, completed.source) AS source,
    COALESCE(created.created, 0) AS created,
    COALESCE(created.uids, 0) AS uids,
    COALESCE(completed.completed, 0) AS completed
FROM created
FULL OUTER JOIN completed
    ON completed.day = created.day AND completed.source = created.source
ORDER BY 1, 2;

CREATE VIEW analytics.cohort_retention AS
WITH cohorts AS (
    SELECT id AS account_id, date(created_at AT TIME ZONE 'Asia/Shanghai') AS cohort_day
    FROM accounts
),
activity AS (
    SELECT subject_id AS account_id, date(occurred_at AT TIME ZONE 'Asia/Shanghai') AS day
    FROM visits
    WHERE subject_type = 'account'
    UNION
    SELECT subject_id AS account_id, date(created_at AT TIME ZONE 'Asia/Shanghai') AS day
    FROM tasks
    WHERE subject_type = 'account'
)
SELECT
    cohorts.cohort_day,
    count(DISTINCT cohorts.account_id) AS cohort_size,
    count(DISTINCT activity.account_id) FILTER (WHERE activity.day = cohorts.cohort_day) AS active_d0,
    count(DISTINCT activity.account_id) FILTER (WHERE activity.day = cohorts.cohort_day + 1) AS active_d1,
    count(DISTINCT activity.account_id) FILTER (WHERE activity.day = cohorts.cohort_day + 7) AS active_d7
FROM cohorts
LEFT JOIN activity ON activity.account_id = cohorts.account_id
GROUP BY cohorts.cohort_day
ORDER BY cohorts.cohort_day;

CREATE VIEW analytics.account_acquisition AS
SELECT
    accounts.id AS account_id,
    accounts.email,
    date(accounts.created_at AT TIME ZONE 'Asia/Shanghai') AS day,
    accounts.plan_id,
    accounts.signup_device_id,
    accounts.signup_referrer_host,
    accounts.signup_utm_source,
    accounts.signup_utm_medium,
    accounts.signup_utm_campaign,
    host(accounts.signup_ip) AS signup_ip
FROM accounts;
