-- =================================================================
-- 💾 SCHEMA: Error Handling & Monitoring Tables
-- =================================================================
--
-- Tabelas para sistema de error handling production-grade
-- Uso: Executar no PostgreSQL do openwa
--   cat database/schema/error_handling.sql | docker exec -i openwa-postgres psql -U openwa -d openwa
-- =================================================================

-- Tabela de erros
CREATE TABLE IF NOT EXISTS whatsapp_errors (
    id SERIAL PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL,
    workflow_name VARCHAR(255) NOT NULL,
    execution_id VARCHAR(255) NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    last_node VARCHAR(255),
    chat_id VARCHAR(255),
    input_data JSONB,
    base_url VARCHAR(255),
    environment VARCHAR(50) DEFAULT 'production',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para queries de performance
CREATE INDEX IF NOT EXISTS idx_errors_workflow_name ON whatsapp_errors(workflow_name);
CREATE INDEX IF NOT EXISTS idx_errors_created_at ON whatsapp_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_chat_id ON whatsapp_errors(chat_id);
CREATE INDEX IF NOT EXISTS idx_errors_workflow_created ON whatsapp_errors(workflow_name, created_at DESC);

-- Tabela de alertas
CREATE TABLE IF NOT EXISTS whatsapp_alerts (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(100) NOT NULL, -- 'high_error_rate', 'service_down', 'rate_limit_hit'
    severity VARCHAR(50) NOT NULL,    -- 'CRITICAL', 'WARNING', 'INFO'
    workflow_name VARCHAR(255),
    message TEXT NOT NULL,
    metadata JSONB,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_alerts_type ON whatsapp_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON whatsapp_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON whatsapp_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON whatsapp_alerts(created_at DESC);

-- Tabela de health checks
CREATE TABLE IF NOT EXISTS whatsapp_health_checks (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL, -- 'openwa', 'groq', 'openai', 'postgres', 'redis'
    status VARCHAR(50) NOT NULL,        -- 'up', 'down', 'degraded'
    response_time_ms INT,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_health_service ON whatsapp_health_checks(service_name);
CREATE INDEX IF NOT EXISTS idx_health_status ON whatsapp_health_checks(status);
CREATE INDEX IF NOT EXISTS idx_health_created_at ON whatsapp_health_checks(created_at DESC);

-- Tabela de rate limiting (complementar ao Redis)
CREATE TABLE IF NOT EXISTS whatsapp_rate_limits (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    limit_type VARCHAR(50) NOT NULL,  -- 'message_count', 'api_calls'
    count INT NOT NULL,
    window_start TIMESTAMP NOT NULL,
    window_end TIMESTAMP NOT NULL,
    was_blocked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ratelimit_chat_id ON whatsapp_rate_limits(chat_id);
CREATE INDEX IF NOT EXISTS idx_ratelimit_window ON whatsapp_rate_limits(window_start, window_end);

-- Tabela de performance metrics (já criada antes, complementar)
CREATE TABLE IF NOT EXISTS whatsapp_performance_metrics (
    id SERIAL PRIMARY KEY,
    workflow_execution_id VARCHAR(255),
    chat_id VARCHAR(255),
    input_type VARCHAR(50),
    webhook_to_ai_agent_ms INT,
    ai_agent_processing_ms INT,
    sanitization_ms INT,
    total_response_ms INT,
    groq_tokens_used INT,
    openai_tokens_used INT,
    estimated_cost_usd DECIMAL(10,6),
    had_errors BOOLEAN DEFAULT false,
    was_sanitized BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_perf_chat_id ON whatsapp_performance_metrics(chat_id);
CREATE INDEX IF NOT EXISTS idx_perf_created_at ON whatsapp_performance_metrics(created_at DESC);

-- =================================================================
-- VIEWS ÚTEIS
-- =================================================================

-- View: Erros recentes por workflow
CREATE OR REPLACE VIEW whatsapp_recent_errors AS
SELECT
    workflow_name,
    COUNT(*) as error_count,
    MAX(created_at) as last_error,
    array_agg(DISTINCT error_message) as unique_errors
FROM whatsapp_errors
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY workflow_name
ORDER BY error_count DESC;

-- View: Health status atual de todos os serviços
CREATE OR REPLACE VIEW whatsapp_services_health AS
SELECT DISTINCT ON (service_name)
    service_name,
    status,
    response_time_ms,
    error_message,
    created_at as last_check
FROM whatsapp_health_checks
ORDER BY service_name, created_at DESC;

-- View: Alertas não resolvidos
CREATE OR REPLACE VIEW whatsapp_unresolved_alerts AS
SELECT
    id,
    alert_type,
    severity,
    workflow_name,
    message,
    created_at,
    EXTRACT(EPOCH FROM (NOW() - created_at))/60 as age_minutes
FROM whatsapp_alerts
WHERE acknowledged = false
ORDER BY
    CASE severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'WARNING' THEN 2
        ELSE 3
    END,
    created_at DESC;

-- View: Performance stats últimas 24h
CREATE OR REPLACE VIEW whatsapp_performance_24h AS
SELECT
    input_type,
    COUNT(*) as total_requests,
    AVG(total_response_ms) as avg_response_ms,
    MAX(total_response_ms) as max_response_ms,
    MIN(total_response_ms) as min_response_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_response_ms) as p95_response_ms,
    SUM(groq_tokens_used) as total_groq_tokens,
    SUM(openai_tokens_used) as total_openai_tokens,
    SUM(estimated_cost_usd) as total_cost_usd,
    COUNT(*) FILTER (WHERE had_errors = true) as error_count,
    COUNT(*) FILTER (WHERE was_sanitized = true) as sanitized_count
FROM whatsapp_performance_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY input_type;

-- =================================================================
-- FUNÇÕES ÚTEIS
-- =================================================================

-- Função: Obter error rate de um workflow
CREATE OR REPLACE FUNCTION get_error_rate(
    p_workflow_name VARCHAR,
    p_minutes INT DEFAULT 5
)
RETURNS TABLE (
    error_count BIGINT,
    time_window VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as error_count,
        (p_minutes || ' minutes')::VARCHAR as time_window
    FROM whatsapp_errors
    WHERE workflow_name = p_workflow_name
      AND created_at > NOW() - (p_minutes || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Função: Cleanup de dados antigos (GDPR compliance)
CREATE OR REPLACE FUNCTION cleanup_old_monitoring_data(
    p_days_to_keep INT DEFAULT 90
)
RETURNS TABLE (
    table_name VARCHAR,
    deleted_count BIGINT
) AS $$
DECLARE
    errors_deleted BIGINT;
    alerts_deleted BIGINT;
    health_deleted BIGINT;
    perf_deleted BIGINT;
BEGIN
    -- Delete old errors
    DELETE FROM whatsapp_errors
    WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS errors_deleted = ROW_COUNT;

    -- Delete old health checks
    DELETE FROM whatsapp_health_checks
    WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS health_deleted = ROW_COUNT;

    -- Delete old performance metrics
    DELETE FROM whatsapp_performance_metrics
    WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS perf_deleted = ROW_COUNT;

    -- Delete acknowledged alerts older than 30 days
    DELETE FROM whatsapp_alerts
    WHERE acknowledged = true
      AND created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS alerts_deleted = ROW_COUNT;

    -- Return results
    RETURN QUERY
    SELECT 'whatsapp_errors'::VARCHAR, errors_deleted
    UNION ALL
    SELECT 'whatsapp_alerts'::VARCHAR, alerts_deleted
    UNION ALL
    SELECT 'whatsapp_health_checks'::VARCHAR, health_deleted
    UNION ALL
    SELECT 'whatsapp_performance_metrics'::VARCHAR, perf_deleted;
END;
$$ LANGUAGE plpgsql;

-- Função: Acknowledge alert
CREATE OR REPLACE FUNCTION acknowledge_alert(
    p_alert_id INT,
    p_acknowledged_by VARCHAR
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE whatsapp_alerts
    SET
        acknowledged = true,
        acknowledged_at = NOW(),
        acknowledged_by = p_acknowledged_by
    WHERE id = p_alert_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- COMENTÁRIOS
-- =================================================================

COMMENT ON TABLE whatsapp_errors IS 'Log centralizado de erros de todos os workflows WhatsApp';
COMMENT ON TABLE whatsapp_alerts IS 'Alertas de monitoramento (high error rate, service down, etc)';
COMMENT ON TABLE whatsapp_health_checks IS 'Health checks periódicos de todos os serviços';
COMMENT ON TABLE whatsapp_rate_limits IS 'Log de rate limiting (complementar ao Redis)';

COMMENT ON VIEW whatsapp_recent_errors IS 'Erros da última hora agrupados por workflow';
COMMENT ON VIEW whatsapp_services_health IS 'Status atual de saúde de todos os serviços';
COMMENT ON VIEW whatsapp_unresolved_alerts IS 'Alertas pendentes ordenados por severidade';
COMMENT ON VIEW whatsapp_performance_24h IS 'Estatísticas de performance das últimas 24h';

COMMENT ON FUNCTION get_error_rate IS 'Retorna número de erros de um workflow em X minutos';
COMMENT ON FUNCTION cleanup_old_monitoring_data IS 'Remove dados antigos (GDPR compliance)';
COMMENT ON FUNCTION acknowledge_alert IS 'Marcar alerta como resolvido';

-- =================================================================
-- FIM DO SCHEMA
-- =================================================================
