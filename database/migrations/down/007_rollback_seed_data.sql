-- database/migrations/down/007_rollback_seed_data.sql
-- Rollback seed data (safe, non-destructive)

BEGIN;

\echo 'Rolling back seed data...'

-- Remove seeded FAQ entries
DELETE FROM knowledge.faq
WHERE question IN (
    'Quanto tempo demora para receber meu benefício após a aprovação?',
    'Preciso comparecer ao INSS pessoalmente?',
    'Quais documentos preciso enviar?',
    'Como funciona o pagamento dos honorários?',
    'Posso acompanhar meu processo online?'
);

-- Remove seeded cron jobs
DELETE FROM bot_config.cron_jobs
WHERE job_name IN (
    'document_reminder',
    'lawapp_sync',
    'faq_usage_report',
    'stale_leads_cleanup'
);

-- Remove seeded auto-answer rules
DELETE FROM bot_config.auto_answer_rules
WHERE trigger_keywords && ARRAY['horário', 'endereço', 'taxa', 'início']::TEXT[];

-- Record rollback
UPDATE public.schema_migrations
SET name = name || ' (rolled back)'
WHERE version = '007_seed_data';

\echo '✓ Seed data rollback complete'

COMMIT;
