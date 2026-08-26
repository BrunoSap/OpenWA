# Database Migrations

## Quick Start

### Prerequisites
- PostgreSQL 15+ with pgvector extension
- Python 3.11+ (for performance tests)
- psql CLI

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
cd database/scripts
./rollback.sh
# Type "yes" to confirm
```

### Test schema
```bash
# Run all tests
cd database/tests
./run_all_tests.sh

# Or run individual tests
psql -h $POSTGRES_HOST -d $POSTGRES_DB -U $POSTGRES_USER -f test_schema_creation.sql
psql -h $POSTGRES_HOST -d $POSTGRES_DB -U $POSTGRES_USER -f test_helper_functions.sql
psql -h $POSTGRES_HOST -d $POSTGRES_DB -U $POSTGRES_USER -f test_fixtures.sql

# Performance test
python3 ../scripts/validate_performance.py
```

## Migration Order
1. `001_install_pgvector.sql` - Install pgvector extension
2. `002_create_schema_knowledge.sql` - Knowledge management tables
3. `003_create_schema_intake_staging.sql` - Lead intake staging
4. `004_create_schema_telegram.sql` - Telegram integration
5. `005_create_schema_bot_config.sql` - Bot configuration
6. `006_create_helper_functions.sql` - SQL helper functions
7. `007_seed_data.sql` - Initial data (FAQ, policies, cron jobs)

## Troubleshooting

### "pgvector extension not found"
```bash
# Install pgvector from source
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install

# Or use package manager (macOS)
brew install pgvector

# Or Docker
docker run -d --name postgres-pgvector \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  pgvector/pgvector:pg15
```

### "role postgres does not exist"
```bash
# Create postgres role
createuser -s postgres

# Or use your existing user
export POSTGRES_USER=your_username
```

### "permission denied for schema"
```bash
# Grant permissions
psql -d openwa -c "GRANT ALL ON SCHEMA knowledge TO your_user;"
psql -d openwa -c "GRANT ALL ON SCHEMA intake_staging TO your_user;"
psql -d openwa -c "GRANT ALL ON SCHEMA telegram TO your_user;"
psql -d openwa -c "GRANT ALL ON SCHEMA bot_config TO your_user;"
```

### Slow similarity search (> 50ms)
```bash
# Increase shared_buffers in postgresql.conf
shared_buffers = 256MB  # Adjust based on RAM

# Rebuild IVFFlat index with more lists
# Formula: lists = sqrt(n_rows)
# Example for 10k rows: lists = 100
# Example for 100k rows: lists = 316

psql -d openwa -c "
  DROP INDEX knowledge.idx_conversations_embedding;
  CREATE INDEX idx_conversations_embedding 
  ON knowledge.conversations 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 316);
"
```

## Performance Tuning

### Optimal IVFFlat lists parameter
| Rows | Lists |
|------|-------|
| 1K   | 32    |
| 10K  | 100   |
| 100K | 316   |
| 1M   | 1000  |

### PostgreSQL configuration
```ini
# postgresql.conf recommendations
shared_buffers = 256MB          # 25% of RAM
effective_cache_size = 1GB      # 50-75% of RAM
maintenance_work_mem = 128MB    # For index builds
work_mem = 16MB                 # Per query
```

## Documentation

- [SCHEMA.md](SCHEMA.md) - Complete schema documentation
- [PERFORMANCE.md](PERFORMANCE.md) - Performance test results
- [Phase 1 Plan](../docs/superpowers/plans/2026-08-25-phase1-schema-pgvector.md) - Implementation plan

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review test output for specific error messages
3. Verify PostgreSQL logs: `tail -f /var/log/postgresql/postgresql.log`
