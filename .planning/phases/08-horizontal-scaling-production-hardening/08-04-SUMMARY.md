---
phase: 08-horizontal-scaling-production-hardening
plan: 04
subsystem: deployment-operations
tags: [production, deployment, rolling-update, smoke-tests, zero-downtime]
dependency_graph:
  requires: [08-01, 08-02, 08-03]
  provides: [deployment-guide, rolling-update-automation, smoke-tests]
  affects: [docs, scripts, test]
tech_stack:
  added: []
  patterns: [rolling-update, smoke-testing, production-readiness]
key_files:
  created:
    - docs/DEPLOYMENT.md
    - scripts/deploy-multi-replica.sh
    - scripts/smoke-test.sh
    - test/smoke-production.e2e-spec.ts
  modified: []
decisions:
  - decision: Rolling update with 30s drain window
    rationale: Balances deployment speed with in-flight request completion
    alternatives: [Blue-green (2× resources), Canary (too complex for 3 replicas)]
  - decision: Smoke test covers 7 critical checks in bash script
    rationale: CI/CD friendly (exit codes), no test framework dependencies
    alternatives: [Pure E2E (slower), manual validation (not repeatable)]
  - decision: DEPLOYMENT.md covers full production lifecycle
    rationale: Single source of truth for operators — prerequisites through DR
    alternatives: [Separate docs per concern (harder to maintain consistency)]
metrics:
  duration_minutes: 3
  completed_date: 2026-08-27
  tasks_completed: 2
  commits_made: 2
  files_created: 4
  files_modified: 0
status: complete
actuals:
  tokens: 15000
  tasks: 2
  commits: 2
---

# Phase 8 Plan 4: Production Deployment Guide + Rolling Updates + Smoke Tests

**Production deployment automation completa: rolling update zero-downtime + smoke test suite para validar multi-replica deployments.**

## Context

Com a infraestrutura de scaling completa (NFS, Redis, load balancer), observability stack (tracing, SLOs, alerting), faltava o **último mile operacional**: runbooks para deploy seguro em produção. Operadores precisam de procedures claros para rolling updates, rollback, troubleshooting, e validação post-deploy.

## What Was Built

### 1. Production Deployment Guide (docs/DEPLOYMENT.md)

Guia completo de 401 linhas cobrindo todo o lifecycle de produção:

**Prerequisites:**
- Infrastructure checklist (NFS, Redis, PostgreSQL, load balancer, monitoring)
- Environment configuration template (`.env` production-ready)
- Pre-deploy checklist (security audit, tests, image build, backup)

**Deployment Procedures:**
- **Initial Deployment**: Step-by-step first-time setup (clone → configure → migrate → start → verify)
- **Rolling Update**: Zero-downtime procedure usando `deploy-multi-replica.sh` (drain → stop → start → health check)
- **Rollback**: Quick rollback para versão anterior (automated ou manual)

**Post-Deploy Validation:**
- Automated smoke test (`./scripts/smoke-test.sh`)
- Manual validation steps (replicas running, health checks, sticky sessions, distributed state, monitoring, logs)

**Operations:**
- **Monitoring & Alerting**: Key metrics, alert response table (ReplicaDown, LatencySLOViolation, etc.)
- **Troubleshooting**: Common issues (replica won't start, session lost, high memory, load imbalance)
- **Maintenance**: Backup schedule, scaling up/down procedures
- **Security Hardening**: TLS, secrets management, firewall, audit logging
- **Performance Tuning**: Connection pool configs (TypeORM, ioredis, BullMQ)
- **Disaster Recovery**: Full system restore procedure, RTO/RPO targets (< 30min / < 24h)

### 2. Rolling Update Script (scripts/deploy-multi-replica.sh)

Bash script automatizado para rolling updates zero-downtime:

**Flow:**
1. Pull new image (`docker pull registry.example.com/openwa-api:$VERSION`)
2. For each replica (1, 2, 3):
   - Mark as draining (optional admin endpoint)
   - Wait drain window (default 30s para in-flight requests completarem)
   - Stop old container
   - Start new container com nova imagem
   - Wait for health check (até `HEALTH_CHECK_TIMEOUT` segundos)
3. Verify all replicas running (`docker ps` filter)
4. Run smoke test (`./scripts/smoke-test.sh`)

**Configurável via env vars:**
- `REPLICA_COUNT` (default: 3)
- `DRAIN_WINDOW` (default: 30s)
- `HEALTH_CHECK_TIMEOUT` (default: 60s)
- `IMAGE` (default: registry.example.com/openwa-api)

**Exit codes:**
- 0 = success (all replicas updated, smoke test passed)
- 1 = failure (replica failed health check ou smoke test failed)

### 3. Smoke Test Suite (scripts/smoke-test.sh)

Bash script validando 7 critical checks em < 5min:

**Test 1: Replicas Running** — Verify N replicas via `docker ps` filter  
**Test 2: Liveness Probe** — GET `/api/health/live` → 200  
**Test 3: Readiness Probe** — GET `/api/health/ready` → 200 (checks Redis + DB)  
**Test 4: Sticky Sessions** — 50 requests from same IP → all go to same replica  
**Test 5: Load Distribution** — 10 requests from different IPs → 2+ replicas used  
**Test 6: Session CRUD** — Create session → query from different replica (via IP) → delete  
**Test 7: Prometheus Metrics** — Endpoint `/metrics` reachable  

**Color-coded output:**
- 🟢 **PASS** (green)
- 🔴 **FAIL** (red)
- 🟡 **WARN/SKIP** (yellow, para optional checks)

**Exit code 0/1** para CI/CD integration.

### 4. Production E2E Tests (test/smoke-production.e2e-spec.ts)

Jest E2E tests rodando contra deployment real (não mock):

**Critical Path 1:** Health checks respond < 2s  
**Critical Path 2:** Create session → query from different replica (validates NFS shared storage)  
**Critical Path 3:** Sticky sessions maintained across 100 requests (same IP)  
**Critical Path 4:** Load distributed across replicas (different IPs)  
**Performance:** p95 latency < 500ms under load (50 iterations)

## Key Decisions

### Decision 1: Rolling Update Strategy

**Chosen:** Rolling update com 30s drain window  
**Rationale:** Balances deployment speed (cada replica ~90s = 4.5min total para 3 replicas) com in-flight request completion (típico request < 10s). Zero-downtime: sempre 2 replicas servindo tráfego durante update.  
**Alternatives Rejected:**
- **Blue-green deployment**: Requer 2× resources (6 replicas durante deploy) — too expensive para 3-replica setup
- **Canary deployment**: Mais complexo (gradual traffic shift), overkill para 3 replicas sem traffic shaping avançado

### Decision 2: Smoke Test Implementation

**Chosen:** Bash script com 7 checks  
**Rationale:** CI/CD friendly (exit codes 0/1), sem dependencies de test framework (roda em qualquer ambiente com `curl` + `docker`), fast (< 5min).  
**Alternatives Rejected:**
- **Pure E2E apenas**: Mais lento (test framework startup), requer Node.js environment
- **Manual validation checklist**: Error-prone, não repetível, não automatizável

### Decision 3: Documentation Structure

**Chosen:** Single DEPLOYMENT.md com todas seções  
**Rationale:** Single source of truth para operators — fácil buscar procedures sem navegar múltiplos docs. Sections bem demarcadas (Prerequisites → Deploy → Monitor → Troubleshoot → DR).  
**Alternatives Rejected:**
- **Separate docs per concern**: Mais modular mas harder to maintain consistency (e.g., rollback procedure references monitoring setup)

## How It Works

### Deployment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Production Deployment Flow (Zero-Downtime Rolling Update)       │
└─────────────────────────────────────────────────────────────────┘

1. Operator triggers:
   ./scripts/deploy-multi-replica.sh v3.6

2. Script pulls new image:
   docker pull registry.example.com/openwa-api:v3.6

3. For each replica (sequential):
   
   Replica 1:
   ┌─────────────┐
   │ Draining... │ (30s) ← In-flight requests complete
   └─────────────┘
   ┌─────────────┐
   │ Stop old    │ ← docker stop openwa-api-1
   └─────────────┘
   ┌─────────────┐
   │ Start new   │ ← docker start with v3.6 image
   └─────────────┘
   ┌─────────────┐
   │ Health wait │ ← Until /health/ready returns 200
   └─────────────┘
   
   Replica 2: (same flow)
   Replica 3: (same flow)

4. Verify all replicas:
   docker ps --filter label=com.docker.compose.service=openwa-api
   Expected: 3 containers running

5. Run smoke test:
   ./scripts/smoke-test.sh
   ✅ Test 1: PASS — 3 replicas running
   ✅ Test 2: PASS — Liveness probe 200
   ✅ Test 3: PASS — Readiness probe 200
   ✅ Test 4: PASS — Sticky sessions (1 unique replica)
   ✅ Test 5: PASS — Load distribution (2+ replicas)
   ✅ Test 6: PASS — Session CRUD cross-replica
   ✅ Test 7: PASS — Prometheus metrics reachable

6. Exit:
   ✅ Deployment successful! (exit 0)
```

**Rollback Flow:**
Se deploy falhar (health check timeout, smoke test fail):

```bash
# Identify previous working version
PREVIOUS_VERSION=v3.5

# Rollback (same rolling update flow, mas para v3.5)
./scripts/deploy-multi-replica.sh v3.5

# Verify
./scripts/smoke-test.sh
```

### Smoke Test Flow

```bash
./scripts/smoke-test.sh

=== OpenWA Production Smoke Test ===
API URL: http://localhost:2785
Expected replicas: 3

Test 1: Verify 3 replicas running... PASS
Test 2: Liveness probe... PASS
Test 3: Readiness probe... PASS
Test 4: Sticky sessions (50 requests)... PASS
Test 5: Load distribution (10 IPs)... PASS
Test 6: Session CRUD... PASS
Test 7: Prometheus metrics... PASS

✅ All smoke tests passed!

Next steps:
  - Monitor Grafana: http://localhost:3000/d/openwa-scaling
  - Check logs: docker-compose logs -f openwa-api
  - Review alerts: http://localhost:9090/alerts
```

## Testing

### Manual Validation

**Verify guide sections:**
```bash
grep -c "^##" docs/DEPLOYMENT.md
# Expected: 10+ sections (Prerequisites, Deployment, Rollback, Monitoring, etc.)

wc -l docs/DEPLOYMENT.md
# Expected: 400+ lines
```

**Verify scripts executable:**
```bash
test -x scripts/deploy-multi-replica.sh && echo "✅ deploy script executable"
test -x scripts/smoke-test.sh && echo "✅ smoke test executable"
```

**Verify script syntax:**
```bash
bash -n scripts/deploy-multi-replica.sh && echo "✅ deploy script syntax valid"
bash -n scripts/smoke-test.sh && echo "✅ smoke test syntax valid"
```

### E2E Validation (requires running deployment)

```bash
# Start 3 replicas with NFS
export NFS_SERVER=192.168.1.100
export API_MASTER_KEY=test-master-key
docker-compose -f docker-compose.yml -f docker-compose.nfs.yml --profile scale-3 up -d

# Wait for startup
sleep 15

# Run smoke test
./scripts/smoke-test.sh
# Expected: All tests PASS

# Run production E2E
API_URL=http://localhost:2785 npm run test:e2e -- smoke-production.e2e-spec.ts
# Expected: 5 test cases pass
```

## Integration

### CI/CD Integration (GitHub Actions example)

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to production
        run: |
          ssh production-server "cd /opt/openwa && ./scripts/deploy-multi-replica.sh ${{ github.ref_name }}"
      
      - name: Smoke test
        run: |
          ssh production-server "cd /opt/openwa && ./scripts/smoke-test.sh"
      
      - name: Rollback on failure
        if: failure()
        run: |
          ssh production-server "cd /opt/openwa && ./scripts/deploy-multi-replica.sh v3.5"
```

### Monitoring Integration

Smoke test checks se Prometheus está reachable (Test 7). Após deploy, operadores devem verificar:

- **Grafana Dashboard**: `http://localhost:3000/d/openwa-scaling`
- **Jaeger Traces**: `http://localhost:16686` (filter by replica.id)
- **Prometheus Alerts**: `http://localhost:9090/alerts`

## Security Considerations

**Deployment Script Security:**
- Script read-only (`chmod 555` recommended)
- Version control audit trail (git log tracks who triggered deploy)
- No secrets hardcoded (image registry URL configurable via `IMAGE` env var)

**Smoke Test Security:**
- API_MASTER_KEY masked in logs (curl output redirected to `/dev/null`)
- Test 6 (Session CRUD) skipped se API_MASTER_KEY ausente (não falha deploy)
- Cleanup após test (session deletado)

**Production Secrets Management:**
DEPLOYMENT.md documenta best practices:
- Use secrets manager (HashiCorp Vault, AWS Secrets Manager) instead of `.env`
- Enable TLS for all inter-service communication (nginx ↔ replicas, replicas ↔ Redis/DB/NFS)

## Deviations from Plan

None — plan executed exatamente como especificado.

## Verification

### Automated Verification

```bash
# Verify DEPLOYMENT.md sections
grep -q "Prerequisites" docs/DEPLOYMENT.md
grep -q "Rolling Update" docs/DEPLOYMENT.md
grep -q "Rollback Procedure" docs/DEPLOYMENT.md
grep -q "Monitoring & Alerting" docs/DEPLOYMENT.md
grep -q "Troubleshooting" docs/DEPLOYMENT.md
grep -q "Security Hardening" docs/DEPLOYMENT.md
grep -q "Disaster Recovery" docs/DEPLOYMENT.md

# Verify deploy script syntax
bash -n scripts/deploy-multi-replica.sh

# Verify smoke test syntax
bash -n scripts/smoke-test.sh

# Verify scripts executable
test -x scripts/deploy-multi-replica.sh
test -x scripts/smoke-test.sh
```

### Success Criteria

- ✅ docs/DEPLOYMENT.md completo (Prerequisites, Deploy, Rollback, Monitoring, Troubleshooting, DR)
- ✅ scripts/deploy-multi-replica.sh automatiza rolling update zero-downtime
- ✅ scripts/smoke-test.sh valida 7 critical checks em < 5min
- ✅ test/smoke-production.e2e-spec.ts cobre 5 user flows críticos
- ✅ Rollback procedure documentado e testável
- ✅ Production checklist cobre infra prerequisites (NFS, Redis, DB, monitoring)
- ✅ Security hardening section documenta TLS, secrets management, firewall
- ✅ Performance tuning section documenta connection pools e concurrency

## Next Steps

### Immediate (Phase 8 Complete)

Phase 8 agora está 100% completo:
- Wave 1: NFS shared storage + 3-replica setup
- Wave 2: Redis HA + WebSocket fan-out + distributed queue
- Wave 3: Observability (distributed tracing, SLOs, alerting)
- **Wave 4: Production deployment guide + rolling updates + smoke tests** ✅

### Future Enhancements (Phase 9+)

**Deployment Automation:**
- Integrate deploy script com Kubernetes (Helm chart com rolling update strategy)
- Add canary deployment support (gradual traffic shift, 10% → 50% → 100%)
- Add blue-green deployment option (toggle via env var)

**Smoke Test Expansion:**
- Add Test 8: Webhook delivery end-to-end (create session → send message → verify webhook received)
- Add Test 9: BullMQ queue processing (enqueue job → verify processed by any replica)
- Add Test 10: Database replication lag (primary vs. read replicas)

**Production Hardening:**
- Document multi-region deployment (cross-region NFS replication, global load balancer)
- Add chaos engineering tests (kill random replica, verify failover)
- Add capacity planning guide (when to scale from 3 → 5 replicas)

## Related Files

**Created:**
- `docs/DEPLOYMENT.md` (401 lines)
- `scripts/deploy-multi-replica.sh` (66 lines)
- `scripts/smoke-test.sh` (133 lines)
- `test/smoke-production.e2e-spec.ts` (96 lines)

**References:**
- `docs/SETUP.md` (Horizontal Scaling section)
- `docker-compose.yml` (base services)
- `docker-compose.nfs.yml` (NFS storage override)
- `.planning/phases/08-horizontal-scaling-production-hardening/08-01-SUMMARY.md` (Wave 1)
- `.planning/phases/08-horizontal-scaling-production-hardening/08-02-SUMMARY.md` (Wave 2)
- `.planning/phases/08-horizontal-scaling-production-hardening/08-03-SUMMARY.md` (Wave 3)

---

**Phase 8 Status:** ✅ **COMPLETE** (4/4 plans done)  
**Wave 4 Duration:** 3 minutes  
**Total Phase 8 Duration:** ~45 minutes across 4 waves
