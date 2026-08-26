--
-- PostgreSQL database dump
--

\restrict AyHvflVG11vziev1nKNzu4vR04W15hwobc09NcXu3aSIXngYzWMnZRKSIS7xmGi

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg12+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg12+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: bot_config; Type: SCHEMA; Schema: -; Owner: openwa
--

CREATE SCHEMA bot_config;


ALTER SCHEMA bot_config OWNER TO openwa;

--
-- Name: intake_staging; Type: SCHEMA; Schema: -; Owner: openwa
--

CREATE SCHEMA intake_staging;


ALTER SCHEMA intake_staging OWNER TO openwa;

--
-- Name: knowledge; Type: SCHEMA; Schema: -; Owner: openwa
--

CREATE SCHEMA knowledge;


ALTER SCHEMA knowledge OWNER TO openwa;

--
-- Name: telegram; Type: SCHEMA; Schema: -; Owner: openwa
--

CREATE SCHEMA telegram;


ALTER SCHEMA telegram OWNER TO openwa;

--
-- Name: audit_trigger_func(); Type: FUNCTION; Schema: intake_staging; Owner: openwa
--

CREATE FUNCTION intake_staging.audit_trigger_func() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, new_data, changed_by)
        VALUES (
            TG_TABLE_NAME,
            NEW.id,
            'INSERT',
            row_to_json(NEW),
            COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER)
        );
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Detect soft delete
        IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
            INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
            VALUES (
                TG_TABLE_NAME,
                NEW.id,
                'SOFT_DELETE',
                row_to_json(OLD),
                row_to_json(NEW),
                COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER)
            );
        ELSE
            INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
            VALUES (
                TG_TABLE_NAME,
                NEW.id,
                'UPDATE',
                row_to_json(OLD),
                row_to_json(NEW),
                COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER)
            );
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data, changed_by)
        VALUES (
            TG_TABLE_NAME,
            OLD.id,
            'DELETE',
            row_to_json(OLD),
            COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION intake_staging.audit_trigger_func() OWNER TO openwa;

--
-- Name: decrypt_cpf(bytea, text); Type: FUNCTION; Schema: intake_staging; Owner: openwa
--

CREATE FUNCTION intake_staging.decrypt_cpf(cpf_encrypted bytea, encryption_key text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
BEGIN
    -- Decrypt using AES-256
    RETURN convert_from(decrypt(cpf_encrypted, encryption_key::bytea, 'aes'), 'UTF8');
END;
$$;


ALTER FUNCTION intake_staging.decrypt_cpf(cpf_encrypted bytea, encryption_key text) OWNER TO openwa;

--
-- Name: FUNCTION decrypt_cpf(cpf_encrypted bytea, encryption_key text); Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON FUNCTION intake_staging.decrypt_cpf(cpf_encrypted bytea, encryption_key text) IS 'Decrypts AES-256 encrypted CPF. Use with app secret key.';


--
-- Name: encrypt_cpf(text, text); Type: FUNCTION; Schema: intake_staging; Owner: openwa
--

CREATE FUNCTION intake_staging.encrypt_cpf(cpf_plain text, encryption_key text) RETURNS bytea
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    cpf_clean TEXT;
BEGIN
    -- Validate CPF first
    IF NOT intake_staging.validate_cpf(cpf_plain) THEN
        RAISE EXCEPTION 'Invalid CPF: %. Failed Luhn validation.', cpf_plain;
    END IF;

    -- Remove non-numeric characters
    cpf_clean := regexp_replace(cpf_plain, '[^0-9]', '', 'g');

    -- Encrypt using AES-256 (pgcrypto)
    RETURN encrypt(cpf_clean::bytea, encryption_key::bytea, 'aes');
END;
$$;


ALTER FUNCTION intake_staging.encrypt_cpf(cpf_plain text, encryption_key text) OWNER TO openwa;

--
-- Name: FUNCTION encrypt_cpf(cpf_plain text, encryption_key text); Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON FUNCTION intake_staging.encrypt_cpf(cpf_plain text, encryption_key text) IS 'Encrypts CPF with AES-256 after validation. LGPD compliant. Use with app secret key.';


--
-- Name: hash_cpf(text); Type: FUNCTION; Schema: intake_staging; Owner: openwa
--

CREATE FUNCTION intake_staging.hash_cpf(cpf_plain text) RETURNS character varying
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    cpf_clean TEXT;
BEGIN
    -- Remove non-numeric characters
    cpf_clean := regexp_replace(cpf_plain, '[^0-9]', '', 'g');

    -- SHA-256 hash
    RETURN encode(digest(cpf_clean, 'sha256'), 'hex');
END;
$$;


ALTER FUNCTION intake_staging.hash_cpf(cpf_plain text) OWNER TO openwa;

--
-- Name: FUNCTION hash_cpf(cpf_plain text); Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON FUNCTION intake_staging.hash_cpf(cpf_plain text) IS 'SHA-256 hash for CPF uniqueness lookups (non-reversible, index-friendly)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: intake_staging; Owner: openwa
--

CREATE FUNCTION intake_staging.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.updated_by = COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER);
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$;


ALTER FUNCTION intake_staging.update_updated_at_column() OWNER TO openwa;

--
-- Name: validate_cpf(text); Type: FUNCTION; Schema: intake_staging; Owner: openwa
--

CREATE FUNCTION intake_staging.validate_cpf(cpf text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
DECLARE
    cpf_clean TEXT;
    sum1 INT := 0;
    sum2 INT := 0;
    digit1 INT;
    digit2 INT;
    i INT;
BEGIN
    -- Remove non-numeric characters
    cpf_clean := regexp_replace(cpf, '[^0-9]', '', 'g');

    -- Must be exactly 11 digits
    IF length(cpf_clean) != 11 THEN
        RETURN FALSE;
    END IF;

    -- Reject known invalid sequences (all same digit)
    IF cpf_clean ~ '^([0-9])\1{10}$' THEN
        RETURN FALSE;
    END IF;

    -- Calculate first check digit
    FOR i IN 1..9 LOOP
        sum1 := sum1 + substring(cpf_clean, i, 1)::INT * (11 - i);
    END LOOP;
    digit1 := 11 - (sum1 % 11);
    IF digit1 >= 10 THEN
        digit1 := 0;
    END IF;

    -- Validate first check digit
    IF digit1 != substring(cpf_clean, 10, 1)::INT THEN
        RETURN FALSE;
    END IF;

    -- Calculate second check digit
    FOR i IN 1..10 LOOP
        sum2 := sum2 + substring(cpf_clean, i, 1)::INT * (12 - i);
    END LOOP;
    digit2 := 11 - (sum2 % 11);
    IF digit2 >= 10 THEN
        digit2 := 0;
    END IF;

    -- Validate second check digit
    IF digit2 != substring(cpf_clean, 11, 1)::INT THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$_$;


ALTER FUNCTION intake_staging.validate_cpf(cpf text) OWNER TO openwa;

--
-- Name: FUNCTION validate_cpf(cpf text); Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON FUNCTION intake_staging.validate_cpf(cpf text) IS 'Validates Brazilian CPF using Luhn algorithm with check digits. Rejects invalid patterns like "11111111111".';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auto_answer_rules; Type: TABLE; Schema: bot_config; Owner: openwa
--

CREATE TABLE bot_config.auto_answer_rules (
    id integer NOT NULL,
    topic character varying(50) NOT NULL,
    auto_answer_enabled boolean DEFAULT true,
    escalate_to_human boolean DEFAULT false,
    escalation_message text,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE bot_config.auto_answer_rules OWNER TO openwa;

--
-- Name: TABLE auto_answer_rules; Type: COMMENT; Schema: bot_config; Owner: openwa
--

COMMENT ON TABLE bot_config.auto_answer_rules IS 'Controls which topics are auto-answered vs escalated to human';


--
-- Name: COLUMN auto_answer_rules.topic; Type: COMMENT; Schema: bot_config; Owner: openwa
--

COMMENT ON COLUMN bot_config.auto_answer_rules.topic IS 'Category: honorarios, documentos, prazos, urgencia_violencia, etc';


--
-- Name: auto_answer_rules_id_seq; Type: SEQUENCE; Schema: bot_config; Owner: openwa
--

CREATE SEQUENCE bot_config.auto_answer_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE bot_config.auto_answer_rules_id_seq OWNER TO openwa;

--
-- Name: auto_answer_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: bot_config; Owner: openwa
--

ALTER SEQUENCE bot_config.auto_answer_rules_id_seq OWNED BY bot_config.auto_answer_rules.id;


--
-- Name: cron_jobs; Type: TABLE; Schema: bot_config; Owner: openwa
--

CREATE TABLE bot_config.cron_jobs (
    id character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    frequency_seconds integer NOT NULL,
    last_run timestamp without time zone,
    next_run timestamp without time zone,
    enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT cron_jobs_frequency_check CHECK ((frequency_seconds > 0))
);


ALTER TABLE bot_config.cron_jobs OWNER TO openwa;

--
-- Name: TABLE cron_jobs; Type: COMMENT; Schema: bot_config; Owner: openwa
--

COMMENT ON TABLE bot_config.cron_jobs IS 'Cron job configuration (frequency, enable/disable via dashboard)';


--
-- Name: audit_log; Type: TABLE; Schema: intake_staging; Owner: openwa
--

CREATE TABLE intake_staging.audit_log (
    id bigint NOT NULL,
    table_name character varying(100) NOT NULL,
    record_id uuid NOT NULL,
    operation character varying(10) NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by character varying(100) DEFAULT CURRENT_USER NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_operation_check CHECK (((operation)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'SOFT_DELETE'::character varying])::text[])))
);


ALTER TABLE intake_staging.audit_log OWNER TO openwa;

--
-- Name: TABLE audit_log; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON TABLE intake_staging.audit_log IS 'Audit trail - LGPD compliance, forensic capability, user accountability';


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: intake_staging; Owner: openwa
--

CREATE SEQUENCE intake_staging.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE intake_staging.audit_log_id_seq OWNER TO openwa;

--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: intake_staging; Owner: openwa
--

ALTER SEQUENCE intake_staging.audit_log_id_seq OWNED BY intake_staging.audit_log.id;


--
-- Name: case_types; Type: TABLE; Schema: intake_staging; Owner: openwa
--

CREATE TABLE intake_staging.case_types (
    code character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE intake_staging.case_types OWNER TO openwa;

--
-- Name: TABLE case_types; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON TABLE intake_staging.case_types IS 'Reference table for case types - eliminates magic strings';


--
-- Name: document_reminders; Type: TABLE; Schema: intake_staging; Owner: openwa
--

CREATE TABLE intake_staging.document_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    document_type character varying(50) NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_count integer DEFAULT 0 NOT NULL,
    last_reminder_at timestamp with time zone,
    next_reminder_at timestamp with time zone,
    reminder_frequency_hours integer DEFAULT 48 NOT NULL,
    max_reminders integer DEFAULT 3 NOT NULL,
    received boolean DEFAULT false NOT NULL,
    received_at timestamp with time zone,
    gave_up boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(100) DEFAULT CURRENT_USER NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(100) DEFAULT CURRENT_USER NOT NULL,
    CONSTRAINT document_reminders_frequency_check CHECK ((reminder_frequency_hours > 0)),
    CONSTRAINT document_reminders_max_reminders_check CHECK ((max_reminders > 0)),
    CONSTRAINT document_reminders_received_at_check CHECK ((((received = false) AND (received_at IS NULL)) OR ((received = true) AND (received_at IS NOT NULL)))),
    CONSTRAINT document_reminders_reminder_count_check CHECK ((reminder_count >= 0)),
    CONSTRAINT document_reminders_reminder_count_max_check CHECK ((reminder_count <= max_reminders))
);


ALTER TABLE intake_staging.document_reminders OWNER TO openwa;

--
-- Name: TABLE document_reminders; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON TABLE intake_staging.document_reminders IS 'Document reminder tracking with progressive escalation';


--
-- Name: document_types; Type: TABLE; Schema: intake_staging; Owner: openwa
--

CREATE TABLE intake_staging.document_types (
    code character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    required boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE intake_staging.document_types OWNER TO openwa;

--
-- Name: TABLE document_types; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON TABLE intake_staging.document_types IS 'Reference table for document types - eliminates magic strings';


--
-- Name: lawapp_sync_queue; Type: TABLE; Schema: intake_staging; Owner: openwa
--

CREATE TABLE intake_staging.lawapp_sync_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    sync_type character varying(50) NOT NULL,
    payload jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    next_retry_at timestamp with time zone,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    error_message jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(100) DEFAULT CURRENT_USER NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(100) DEFAULT CURRENT_USER NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT lawapp_sync_queue_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT lawapp_sync_queue_attempts_max_check CHECK ((attempts <= max_attempts)),
    CONSTRAINT lawapp_sync_queue_error_size_check CHECK (((error_message IS NULL) OR (pg_column_size(error_message) < 1048576))),
    CONSTRAINT lawapp_sync_queue_max_attempts_check CHECK ((max_attempts > 0)),
    CONSTRAINT lawapp_sync_queue_payload_size_check CHECK ((pg_column_size(payload) < 1048576)),
    CONSTRAINT lawapp_sync_queue_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE intake_staging.lawapp_sync_queue OWNER TO openwa;

--
-- Name: TABLE lawapp_sync_queue; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON TABLE intake_staging.lawapp_sync_queue IS 'Async LawApp sync queue with retry logic and structured errors';


--
-- Name: lead_documents; Type: TABLE; Schema: intake_staging; Owner: openwa
--

CREATE TABLE intake_staging.lead_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    document_type character varying(50) NOT NULL,
    file_name character varying(255),
    mime_type character varying(100),
    file_size_bytes bigint,
    storage_provider character varying(20),
    storage_path text NOT NULL,
    storage_url text,
    extracted_text text,
    structured_data jsonb,
    ocr_confidence double precision,
    validated boolean DEFAULT false NOT NULL,
    validated_by character varying(100),
    validated_at timestamp with time zone,
    validation_notes jsonb,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(100) DEFAULT CURRENT_USER NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(100) DEFAULT CURRENT_USER NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by character varying(100),
    CONSTRAINT lead_documents_file_size_check CHECK (((file_size_bytes IS NULL) OR (file_size_bytes > 0))),
    CONSTRAINT lead_documents_ocr_confidence_check CHECK (((ocr_confidence IS NULL) OR ((ocr_confidence >= (0)::double precision) AND (ocr_confidence <= (1)::double precision)))),
    CONSTRAINT lead_documents_storage_provider_check CHECK ((((storage_provider)::text = ANY ((ARRAY['minio'::character varying, 's3'::character varying, 'gdrive'::character varying])::text[])) OR (storage_provider IS NULL))),
    CONSTRAINT lead_documents_structured_data_size_check CHECK (((structured_data IS NULL) OR (pg_column_size(structured_data) < 1048576))),
    CONSTRAINT lead_documents_validated_at_check CHECK ((((validated = false) AND (validated_at IS NULL)) OR ((validated = true) AND (validated_at IS NOT NULL)))),
    CONSTRAINT lead_documents_validation_notes_size_check CHECK (((validation_notes IS NULL) OR (pg_column_size(validation_notes) < 1048576)))
);


ALTER TABLE intake_staging.lead_documents OWNER TO openwa;

--
-- Name: TABLE lead_documents; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON TABLE intake_staging.lead_documents IS 'Documents with OCR extraction - soft delete enabled, audit trail';


--
-- Name: COLUMN lead_documents.validation_notes; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON COLUMN intake_staging.lead_documents.validation_notes IS 'Structured: {status, issues: [{code, message}], reviewer}. Machine-parseable.';


--
-- Name: leads; Type: TABLE; Schema: intake_staging; Owner: openwa
--

CREATE TABLE intake_staging.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id character varying(100) NOT NULL,
    phone character varying(20),
    cpf_encrypted bytea,
    cpf_hash character varying(64),
    full_name character varying(200),
    birth_date date,
    email character varying(200),
    address jsonb,
    case_type character varying(50) NOT NULL,
    case_subtype character varying(50),
    urgency_level character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    case_data jsonb NOT NULL,
    documents_collected text[],
    documents_missing text[],
    intake_status character varying(50) DEFAULT 'in_progress'::character varying NOT NULL,
    intake_completed_at timestamp with time zone,
    intake_started_at timestamp with time zone DEFAULT now() NOT NULL,
    additional_opportunities jsonb,
    fee_structure jsonb,
    lawapp_synced boolean DEFAULT false NOT NULL,
    lawapp_opportunity_id uuid,
    lawapp_sync_attempted_at timestamp with time zone,
    lawapp_sync_error jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(100) DEFAULT CURRENT_USER NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(100) DEFAULT CURRENT_USER NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by character varying(100),
    CONSTRAINT leads_additional_opportunities_size_check CHECK (((additional_opportunities IS NULL) OR (pg_column_size(additional_opportunities) < 1048576))),
    CONSTRAINT leads_address_size_check CHECK (((address IS NULL) OR (pg_column_size(address) < 1048576))),
    CONSTRAINT leads_birth_date_check CHECK (((birth_date IS NULL) OR ((birth_date >= '1900-01-01'::date) AND (birth_date <= CURRENT_DATE)))),
    CONSTRAINT leads_case_data_size_check CHECK ((pg_column_size(case_data) < 1048576)),
    CONSTRAINT leads_chat_id_check CHECK (((chat_id)::text ~ '^[0-9]+(@.+)?$'::text)),
    CONSTRAINT leads_documents_collected_size_check CHECK (((documents_collected IS NULL) OR (array_length(documents_collected, 1) IS NULL) OR (array_length(documents_collected, 1) <= 1000))),
    CONSTRAINT leads_documents_missing_size_check CHECK (((documents_missing IS NULL) OR (array_length(documents_missing, 1) IS NULL) OR (array_length(documents_missing, 1) <= 1000))),
    CONSTRAINT leads_email_check CHECK (((email IS NULL) OR (((email)::text ~* '^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$'::text) AND ((email)::text !~ '\.\.'::text) AND (length(split_part((email)::text, '@'::text, 2)) >= 4) AND (split_part((email)::text, '.'::text, '-1'::integer) ~ '^[A-Za-z]{2,}$'::text)))),
    CONSTRAINT leads_fee_structure_size_check CHECK (((fee_structure IS NULL) OR (pg_column_size(fee_structure) < 1048576))),
    CONSTRAINT leads_intake_status_check CHECK (((intake_status)::text = ANY ((ARRAY['in_progress'::character varying, 'completed'::character varying, 'approved'::character varying, 'rejected'::character varying, 'stalled'::character varying])::text[]))),
    CONSTRAINT leads_phone_check CHECK (((phone IS NULL) OR ((phone)::text ~ '^\+?[1-9]\d{9,14}$'::text))),
    CONSTRAINT leads_urgency_level_check CHECK (((urgency_level)::text = ANY ((ARRAY['normal'::character varying, 'high'::character varying, 'critical'::character varying])::text[])))
);


ALTER TABLE intake_staging.leads OWNER TO openwa;

--
-- Name: TABLE leads; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON TABLE intake_staging.leads IS 'Lead intake staging - LGPD compliant with CPF encryption, soft delete, audit trail, and security constraints';


--
-- Name: COLUMN leads.cpf_encrypted; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON COLUMN intake_staging.leads.cpf_encrypted IS 'AES-256 encrypted CPF (pgcrypto). Use decrypt_cpf() to read. LGPD compliant.';


--
-- Name: COLUMN leads.cpf_hash; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON COLUMN intake_staging.leads.cpf_hash IS 'SHA-256 hash of CPF for uniqueness checks (non-reversible). Index-friendly.';


--
-- Name: COLUMN leads.case_data; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON COLUMN intake_staging.leads.case_data IS 'JSONB for case-specific data (age, work_duration, etc). Max 1MB. GIN indexed.';


--
-- Name: COLUMN leads.lawapp_sync_error; Type: COMMENT; Schema: intake_staging; Owner: openwa
--

COMMENT ON COLUMN intake_staging.leads.lawapp_sync_error IS 'Structured error: {code, message, details, timestamp}. Machine-parseable.';


--
-- Name: clients; Type: TABLE; Schema: knowledge; Owner: openwa
--

CREATE TABLE knowledge.clients (
    id integer NOT NULL,
    chat_id character varying(100) NOT NULL,
    phone character varying(20),
    cpf character varying(14),
    full_name character varying(200),
    first_seen timestamp without time zone DEFAULT now(),
    last_seen timestamp without time zone DEFAULT now(),
    total_messages integer DEFAULT 0,
    client_type character varying(50) DEFAULT 'new'::character varying,
    case_types text[],
    current_stage character varying(50) DEFAULT 'discovery'::character varying,
    lawapp_id uuid,
    metadata jsonb,
    context_summary text,
    CONSTRAINT clients_client_type_check CHECK (((client_type)::text = ANY ((ARRAY['new'::character varying, 'returning'::character varying, 'vip'::character varying])::text[]))),
    CONSTRAINT clients_current_stage_check CHECK (((current_stage)::text = ANY ((ARRAY['discovery'::character varying, 'intake'::character varying, 'documents'::character varying, 'approved'::character varying, 'rejected'::character varying, 'stalled'::character varying])::text[]))),
    CONSTRAINT clients_total_messages_check CHECK ((total_messages >= 0))
);


ALTER TABLE knowledge.clients OWNER TO openwa;

--
-- Name: TABLE clients; Type: COMMENT; Schema: knowledge; Owner: openwa
--

COMMENT ON TABLE knowledge.clients IS 'Client aggregation with metadata and LLM-generated summaries';


--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: knowledge; Owner: openwa
--

CREATE SEQUENCE knowledge.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE knowledge.clients_id_seq OWNER TO openwa;

--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: knowledge; Owner: openwa
--

ALTER SEQUENCE knowledge.clients_id_seq OWNED BY knowledge.clients.id;


--
-- Name: conversations; Type: TABLE; Schema: knowledge; Owner: openwa
--

CREATE TABLE knowledge.conversations (
    id integer NOT NULL,
    chat_id character varying(100) NOT NULL,
    message_id character varying(100) NOT NULL,
    session_id character varying(100),
    from_user character varying(100),
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    message_type character varying(20),
    message_text text,
    raw_media jsonb,
    storage_path text,
    extracted_data jsonb,
    embedding public.vector(1536),
    CONSTRAINT conversations_from_user_check CHECK (((from_user)::text = ANY ((ARRAY['client'::character varying, 'bot'::character varying])::text[]))),
    CONSTRAINT conversations_message_type_check CHECK (((message_type)::text = ANY ((ARRAY['text'::character varying, 'audio'::character varying, 'image'::character varying, 'document'::character varying, 'video'::character varying])::text[])))
);


ALTER TABLE knowledge.conversations OWNER TO openwa;

--
-- Name: TABLE conversations; Type: COMMENT; Schema: knowledge; Owner: openwa
--

COMMENT ON TABLE knowledge.conversations IS 'All WhatsApp messages with embeddings for semantic search';


--
-- Name: COLUMN conversations.embedding; Type: COMMENT; Schema: knowledge; Owner: openwa
--

COMMENT ON COLUMN knowledge.conversations.embedding IS 'OpenAI text-embedding-3-small (1536 dims)';


--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: knowledge; Owner: openwa
--

CREATE SEQUENCE knowledge.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE knowledge.conversations_id_seq OWNER TO openwa;

--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: knowledge; Owner: openwa
--

ALTER SEQUENCE knowledge.conversations_id_seq OWNED BY knowledge.conversations.id;


--
-- Name: documents; Type: TABLE; Schema: knowledge; Owner: openwa
--

CREATE TABLE knowledge.documents (
    id integer NOT NULL,
    client_id integer NOT NULL,
    conversation_id integer,
    document_type character varying(50) NOT NULL,
    file_name character varying(255),
    mime_type character varying(100),
    storage_path text NOT NULL,
    extracted_text text,
    structured_data jsonb,
    verified boolean DEFAULT false,
    uploaded_at timestamp without time zone DEFAULT now()
);


ALTER TABLE knowledge.documents OWNER TO openwa;

--
-- Name: TABLE documents; Type: COMMENT; Schema: knowledge; Owner: openwa
--

COMMENT ON TABLE knowledge.documents IS 'Files uploaded by clients (RG, CPF, etc) with OCR extraction';


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: knowledge; Owner: openwa
--

CREATE SEQUENCE knowledge.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE knowledge.documents_id_seq OWNER TO openwa;

--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: knowledge; Owner: openwa
--

ALTER SEQUENCE knowledge.documents_id_seq OWNED BY knowledge.documents.id;


--
-- Name: faq; Type: TABLE; Schema: knowledge; Owner: openwa
--

CREATE TABLE knowledge.faq (
    id integer NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    category character varying(50),
    keywords text[],
    use_count integer DEFAULT 0,
    last_used timestamp without time zone,
    embedding public.vector(1536),
    CONSTRAINT faq_use_count_check CHECK ((use_count >= 0))
);


ALTER TABLE knowledge.faq OWNER TO openwa;

--
-- Name: TABLE faq; Type: COMMENT; Schema: knowledge; Owner: openwa
--

COMMENT ON TABLE knowledge.faq IS 'Frequent questions with embeddings for zero-cost Layer 1 matching';


--
-- Name: faq_id_seq; Type: SEQUENCE; Schema: knowledge; Owner: openwa
--

CREATE SEQUENCE knowledge.faq_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE knowledge.faq_id_seq OWNER TO openwa;

--
-- Name: faq_id_seq; Type: SEQUENCE OWNED BY; Schema: knowledge; Owner: openwa
--

ALTER SEQUENCE knowledge.faq_id_seq OWNED BY knowledge.faq.id;


--
-- Name: session_context; Type: TABLE; Schema: knowledge; Owner: openwa
--

CREATE TABLE knowledge.session_context (
    session_id character varying(100) NOT NULL,
    chat_id character varying(100) NOT NULL,
    current_flow character varying(50),
    current_step character varying(50),
    collected_data jsonb,
    pending_questions text[],
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE knowledge.session_context OWNER TO openwa;

--
-- Name: TABLE session_context; Type: COMMENT; Schema: knowledge; Owner: openwa
--

COMMENT ON TABLE knowledge.session_context IS 'Active conversation state (intake flow, collected data)';


--
-- Name: client_tasks; Type: TABLE; Schema: telegram; Owner: openwa
--

CREATE TABLE telegram.client_tasks (
    id integer NOT NULL,
    lead_id integer,
    task_type character varying(50) NOT NULL,
    task_data jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    sent_at timestamp without time zone,
    answered_at timestamp without time zone,
    client_response text,
    client_response_data jsonb,
    CONSTRAINT client_tasks_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'answered'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT client_tasks_task_type_check CHECK (((task_type)::text = ANY ((ARRAY['ask_question'::character varying, 'request_document'::character varying, 'schedule_call'::character varying])::text[])))
);


ALTER TABLE telegram.client_tasks OWNER TO openwa;

--
-- Name: TABLE client_tasks; Type: COMMENT; Schema: telegram; Owner: openwa
--

COMMENT ON TABLE telegram.client_tasks IS 'Tasks team requests bot to execute via WhatsApp';


--
-- Name: COLUMN client_tasks.task_data; Type: COMMENT; Schema: telegram; Owner: openwa
--

COMMENT ON COLUMN telegram.client_tasks.task_data IS 'JSONB: {question, context, requested_by_user}';


--
-- Name: client_tasks_id_seq; Type: SEQUENCE; Schema: telegram; Owner: openwa
--

CREATE SEQUENCE telegram.client_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE telegram.client_tasks_id_seq OWNER TO openwa;

--
-- Name: client_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: telegram; Owner: openwa
--

ALTER SEQUENCE telegram.client_tasks_id_seq OWNED BY telegram.client_tasks.id;


--
-- Name: lead_topics; Type: TABLE; Schema: telegram; Owner: openwa
--

CREATE TABLE telegram.lead_topics (
    lead_id integer NOT NULL,
    telegram_group_id bigint NOT NULL,
    telegram_topic_id bigint NOT NULL,
    topic_created_at timestamp without time zone DEFAULT now(),
    topic_title character varying(200),
    is_archived boolean DEFAULT false
);


ALTER TABLE telegram.lead_topics OWNER TO openwa;

--
-- Name: TABLE lead_topics; Type: COMMENT; Schema: telegram; Owner: openwa
--

COMMENT ON TABLE telegram.lead_topics IS 'Maps each lead to a Telegram Supergroup topic (thread)';


--
-- Name: topic_context; Type: TABLE; Schema: telegram; Owner: openwa
--

CREATE TABLE telegram.topic_context (
    topic_id bigint NOT NULL,
    lead_id integer,
    conversation_summary text,
    team_decisions jsonb[],
    mentioned_documents text[],
    last_updated timestamp without time zone DEFAULT now()
);


ALTER TABLE telegram.topic_context OWNER TO openwa;

--
-- Name: TABLE topic_context; Type: COMMENT; Schema: telegram; Owner: openwa
--

COMMENT ON TABLE telegram.topic_context IS 'Persistent context of team discussion in Telegram';


--
-- Name: user_permissions; Type: TABLE; Schema: telegram; Owner: openwa
--

CREATE TABLE telegram.user_permissions (
    telegram_user_id bigint NOT NULL,
    full_name character varying(200),
    role character varying(50),
    can_approve_leads boolean DEFAULT false,
    can_reject_leads boolean DEFAULT false,
    can_ask_client boolean DEFAULT true,
    can_view_documents boolean DEFAULT true,
    can_calculate_fees boolean DEFAULT true,
    added_at timestamp without time zone DEFAULT now(),
    added_by_user_id bigint,
    CONSTRAINT user_permissions_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'intake'::character varying, 'paralegal'::character varying, 'viewer'::character varying])::text[])))
);


ALTER TABLE telegram.user_permissions OWNER TO openwa;

--
-- Name: TABLE user_permissions; Type: COMMENT; Schema: telegram; Owner: openwa
--

COMMENT ON TABLE telegram.user_permissions IS 'Telegram user access control (future multi-tenancy)';


--
-- Name: auto_answer_rules id; Type: DEFAULT; Schema: bot_config; Owner: openwa
--

ALTER TABLE ONLY bot_config.auto_answer_rules ALTER COLUMN id SET DEFAULT nextval('bot_config.auto_answer_rules_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.audit_log ALTER COLUMN id SET DEFAULT nextval('intake_staging.audit_log_id_seq'::regclass);


--
-- Name: clients id; Type: DEFAULT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.clients ALTER COLUMN id SET DEFAULT nextval('knowledge.clients_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.conversations ALTER COLUMN id SET DEFAULT nextval('knowledge.conversations_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.documents ALTER COLUMN id SET DEFAULT nextval('knowledge.documents_id_seq'::regclass);


--
-- Name: faq id; Type: DEFAULT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.faq ALTER COLUMN id SET DEFAULT nextval('knowledge.faq_id_seq'::regclass);


--
-- Name: client_tasks id; Type: DEFAULT; Schema: telegram; Owner: openwa
--

ALTER TABLE ONLY telegram.client_tasks ALTER COLUMN id SET DEFAULT nextval('telegram.client_tasks_id_seq'::regclass);


--
-- Name: auto_answer_rules auto_answer_rules_pkey; Type: CONSTRAINT; Schema: bot_config; Owner: openwa
--

ALTER TABLE ONLY bot_config.auto_answer_rules
    ADD CONSTRAINT auto_answer_rules_pkey PRIMARY KEY (id);


--
-- Name: auto_answer_rules auto_answer_rules_topic_key; Type: CONSTRAINT; Schema: bot_config; Owner: openwa
--

ALTER TABLE ONLY bot_config.auto_answer_rules
    ADD CONSTRAINT auto_answer_rules_topic_key UNIQUE (topic);


--
-- Name: cron_jobs cron_jobs_pkey; Type: CONSTRAINT; Schema: bot_config; Owner: openwa
--

ALTER TABLE ONLY bot_config.cron_jobs
    ADD CONSTRAINT cron_jobs_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: case_types case_types_pkey; Type: CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.case_types
    ADD CONSTRAINT case_types_pkey PRIMARY KEY (code);


--
-- Name: document_reminders document_reminders_pkey; Type: CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.document_reminders
    ADD CONSTRAINT document_reminders_pkey PRIMARY KEY (id);


--
-- Name: document_types document_types_pkey; Type: CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.document_types
    ADD CONSTRAINT document_types_pkey PRIMARY KEY (code);


--
-- Name: lawapp_sync_queue lawapp_sync_queue_pkey; Type: CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.lawapp_sync_queue
    ADD CONSTRAINT lawapp_sync_queue_pkey PRIMARY KEY (id);


--
-- Name: lead_documents lead_documents_pkey; Type: CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.lead_documents
    ADD CONSTRAINT lead_documents_pkey PRIMARY KEY (id);


--
-- Name: leads leads_chat_id_unique; Type: CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.leads
    ADD CONSTRAINT leads_chat_id_unique UNIQUE (chat_id);


--
-- Name: leads leads_cpf_hash_unique; Type: CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.leads
    ADD CONSTRAINT leads_cpf_hash_unique UNIQUE (cpf_hash);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: clients clients_chat_id_key; Type: CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.clients
    ADD CONSTRAINT clients_chat_id_key UNIQUE (chat_id);


--
-- Name: clients clients_cpf_key; Type: CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.clients
    ADD CONSTRAINT clients_cpf_key UNIQUE (cpf);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_message_id_key; Type: CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.conversations
    ADD CONSTRAINT conversations_message_id_key UNIQUE (message_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: faq faq_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.faq
    ADD CONSTRAINT faq_pkey PRIMARY KEY (id);


--
-- Name: session_context session_context_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.session_context
    ADD CONSTRAINT session_context_pkey PRIMARY KEY (session_id);


--
-- Name: client_tasks client_tasks_pkey; Type: CONSTRAINT; Schema: telegram; Owner: openwa
--

ALTER TABLE ONLY telegram.client_tasks
    ADD CONSTRAINT client_tasks_pkey PRIMARY KEY (id);


--
-- Name: lead_topics lead_topics_pkey; Type: CONSTRAINT; Schema: telegram; Owner: openwa
--

ALTER TABLE ONLY telegram.lead_topics
    ADD CONSTRAINT lead_topics_pkey PRIMARY KEY (lead_id);


--
-- Name: topic_context topic_context_pkey; Type: CONSTRAINT; Schema: telegram; Owner: openwa
--

ALTER TABLE ONLY telegram.topic_context
    ADD CONSTRAINT topic_context_pkey PRIMARY KEY (topic_id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: telegram; Owner: openwa
--

ALTER TABLE ONLY telegram.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (telegram_user_id);


--
-- Name: idx_auto_answer_rules_topic; Type: INDEX; Schema: bot_config; Owner: openwa
--

CREATE INDEX idx_auto_answer_rules_topic ON bot_config.auto_answer_rules USING btree (topic);


--
-- Name: idx_cron_jobs_next_run; Type: INDEX; Schema: bot_config; Owner: openwa
--

CREATE INDEX idx_cron_jobs_next_run ON bot_config.cron_jobs USING btree (next_run) WHERE (enabled = true);


--
-- Name: idx_audit_log_changed_at; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_audit_log_changed_at ON intake_staging.audit_log USING btree (changed_at DESC);


--
-- Name: idx_audit_log_changed_by; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_audit_log_changed_by ON intake_staging.audit_log USING btree (changed_by);


--
-- Name: idx_audit_log_table_record; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_audit_log_table_record ON intake_staging.audit_log USING btree (table_name, record_id);


--
-- Name: idx_document_reminders_lead; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_document_reminders_lead ON intake_staging.document_reminders USING btree (lead_id);


--
-- Name: idx_document_reminders_pending; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_document_reminders_pending ON intake_staging.document_reminders USING btree (next_reminder_at) WHERE ((received = false) AND (gave_up = false) AND (next_reminder_at IS NOT NULL));


--
-- Name: idx_document_reminders_status; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_document_reminders_status ON intake_staging.document_reminders USING btree (received, gave_up);


--
-- Name: idx_lawapp_sync_queue_attempts; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lawapp_sync_queue_attempts ON intake_staging.lawapp_sync_queue USING btree (attempts, status) WHERE ((status)::text = 'failed'::text);


--
-- Name: idx_lawapp_sync_queue_created; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lawapp_sync_queue_created ON intake_staging.lawapp_sync_queue USING btree (created_at DESC);


--
-- Name: idx_lawapp_sync_queue_lead; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lawapp_sync_queue_lead ON intake_staging.lawapp_sync_queue USING btree (lead_id);


--
-- Name: idx_lawapp_sync_queue_pending; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lawapp_sync_queue_pending ON intake_staging.lawapp_sync_queue USING btree (status, next_retry_at) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying])::text[]));


--
-- Name: idx_lead_documents_deleted; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lead_documents_deleted ON intake_staging.lead_documents USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_lead_documents_file_name; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lead_documents_file_name ON intake_staging.lead_documents USING btree (file_name) WHERE ((file_name IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_lead_documents_lead; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lead_documents_lead ON intake_staging.lead_documents USING btree (lead_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_lead_documents_lead_type; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lead_documents_lead_type ON intake_staging.lead_documents USING btree (lead_id, document_type) WHERE (deleted_at IS NULL);


--
-- Name: idx_lead_documents_structured_data_gin; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lead_documents_structured_data_gin ON intake_staging.lead_documents USING gin (structured_data);


--
-- Name: idx_lead_documents_type; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lead_documents_type ON intake_staging.lead_documents USING btree (document_type) WHERE (deleted_at IS NULL);


--
-- Name: idx_lead_documents_uploaded; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lead_documents_uploaded ON intake_staging.lead_documents USING btree (uploaded_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_lead_documents_validated; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_lead_documents_validated ON intake_staging.lead_documents USING btree (validated) WHERE (deleted_at IS NULL);


--
-- Name: idx_leads_additional_opportunities_gin; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_additional_opportunities_gin ON intake_staging.leads USING gin (additional_opportunities);


--
-- Name: idx_leads_address_gin; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_address_gin ON intake_staging.leads USING gin (address);


--
-- Name: idx_leads_case_data_gin; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_case_data_gin ON intake_staging.leads USING gin (case_data);


--
-- Name: idx_leads_chat; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_chat ON intake_staging.leads USING btree (chat_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_leads_cpf_hash; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_cpf_hash ON intake_staging.leads USING btree (cpf_hash) WHERE ((cpf_hash IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_leads_created; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_created ON intake_staging.leads USING btree (created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_leads_deleted; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_deleted ON intake_staging.leads USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_leads_email; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_email ON intake_staging.leads USING btree (email) WHERE ((email IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_leads_fee_structure_gin; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_fee_structure_gin ON intake_staging.leads USING gin (fee_structure);


--
-- Name: idx_leads_pending_sync; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_pending_sync ON intake_staging.leads USING btree (lawapp_synced, intake_status, updated_at) WHERE ((deleted_at IS NULL) AND (lawapp_synced = false));


--
-- Name: idx_leads_phone; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_phone ON intake_staging.leads USING btree (phone) WHERE ((phone IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_leads_priority_queue; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_priority_queue ON intake_staging.leads USING btree (intake_status, urgency_level, created_at DESC) WHERE ((deleted_at IS NULL) AND ((intake_status)::text = 'in_progress'::text));


--
-- Name: idx_leads_status_sync; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_status_sync ON intake_staging.leads USING btree (intake_status, lawapp_synced) WHERE (deleted_at IS NULL);


--
-- Name: idx_leads_urgency; Type: INDEX; Schema: intake_staging; Owner: openwa
--

CREATE INDEX idx_leads_urgency ON intake_staging.leads USING btree (urgency_level) WHERE (deleted_at IS NULL);


--
-- Name: idx_clients_cpf; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_clients_cpf ON knowledge.clients USING btree (cpf) WHERE (cpf IS NOT NULL);


--
-- Name: idx_clients_last_seen; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_clients_last_seen ON knowledge.clients USING btree (last_seen DESC);


--
-- Name: idx_clients_lawapp; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_clients_lawapp ON knowledge.clients USING btree (lawapp_id) WHERE (lawapp_id IS NOT NULL);


--
-- Name: idx_clients_phone; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_clients_phone ON knowledge.clients USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: idx_clients_stage; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_clients_stage ON knowledge.clients USING btree (current_stage);


--
-- Name: idx_conversations_chat_timestamp; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_conversations_chat_timestamp ON knowledge.conversations USING btree (chat_id, "timestamp");


--
-- Name: idx_conversations_embedding; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_conversations_embedding ON knowledge.conversations USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: INDEX idx_conversations_embedding; Type: COMMENT; Schema: knowledge; Owner: openwa
--

COMMENT ON INDEX knowledge.idx_conversations_embedding IS 'IVFFlat index for cosine similarity search (100 clusters)';


--
-- Name: idx_conversations_from_user; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_conversations_from_user ON knowledge.conversations USING btree (from_user);


--
-- Name: idx_conversations_message_type; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_conversations_message_type ON knowledge.conversations USING btree (message_type);


--
-- Name: idx_conversations_session; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_conversations_session ON knowledge.conversations USING btree (session_id);


--
-- Name: idx_documents_client; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_documents_client ON knowledge.documents USING btree (client_id);


--
-- Name: idx_documents_type; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_documents_type ON knowledge.documents USING btree (document_type);


--
-- Name: idx_documents_uploaded; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_documents_uploaded ON knowledge.documents USING btree (uploaded_at DESC);


--
-- Name: idx_documents_verified; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_documents_verified ON knowledge.documents USING btree (verified);


--
-- Name: idx_faq_category; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_faq_category ON knowledge.faq USING btree (category);


--
-- Name: idx_faq_embedding; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_faq_embedding ON knowledge.faq USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='10');


--
-- Name: idx_session_chat; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_session_chat ON knowledge.session_context USING btree (chat_id);


--
-- Name: idx_session_expires; Type: INDEX; Schema: knowledge; Owner: openwa
--

CREATE INDEX idx_session_expires ON knowledge.session_context USING btree (expires_at);


--
-- Name: idx_client_tasks_created; Type: INDEX; Schema: telegram; Owner: openwa
--

CREATE INDEX idx_client_tasks_created ON telegram.client_tasks USING btree (created_at DESC);


--
-- Name: idx_client_tasks_pending; Type: INDEX; Schema: telegram; Owner: openwa
--

CREATE INDEX idx_client_tasks_pending ON telegram.client_tasks USING btree (lead_id, status) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_lead_topics_archived; Type: INDEX; Schema: telegram; Owner: openwa
--

CREATE INDEX idx_lead_topics_archived ON telegram.lead_topics USING btree (is_archived);


--
-- Name: idx_lead_topics_group; Type: INDEX; Schema: telegram; Owner: openwa
--

CREATE INDEX idx_lead_topics_group ON telegram.lead_topics USING btree (telegram_group_id);


--
-- Name: idx_topic_context_lead; Type: INDEX; Schema: telegram; Owner: openwa
--

CREATE INDEX idx_topic_context_lead ON telegram.topic_context USING btree (lead_id);


--
-- Name: idx_user_permissions_role; Type: INDEX; Schema: telegram; Owner: openwa
--

CREATE INDEX idx_user_permissions_role ON telegram.user_permissions USING btree (role);


--
-- Name: document_reminders trigger_audit; Type: TRIGGER; Schema: intake_staging; Owner: openwa
--

CREATE TRIGGER trigger_audit AFTER INSERT OR DELETE OR UPDATE ON intake_staging.document_reminders FOR EACH ROW EXECUTE FUNCTION intake_staging.audit_trigger_func();


--
-- Name: lawapp_sync_queue trigger_audit; Type: TRIGGER; Schema: intake_staging; Owner: openwa
--

CREATE TRIGGER trigger_audit AFTER INSERT OR DELETE OR UPDATE ON intake_staging.lawapp_sync_queue FOR EACH ROW EXECUTE FUNCTION intake_staging.audit_trigger_func();


--
-- Name: lead_documents trigger_audit; Type: TRIGGER; Schema: intake_staging; Owner: openwa
--

CREATE TRIGGER trigger_audit AFTER INSERT OR DELETE OR UPDATE ON intake_staging.lead_documents FOR EACH ROW EXECUTE FUNCTION intake_staging.audit_trigger_func();


--
-- Name: leads trigger_audit; Type: TRIGGER; Schema: intake_staging; Owner: openwa
--

CREATE TRIGGER trigger_audit AFTER INSERT OR DELETE OR UPDATE ON intake_staging.leads FOR EACH ROW EXECUTE FUNCTION intake_staging.audit_trigger_func();


--
-- Name: document_reminders trigger_update_updated_at; Type: TRIGGER; Schema: intake_staging; Owner: openwa
--

CREATE TRIGGER trigger_update_updated_at BEFORE UPDATE ON intake_staging.document_reminders FOR EACH ROW EXECUTE FUNCTION intake_staging.update_updated_at_column();


--
-- Name: lawapp_sync_queue trigger_update_updated_at; Type: TRIGGER; Schema: intake_staging; Owner: openwa
--

CREATE TRIGGER trigger_update_updated_at BEFORE UPDATE ON intake_staging.lawapp_sync_queue FOR EACH ROW EXECUTE FUNCTION intake_staging.update_updated_at_column();


--
-- Name: lead_documents trigger_update_updated_at; Type: TRIGGER; Schema: intake_staging; Owner: openwa
--

CREATE TRIGGER trigger_update_updated_at BEFORE UPDATE ON intake_staging.lead_documents FOR EACH ROW EXECUTE FUNCTION intake_staging.update_updated_at_column();


--
-- Name: leads trigger_update_updated_at; Type: TRIGGER; Schema: intake_staging; Owner: openwa
--

CREATE TRIGGER trigger_update_updated_at BEFORE UPDATE ON intake_staging.leads FOR EACH ROW EXECUTE FUNCTION intake_staging.update_updated_at_column();


--
-- Name: document_reminders document_reminders_document_type_fkey; Type: FK CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.document_reminders
    ADD CONSTRAINT document_reminders_document_type_fkey FOREIGN KEY (document_type) REFERENCES intake_staging.document_types(code);


--
-- Name: document_reminders document_reminders_lead_id_fkey; Type: FK CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.document_reminders
    ADD CONSTRAINT document_reminders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES intake_staging.leads(id) ON DELETE CASCADE;


--
-- Name: lawapp_sync_queue lawapp_sync_queue_lead_id_fkey; Type: FK CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.lawapp_sync_queue
    ADD CONSTRAINT lawapp_sync_queue_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES intake_staging.leads(id) ON DELETE CASCADE;


--
-- Name: lead_documents lead_documents_document_type_fkey; Type: FK CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.lead_documents
    ADD CONSTRAINT lead_documents_document_type_fkey FOREIGN KEY (document_type) REFERENCES intake_staging.document_types(code);


--
-- Name: lead_documents lead_documents_lead_id_fkey; Type: FK CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.lead_documents
    ADD CONSTRAINT lead_documents_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES intake_staging.leads(id) ON DELETE CASCADE;


--
-- Name: leads leads_case_type_fkey; Type: FK CONSTRAINT; Schema: intake_staging; Owner: openwa
--

ALTER TABLE ONLY intake_staging.leads
    ADD CONSTRAINT leads_case_type_fkey FOREIGN KEY (case_type) REFERENCES intake_staging.case_types(code);


--
-- Name: documents documents_client_id_fkey; Type: FK CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.documents
    ADD CONSTRAINT documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES knowledge.clients(id) ON DELETE CASCADE;


--
-- Name: documents documents_conversation_id_fkey; Type: FK CONSTRAINT; Schema: knowledge; Owner: openwa
--

ALTER TABLE ONLY knowledge.documents
    ADD CONSTRAINT documents_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES knowledge.conversations(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict AyHvflVG11vziev1nKNzu4vR04W15hwobc09NcXu3aSIXngYzWMnZRKSIS7xmGi

