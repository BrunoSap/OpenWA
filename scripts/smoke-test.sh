#!/bin/bash
set -euo pipefail

# OpenWA Production Smoke Test
# Validates multi-replica deployment is functional
# Exit code 0 = success, 1 = failure

API_URL=${API_URL:-http://localhost:2785}
API_KEY=${API_MASTER_KEY:-}
EXPECTED_REPLICAS=${EXPECTED_REPLICAS:-3}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== OpenWA Production Smoke Test ==="
echo "API URL: $API_URL"
echo "Expected replicas: $EXPECTED_REPLICAS"
echo ""

# Test 1: Verify replicas running
echo -n "Test 1: Verify $EXPECTED_REPLICAS replicas running... "
RUNNING=$(docker ps --filter "label=com.docker.compose.service=openwa-api" --format "{{.Names}}" | wc -l)
if [ "$RUNNING" -ne "$EXPECTED_REPLICAS" ]; then
  echo -e "${RED}FAIL${NC}"
  echo "Expected $EXPECTED_REPLICAS, found $RUNNING"
  exit 1
fi
echo -e "${GREEN}PASS${NC}"

# Test 2: Health checks (liveness)
echo -n "Test 2: Liveness probe... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health/live")
if [ "$HTTP_CODE" -ne 200 ]; then
  echo -e "${RED}FAIL${NC}"
  echo "Expected 200, got $HTTP_CODE"
  exit 1
fi
echo -e "${GREEN}PASS${NC}"

# Test 3: Health checks (readiness)
echo -n "Test 3: Readiness probe... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health/ready")
if [ "$HTTP_CODE" -ne 200 ]; then
  echo -e "${RED}FAIL${NC}"
  echo "Expected 200, got $HTTP_CODE"
  curl -s "$API_URL/api/health/ready" | jq .
  exit 1
fi
echo -e "${GREEN}PASS${NC}"

# Test 4: Sticky sessions (50 requests from same IP)
echo -n "Test 4: Sticky sessions (50 requests)... "
REPLICA_COUNT=$(for i in {1..50}; do
  curl -s -H "X-Forwarded-For: 192.168.1.100" "$API_URL/api/health/live" -I | grep -i x-replica
done | sort | uniq | wc -l)
if [ "$REPLICA_COUNT" -ne 1 ]; then
  echo -e "${RED}FAIL${NC}"
  echo "Expected 1 unique replica, got $REPLICA_COUNT (sticky sessions broken)"
  exit 1
fi
echo -e "${GREEN}PASS${NC}"

# Test 5: Load distribution (10 requests from different IPs)
echo -n "Test 5: Load distribution (10 IPs)... "
REPLICA_COUNT=$(for i in {101..110}; do
  curl -s -H "X-Forwarded-For: 192.168.1.$i" "$API_URL/api/health/live" -I | grep -i x-replica
done | sort | uniq | wc -l)
if [ "$REPLICA_COUNT" -lt 2 ]; then
  echo -e "${YELLOW}WARN${NC}"
  echo "Expected 2+ replicas, got $REPLICA_COUNT (acceptable but suboptimal)"
else
  echo -e "${GREEN}PASS${NC}"
fi

# Test 6: Session CRUD (requires API key)
if [ -n "$API_KEY" ]; then
  echo -n "Test 6: Session CRUD... "
  SESSION_ID="smoke-test-$(date +%s)"

  # Create session
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL/api/session/create" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$SESSION_ID\",\"engine\":\"baileys\"}")

  if [ "$HTTP_CODE" -ne 201 ]; then
    echo -e "${RED}FAIL${NC}"
    echo "Create session returned $HTTP_CODE"
    exit 1
  fi

  # Get session (from different replica via different IP)
  sleep 2
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "X-Forwarded-For: 192.168.1.102" \
    -H "X-API-Key: $API_KEY" \
    "$API_URL/api/session/$SESSION_ID")

  if [ "$HTTP_CODE" -ne 200 ]; then
    echo -e "${RED}FAIL${NC}"
    echo "Get session returned $HTTP_CODE (shared storage broken?)"
    exit 1
  fi

  # Delete session (cleanup)
  curl -s -X DELETE "$API_URL/api/session/$SESSION_ID" \
    -H "X-API-Key: $API_KEY" > /dev/null

  echo -e "${GREEN}PASS${NC}"
else
  echo "Test 6: Session CRUD... ${YELLOW}SKIP${NC} (no API_MASTER_KEY)"
fi

# Test 7: Monitoring endpoints
echo -n "Test 7: Prometheus metrics... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9090/-/healthy")
if [ "$HTTP_CODE" -ne 200 ]; then
  echo -e "${YELLOW}WARN${NC}"
  echo "Prometheus not reachable (optional)"
else
  echo -e "${GREEN}PASS${NC}"
fi

echo ""
echo -e "${GREEN}✅ All smoke tests passed!${NC}"
echo ""
echo "Next steps:"
echo "  - Monitor Grafana: http://localhost:3000/d/openwa-scaling"
echo "  - Check logs: docker-compose logs -f openwa-api"
echo "  - Review alerts: http://localhost:9090/alerts"
