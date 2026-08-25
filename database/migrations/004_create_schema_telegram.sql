-- database/migrations/004_create_schema_telegram.sql
-- Schema for Telegram Command Center integration

BEGIN;

CREATE SCHEMA IF NOT EXISTS telegram;

-- ═══════════════════════════════════════════════════════════
--  TABLE: lead_topics
-- ═══════════════════════════════════════════════════════════
CREATE TABLE telegram.lead_topics (
    lead_id INT PRIMARY KEY REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    telegram_group_id BIGINT NOT NULL,
    telegram_topic_id BIGINT NOT NULL,

    topic_created_at TIMESTAMPTZ DEFAULT NOW(),
    topic_title VARCHAR(200),
    is_archived BOOLEAN DEFAULT FALSE
);

-- Indexes
CREATE INDEX idx_lead_topics_group ON telegram.lead_topics (telegram_group_id);
CREATE INDEX idx_lead_topics_archived ON telegram.lead_topics (is_archived);

COMMENT ON TABLE telegram.lead_topics IS 'Maps each lead to a Telegram Supergroup topic (thread)';

-- ═══════════════════════════════════════════════════════════
--  TABLE: client_tasks
-- ═══════════════════════════════════════════════════════════
CREATE TABLE telegram.client_tasks (
    id SERIAL PRIMARY KEY,
    lead_id INT REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    task_type VARCHAR(50) NOT NULL,
    task_data JSONB NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    answered_at TIMESTAMPTZ,

    -- Resposta do cliente
    client_response TEXT,
    client_response_data JSONB,

    -- Constraints
    CONSTRAINT client_tasks_task_type_check CHECK (
        task_type IN ('ask_question', 'request_document', 'schedule_call')
    ),
    CONSTRAINT client_tasks_status_check CHECK (
        status IN ('pending', 'sent', 'answered', 'failed')
    )
);

-- Indexes
CREATE INDEX idx_client_tasks_pending ON telegram.client_tasks (lead_id, status) WHERE status = 'pending';
CREATE INDEX idx_client_tasks_created ON telegram.client_tasks (created_at DESC);

COMMENT ON TABLE telegram.client_tasks IS 'Tasks team requests bot to execute via WhatsApp';
COMMENT ON COLUMN telegram.client_tasks.task_data IS 'JSONB: {question, context, requested_by_user}';

-- ═══════════════════════════════════════════════════════════
--  TABLE: topic_context
-- ═══════════════════════════════════════════════════════════
CREATE TABLE telegram.topic_context (
    topic_id BIGINT PRIMARY KEY,
    lead_id INT REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    conversation_summary TEXT,
    team_decisions JSONB[],
    mentioned_documents TEXT[],

    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_topic_context_lead ON telegram.topic_context (lead_id);

COMMENT ON TABLE telegram.topic_context IS 'Persistent context of team discussion in Telegram';

-- ═══════════════════════════════════════════════════════════
--  TABLE: user_permissions
-- ═══════════════════════════════════════════════════════════
CREATE TABLE telegram.user_permissions (
    telegram_user_id BIGINT PRIMARY KEY,
    full_name VARCHAR(200),
    role VARCHAR(50),

    -- Permissões
    can_approve_leads BOOLEAN DEFAULT FALSE,
    can_reject_leads BOOLEAN DEFAULT FALSE,
    can_ask_client BOOLEAN DEFAULT TRUE,
    can_view_documents BOOLEAN DEFAULT TRUE,
    can_calculate_fees BOOLEAN DEFAULT TRUE,

    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by_user_id BIGINT,

    -- Constraints
    CONSTRAINT user_permissions_role_check CHECK (
        role IN ('admin', 'intake', 'paralegal', 'viewer')
    )
);

-- Indexes
CREATE INDEX idx_user_permissions_role ON telegram.user_permissions (role);

COMMENT ON TABLE telegram.user_permissions IS 'Telegram user access control (future multi-tenancy)';

COMMIT;
