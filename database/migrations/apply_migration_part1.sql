-- Part 1: Functions (can run in transaction)
BEGIN;

CREATE OR REPLACE FUNCTION knowledge.find_similar_faq_v2(
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
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'query_embedding cannot be NULL';
    END IF;
    IF match_threshold < 0 OR match_threshold > 1 THEN
        RAISE EXCEPTION 'match_threshold must be between 0 and 1, got: %', match_threshold;
    END IF;
    IF match_count <= 0 OR match_count > 100 THEN
        RAISE EXCEPTION 'match_count must be between 1 and 100, got: %', match_count;
    END IF;

    RETURN QUERY
    SELECT
        f.id,
        f.question,
        f.answer,
        (1 - (f.embedding <=> query_embedding))::FLOAT AS similarity
    FROM knowledge.faq f
    WHERE
        f.deleted_at IS NULL
        AND f.embedding IS NOT NULL
        AND (1 - (f.embedding <=> query_embedding)) >= match_threshold
    ORDER BY f.embedding <=> query_embedding
    LIMIT match_count;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'find_similar_faq_v2 failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql STABLE STRICT PARALLEL SAFE;

CREATE OR REPLACE FUNCTION knowledge.find_similar_conversations_v2(
    query_embedding VECTOR(1536),
    exclude_chat_id VARCHAR(100),
    match_threshold FLOAT DEFAULT 0.75,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    conversation_id INT,
    chat_id VARCHAR(100),
    message_text TEXT,
    msg_timestamp TIMESTAMPTZ,
    similarity FLOAT
) AS $$
BEGIN
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'query_embedding cannot be NULL';
    END IF;
    IF exclude_chat_id IS NULL THEN
        RAISE EXCEPTION 'exclude_chat_id cannot be NULL';
    END IF;
    IF exclude_chat_id !~ '^[0-9]+(@.+)?$' THEN
        RAISE EXCEPTION 'Invalid chat_id format: %', exclude_chat_id;
    END IF;
    IF match_threshold < 0 OR match_threshold > 1 THEN
        RAISE EXCEPTION 'match_threshold must be between 0 and 1, got: %', match_threshold;
    END IF;
    IF match_count <= 0 OR match_count > 100 THEN
        RAISE EXCEPTION 'match_count must be between 1 and 100, got: %', match_count;
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.chat_id,
        c.message_text,
        c.timestamp,
        (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity
    FROM knowledge.conversations c
    WHERE
        c.deleted_at IS NULL
        AND c.embedding IS NOT NULL
        AND c.chat_id != exclude_chat_id
        AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'find_similar_conversations_v2 failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql STABLE STRICT PARALLEL SAFE;

CREATE OR REPLACE FUNCTION knowledge.get_client_summary_v2(
    p_chat_id VARCHAR(100)
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    IF p_chat_id IS NULL THEN
        RAISE EXCEPTION 'p_chat_id cannot be NULL';
    END IF;
    IF p_chat_id !~ '^[0-9]+(@.+)?$' THEN
        RAISE EXCEPTION 'Invalid chat_id format: %', p_chat_id;
    END IF;

    SELECT json_build_object(
        'client', row_to_json(cl.*),
        'recent_messages', (
            SELECT json_agg(row_to_json(conv.*))
            FROM (
                SELECT * FROM knowledge.conversations
                WHERE chat_id = p_chat_id
                AND deleted_at IS NULL
                ORDER BY timestamp DESC
                LIMIT 10
            ) conv
        ),
        'summary', cl.summary,
        'last_interaction', cl.last_interaction_at
    )
    INTO result
    FROM knowledge.clients cl
    WHERE cl.chat_id = p_chat_id
    AND cl.deleted_at IS NULL;

    IF result IS NULL THEN
        RAISE EXCEPTION 'Client not found: %', p_chat_id;
    END IF;

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'get_client_summary_v2 failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql STABLE STRICT;

CREATE OR REPLACE FUNCTION knowledge.calculate_fees_v2(
    estimated_backpay NUMERIC,
    monthly_benefit NUMERIC,
    estimated_uads INTEGER
)
RETURNS JSON AS $$
DECLARE
    backpay_fee NUMERIC(12,2);
    monthly_fee NUMERIC(12,2);
    uad_fee NUMERIC(12,2);
    total_fee NUMERIC(12,2);
    UAD_VALUE CONSTANT NUMERIC(12,2) := 159.21;
    FEE_PERCENTAGE CONSTANT NUMERIC := 0.30;
BEGIN
    IF estimated_backpay < 0 THEN
        RAISE EXCEPTION 'estimated_backpay must be non-negative, got: %', estimated_backpay;
    END IF;
    IF monthly_benefit < 0 THEN
        RAISE EXCEPTION 'monthly_benefit must be non-negative, got: %', monthly_benefit;
    END IF;
    IF estimated_uads < 0 OR estimated_uads > 1000 THEN
        RAISE EXCEPTION 'estimated_uads must be between 0 and 1000, got: %', estimated_uads;
    END IF;

    backpay_fee := (estimated_backpay * FEE_PERCENTAGE)::NUMERIC(12,2);
    monthly_fee := (monthly_benefit * 12 * FEE_PERCENTAGE)::NUMERIC(12,2);
    uad_fee := (estimated_uads * UAD_VALUE)::NUMERIC(12,2);
    total_fee := backpay_fee + monthly_fee + uad_fee;

    RETURN json_build_object(
        'backpay', backpay_fee,
        'monthly', monthly_fee,
        'uads', uad_fee,
        'total', total_fee,
        'input', json_build_object(
            'estimated_backpay', estimated_backpay,
            'monthly_benefit', monthly_benefit,
            'estimated_uads', estimated_uads
        )
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'calculate_fees_v2 failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

COMMIT;
