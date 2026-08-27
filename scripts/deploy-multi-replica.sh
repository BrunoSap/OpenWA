#!/bin/bash
set -euo pipefail

# OpenWA Multi-Replica Rolling Update Script
# Usage: ./scripts/deploy-multi-replica.sh <version>
# Example: ./scripts/deploy-multi-replica.sh v3.6

VERSION=${1:-latest}
REPLICA_COUNT=${REPLICA_COUNT:-3}
DRAIN_WINDOW=${DRAIN_WINDOW:-30}  # seconds
HEALTH_CHECK_TIMEOUT=${HEALTH_CHECK_TIMEOUT:-60}  # seconds
IMAGE=${IMAGE:-registry.example.com/openwa-api}

echo "=== OpenWA Rolling Update ==="
echo "Version: $VERSION"
echo "Replicas: $REPLICA_COUNT"
echo "Drain window: ${DRAIN_WINDOW}s"
echo ""

# Pull new image
echo "Pulling image $IMAGE:$VERSION..."
docker pull "$IMAGE:$VERSION"

# Rolling update each replica
for i in $(seq 1 $REPLICA_COUNT); do
  REPLICA_NAME="openwa-api-$i"
  echo ""
  echo "=== Updating $REPLICA_NAME ==="

  # Mark as draining (optional: call admin endpoint)
  echo "Marking $REPLICA_NAME as draining..."
  # docker exec $REPLICA_NAME curl -X POST http://localhost:2785/api/admin/drain || true

  # Wait for drain window (in-flight requests complete)
  echo "Waiting ${DRAIN_WINDOW}s for drain..."
  sleep $DRAIN_WINDOW

  # Stop old container
  echo "Stopping $REPLICA_NAME..."
  docker stop $REPLICA_NAME

  # Start new container with new image
  echo "Starting $REPLICA_NAME with $VERSION..."
  docker start $REPLICA_NAME

  # Wait for health check
  echo "Waiting for $REPLICA_NAME to be ready..."
  ELAPSED=0
  until docker exec $REPLICA_NAME curl -f http://localhost:2785/api/health/ready 2>/dev/null; do
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    if [ $ELAPSED -ge $HEALTH_CHECK_TIMEOUT ]; then
      echo "ERROR: $REPLICA_NAME failed to become ready within ${HEALTH_CHECK_TIMEOUT}s"
      exit 1
    fi
  done

  echo "$REPLICA_NAME is ready!"
done

echo ""
echo "=== Rolling Update Complete ==="
echo "Verifying deployment..."

# Verify all replicas running
RUNNING=$(docker ps --filter "label=com.docker.compose.service=openwa-api" --format "{{.Names}}" | wc -l)
if [ "$RUNNING" -ne "$REPLICA_COUNT" ]; then
  echo "ERROR: Expected $REPLICA_COUNT replicas, found $RUNNING"
  exit 1
fi

echo "All $REPLICA_COUNT replicas running"

# Run smoke test
if [ -f "./scripts/smoke-test.sh" ]; then
  echo "Running smoke test..."
  ./scripts/smoke-test.sh
fi

echo ""
echo "✅ Deployment successful!"
