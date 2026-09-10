CREATE OR REPLACE VIEW analytics.daily_funnel AS
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
    WHERE signup_device_id IS NOT NULL
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
    WHERE signup_device_id IS NOT NULL
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
