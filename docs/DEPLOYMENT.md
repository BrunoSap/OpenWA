# OpenWA - Production Deployment Guide

Este guia cobre deployment de multi-replica OpenWA em produção com zero-downtime updates.

## Prerequisites

### Infrastructure

- [x] NFS server configurado e acessível (ver SETUP.md "Horizontal Scaling")
- [x] Redis standalone ou Sentinel HA (obrigatório para WebSocket fan-out + BullMQ)
- [x] PostgreSQL 16+ com pgvector (recomendado: primary + 2 read replicas)
- [x] Load balancer (nginx incluído no docker-compose, ou AWS ALB / GCP Load Balancer)
- [x] Monitoring stack (Prometheus + Grafana + Jaeger opcional)

### Environment

- [x] `.env` configurado para produção:
  ```bash
  NODE_ENV=production
  
  # Database (não usar defaults)
  DATABASE_TYPE=postgres
  DATABASE_PASSWORD=<strong-password>
  
  # Storage (S3/MinIO para produção)
  STORAGE_TYPE=s3
  S3_ACCESS_KEY_ID=<access-key>
  S3_SECRET_ACCESS_KEY=<secret-key>
  
  # Auth
  API_MASTER_KEY=<strong-master-key>
  API_KEY_PEPPER=<random-pepper>
  
  # Redis
  REDIS_ENABLED=true
  REDIS_PASSWORD=<redis-password>
  
  # Scaling
  NFS_SERVER=<nfs-server-ip>
  NFS_EXPORT_PATH=/exports/openwa-data
  
  # Telemetry
  TELEMETRY_ENABLED=true
  TELEMETRY_OTLP_ENDPOINT=http://jaeger:4318/v1/traces
  ```

- [x] Docker Compose files:
  - `docker-compose.yml` (base)
  - `docker-compose.nfs.yml` (NFS storage override)
  - `docker-compose.prod.yml` (production overrides — resource limits, restart policies)

### Pre-Deploy Checklist

- [ ] Run security audit: `npm audit --production`
- [ ] Run tests: `npm test && npm run test:e2e`
- [ ] Build Docker image: `docker build -t openwa-api:v3.6 .`
- [ ] Push to registry: `docker push registry.example.com/openwa-api:v3.6`
- [ ] Backup database: `pg_dump openwa > backup-$(date +%Y%m%d).sql`
- [ ] Verify NFS mount accessible: `showmount -e $NFS_SERVER`
- [ ] Verify Redis connectivity: `redis-cli -h $REDIS_HOST ping`

## Deployment Procedure

### Initial Deployment (First Time)

```bash
# 1. Clone repo on production server
git clone https://github.com/your-org/openwa.git /opt/openwa
cd /opt/openwa

# 2. Configure environment
cp .env.example .env
nano .env  # Set production values

# 3. Start infrastructure (PostgreSQL, Redis, NFS if built-in)
docker-compose --profile full-stack up -d postgres redis

# 4. Run migrations
docker-compose run --rm openwa-api npm run migration:run

# 5. Start 3 replicas with NFS
docker-compose -f docker-compose.yml -f docker-compose.nfs.yml --profile scale-3 up -d

# 6. Verify health
./scripts/smoke-test.sh

# 7. Monitor logs
docker-compose logs -f openwa-api
```

### Rolling Update (Zero-Downtime)

Use `scripts/deploy-multi-replica.sh` para automated rolling update:

```bash
# Update to new version
./scripts/deploy-multi-replica.sh v3.6

# Script performs:
# 1. Pull new image
# 2. For each replica (1, 2, 3):
#    - Mark replica as draining (readiness = 503)
#    - Wait for drain window (30s)
#    - Stop old container
#    - Start new container with new image
#    - Wait for health check (ready)
# 3. Verify all replicas healthy
# 4. Run smoke test
```

**Manual rolling update:**

```bash
# Pull new image
docker pull registry.example.com/openwa-api:v3.6

# Update replica 1
docker stop openwa-api-1
docker run -d --name openwa-api-1 \
  --network openwa-network \
  --env-file .env \
  -v openwa-data:/app/data \
  registry.example.com/openwa-api:v3.6

# Wait for health
until curl -f http://localhost:2785/api/health/ready; do sleep 2; done

# Repeat for replica 2 and 3
# ...

# Verify
docker ps --filter label=com.docker.compose.service=openwa-api
./scripts/smoke-test.sh
```

### Rollback Procedure

Se deploy falhar, rollback para versão anterior:

```bash
# Identify previous working version
PREVIOUS_VERSION=v3.5

# Rollback using deploy script
./scripts/deploy-multi-replica.sh $PREVIOUS_VERSION

# Or manual:
docker-compose -f docker-compose.yml -f docker-compose.nfs.yml \
  --profile scale-3 down

# Update image tag in .env or docker-compose
IMAGE_TAG=$PREVIOUS_VERSION docker-compose -f docker-compose.yml \
  -f docker-compose.nfs.yml --profile scale-3 up -d

# Verify
./scripts/smoke-test.sh
```

## Post-Deploy Validation

### Automated Smoke Test

```bash
./scripts/smoke-test.sh
```

### Manual Validation

```bash
# 1. Verify replicas running
docker ps --filter label=com.docker.compose.service=openwa-api
# Expected: 3 containers (openwa-api-1, openwa-api-2, openwa-api-3)

# 2. Verify health checks
for i in {1..3}; do
  docker exec openwa-api-$i curl -f http://localhost:2785/api/health/ready
done

# 3. Verify load balancer
curl -f http://localhost:2785/api/health/ready

# 4. Verify sticky sessions (50 requests, same IP)
for i in {1..50}; do 
  curl -H "X-Forwarded-For: 192.168.1.100" http://localhost:2785/api/health/live -I | grep X-Replica
done | sort | uniq -c
# Expected: all 50 from same replica

# 5. Verify distributed state (create session, visible in all replicas)
SESSION_ID="smoke-test-$(date +%s)"
curl -X POST http://localhost:2785/api/session/create \
  -H "X-API-Key: $API_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"engine\":\"baileys\"}"

# Query from different replicas (via different IPs)
for i in {101..103}; do
  curl -H "X-Forwarded-For: 192.168.1.$i" \
    http://localhost:2785/api/session/$SESSION_ID \
    -H "X-API-Key: $API_MASTER_KEY"
done
# Expected: all return same session

# 6. Verify monitoring
open http://localhost:3000/d/openwa-scaling  # Grafana dashboard
open http://localhost:16686  # Jaeger traces (if enabled)

# 7. Check logs for errors
docker-compose logs --tail=100 openwa-api | grep -i error
# Expected: no critical errors
```

## Monitoring & Alerting

### Key Metrics to Watch

- **Replica health**: `up{job="openwa-api"}` — all replicas should be 1
- **Request rate**: `rate(http_requests_total[5m])` — should be distributed evenly
- **Latency p95**: `histogram_quantile(0.95, ...)` — should be <500ms
- **Error rate**: `sum(rate(...{status=~"5.."}[5m])) / sum(rate(...[5m]))` — should be <1%
- **Memory usage**: `container_memory_usage_bytes / container_spec_memory_limit_bytes` — should be <85%

### Alert Response

| Alert | Severity | Response |
|-------|----------|----------|
| ReplicaDown | Critical | Check `docker ps` and `docker logs openwa-api-N` |
| ReplicaUnhealthy | Warning | Check `/health/ready` response: Redis down? DB connection pool exhausted? |
| LoadImbalance | Warning | Verify nginx ip_hash config; check client IP distribution |
| LatencySLOViolation | Warning | Check slow queries (DB), Redis latency, or scale up replicas |
| ErrorRateSLOViolation | Critical | Check application logs for exceptions; rollback if new deploy |

## Troubleshooting

### Replica won't start

```bash
# Check logs
docker logs openwa-api-1 --tail=50

# Common issues:
# - NFS mount failed: verify showmount -e $NFS_SERVER
# - Database unreachable: verify pg_isready -h $DATABASE_HOST
# - Redis unreachable: verify redis-cli -h $REDIS_HOST ping
# - Port conflict: verify no other process on 2785
```

### Session lost after failover

```bash
# Verify NFS mount
docker exec openwa-api-1 ls -la /app/data/sessions

# Verify profile path matches
docker exec openwa-api-1 env | grep SESSION_DATA_PATH
# Expected: SESSION_DATA_PATH=/app/data/sessions

# Verify profile persisted
docker exec openwa-api-1 find /app/data/sessions -type f | head
# Expected: session files present
```

### High memory usage

```bash
# Check per-replica memory
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# If >85%:
# 1. Check for memory leaks: monitor over time, should stabilize
# 2. Increase limit: OPENWA_MEM_LIMIT=4g in docker-compose.yml
# 3. Reduce sessions per replica: distribute load to more replicas
```

### Load imbalance

```bash
# Check request distribution
curl -s http://localhost:9090/api/v1/query?query='rate(http_requests_total{job="openwa-api"}[5m])' | jq '.data.result'

# If variance >50%:
# 1. Verify sticky sessions: nginx ip_hash configured?
# 2. Check client IPs: are all requests from same IP? (NAT issue)
# 3. Verify all replicas healthy: one down = all traffic to others
```

## Maintenance

### Backup Schedule

- **Database**: Daily pg_dump at 2 AM (cron)
- **Session profiles**: Weekly NFS snapshot
- **Configuration**: Git commit .env changes (encrypted)

### Scaling Up

```bash
# Add replica 4
docker-compose -f docker-compose.yml -f docker-compose.nfs.yml \
  up -d --scale openwa-api=4

# Update nginx upstream (add openwa-api-4:2785)
nano nginx.conf
docker-compose restart nginx

# Verify
./scripts/smoke-test.sh
```

### Scaling Down

```bash
# Gracefully stop replica 4
docker stop openwa-api-4

# Wait for drain (30s)
sleep 30

# Remove
docker rm openwa-api-4

# Update nginx upstream (remove openwa-api-4)
nano nginx.conf
docker-compose restart nginx
```

## Security Hardening

- [ ] Run containers as non-root (already configured via gosu in entrypoint)
- [ ] Enable read-only rootfs (already configured in docker-compose.yml)
- [ ] Drop all capabilities except required (CHOWN, SETUID, SETGID already minimal)
- [ ] Use secrets management (HashiCorp Vault, AWS Secrets Manager) instead of .env
- [ ] Enable TLS for:
  - [ ] nginx → replicas (mTLS)
  - [ ] replicas → Redis (TLS)
  - [ ] replicas → PostgreSQL (SSL)
  - [ ] replicas → NFS (Kerberos sec=krb5)
- [ ] Enable firewall rules (only allow internal VPC traffic to replicas)
- [ ] Enable audit logging (já implementado em AuditService)

## Performance Tuning

### Database Connection Pool

```typescript
// TypeORM config
extra: {
  max: 20,  // Max connections per replica (3 replicas × 20 = 60 total)
  min: 5,   // Keep 5 connections warm
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
}
```

### Redis Connection Pool

```typescript
// ioredis config
const redis = new Redis({
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  keepAlive: 30000,
});
```

### BullMQ Concurrency

```typescript
// Processor config
@Processor('webhook-delivery', {
  concurrency: 5,  // 5 concurrent jobs per replica (15 total with 3 replicas)
})
```

## Disaster Recovery

### Full System Restore

```bash
# 1. Restore database backup
psql openwa < backup-20260827.sql

# 2. Restore NFS data (from snapshot)
rsync -av /backup/openwa-data/ /exports/openwa-data/

# 3. Deploy from known-good image
IMAGE_TAG=v3.5 ./scripts/deploy-multi-replica.sh v3.5

# 4. Verify
./scripts/smoke-test.sh
```

### RTO/RPO Targets

- **RTO (Recovery Time Objective)**: < 30 minutes
- **RPO (Recovery Point Objective)**: < 24 hours (daily backups)

---

**Last updated:** 2026-08-27  
**Roadmap:** Phase 8 - Horizontal Scaling & Production Hardening
