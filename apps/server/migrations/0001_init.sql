CREATE TABLE plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    period text NOT NULL CHECK (period IN ('day', 'month')),
    quota integer NOT NULL,
    max_file_size bigint NOT NULL,
    retention_hours integer NOT NULL,
    max_api_keys integer NOT NULL
);

INSERT INTO plans (id, name, period, quota, max_file_size, retention_hours, max_api_keys) VALUES
    ('anonymous', '匿名访客', 'day', 5, 5242880, 24, 0),
    ('free', '免费', 'month', 50, 5242880, 24, 1);

CREATE TABLE accounts (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    plan_id text NOT NULL REFERENCES plans (id),
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
    id uuid PRIMARY KEY,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    code_hash text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX otp_codes_email_idx ON otp_codes (email, created_at DESC);

CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_account_idx ON sessions (account_id);

CREATE TABLE api_keys (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    name text NOT NULL,
    prefix text NOT NULL,
    suffix text NOT NULL,
    key_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at timestamptz
);

CREATE INDEX api_keys_account_idx ON api_keys (account_id);

CREATE TABLE quota_balances (
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    period_key text NOT NULL,
    granted integer NOT NULL,
    purchased integer NOT NULL DEFAULT 0,
    used integer NOT NULL DEFAULT 0,
    held integer NOT NULL DEFAULT 0,
    PRIMARY KEY (subject_type, subject_id, period_key)
);

CREATE TABLE quota_ledger (
    id bigserial PRIMARY KEY,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('grant', 'reserve', 'settle', 'refund', 'purchase')),
    delta integer NOT NULL,
    period_key text,
    task_id uuid,
    ref text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quota_ledger_subject_idx ON quota_ledger (subject_type, subject_id, created_at DESC);

CREATE TABLE tasks (
    id uuid PRIMARY KEY,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    source text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    progress smallint NOT NULL DEFAULT 0,
    original_name text NOT NULL,
    original_size bigint NOT NULL,
    compressed_size bigint,
    input_key text NOT NULL,
    output_key text,
    error_msg text,
    quota_period text NOT NULL,
    locked_by text,
    locked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    expires_at timestamptz
);

CREATE INDEX tasks_pending_idx ON tasks (created_at) WHERE status = 'pending';
CREATE INDEX tasks_processing_idx ON tasks (locked_at) WHERE status = 'processing';
CREATE INDEX tasks_subject_idx ON tasks (subject_type, subject_id, created_at DESC);

CREATE TABLE rate_limits (
    key text NOT NULL,
    window_start timestamptz NOT NULL,
    count integer NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
);
