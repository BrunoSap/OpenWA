-- database/migrations/006_create_helper_functions.sql
-- SQL helper functions for semantic search and aggregation

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  FUNCTION: find_similar_faq
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION knowledge.find_similar_faq(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.8,
    match_count INT DEFAULT 3
)
RETURNS TABLE (
    faq_id INT,
    question TEXT,
    answer TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.question,
        f.answer,
        1 - (f.embedding <=> query_embedding) AS similarity
    FROM knowledge.faq f
    WHERE
        f.embedding IS NOT NULL
        AND 1 - (f.embedding <=> query_embedding) >= match_threshold
    ORDER BY f.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION knowledge.find_similar_faq IS 'Find FAQ entries by cosine similarity (Layer 1 matching)';

-- ═══════════════════════════════════════════════════════════
--  FUNCTION: find_similar_conversations
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION knowledge.find_similar_conversations(
    query_embedding VECTOR(1536),
    exclude_chat_id VARCHAR(100),
    match_threshold FLOAT DEFAULT 0.75,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    conversation_id INT,
    chat_id VARCHAR(100),
    message_text TEXT,
    msg_timestamp TIMESTAMP,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.chat_id,
        c.message_text,
        c.timestamp,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM knowledge.conversations c
    WHERE
        c.chat_id != exclude_chat_id
        AND c.embedding IS NOT NULL
        AND 1 - (c.embedding <=> query_embedding) >= match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION knowledge.find_similar_conversations IS 'Find similar conversations from other clients (RAG Layer 2)';

-- ═══════════════════════════════════════════════════════════
--  FUNCTION: get_client_summary
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION knowledge.get_client_summary(
    target_chat_id VARCHAR(100)
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'client', (
            SELECT row_to_json(c.*)
            FROM knowledge.clients c
            WHERE c.chat_id = target_chat_id
        ),
        'recent_messages', (
            SELECT COALESCE(json_agg(row_to_json(conv.*)), '[]'::json)
            FROM (
                SELECT id, message_text, timestamp, from_user, message_type
                FROM knowledge.conversations
                WHERE chat_id = target_chat_id
                ORDER BY timestamp DESC
                LIMIT 10
            ) conv
        ),
        'documents', (
            SELECT COALESCE(json_agg(row_to_json(docs.*)), '[]'::json)
            FROM (
                SELECT d.id, d.document_type, d.file_name, d.verified, d.uploaded_at
                FROM knowledge.documents d
                JOIN knowledge.clients c ON c.id = d.client_id
                WHERE c.chat_id = target_chat_id
                ORDER BY d.uploaded_at DESC
            ) docs
        ),
        'lead_data', (
            SELECT row_to_json(l.*)
            FROM intake_staging.leads l
            WHERE l.chat_id = target_chat_id
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION knowledge.get_client_summary IS 'Get complete client summary for Telegram /resumo command';

-- ═══════════════════════════════════════════════════════════
--  FUNCTION: calculate_fees
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION knowledge.calculate_fees(
    estimated_backpay NUMERIC,
    monthly_benefit NUMERIC,
    estimated_uads INT DEFAULT 60
)
RETURNS JSON AS $$
DECLARE
    atrasados NUMERIC;
    vincendas NUMERIC;
    uads NUMERIC;
    total NUMERIC;
    parcel_10x NUMERIC;
    parcel_15x NUMERIC;
BEGIN
    atrasados := estimated_backpay * 0.30;
    vincendas := monthly_benefit * 12 * 0.30;
    uads := estimated_uads * 159.21;
    total := atrasados + vincendas + uads;
    parcel_10x := (total * 0.40) / 10;
    parcel_15x := (total * 0.40) / 15;

    RETURN json_build_object(
        'atrasados_30_percent', ROUND(atrasados, 2),
        'vincendas_30_percent', ROUND(vincendas, 2),
        'uads_total', ROUND(uads, 2),
        'total', ROUND(total, 2),
        'parcelamento_options', json_build_object(
            '10x', ROUND(parcel_10x, 2),
            '15x', ROUND(parcel_15x, 2)
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION knowledge.calculate_fees IS 'Calculate attorney fees (30% atrasados + 30% vincendas + UADs)';

COMMIT;
