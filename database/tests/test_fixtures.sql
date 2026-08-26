-- database/tests/test_fixtures.sql
-- Test that seed data was inserted correctly

\echo '🧪 Testing seed data...'

-- Test auto_answer_rules
DO $$
DECLARE
    count INT;
BEGIN
    SELECT COUNT(*) INTO count FROM bot_config.auto_answer_rules;
    IF count != 4 THEN
        RAISE EXCEPTION 'FAIL: Expected 4 auto_answer_rules, got %', count;
    END IF;
    RAISE NOTICE '✅ PASS: 4 auto_answer_rules seeded';
END $$;

-- Test cron_jobs
DO $$
DECLARE
    count INT;
BEGIN
    SELECT COUNT(*) INTO count FROM bot_config.cron_jobs;
    IF count != 4 THEN
        RAISE EXCEPTION 'FAIL: Expected 4 cron_jobs, got %', count;
    END IF;
    RAISE NOTICE '✅ PASS: 4 cron_jobs seeded';
END $$;

-- Test FAQ
DO $$
DECLARE
    count INT;
BEGIN
    SELECT COUNT(*) INTO count FROM knowledge.faq;
    IF count != 5 THEN
        RAISE EXCEPTION 'FAIL: Expected 5 FAQ entries, got %', count;
    END IF;
    RAISE NOTICE '✅ PASS: 5 FAQ entries seeded';
END $$;

-- Test honorarios policy
DO $$
DECLARE
    policy RECORD;
BEGIN
    SELECT * INTO policy FROM bot_config.auto_answer_rules WHERE topic = 'honorarios';
    IF policy.auto_answer_enabled = TRUE THEN
        RAISE EXCEPTION 'FAIL: honorarios should be escalated to human';
    END IF;
    RAISE NOTICE '✅ PASS: honorarios correctly configured to escalate';
END $$;

\echo '✅ All seed data tests passed!'
