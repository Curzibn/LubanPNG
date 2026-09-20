DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM quota_ledger
        WHERE task_id IS NOT NULL
        GROUP BY task_id, kind
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'quota_ledger contains duplicate (task_id, kind) rows; resolve them before enforcing uniqueness';
    END IF;
END
$$;

CREATE UNIQUE INDEX quota_ledger_task_kind_unique
    ON quota_ledger (task_id, kind)
    WHERE task_id IS NOT NULL;
