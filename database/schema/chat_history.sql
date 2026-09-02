-- =================================================================
-- 💾 SCHEMA: WhatsApp Chat History - Persistência Completa
-- =================================================================
--
-- Tabela para gravar TODAS as mensagens (usuário + bot) com metadata
-- Permite histórico infinito, análise de conversas e auditoria
--
-- Uso: Executar no PostgreSQL do n8n
--   docker exec -i n8n-postgres psql -U n8n -d n8n < chat_history.sql
-- =================================================================

-- Tabela principal de histórico
CREATE TABLE IF NOT EXISTS whatsapp_chat_history (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,           -- ID do chat WhatsApp (e.g. "5511999999999@c.us")
    message_id VARCHAR(255) NOT NULL,        -- ID único da mensagem
    sender_type VARCHAR(20) NOT NULL,        -- 'user' ou 'bot'
    message_text TEXT NOT NULL,              -- Texto da mensagem (sanitizado se bot)
    input_type VARCHAR(50),                  -- 'text', 'voice', 'image', 'document', 'response'
    metadata JSONB,                          -- Dados extras: from, timestamp, _security, etc
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_sender_type CHECK (sender_type IN ('user', 'bot')),
    CONSTRAINT valid_input_type CHECK (input_type IN ('text', 'voice', 'image', 'document', 'response'))
);

-- Índices para performance de queries
CREATE INDEX IF NOT EXISTS idx_chat_id ON whatsapp_chat_history(chat_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON whatsapp_chat_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sender_type ON whatsapp_chat_history(sender_type);
CREATE INDEX IF NOT EXISTS idx_chat_created ON whatsapp_chat_history(chat_id, created_at DESC);

-- Índice JSONB para queries em metadata
CREATE INDEX IF NOT EXISTS idx_metadata_gin ON whatsapp_chat_history USING GIN (metadata);

-- =================================================================
-- VIEWS ÚTEIS
-- =================================================================

-- View: Últimas conversas por chat
CREATE OR REPLACE VIEW whatsapp_recent_chats AS
SELECT DISTINCT ON (chat_id)
    chat_id,
    message_text as last_message,
    sender_type as last_sender,
    created_at as last_activity,
    metadata->>'from' as user_phone
FROM whatsapp_chat_history
ORDER BY chat_id, created_at DESC;

-- View: Estatísticas por chat
CREATE OR REPLACE VIEW whatsapp_chat_stats AS
SELECT
    chat_id,
    COUNT(*) as total_messages,
    COUNT(*) FILTER (WHERE sender_type = 'user') as user_messages,
    COUNT(*) FILTER (WHERE sender_type = 'bot') as bot_messages,
    MIN(created_at) as first_message,
    MAX(created_at) as last_message,
    MAX(created_at) - MIN(created_at) as conversation_duration
FROM whatsapp_chat_history
GROUP BY chat_id;

-- View: Mensagens com PII sanitizado (para auditoria)
CREATE OR REPLACE VIEW whatsapp_sanitized_messages AS
SELECT
    id,
    chat_id,
    message_id,
    sender_type,
    message_text,
    input_type,
    created_at,
    metadata->'_security' as security_info,
    (metadata->'_security'->>'sanitized')::boolean as was_sanitized,
    (metadata->'_security'->>'redactionCount')::int as redaction_count
FROM whatsapp_chat_history
WHERE sender_type = 'bot';

-- =================================================================
-- FUNÇÕES ÚTEIS
-- =================================================================

-- Função: Buscar histórico completo de um chat
CREATE OR REPLACE FUNCTION get_chat_history(p_chat_id VARCHAR)
RETURNS TABLE (
    message_id VARCHAR,
    sender VARCHAR,
    message TEXT,
    type VARCHAR,
    timestamp TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.message_id::VARCHAR,
        h.sender_type::VARCHAR as sender,
        h.message_text as message,
        h.input_type::VARCHAR as type,
        h.created_at as timestamp
    FROM whatsapp_chat_history h
    WHERE h.chat_id = p_chat_id
    ORDER BY h.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Função: Limpar histórico antigo (GDPR compliance)
CREATE OR REPLACE FUNCTION cleanup_old_history(days_to_keep INT DEFAULT 90)
RETURNS TABLE (deleted_count BIGINT) AS $$
BEGIN
    DELETE FROM whatsapp_chat_history
    WHERE created_at < CURRENT_TIMESTAMP - (days_to_keep || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN QUERY SELECT deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Função: Buscar mensagens com dados sensíveis redactados
CREATE OR REPLACE FUNCTION get_sanitized_logs(p_limit INT DEFAULT 100)
RETURNS TABLE (
    chat_id VARCHAR,
    message_text TEXT,
    redaction_count INT,
    redacted_types TEXT[],
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.chat_id::VARCHAR,
        h.message_text,
        (h.metadata->'_security'->>'redactionCount')::INT as redaction_count,
        ARRAY(SELECT jsonb_array_elements_text(h.metadata->'_security'->'redactedTypes')) as redacted_types,
        h.created_at
    FROM whatsapp_chat_history h
    WHERE h.sender_type = 'bot'
      AND (h.metadata->'_security'->>'sanitized')::boolean = true
    ORDER BY h.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- TESTES (OPCIONAL)
-- =================================================================

-- Inserir mensagem de teste
INSERT INTO whatsapp_chat_history (chat_id, message_id, sender_type, message_text, input_type, metadata)
VALUES (
    '5511999999999@c.us',
    'test_msg_001',
    'user',
    'Olá, preciso de ajuda',
    'text',
    '{"from": "5511999999999", "timestamp": "2026-08-28T13:00:00Z"}'::jsonb
);

-- Inserir resposta do bot
INSERT INTO whatsapp_chat_history (chat_id, message_id, sender_type, message_text, input_type, metadata)
VALUES (
    '5511999999999@c.us',
    'test_msg_001_bot',
    'bot',
    'Olá! Como posso te ajudar?',
    'response',
    '{"_security": {"sanitized": false, "redactionCount": 0}}'::jsonb
);

-- Testar queries
SELECT * FROM whatsapp_recent_chats;
SELECT * FROM whatsapp_chat_stats;
SELECT * FROM get_chat_history('5511999999999@c.us');

-- =================================================================
-- COMENTÁRIOS FINAIS
-- =================================================================

COMMENT ON TABLE whatsapp_chat_history IS 'Histórico completo de conversas WhatsApp (usuário + bot)';
COMMENT ON COLUMN whatsapp_chat_history.chat_id IS 'ID do chat WhatsApp (formato: número@c.us)';
COMMENT ON COLUMN whatsapp_chat_history.sender_type IS 'Origem da mensagem: user (cliente) ou bot (assistente)';
COMMENT ON COLUMN whatsapp_chat_history.metadata IS 'JSON com dados extras: from, timestamp, _security (sanitização), etc';
COMMENT ON VIEW whatsapp_recent_chats IS 'Última mensagem e atividade de cada chat';
COMMENT ON VIEW whatsapp_chat_stats IS 'Estatísticas agregadas por chat (total msgs, duração, etc)';
COMMENT ON FUNCTION get_chat_history IS 'Retorna histórico ordenado de um chat específico';
COMMENT ON FUNCTION cleanup_old_history IS 'Remove mensagens antigas (GDPR compliance)';

-- =================================================================
-- FIM DO SCHEMA
-- =================================================================
