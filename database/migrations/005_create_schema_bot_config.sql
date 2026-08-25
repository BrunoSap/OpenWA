-- database/migrations/005_create_schema_bot_config.sql
-- Schema for bot configuration (auto-answer policies, cron jobs)

BEGIN;

CREATE SCHEMA IF NOT EXISTS bot_config;

-- ═══════════════════════════════════════════════════════════
--  TABLE: auto_answer_rules
-- ═══════════════════════════════════════════════════════════
CREATE TABLE bot_config.auto_answer_rules (
    id SERIAL PRIMARY KEY,

    topic VARCHAR(50) UNIQUE NOT NULL,

    auto_answer_enabled BOOLEAN DEFAULT TRUE,
    escalate_to_human BOOLEAN DEFAULT FALSE,

    escalation_message TEXT,

    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_auto_answer_rules_topic ON bot_config.auto_answer_rules (topic);

COMMENT ON TABLE bot_config.auto_answer_rules IS 'Controls which topics are auto-answered vs escalated to human';
COMMENT ON COLUMN bot_config.auto_answer_rules.topic IS 'Category: honorarios, documentos, prazos, urgencia_violencia, etc';

-- ═══════════════════════════════════════════════════════════
--  TABLE: cron_jobs
-- ═══════════════════════════════════════════════════════════
CREATE TABLE bot_config.cron_jobs (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,

    frequency_seconds INT NOT NULL,
    last_run TIMESTAMP,
    next_run TIMESTAMP,

    enabled BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT cron_jobs_frequency_check CHECK (frequency_seconds > 0)
);

-- Indexes
CREATE INDEX idx_cron_jobs_next_run ON bot_config.cron_jobs (next_run) WHERE enabled = TRUE;

COMMENT ON TABLE bot_config.cron_jobs IS 'Cron job configuration (frequency, enable/disable via dashboard)';

COMMIT;
