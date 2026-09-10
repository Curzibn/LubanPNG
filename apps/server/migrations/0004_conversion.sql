ALTER TABLE tasks
    ADD COLUMN quota_units smallint NOT NULL DEFAULT 1,
    ADD COLUMN target_format text,
    ADD COLUMN background text;
