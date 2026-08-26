-- database/tests/fixtures/teardown_test_env.sql
-- Clean up test environment after test execution

\echo '🧹 Cleaning up test environment...'

-- Clean all test data from production tables
SELECT test_fixtures.clean_test_data();

-- Drop test schema if exists
-- DROP SCHEMA IF EXISTS test_fixtures CASCADE;

\echo '✅ Test environment cleanup complete'
\echo 'ℹ️  Note: test_fixtures schema kept for reuse. Run DROP SCHEMA test_fixtures CASCADE to remove permanently.'
