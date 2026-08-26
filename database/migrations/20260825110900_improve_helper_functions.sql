-- database/migrations/20260825110900_improve_helper_functions.sql
-- Improve helper functions with better error handling and configuration

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  IMPROVE: find_similar_faq with better NULL handling
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
    -- Validate input
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'query_embedding cannot be NULL. Ensure embedding generation succeeded before calling this function.';
    END IF;

    IF match_threshold < 0 OR match_threshold > 1 THEN
        RAISE EXCEPTION 'match_threshold must be between 0 and 1, got: %', match_threshold;
    END IF;

    IF match_count <= 0 THEN
        RAISE EXCEPTION 'match_count must be positive, got: %', match_count;
    END IF;

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

    -- Log warning if no results (for debugging)
    IF NOT FOUND THEN
        RAISE NOTICE 'No FAQ entries found above threshold % (consider lowering threshold or checking embeddings)', match_threshold;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION knowledge.find_similar_faq IS 'Find FAQ entries by cosine similarity (Layer 1 matching). Raises error on NULL embedding.';

-- ═══════════════════════════════════════════════════════════
--  IMPROVE: find_similar_conversations with better NULL handling
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
    msg_timestamp TIMESTAMPTZ,
    similarity FLOAT
) AS $$
BEGIN
    -- Validate input
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'query_embedding cannot be NULL. Ensure embedding generation succeeded before calling this function.';
    END IF;

    IF match_threshold < 0 OR match_threshold > 1 THEN
        RAISE EXCEPTION 'match_threshold must be between 0 and 1, got: %', match_threshold;
    END IF;

    IF match_count <= 0 THEN
        RAISE EXCEPTION 'match_count must be positive, got: %', match_count;
    END IF;

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

    -- Log warning if no results
    IF NOT FOUND THEN
        RAISE NOTICE 'No similar conversations found above threshold % (consider lowering threshold)', match_threshold;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION knowledge.find_similar_conversations IS 'Find similar conversations from other clients (RAG Layer 2). Raises error on NULL embedding.';

-- ═══════════════════════════════════════════════════════════
--  IMPROVE: calculate_fees to use configuration table
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION knowledge.calculate_fees(
    estimated_backpay NUMERIC,
    monthly_benefit NUMERIC,
    estimated_uads INT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    uad_value NUMERIC;
    atrasados_pct NUMERIC;
    vincendas_pct NUMERIC;
    default_uad_count INT;
    parcel_10x_pct NUMERIC;
    parcel_15x_pct NUMERIC;

    atrasados NUMERIC;
    vincendas NUMERIC;
    uads NUMERIC;
    total NUMERIC;
    parcel_10x NUMERIC;
    parcel_15x NUMERIC;
BEGIN
    -- Validate inputs
    IF estimated_backpay IS NULL OR estimated_backpay < 0 THEN
        RAISE EXCEPTION 'estimated_backpay must be non-negative, got: %', estimated_backpay;
    END IF;

    IF monthly_benefit IS NULL OR monthly_benefit < 0 THEN
        RAISE EXCEPTION 'monthly_benefit must be non-negative, got: %', monthly_benefit;
    END IF;

    IF estimated_uads IS NOT NULL AND estimated_uads < 0 THEN
        RAISE EXCEPTION 'estimated_uads must be non-negative, got: %', estimated_uads;
    END IF;

    -- Load parameters from configuration table
    SELECT parameter_value INTO uad_value
    FROM bot_config.fee_parameters
    WHERE parameter_name = 'uad_value_brl';

    SELECT parameter_value INTO atrasados_pct
    FROM bot_config.fee_parameters
    WHERE parameter_name = 'atrasados_percent';

    SELECT parameter_value INTO vincendas_pct
    FROM bot_config.fee_parameters
    WHERE parameter_name = 'vincendas_percent';

    SELECT parameter_value::INT INTO default_uad_count
    FROM bot_config.fee_parameters
    WHERE parameter_name = 'default_uad_count';

    SELECT parameter_value INTO parcel_10x_pct
    FROM bot_config.fee_parameters
    WHERE parameter_name = 'parcelamento_10x_percent';

    SELECT parameter_value INTO parcel_15x_pct
    FROM bot_config.fee_parameters
    WHERE parameter_name = 'parcelamento_15x_percent';

    -- Fallback to hardcoded values if config table is empty
    uad_value := COALESCE(uad_value, 159.21);
    atrasados_pct := COALESCE(atrasados_pct, 30.0);
    vincendas_pct := COALESCE(vincendas_pct, 30.0);
    default_uad_count := COALESCE(default_uad_count, 60);
    parcel_10x_pct := COALESCE(parcel_10x_pct, 40.0);
    parcel_15x_pct := COALESCE(parcel_15x_pct, 40.0);

    -- Use default if not provided
    estimated_uads := COALESCE(estimated_uads, default_uad_count);

    -- Calculate fees
    atrasados := estimated_backpay * (atrasados_pct / 100.0);
    vincendas := monthly_benefit * 12 * (vincendas_pct / 100.0);
    uads := estimated_uads * uad_value;
    total := atrasados + vincendas + uads;
    parcel_10x := (total * (parcel_10x_pct / 100.0)) / 10;
    parcel_15x := (total * (parcel_15x_pct / 100.0)) / 15;

    RETURN json_build_object(
        'atrasados_30_percent', ROUND(atrasados, 2),
        'vincendas_30_percent', ROUND(vincendas, 2),
        'uads_total', ROUND(uads, 2),
        'uads_count', estimated_uads,
        'uad_value_brl', uad_value,
        'total', ROUND(total, 2),
        'parcelamento_options', json_build_object(
            '10x', ROUND(parcel_10x, 2),
            '15x', ROUND(parcel_15x, 2)
        ),
        'parameters_used', json_build_object(
            'atrasados_percent', atrasados_pct,
            'vincendas_percent', vincendas_pct,
            'parcelamento_10x_percent', parcel_10x_pct,
            'parcelamento_15x_percent', parcel_15x_pct
        )
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION knowledge.calculate_fees IS 'Calculate attorney fees using bot_config.fee_parameters table (fallback to defaults if table empty)';

-- ═══════════════════════════════════════════════════════════
--  Record migration
-- ═══════════════════════════════════════════════════════════

INSERT INTO public.schema_migrations (version, description)
VALUES ('20260825110900_improve_helper_functions', 'Improve helper functions: NULL validation, config-driven fees')
ON CONFLICT (version) DO NOTHING;

COMMIT;
