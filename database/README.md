# Database Migrations

## Quick Start

### Run all migrations
```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=openwa
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=your_password

cd database/scripts
chmod +x run_migrations.sh
./run_migrations.sh
```

### Rollback (WARNING: Deletes all data)
```bash
./rollback.sh
```

### Test schema
```bash
psql -h $POSTGRES_HOST -d $POSTGRES_DB -U $POSTGRES_USER -f tests/test_schema_creation.sql
```

## Migration Order
1. `001_install_pgvector.sql` - Install pgvector extension
2. `002_create_schema_knowledge.sql` - Knowledge management tables
3. `003_create_schema_intake_staging.sql` - Lead intake staging
4. `004_create_schema_telegram.sql` - Telegram integration
5. `005_create_schema_bot_config.sql` - Bot configuration
6. `006_create_helper_functions.sql` - SQL helper functions
7. `007_seed_data.sql` - Initial data (FAQ, policies, cron jobs)
