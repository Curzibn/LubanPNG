DROP VIEW IF EXISTS analytics.cohort_retention;
DROP VIEW IF EXISTS analytics.traffic_channels;
DROP VIEW IF EXISTS analytics.daily_source_tasks;
DROP VIEW IF EXISTS analytics.daily_funnel;
DROP VIEW IF EXISTS analytics.identity_tasks;
DROP VIEW IF EXISTS analytics.identity_visits;
DROP VIEW IF EXISTS analytics.visitor_keys;

CREATE VIEW analytics.visitor_keys AS
WITH device_registration AS (
    SELECT DISTINCT ON (accounts.signup_device_id)
        accounts.signup_device_id AS device_id,
        accounts.id AS account_id
    FROM accounts
    WHERE accounts.signup_device_id IS NOT NULL
    ORDER BY accounts.signup_device_id, accounts.created_at, accounts.id
)
SELECT
    'device'::text AS subject_type,
    device_registration.device_id AS subject_id,
    device_registration.account_id AS visitor_id
FROM device_registration
UNION ALL
SELECT 'device', seen.subject_id, seen.subject_id
FROM (
    SELECT subject_id FROM visits WHERE subject_type = 'device'
    UNION
    SELECT subject_id FROM tasks WHERE subject_type = 'device' AND kind = 'compress'
) AS seen
WHERE NOT EXISTS (
    SELECT 1 FROM device_registration WHERE device_registration.device_id = seen.subject_id
)
UNION ALL
SELECT 'account', accounts.id, accounts.id
FROM accounts;

CREATE VIEW analytics.identity_visits AS
SELECT
    date(visits.occurred_at AT TIME ZONE 'Asia/Shanghai') AS day,
    COALESCE(keys.visitor_id, visits.subject_id) AS visitor_id,
    visits.subject_type,
    visits.subject_id,
    visits.path
FROM visits
LEFT JOIN analytics.visitor_keys AS keys
    ON keys.subject_type = visits.subject_type AND keys.subject_id = visits.subject_id;

CREATE VIEW analytics.identity_tasks AS
SELECT
    date(tasks.created_at AT TIME ZONE 'Asia/Shanghai') AS day,
    COALESCE(keys.visitor_id, tasks.subject_id) AS visitor_id,
    tasks.subject_type,
    tasks.subject_id,
    tasks.source,
    tasks.status,
    tasks.original_size,
    tasks.compressed_size
FROM tasks
LEFT JOIN analytics.visitor_keys AS keys
    ON keys.subject_type = tasks.subject_type AND keys.subject_id = tasks.subject_id
WHERE tasks.kind = 'compress';

CREATE VIEW analytics.daily_funnel AS
WITH days AS (
    SELECT day FROM analytics.identity_visits
    UNION
    SELECT day FROM analytics.identity_tasks
    UNION
    SELECT date(created_at AT TIME ZONE 'Asia/Shanghai') FROM accounts
),
visitors_by_day AS (
    SELECT day, count(DISTINCT visitor_id) AS visitors
    FROM analytics.identity_visits
    GROUP BY day
),
uploaders_by_day AS (
    SELECT day, count(DISTINCT visitor_id) AS uploaders
    FROM analytics.identity_tasks
    GROUP BY day
),
attributed_uploaders_by_day AS (
    SELECT tasks.day, count(DISTINCT tasks.visitor_id) AS attributed_uploaders
    FROM analytics.identity_tasks AS tasks
    WHERE EXISTS (
        SELECT 1 FROM analytics.identity_visits AS visits
        WHERE visits.visitor_id = tasks.visitor_id
          AND visits.day <= tasks.day
    )
    GROUP BY tasks.day
),
counted_by_day AS (
    SELECT day, count(*) AS counted
    FROM analytics.identity_tasks
    WHERE status = 'completed' AND compressed_size < original_size
    GROUP BY day
),
registrations_by_day AS (
    SELECT date(created_at AT TIME ZONE 'Asia/Shanghai') AS day, count(*) AS registrations
    FROM accounts
    GROUP BY day
)
SELECT
    days.day,
    COALESCE(visitors_by_day.visitors, 0) AS visitors,
    COALESCE(uploaders_by_day.uploaders, 0) AS uploaders,
    COALESCE(attributed_uploaders_by_day.attributed_uploaders, 0) AS attributed_uploaders,
    COALESCE(counted_by_day.counted, 0) AS counted,
    COALESCE(registrations_by_day.registrations, 0) AS registrations
FROM days
LEFT JOIN visitors_by_day ON visitors_by_day.day = days.day
LEFT JOIN uploaders_by_day ON uploaders_by_day.day = days.day
LEFT JOIN attributed_uploaders_by_day ON attributed_uploaders_by_day.day = days.day
LEFT JOIN counted_by_day ON counted_by_day.day = days.day
LEFT JOIN registrations_by_day ON registrations_by_day.day = days.day
ORDER BY 1;

CREATE VIEW analytics.daily_source_tasks AS
SELECT
    day,
    source,
    count(*) AS created,
    count(DISTINCT visitor_id) AS uids,
    count(*) FILTER (WHERE status = 'completed' AND compressed_size IS NOT NULL) AS completed,
    count(*) FILTER (WHERE status = 'completed' AND compressed_size < original_size) AS counted,
    count(*) FILTER (WHERE status = 'failed') AS failed
FROM analytics.identity_tasks
GROUP BY day, source
ORDER BY day, source;

CREATE VIEW analytics.traffic_channels AS
WITH touches AS (
    SELECT
        COALESCE(keys.visitor_id, visits.subject_id) AS visitor_id,
        visits.id AS touch_id,
        visits.occurred_at,
        date(visits.occurred_at AT TIME ZONE 'Asia/Shanghai') AS day,
        CASE
            WHEN visits.utm_source IS NOT NULL THEN 'utm:' || visits.utm_source
            WHEN visits.referrer_host IS NOT NULL AND visits.referrer_host <> ''
                THEN 'referrer:' || visits.referrer_host
            ELSE 'direct'
        END AS touch_channel
    FROM visits
    LEFT JOIN analytics.visitor_keys AS keys
        ON keys.subject_type = visits.subject_type AND keys.subject_id = visits.subject_id
),
first_touch AS (
    SELECT DISTINCT ON (visitor_id)
        visitor_id,
        day AS first_day,
        touch_channel
    FROM touches
    ORDER BY visitor_id, occurred_at, touch_id
),
web_activity AS (
    SELECT visitor_id, status, original_size, compressed_size
    FROM analytics.identity_tasks
    WHERE source = 'web'
)
SELECT
    first_touch.first_day,
    first_touch.touch_channel AS channel,
    count(DISTINCT first_touch.visitor_id) AS visitors,
    count(DISTINCT web_activity.visitor_id) AS uploaders,
    count(web_activity.visitor_id) FILTER (
        WHERE web_activity.status = 'completed' AND web_activity.compressed_size < web_activity.original_size
    ) AS counted,
    count(DISTINCT accounts.id) AS registrations
FROM first_touch
LEFT JOIN web_activity ON web_activity.visitor_id = first_touch.visitor_id
LEFT JOIN accounts ON accounts.id = first_touch.visitor_id
GROUP BY first_touch.first_day, first_touch.touch_channel
ORDER BY first_touch.first_day, uploaders DESC, visitors DESC, channel;

CREATE VIEW analytics.cohort_retention AS
WITH cohorts AS (
    SELECT id AS account_id, date(created_at AT TIME ZONE 'Asia/Shanghai') AS cohort_day
    FROM accounts
),
activity AS (
    SELECT visitor_id AS account_id, day
    FROM analytics.identity_visits
    UNION
    SELECT visitor_id AS account_id, day
    FROM analytics.identity_tasks
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
