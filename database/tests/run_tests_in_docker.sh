#!/bin/bash
# Run Python performance tests inside Docker container

set -e

echo "🧪 Running Performance Tests in Docker..."

# Copy test file into container
docker compose cp database/tests/validate_performance_v2_aaa.py postgres:/tmp/

# Install dependencies and run tests
docker compose exec -T postgres bash -c "
    apt-get update -qq && apt-get install -y -qq python3-pip python3-psutil > /dev/null 2>&1
    pip3 install --quiet psycopg2-binary numpy 2>&1 | grep -v 'Defaulting to user installation'

    export POSTGRES_HOST=localhost
    export POSTGRES_PORT=5432
    export POSTGRES_DB=openwa
    export POSTGRES_USER=openwa
    export POSTGRES_PASSWORD=''

    python3 /tmp/validate_performance_v2_aaa.py
"

echo "✅ Tests completed"
