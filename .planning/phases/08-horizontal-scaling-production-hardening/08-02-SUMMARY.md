---
phase: 08-horizontal-scaling-production-hardening
plan: 02
subsystem: infrastructure
tags:
  - horizontal-scaling
  - nfs-storage
  - multi-replica
  - distributed-workers
  - shared-storage
dependency_graph:
  requires:
    - nginx load balancer (08-01)
    - sticky sessions (08-01)
    - Redis health checks (08-01)
  provides:
    - NFS shared storage configuration
    - 3+ replica deployment pattern
    - Cross-replica profile persistence
    - Distributed BullMQ worker validation
  affects:
    - deployment architecture
    - session storage layer
    - scaling ceiling (now 3+ replicas)
tech_stack:
  added:
    - docker-compose.nfs.yml (NFS volume driver)
    - NFS mount options (soft,timeo=600,retrans=2)
    - OPENWA_REPLICAS environment variable
  patterns:
    - NFS ReadWriteMany volume for stateful data
    - Profile persistence cross-replica pattern
    - Distributed worker smoke testing
key_files:
  created:
    - docker-compose.nfs.yml
    - test/shared-storage.e2e-spec.ts
    - test/multi-replica-3plus.e2e-spec.ts
  modified:
    - docker-compose.yml
    - nginx.conf
    - docs/SETUP.md
    - package.json
decisions:
  - id: DEC-08-02-01
    title: Use NFS soft mount instead of hard mount for profile storage
    rationale: Soft mount with timeo=600,retrans=2 provides automatic retry on network blips while avoiding indefinite hangs that would freeze Chromium; hard mounts can block forever on NFS server failure
    alternatives_rejected:
      - Hard mount: blocks indefinitely on NFS failure, requires manual intervention
      - S3-backed filesystem (s3fs-fuse): high latency for Chromium profile I/O
      - Redis-backed session store: WhatsApp profiles not easily serializable
  - id: DEC-08-02-02
    title: Scale from 2 to 3+ replicas via OPENWA_REPLICAS env var
    rationale: Allows operators to tune replica count without editing docker-compose.yml; default 2 maintains backward compatibility with scale-2 profile
    alternatives_rejected:
      - Fixed 3 replicas: less flexible for resource-constrained environments
      - Separate docker-compose files per replica count: maintenance burden
  - id: DEC-08-02-03
    title: Update nginx upstream to pre-configure 3 backend servers
    rationale: nginx requires static upstream configuration; pre-configuring 3 servers allows scale-3 profile to work without nginx.conf changes
    alternatives_rejected:
      - Dynamic upstream via nginx-plus: requires paid license
      - Consul/etcd service discovery: adds operational complexity
metrics:
  duration_minutes: 5
  completed_date: 2026-08-27
  tasks_completed: 3
  commits: 3
  files_created: 3
  files_modified: 3
status: complete
actuals:
  tokens: 6200
  tasks: 3
  commits: 3
---

# Phase 08 Plan 02: NFS shared storage + 3+ replicas expansion Summary

**Shared storage infrastructure for WhatsApp profiles enabling horizontal scale to 3+ replicas**

## One-Liner

NFS volume configuration with ReadWriteMany access for profile persistence across 3+ replicas, enabling cross-replica failover without session re-authentication.

## What Was Built

### 1. NFS Shared Storage Configuration (Task 1)

**Objective:** Create docker-compose overlay for NFS-backed shared storage.

**Implementation:**
- Created `docker-compose.nfs.yml` with NFS volume driver configuration
- Volume options: `soft,timeo=600,retrans=2` for resilient network retry
- Configured `NFS_SERVER` and `NFS_EXPORT_PATH` environment variables
- Updated `docker-compose.yml` to support both `scale-2` and `scale-3` profiles
- Added `OPENWA_REPLICAS` env var (default: 2) for flexible replica count
- Updated `nginx.conf` upstream to pre-configure 3 backend servers
- Documented complete NFS server setup in `docs/SETUP.md`

**NFS Mount Strategy:**
- **soft mount**: Retry on network failures, don't block indefinitely
- **timeo=600**: 60s retry timeout (conservative for production)
- **retrans=2**: 2 retry attempts before returning error
- **no_root_squash**: Allow container root to write profiles

**Files:**
- `docker-compose.nfs.yml` — NFS volume override
- `docker-compose.yml` — scale-3 profile support + OPENWA_REPLICAS
- `nginx.conf` — 3-server upstream configuration
- `docs/SETUP.md` — "Horizontal Scaling" section with NFS setup guide

**Commit:** dcf1cb39

### 2. E2E Test — Shared Storage Profile Persistence (Task 2, TDD RED)

**Objective:** Validate profile created on replica 1 accessible from replica 2.

**Implementation (TDD RED):**
- Created `test/shared-storage.e2e-spec.ts` with 3 test cases:
  1. **Profile creation**: Session created via replica 1 writes to NFS
  2. **Cross-replica access**: Replica 2 can read profile from shared storage
  3. **Concurrent writes**: File lock prevents corruption during parallel writes
- Test uses `X-Forwarded-For` header to force routing to specific replicas
- Cleanup: deletes test session after run (no orphaned data)
- Installed `@nestjs/terminus@11.1.1` dependency (required by Wave 1 health indicators)

**Test Data:**
- Session ID: `test-shared-storage-${timestamp}` (unique per run)
- Profile path: `${BAILEYS_AUTH_DIR}/${sessionId}` (mirrors production)
- Concurrent write targets: `5511999999999@c.us` (test phone number)

**Files:**
- `test/shared-storage.e2e-spec.ts`
- `package.json` + `package-lock.json` (@nestjs/terminus added)

**Commit:** a89c6d13

### 3. E2E Test — 3+ Replicas Distributed State (Task 3, TDD RED)

**Objective:** Validate BullMQ distributed workers and WebSocket cross-replica fan-out.

**Implementation (TDD RED):**
- Created `test/multi-replica-3plus.e2e-spec.ts` with 4 test cases:
  1. **3 replicas healthy**: Different IPs hit different replicas (X-Replica header)
  2. **BullMQ distributed workers**: Job queued via one replica processed by any worker
  3. **WebSocket fan-out**: Broadcast via Redis pub/sub reaches all 3 clients
  4. **Graceful shutdown**: Long-running job completes (not lost during drain)
- Uses `socket.io-client` to connect 3 WebSocket clients to different replicas
- Validates Redis adapter cross-replica communication (already implemented)

**Test Data:**
- Webhook URLs: `https://webhook.site/test` (public webhook receiver)
- Event types: `test.event`, `test.slow` (simulates long job)
- Session ID: `test-broadcast` (WebSocket broadcast validation)

**Files:**
- `test/multi-replica-3plus.e2e-spec.ts`

**Commit:** d8256239

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new security-relevant surface introduced beyond what was documented in the plan's threat model. All threats identified in PLAN.md `<threat_model>` section were addressed or accepted:

- **T-08-05 (NFS man-in-the-middle):** Mitigated via deployment guidance — docs recommend NFSv4 with Kerberos (sec=krb5) in production; dev environments use internal VPC
- **T-08-06 (Redis unauthorized access):** Mitigated — Redis AUTH password already enforced by existing infra; bind 127.0.0.1 or internal VPC only
- **T-08-07 (NFS stale file handle):** Mitigated — soft mount + retry (timeo=600) allows automatic recovery; documented troubleshooting steps in SETUP.md
- **T-08-08 (Profile files on NFS):** Accepted — filesystem-level encryption not implemented; operators can enable if compliance requires
- **T-08-SC (npm installs):** Mitigated — @nestjs/terminus is legitimate package (verified in 08-RESEARCH.md)

## Self-Check: PASSED

**Created files exist:**
```bash
[ -f "docker-compose.nfs.yml" ] && echo "FOUND: docker-compose.nfs.yml" || echo "MISSING: docker-compose.nfs.yml"
# FOUND: docker-compose.nfs.yml
[ -f "test/shared-storage.e2e-spec.ts" ] && echo "FOUND: shared-storage.e2e-spec.ts" || echo "MISSING: shared-storage.e2e-spec.ts"
# FOUND: shared-storage.e2e-spec.ts
[ -f "test/multi-replica-3plus.e2e-spec.ts" ] && echo "FOUND: multi-replica-3plus.e2e-spec.ts" || echo "MISSING: multi-replica-3plus.e2e-spec.ts"
# FOUND: multi-replica-3plus.e2e-spec.ts
```

**Commits exist:**
```bash
git log --oneline --all | grep -q "dcf1cb39" && echo "FOUND: dcf1cb39" || echo "MISSING: dcf1cb39"
# FOUND: dcf1cb39
git log --oneline --all | grep -q "a89c6d13" && echo "FOUND: a89c6d13" || echo "MISSING: a89c6d13"
# FOUND: a89c6d13
git log --oneline --all | grep -q "d8256239" && echo "FOUND: d8256239" || echo "MISSING: d8256239"
# FOUND: d8256239
```

## Deployment Protocol

### Prerequisites (User Setup Required)

**NFS Server must be configured externally before deployment.** This is NOT automated by the plan.

**Ubuntu/Debian NFS Server Setup:**

```bash
# Install NFS server
sudo apt update && sudo apt install -y nfs-kernel-server

# Create export directory
sudo mkdir -p /exports/openwa-data
sudo chown nobody:nogroup /exports/openwa-data
sudo chmod 755 /exports/openwa-data

# Configure export
echo "/exports/openwa-data *(rw,sync,no_subtree_check,no_root_squash)" | sudo tee -a /etc/exports

# Apply and restart
sudo exportfs -ra
sudo systemctl restart nfs-kernel-server
```

**Verify NFS export:**

```bash
showmount -e localhost
# Expected output:
# Export list for localhost:
# /exports/openwa-data *
```

### Deploy 3 Replicas with NFS

```bash
# Set NFS server address (replace with your NFS server IP)
export NFS_SERVER=192.168.1.100
export NFS_EXPORT_PATH=/exports/openwa-data
export OPENWA_REPLICAS=3

# Start with NFS storage + 3 replicas
docker-compose -f docker-compose.yml -f docker-compose.nfs.yml --profile scale-3 up -d

# Wait for healthy
sleep 15

# Verify 3 replicas running
docker ps --filter label=com.openwa.replica=true --format '{{.Names}}'
# Expected: openwa-api-scaled-1, openwa-api-scaled-2, openwa-api-scaled-3
```

### Verify NFS Mount

```bash
# Check NFS mount in all replicas
docker exec openwa-api-scaled-1 df -h | grep /app/data
docker exec openwa-api-scaled-2 df -h | grep /app/data
docker exec openwa-api-scaled-3 df -h | grep /app/data

# Create test file on replica 1
docker exec openwa-api-scaled-1 touch /app/data/test-nfs-shared.txt

# Verify visible on replica 2 and 3
docker exec openwa-api-scaled-2 ls -la /app/data/test-nfs-shared.txt
docker exec openwa-api-scaled-3 ls -la /app/data/test-nfs-shared.txt

# Cleanup
docker exec openwa-api-scaled-1 rm /app/data/test-nfs-shared.txt
```

### Run E2E Tests

**Prerequisites:**
- 3 replicas running with NFS mount active
- Redis running (for BullMQ + WebSocket)
- API_MASTER_KEY environment variable set

```bash
# Export API key
export API_MASTER_KEY=$(docker exec openwa-api-scaled-1 cat /app/data/api-key.txt)

# Run shared storage tests
npm run test:e2e -- shared-storage.e2e-spec.ts

# Run multi-replica tests
npm run test:e2e -- multi-replica-3plus.e2e-spec.ts
```

### Load Distribution Validation

```bash
# Send 100 requests from different IPs
for i in {1..100}; do 
  curl -s -H "X-Forwarded-For: 192.168.1.$((100 + i))" \
    http://localhost:2785/api/health/live -I | grep X-Replica
done | sort | uniq -c

# Expected output (roughly 1/3 each):
#   33 X-Replica: openwa-api-scaled-1:2785
#   34 X-Replica: openwa-api-scaled-2:2785
#   33 X-Replica: openwa-api-scaled-3:2785
```

## Known Stubs

None — all functionality is production-ready configuration. Tests are RED phase (expected to fail until 3 replicas + NFS deployed).

## Success Criteria Met

- ✅ docker-compose.nfs.yml configurado com NFS volume driver
- ✅ docs/SETUP.md seção "Horizontal Scaling" completa (NFS setup + troubleshooting)
- ✅ 3 replicas configuradas via scale-3 profile + OPENWA_REPLICAS env var
- ✅ nginx.conf upstream suporta 3 backends
- ✅ Profile persistence tests criados (shared-storage.e2e-spec.ts)
- ✅ Distributed state tests criados (multi-replica-3plus.e2e-spec.ts)
- ✅ @nestjs/terminus dependency instalada (required by Wave 1)

**Tests are RED phase (TDD)** — require deployment with 3 replicas + NFS to pass. This is intentional per TDD workflow.

## Output Artifacts

- **docker-compose.nfs.yml:** Production-ready NFS configuration for shared storage
- **NFS setup guide:** Complete operator documentation in docs/SETUP.md
- **E2E test suite:** Validates profile persistence and distributed state behavior
- **Flexible replica count:** OPENWA_REPLICAS env var allows 2-N replicas

## Next Steps

**Phase 08 Plan 03:** Metrics exposure (Prometheus scrape endpoint) and Grafana dashboard  
**Phase 08 Plan 04:** Distributed tracing with OpenTelemetry  
**Phase 08 Plan 05:** Chaos testing (kill replica, Redis down, network partition)

## Technical Debt

None introduced.

## Dependencies for Future Plans

- Plan 08-03 will add Prometheus metrics endpoint to expose per-replica metrics
- Plan 08-04 will add distributed tracing to track requests across replicas
- Plan 08-05 will validate failover behavior under replica failures (chaos engineering)

## Manual Testing Results

**Not executed** — tests require NFS server setup and 3 replicas deployment, which is a user-provisioned prerequisite outside the scope of this plan. Tests are provided in RED phase per TDD workflow; GREEN phase (passing tests) validates deployment correctness when operator deploys 3+ replicas with NFS.

## Troubleshooting Guide

See `docs/SETUP.md` section "Horizontal Scaling > Troubleshooting" for:
- Stale file handle errors (NFS mount recovery)
- Replica startup failures (NFS permissions, mount verification)
- Session persistence failures (profile path validation)
