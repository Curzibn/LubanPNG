ALTER TABLE tasks
    ADD COLUMN kind text NOT NULL DEFAULT 'compress'
        CHECK (kind IN ('compress', 'upscale')),
    ADD COLUMN upscale_scale smallint
        CHECK (upscale_scale IN (2, 4));

CREATE INDEX tasks_upscale_pending_idx ON tasks (created_at)
    WHERE kind = 'upscale' AND status = 'pending';
