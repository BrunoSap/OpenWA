#!/bin/bash
# Run performance test inside Docker network
# This script creates a temporary Python container that can access postgres

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🐳 Running performance test via Docker..."
echo ""

# Create temporary Dockerfile for test runner
cat > "$SCRIPT_DIR/Dockerfile.test" <<'EOF'
FROM python:3.9-slim

WORKDIR /test

# Install dependencies
COPY database/tests/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy test script
COPY database/scripts/validate_performance.py .

CMD ["python3", "validate_performance.py"]
EOF

# Build test image
docker build -f "$SCRIPT_DIR/Dockerfile.test" -t openwa-perf-test "$PROJECT_ROOT"

# Run test with access to postgres network
docker run --rm \
  --network openwa_default \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=openwa \
  -e POSTGRES_USER=openwa \
  -e POSTGRES_PASSWORD="" \
  openwa-perf-test

# Cleanup
rm -f "$SCRIPT_DIR/Dockerfile.test"

echo ""
echo "✅ Performance test complete!"
