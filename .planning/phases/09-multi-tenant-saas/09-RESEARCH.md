# Phase 9: Multi-Tenant Support - Research

**Researched:** 2026-08-27  
**Domain:** Multi-tenant SaaS architecture, database isolation, billing integration  
**Confidence:** MEDIUM

## Summary

A transformação do OpenWA em plataforma SaaS multi-tenant requer isolamento rigoroso de dados, API keys por tenant, billing/usage tracking, e onboarding automatizado. Duas abordagens principais emergem: **PostgreSQL RLS (Row Level Security)** para isolamento no banco de dados vs **application-level scoping** via TypeORM/NestJS.

**Arquitetura atual:** OpenWA opera como single-tenant — uma API key global, sem conceito de `tenantId`, todos os dados compartilhados. Entidades existentes (Session, Message, ApiKey, AnalyticsEvent) não possuem coluna `tenantId`.

**Primary recommendation:** Hybrid approach — usar **Application-level scoping** (TypeORM + NestJS ClsModule) para flexibilidade e controle explícito, com **PostgreSQL RLS como safety net** em production para prevenir cross-tenant leaks mesmo se application logic falhar. RLS puro é mais seguro mas menos flexível; app-level é mais explícito mas requer disciplina.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tenant context extraction | API / Backend | — | Middleware extrai `tenantId` de JWT/header, armazena em AsyncLocalStorage |
| Query scoping enforcement | Database | API / Backend | RLS garante isolamento no PostgreSQL; app-level adiciona controle explícito |
| API key validation | API / Backend | — | Guard valida API key e resolve tenant associado |
| Rate limiting | Cache (Redis) | API / Backend | Redis armazena contadores per-tenant com TTL; backend enforces limits |
| Usage metering | API / Backend | Database | Backend emite eventos; PostgreSQL agrega métricas |
| Billing integration | API / Backend | — | Webhooks Stripe processados no backend; storage no PostgreSQL |
| Tenant provisioning | API / Backend | Database | Workflow de signup cria tenant row + API keys + seed data |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `nestjs-cls` | 4.7.0 [VERIFIED: npm registry] | AsyncLocalStorage para request-scoped tenant context | Padrão NestJS para propagação de contexto entre camadas sem passar parâmetros |
| `stripe` | 19.1.0 [VERIFIED: npm registry] | Billing webhooks, usage metering, subscription management | API oficial Stripe para Node.js, amplamente adotada em SaaS |
| `ioredis` | 5.5.0 [VERIFIED: npm registry] | Redis client para rate limiting per-tenant | Já em uso no projeto; suporta Lua scripts para atomic operations |

**Installation:**
```bash
npm install nestjs-cls@4.7.0 stripe@19.1.0
# ioredis já instalado no projeto
```

**Version verification:**
```bash
npm view nestjs-cls version
# 4.7.0 (published 2024-12-30)

npm view stripe version  
# 19.1.0 (published 2025-01-15)

npm view ioredis version
# 5.5.0 (published 2024-12-10)
```

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/typeorm` | 10.0.0 [VERIFIED: npm registry] | TypeORM integration para NestJS | Já em uso; necessário para EntitySubscribers |
| `typeorm` | 0.3.20 [VERIFIED: npm registry] | ORM com suporte a subscribers/listeners | Já em uso; base para query scoping manual |
| `pg` | 8.13.1 [VERIFIED: npm registry] | PostgreSQL driver | Já em uso; necessário para RLS session variables |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Application-level scoping | PostgreSQL RLS only | RLS mais seguro (database-enforced) mas menos flexível; dificulta joins cross-tenant legítimos (ex: admin dashboard) |
| nestjs-cls (AsyncLocalStorage) | Request-scoped providers | Providers mais "NestJS-native" mas verbosos; ALS é padrão moderno para context propagation |
| Stripe | PagSeguro (Brasil) | PagSeguro sem metering API nativa; Stripe mais completo para usage-based billing |
| Redis Lua scripts | Application-level rate limiting | App-level race conditions em high-concurrency; Lua garante atomicidade |

## Tenant Isolation Approaches

### Approach 1: PostgreSQL Row Level Security (RLS)

**What:** Database-level row filtering via policies. PostgreSQL filtra automaticamente queries baseado em session variable `app.tenant_id`.

**Pros:**
- ✅ **Defense in depth:** Isolamento garantido mesmo se application logic falhar
- ✅ **Auditável:** Policies visíveis em schema SQL, versionadas com migrations
- ✅ **Performance:** Native PostgreSQL, sem overhead de application parsing
- ✅ **Compliance-friendly:** LGPD/GDPR requerem "impossibilidade técnica" de leak — RLS oferece isso

**Cons:**
- ❌ **Complexidade em joins:** Queries cross-tenant legítimas (admin analytics) precisam `SET LOCAL` para bypass
- ❌ **Debugging opaco:** Policy violations retornam empty result set, não erro explícito
- ❌ **Migration overhead:** Adicionar RLS em schema existente requer políticas para CADA tabela
- ❌ **Session variable management:** Cada query precisa `SET app.tenant_id` antes; connection pooling complica (variable persiste na connection)

**Implementation pattern [CITED: PostgreSQL docs]:**

```sql
-- Enable RLS on table
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: users see only their tenant's rows
CREATE POLICY tenant_isolation ON sessions
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Policy: admins can see all (bypass RLS)
CREATE POLICY admin_all ON sessions
  TO admin_role
  USING (true);
```

**Per-request setup (TypeORM):**
```typescript
// Middleware sets session variable before query
await queryRunner.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
```

### Approach 2: Application-Level Scoping (TypeORM + NestJS)

**What:** Tenant context propagado via AsyncLocalStorage (ClsModule). Repositories/services injetam `tenantId` explicitamente em WHERE clauses.

**Pros:**
- ✅ **Explicit is better than implicit:** Cada query declara tenant; fácil code review
- ✅ **Flexível:** Queries cross-tenant triviais (admin dashboard, analytics)
- ✅ **Debuggable:** Logs mostram `tenantId` em cada query; erros explícitos
- ✅ **Migration incremental:** Adicionar scoping table-por-table conforme necessário

**Cons:**
- ❌ **Erro humano:** Esquecer `.where('tenantId', tid)` em uma query causa leak
- ❌ **Verboso:** Cada repository method precisa injetar tenant filter
- ❌ **Não auditável por ferramentas:** Linters/SAST não detectam "esqueci o WHERE"
- ❌ **Teste coverage crítico:** Requer integration tests verificando isolation

**Implementation pattern [CITED: NestJS docs + TypeORM docs]:**

```typescript
// 1. ClsModule setup (app.module.ts)
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
  ],
})
export class AppModule {}

// 2. Middleware extrai tenant (tenant-context.middleware.ts)
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] || req.user?.tenantId;
    this.cls.set('tenantId', tenantId);
    next();
  }
}

// 3. Base repository injeta tenant em queries (tenant-scoped.repository.ts)
export class TenantScopedRepository<T> {
  constructor(
    private readonly cls: ClsService,
    private readonly repo: Repository<T>,
  ) {}

  private getTenantId(): string {
    const tid = this.cls.get('tenantId');
    if (!tid) throw new UnauthorizedException('Tenant context missing');
    return tid;
  }

  async find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repo.find({
      ...options,
      where: { tenantId: this.getTenantId(), ...options?.where },
    });
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repo.findOne({
      ...options,
      where: { tenantId: this.getTenantId(), ...options?.where },
    });
  }
}

// 4. EntitySubscriber como safety net (tenant-guard.subscriber.ts)
@EventSubscriber()
export class TenantGuardSubscriber implements EntitySubscriberInterface {
  constructor(private readonly cls: ClsService) {}

  beforeInsert(event: InsertEvent<any>) {
    if (event.entity.tenantId === undefined) {
      event.entity.tenantId = this.cls.get('tenantId');
    }
  }

  beforeQuery(event: BeforeQueryEvent<any>) {
    // Log warning se query sem tenant filter (dev/staging only)
    if (process.env.NODE_ENV !== 'production') {
      const sql = event.query;
      if (!sql.includes('tenantId') && !sql.includes('tenant_id')) {
        console.warn('[TenantGuard] Query without tenant filter:', sql);
      }
    }
  }
}
```

### Approach 3: Hybrid (RECOMMENDED)

**What:** Application-level scoping como primary mechanism, PostgreSQL RLS como safety net em production.

**Rationale:**
- App-level dá flexibilidade para queries legítimas (admin analytics, cross-tenant reports)
- RLS previne leaks catastrophic se app logic tiver bug
- Dev/staging usam app-level only (RLS off) para debugging facilitado
- Production ativa RLS após migration estável

**Migration path:**
1. **Phase 1:** Adicionar `tenantId` columns + app-level scoping + tests (RLS disabled)
2. **Phase 2:** Ativar RLS em staging, monitorar policy violations via audit log
3. **Phase 3:** Deploy RLS em production após 2 semanas zero violations

**Production config:**
```typescript
// config/database.config.ts
export default {
  enableRLS: process.env.NODE_ENV === 'production',
  rlsBypassRoles: ['admin_role'], // Para analytics queries
};
```

## API Key Scoping Strategy

### Current Architecture [VERIFIED: src/modules/auth/entities/api-key.entity.ts:1-56]

```typescript
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  keyHash!: string;

  @Column({ type: 'varchar', length: 12 })
  keyPrefix!: string;

  @Column({ type: 'varchar', length: 20, default: ApiKeyRole.OPERATOR })
  role!: ApiKeyRole;

  @Column({ type: 'simple-array', nullable: true })
  allowedIps!: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  allowedSessions!: string[] | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'datetime', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  usageCount!: number;

  // ❌ Missing: tenantId column
}
```

**Gap:** API keys são globais. Não há conceito de "esta key pertence ao tenant X".

### Multi-Tenant API Key Design

**New columns needed:**

```typescript
@Entity('api_keys')
export class ApiKey {
  // ... existing fields ...

  @Column({ type: 'uuid' })
  @Index()
  tenantId!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: {
    rateLimitOverride?: number; // Requests per minute override
    quotaOverride?: { messages?: number; tokens?: number }; // Monthly quota override
  };
}
```

**Key format:** `openwa_<env>_<tenantPrefix>_<random>`
- `env`: `prod` | `dev`
- `tenantPrefix`: First 4 chars of tenant name (slugified)
- `random`: 32-char base58

**Example:** `openwa_prod_acme_7YjK9pLmQwXr3Zv8NbTc4Hf6Gd2Sx1Vu`

**Validation flow [CITED: src/modules/auth/guards/api-key.guard.ts:52-113]:**

```typescript
// Current: validateApiKey returns ApiKey entity
const apiKey = await this.authService.validateApiKey(apiKeyHeader, clientIp, sessionId);

// New: validateApiKey também resolve tenant e injeta no ClsService
const apiKey = await this.authService.validateApiKey(apiKeyHeader, clientIp, sessionId);
this.cls.set('tenantId', apiKey.tenantId);
this.cls.set('apiKeyId', apiKey.id);
```

**Rate limiting:** Separado por tenant (ver seção Redis Rate Limiting).

## Billing Integration Pattern

### Stripe vs PagSeguro Comparison

| Feature | Stripe | PagSeguro |
|---------|--------|-----------|
| Usage metering API | ✅ Native (Billing Meters) | ❌ Manual tracking |
| Webhook reliability | ✅ Retry + signature verification | ⚠️ Basic webhooks |
| Multi-currency | ✅ 135+ currencies | ❌ BRL only |
| Subscription management | ✅ Full API (pause, upgrade, prorate) | ⚠️ Limited |
| Developer experience | ✅ Excellent docs + SDKs | ⚠️ Portuguese-only docs |
| Brasil market | ⚠️ Requires Stripe Brasil entity | ✅ Native |

**Recommendation:** Start with **Stripe** para MVP global. Add PagSeguro later se foco no Brasil.

### Stripe Billing Meters Implementation [CITED: Stripe API docs]

**1. Create meter (one-time setup):**

```typescript
// Setup: Define meter for message counting
const meter = await stripe.billing.meters.create({
  display_name: 'WhatsApp Messages Sent',
  event_name: 'whatsapp.message.sent',
  default_aggregation: { formula: 'sum' },
  customer_mapping: {
    type: 'by_id',
    event_payload_key: 'stripe_customer_id',
  },
  value_settings: {
    event_payload_key: 'message_count',
  },
});
```

**2. Emit usage events:**

```typescript
// After each message sent
await stripe.billing.meterEvents.create({
  event_name: 'whatsapp.message.sent',
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    message_count: 1,
  },
  identifier: `msg-${messageId}`, // Idempotency
  timestamp: Math.floor(Date.now() / 1000),
});
```

**3. Handle webhooks:**

```typescript
@Controller('webhooks/stripe')
export class StripeWebhookController {
  @Post()
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    switch (event.type) {
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
    }

    return { received: true };
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const tenant = await this.tenantService.findByStripeCustomerId(
      invoice.customer as string,
    );
    
    // Soft limit: downgrade to free tier after 3 days grace
    await this.tenantService.scheduleDowngrade(tenant.id, { graceDays: 3 });
    
    // Send email notification
    await this.emailService.send({
      to: tenant.billingEmail,
      template: 'payment-failed',
      data: { invoiceUrl: invoice.hosted_invoice_url },
    });
  }
}
```

### Usage Tracking Architecture

**Storage:** Extend existing `analytics_events` table [VERIFIED: src/modules/analytics/entities/analytics-event.entity.ts:14-60]:

```typescript
@Entity('analytics_events')
@Index('IDX_analytics_events_tenant_type_created', ['tenant_id', 'event_type', 'created_at'])
export class AnalyticsEvent {
  // ... existing fields ...

  @Column({ type: 'uuid', nullable: true })
  @Index()
  tenant_id?: string; // NEW: for per-tenant aggregation

  // Existing fields already support usage tracking:
  // - event_type: 'message.sent', 'llm.tokens.used', 'storage.bytes'
  // - tokens_used: number
  // - cost_usd: decimal(10,6)
  // - payload: JSONB for custom metrics
}
```

**Aggregation query (monthly usage):**

```sql
-- Monthly message count per tenant
SELECT tenant_id,
       COUNT(*) as message_count,
       SUM(tokens_used) as total_tokens,
       SUM(cost_usd) as total_cost
FROM analytics_events
WHERE event_type = 'message.sent'
  AND created_at >= date_trunc('month', CURRENT_DATE)
  AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
GROUP BY tenant_id;
```

**Quota enforcement:**

```typescript
@Injectable()
export class QuotaGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tenantId = this.cls.get('tenantId');
    const tenant = await this.tenantService.findById(tenantId);

    const usage = await this.usageService.getCurrentMonthUsage(tenantId);

    // Soft limit: warn at 80%
    if (usage.messages >= tenant.quotaMessages * 0.8) {
      await this.notificationService.sendQuotaWarning(tenant, usage);
    }

    // Hard limit: block at 100% (unless overage allowed)
    if (usage.messages >= tenant.quotaMessages && !tenant.allowOverage) {
      throw new ForbiddenException('Monthly message quota exceeded');
    }

    return true;
  }
}
```

## Redis Rate Limiting Per-Tenant

### Pattern: Sliding Window (RECOMMENDED) [CITED: Redis docs]

**Why sliding window over fixed window:**
- Fixed window permite burst no boundary (59 requests em :59s, 60 em :00s = 119 em 1 segundo)
- Sliding window distribui uniformemente ao longo do tempo

**Implementation (Lua script para atomicidade):**

```typescript
// rate-limiter.service.ts
@Injectable()
export class RateLimiterService {
  private readonly slidingWindowScript = `
    local base   = KEYS[1]
    local limit  = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])

    local t   = redis.call('TIME')
    local now = tonumber(t[1]) + tonumber(t[2]) / 1e6

    local window_num = math.floor(now / window)
    local elapsed     = (now % window) / window

    local curr_key = base .. ':' .. window_num
    local prev_key = base .. ':' .. (window_num - 1)

    local prev = tonumber(redis.call('GET', prev_key) or 0)
    local curr = tonumber(redis.call('GET', curr_key) or 0)

    local estimate = prev * (1 - elapsed) + curr

    if estimate >= limit then
        return {0, math.ceil(limit - estimate)}
    end

    local new_count = redis.call('INCR', curr_key)
    if new_count == 1 then
        redis.call('EXPIRE', curr_key, window * 2)
    end

    return {1, math.ceil(limit - estimate - 1)}
  `;

  async checkLimit(
    tenantId: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = `rate_limit:tenant:${tenantId}`;
    
    const [allowed, remaining] = await this.redis.eval(
      this.slidingWindowScript,
      1,
      key,
      limit,
      windowSeconds,
    ) as [number, number];

    return {
      allowed: Boolean(allowed),
      remaining: Math.max(0, remaining),
    };
  }
}
```

**Usage in guard:**

```typescript
@Injectable()
export class TenantRateLimitGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tenantId = this.cls.get('tenantId');
    const tenant = await this.tenantService.findById(tenantId);

    const limit = tenant.rateLimitOverride ?? 60; // Default: 60 req/min
    const result = await this.rateLimiter.checkLimit(tenantId, limit, 60);

    if (!result.allowed) {
      throw new TooManyRequestsException({
        message: 'Rate limit exceeded',
        retryAfter: 60,
        limit,
      });
    }

    // Adicionar headers de rate limit na response
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);

    return true;
  }
}
```

**Redis key structure para multi-tenant:**

```
rate_limit:tenant:<tenantId>:<window_num>
usage:tenant:<tenantId>:messages:<YYYY-MM>
usage:tenant:<tenantId>:tokens:<YYYY-MM>
```

**Redis Cluster considerations:** Use hash tags `{tenantId}` para co-location:

```typescript
const key = `rate_limit:tenant:{${tenantId}}:window`;
```

## Data Migration Strategy

### Current Schema Gap

**Tables needing `tenantId` column [VERIFIED: entity file inspection]:**

1. ✅ `sessions` — cada WhatsApp session pertence a um tenant
2. ✅ `messages` — todas as mensagens são tenant-scoped
3. ✅ `api_keys` — keys pertencem a tenant específico
4. ✅ `webhooks` — webhook configs por tenant
5. ✅ `automation_rules` — automation rules por tenant
6. ✅ `analytics_events` — usage tracking por tenant
7. ✅ `analytics_aggregates` — agregações por tenant
8. ✅ `intake_leads` — leads capturados por tenant
9. ✅ `audit_logs` — audit trail por tenant

**Tables NOT needing `tenantId`:**
- ❌ `knowledge_base_documents` — **actually needs it** (cada KB é tenant-owned)
- ❌ `llm_conversations` — **actually needs it** (conversas pertencem a tenant)
- ❌ `webhook_outbox_events` / `webhook_delivery_failures` — indiretamente scoped via `webhook_id` FK

### Zero-Downtime Migration Plan

**Challenge:** Adicionar `NOT NULL` column em tabela grande (messages, analytics_events) causa lock.

**Solution:** Multi-step migration sem downtime [ASSUMED: PostgreSQL 12+ supports this pattern]:

#### Step 1: Add nullable column (non-blocking)

```typescript
// migrations/YYYYMMDDHHMMSS-add-tenantid-nullable.ts
export class AddTenantIdNullable1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add column without NOT NULL constraint (instant, no table rewrite)
    await queryRunner.query(`
      ALTER TABLE sessions ADD COLUMN tenant_id UUID;
      ALTER TABLE messages ADD COLUMN tenant_id UUID;
      ALTER TABLE api_keys ADD COLUMN tenant_id UUID;
      -- ... outras tabelas ...
    `);

    // Add indexes (can run concurrently to avoid locks)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY idx_sessions_tenant_id ON sessions(tenant_id);
      CREATE INDEX CONCURRENTLY idx_messages_tenant_id ON messages(tenant_id);
      CREATE INDEX CONCURRENTLY idx_api_keys_tenant_id ON api_keys(tenant_id);
    `);
  }
}
```

#### Step 2: Backfill default tenant (background job)

```typescript
// scripts/backfill-default-tenant.ts
import { DataSource } from 'typeorm';

const DEFAULT_TENANT_ID = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'; // UUID do tenant "legacy"

async function backfillTenantId(dataSource: DataSource) {
  const batchSize = 1000;
  let offset = 0;

  // Create default tenant first
  await dataSource.query(`
    INSERT INTO tenants (id, name, slug, created_at)
    VALUES ($1, 'Legacy Tenant', 'legacy', NOW())
    ON CONFLICT (id) DO NOTHING
  `, [DEFAULT_TENANT_ID]);

  // Backfill messages in batches
  while (true) {
    const result = await dataSource.query(`
      UPDATE messages
      SET tenant_id = $1
      WHERE tenant_id IS NULL
      LIMIT $2
    `, [DEFAULT_TENANT_ID, batchSize]);

    if (result.affectedRows === 0) break;
    
    offset += batchSize;
    console.log(`Backfilled ${offset} messages`);
    
    // Throttle to avoid overwhelming DB
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Repeat for other tables...
}
```

#### Step 3: Add NOT NULL constraint (after backfill completes)

```typescript
// migrations/YYYYMMDDHHMMSS-make-tenantid-required.ts
export class MakeTenantIdRequired1234567891 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verify no nulls remain (safety check)
    const nullCount = await queryRunner.query(`
      SELECT COUNT(*) FROM messages WHERE tenant_id IS NULL
    `);
    
    if (nullCount[0].count > 0) {
      throw new Error(`Cannot add NOT NULL: ${nullCount[0].count} rows still have null tenant_id`);
    }

    // Add NOT NULL constraint (fast if all values populated)
    await queryRunner.query(`
      ALTER TABLE sessions ALTER COLUMN tenant_id SET NOT NULL;
      ALTER TABLE messages ALTER COLUMN tenant_id SET NOT NULL;
      ALTER TABLE api_keys ALTER COLUMN tenant_id SET NOT NULL;
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE sessions ADD CONSTRAINT fk_sessions_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      
      ALTER TABLE messages ADD CONSTRAINT fk_messages_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      
      ALTER TABLE api_keys ADD CONSTRAINT fk_api_keys_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    `);
  }
}
```

#### Step 4: Enable RLS (after app deployment with tenant scoping)

```typescript
// migrations/YYYYMMDDHHMMSS-enable-rls.ts
export class EnableRLS1234567892 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable RLS on all tenant-scoped tables
    await queryRunner.query(`
      ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
    `);

    // Create policies
    await queryRunner.query(`
      CREATE POLICY tenant_isolation_sessions ON sessions
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id')::uuid);

      CREATE POLICY tenant_isolation_messages ON messages
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id')::uuid);

      CREATE POLICY tenant_isolation_api_keys ON api_keys
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id')::uuid);
    `);

    // Admin bypass policy
    await queryRunner.query(`
      CREATE ROLE tenant_admin;

      CREATE POLICY admin_bypass_sessions ON sessions
        TO tenant_admin
        USING (true);

      CREATE POLICY admin_bypass_messages ON messages
        TO tenant_admin
        USING (true);
    `);
  }
}
```

**Timeline estimate:**
- Step 1: Deploy imediatamente (minutes)
- Step 2: Run backfill job (hours to days, depending on table size)
- Step 3: Deploy após backfill 100% (minutes)
- Step 4: Deploy em production após staging validation (days/weeks)

**Rollback strategy:**
- Step 1-2: Drop column (reversible)
- Step 3: Remove constraint, keep column (reversible)
- Step 4: Disable RLS, drop policies (reversible)

## Tenant Onboarding Automation

### Self-Service Signup Flow

**User journey:**
1. Land on `/signup` → Form (name, email, company, plan)
2. Email verification → Confirm email token
3. Tenant provisioning → Create tenant + admin API key + default session
4. Onboarding wizard → Step-by-step setup (WhatsApp QR, KB upload, test message)
5. Dashboard redirect → Ready to use

**Backend workflow:**

```typescript
@Injectable()
export class TenantProvisioningService {
  async provisionTenant(dto: SignupDto): Promise<{
    tenant: Tenant;
    adminKey: string; // Plain key (only shown once)
    setupUrl: string;
  }> {
    return this.dataSource.transaction(async (em) => {
      // 1. Create tenant
      const tenant = em.create(Tenant, {
        name: dto.companyName,
        slug: this.slugify(dto.companyName),
        billingEmail: dto.email,
        plan: dto.plan || 'free',
        quotaMessages: this.getQuotaForPlan(dto.plan),
        rateLimitPerMinute: this.getRateLimitForPlan(dto.plan),
        stripeCustomerId: null, // Created async via Stripe API
      });
      await em.save(tenant);

      // 2. Create Stripe customer (async, non-blocking)
      this.queue.add('create-stripe-customer', {
        tenantId: tenant.id,
        email: dto.email,
        name: dto.companyName,
      });

      // 3. Generate admin API key
      const { key: plainKey, hash } = await this.authService.generateApiKey();
      const apiKey = em.create(ApiKey, {
        tenantId: tenant.id,
        name: 'Admin Key (auto-generated)',
        keyHash: hash,
        keyPrefix: plainKey.substring(0, 12),
        role: ApiKeyRole.ADMIN,
        allowedIps: null, // No IP restriction initially
        allowedSessions: null, // Access all sessions
      });
      await em.save(apiKey);

      // 4. Create default WhatsApp session (pre-initialized)
      const session = em.create(Session, {
        tenantId: tenant.id,
        name: 'default',
        status: SessionStatus.CREATED,
        config: {
          autoReconnect: true,
          webhookUrl: null, // Configured later in wizard
        },
      });
      await em.save(session);

      // 5. Seed knowledge base with example docs (optional)
      if (dto.seedExamples) {
        await this.knowledgeBaseService.seedExamples(tenant.id, em);
      }

      // 6. Send welcome email
      await this.emailService.send({
        to: dto.email,
        template: 'welcome',
        data: {
          tenantName: tenant.name,
          apiKey: plainKey,
          setupUrl: `${process.env.BASE_URL}/onboarding/${tenant.id}`,
        },
      });

      return {
        tenant,
        adminKey: plainKey,
        setupUrl: `/onboarding/${tenant.id}`,
      };
    });
  }

  private getQuotaForPlan(plan: string): number {
    const quotas = {
      free: 100,
      starter: 1000,
      pro: 10000,
      enterprise: 100000,
    };
    return quotas[plan] || quotas.free;
  }

  private getRateLimitForPlan(plan: string): number {
    const limits = {
      free: 10,      // 10 req/min
      starter: 60,   // 60 req/min
      pro: 300,      // 300 req/min
      enterprise: 1000, // 1000 req/min
    };
    return limits[plan] || limits.free;
  }
}
```

### Onboarding Wizard Steps

**Frontend (React):**

```typescript
// components/OnboardingWizard.tsx
const steps = [
  {
    id: 'welcome',
    title: 'Welcome to OpenWA',
    component: <WelcomeStep />,
  },
  {
    id: 'whatsapp',
    title: 'Connect WhatsApp',
    component: <WhatsAppQRStep />,
    validation: async () => {
      const session = await api.getSessions();
      return session[0]?.status === 'ready';
    },
  },
  {
    id: 'knowledge-base',
    title: 'Upload Knowledge Base',
    component: <KnowledgeBaseUploadStep />,
    optional: true,
  },
  {
    id: 'test-message',
    title: 'Send Test Message',
    component: <TestMessageStep />,
    validation: async () => {
      const messages = await api.getMessages({ limit: 1 });
      return messages.length > 0;
    },
  },
  {
    id: 'complete',
    title: 'Setup Complete!',
    component: <CompleteStep />,
  },
];
```

**Sandbox mode (trial tenants):**

```typescript
@Entity('tenants')
export class Tenant {
  @Column({ type: 'boolean', default: false })
  isSandbox!: boolean;

  @Column({ type: 'datetime', nullable: true })
  sandboxExpiresAt!: Date | null; // 14 days trial

  // Sandbox limits (lower than paid plans)
  @Column({ type: 'int', default: 50 })
  sandboxQuotaMessages!: number;
}
```

**Sandbox restrictions:**
- Limited to 1 WhatsApp session
- 50 messages per month
- Knowledge base max 10 documents
- No webhook configuration
- Auto-delete after 30 days inactivity

**Upgrade flow:**

```typescript
@Post('tenant/:tenantId/upgrade')
async upgradeTenant(
  @Param('tenantId') tenantId: string,
  @Body() dto: UpgradeDto,
) {
  const tenant = await this.tenantService.findById(tenantId);

  // Create Stripe subscription
  const subscription = await this.stripe.subscriptions.create({
    customer: tenant.stripeCustomerId,
    items: [{ price: dto.stripePriceId }],
    trial_period_days: dto.trialDays,
  });

  // Update tenant
  await this.tenantService.update(tenantId, {
    isSandbox: false,
    plan: dto.plan,
    quotaMessages: this.getQuotaForPlan(dto.plan),
    stripeSubscriptionId: subscription.id,
  });

  return { subscription };
}
```

## Common Pitfalls

### Pitfall 1: Cross-Tenant Data Leaks via Admin Queries

**What goes wrong:**  
Admin dashboard queries (ex: "show all tenants' usage") bypass tenant scoping, mas esquecem de usar `SET LOCAL` para bypass RLS. Resultado: RLS bloqueia query, admin dashboard vazio.

**Why it happens:**  
RLS policies aplicam para TODAS as queries, incluindo admin. Não há "super user context" automático.

**How to avoid:**  
```typescript
// Admin queries explicitamente desabilitam RLS temporariamente
async getGlobalUsageStats(): Promise<UsageStats> {
  return this.dataSource.transaction(async (em) => {
    // Bypass RLS para esta transaction
    await em.query(`SET LOCAL row_security = OFF`);
    
    const stats = await em.query(`
      SELECT tenant_id, COUNT(*) as message_count
      FROM messages
      GROUP BY tenant_id
    `);
    
    return stats;
  });
}
```

**Warning signs:**  
- Admin dashboard mostra dados vazios apesar de rows existirem
- Logs mostram queries corretas mas retornam 0 results
- `EXPLAIN ANALYZE` mostra "Rows Removed by Filter" altíssimo

### Pitfall 2: Tenant Context Lost em Async Jobs

**What goes wrong:**  
BullMQ job queue processa job sem tenant context. AsyncLocalStorage não propaga para worker threads.

**Why it happens:**  
ALS é thread-local. Queue workers rodam em processo separado.

**How to avoid:**  
```typescript
// Job producer: inclui tenantId no payload
await this.queue.add('send-bulk-messages', {
  tenantId: this.cls.get('tenantId'), // ✅ Explicit
  messageIds: [...],
});

// Job consumer: reconstrói tenant context
@Processor('send-bulk-messages')
export class BulkMessageProcessor {
  @Process()
  async handle(job: Job<{ tenantId: string; messageIds: string[] }>) {
    // ✅ Set tenant context antes de queries
    return this.cls.run(() => {
      this.cls.set('tenantId', job.data.tenantId);
      return this.processBulkMessages(job.data.messageIds);
    });
  }
}
```

**Warning signs:**  
- Jobs falham com "Tenant context missing"
- Queries de jobs vazam dados cross-tenant
- Logs mostram `tenantId: undefined` em job processing

### Pitfall 3: Connection Pool Session Variable Pollution

**What goes wrong:**  
`SET app.tenant_id = 'xxx'` em connection pooled persiste para próximo request. Tenant A vê dados do Tenant B.

**Why it happens:**  
PostgreSQL session variables duram pela vida da connection, não da transaction.

**How to avoid:**  
```typescript
// ❌ WRONG: SET sem LOCAL persiste
await queryRunner.query(`SET app.tenant_id = $1`, [tenantId]);

// ✅ CORRECT: SET LOCAL limpa ao fim da transaction
await queryRunner.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);

// Ou: use transaction wrapper que garante cleanup
async withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return this.dataSource.transaction(async (em) => {
    await em.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    return fn();
  });
}
```

**Warning signs:**  
- Cross-tenant leaks intermitentes (não reproduzem sempre)
- Logs mostram tenant context correto mas query retorna dados errados
- Problema piora em alta concorrência (pool reuse frequente)

### Pitfall 4: Race Conditions em Quota Enforcement

**What goes wrong:**  
100 requests simultâneos checkam quota (todos vêem 950/1000), passam validation, executam. Total: 1050 messages enviadas apesar de quota 1000.

**Why it happens:**  
Check-then-act pattern sem lock. Quota check e increment são operações separadas.

**How to avoid:**  
```typescript
// ❌ WRONG: Race condition
const usage = await this.getUsage(tenantId);
if (usage.messages >= quota) throw new Error('Quota exceeded');
await this.incrementUsage(tenantId, 1);

// ✅ CORRECT: Atomic increment + check via Lua script
const allowed = await this.redis.eval(`
  local key = KEYS[1]
  local quota = tonumber(ARGV[1])
  local current = tonumber(redis.call('GET', key) or 0)
  
  if current >= quota then
    return 0
  end
  
  redis.call('INCR', key)
  return 1
`, 1, `quota:${tenantId}:${month}`, quota);

if (!allowed) throw new Error('Quota exceeded');
```

**Warning signs:**  
- Quota overruns de ~5-10% do limite
- Problema só aparece em load tests, não em dev
- Logs mostram múltiplos requests "at quota boundary" simultâneos

### Pitfall 5: Forgot to Scope Knowledge Base Embeddings

**What goes wrong:**  
RAG query retorna documentos de outros tenants porque `pgvector` similarity search não inclui `tenant_id` filter.

**Why it happens:**  
Vector similarity é computada ANTES de WHERE filters. Precisa filtrar DEPOIS de similarity.

**How to avoid:**  
```typescript
// ❌ WRONG: WHERE aplicado após similarity (não filtra)
const results = await em.query(`
  SELECT id, content, 1 - (embedding <=> $1) AS similarity
  FROM knowledge_base_documents
  ORDER BY embedding <=> $1
  LIMIT 10
`, [queryEmbedding]);

// ✅ CORRECT: WHERE integrado no similarity query
const results = await em.query(`
  SELECT id, content, 1 - (embedding <=> $2) AS similarity
  FROM knowledge_base_documents
  WHERE tenant_id = $1
  ORDER BY embedding <=> $2
  LIMIT 10
`, [tenantId, queryEmbedding]);
```

**Warning signs:**  
- RAG responses incluem informações de outros clientes
- Logs de similarity search não mostram tenant_id filter
- Problema aparece em integration tests mas passa em unit tests (mock)

## Code Examples

### Complete Tenant-Scoped Repository Pattern

```typescript
// common/repositories/tenant-scoped-base.repository.ts
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Repository, FindManyOptions, FindOneOptions, DeepPartial } from 'typeorm';

export abstract class TenantScopedRepository<T> {
  constructor(
    protected readonly cls: ClsService,
    protected readonly repository: Repository<T>,
  ) {}

  protected getTenantId(): string {
    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) {
      throw new Error(
        'Tenant context missing. Ensure TenantContextMiddleware ran before this call.',
      );
    }
    return tenantId;
  }

  async find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find({
      ...options,
      where: {
        tenantId: this.getTenantId(),
        ...(options?.where || {}),
      } as any,
    });
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne({
      ...options,
      where: {
        tenantId: this.getTenantId(),
        ...(options?.where || {}),
      } as any,
    });
  }

  async findById(id: string): Promise<T | null> {
    return this.findOne({ where: { id } as any });
  }

  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create({
      ...data,
      tenantId: this.getTenantId(),
    } as any);
    return this.repository.save(entity);
  }

  async update(id: string, data: DeepPartial<T>): Promise<T> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new Error(`Entity with id ${id} not found`);
    }
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async delete(id: string): Promise<void> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new Error(`Entity with id ${id} not found`);
    }
    await this.repository.remove(entity);
  }

  // Admin-only: bypass tenant scoping
  async findAllTenants(options?: FindManyOptions<T>): Promise<T[]> {
    // No tenantId filter — use with caution
    return this.repository.find(options);
  }
}
```

**Usage:**

```typescript
// modules/session/session.repository.ts
@Injectable()
export class SessionRepository extends TenantScopedRepository<Session> {
  constructor(
    cls: ClsService,
    @InjectRepository(Session) repo: Repository<Session>,
  ) {
    super(cls, repo);
  }

  // Domain-specific methods auto-inherit tenant scoping
  async findByName(name: string): Promise<Session | null> {
    return this.findOne({ where: { name } });
  }

  async findActive(): Promise<Session[]> {
    return this.find({
      where: { status: SessionStatus.READY },
    });
  }
}
```

### Stripe Webhook Handler com Idempotency

```typescript
// modules/billing/stripe-webhook.controller.ts
import { Controller, Post, Req, Headers, BadRequestException } from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import Stripe from 'stripe';

@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly stripe: Stripe;
  private readonly processedEvents = new Set<string>();

  constructor(
    private readonly tenantService: TenantService,
    private readonly auditService: AuditService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-12-18.acacia',
    });
  }

  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    // 1. Verify webhook signature
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody!,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
    }

    // 2. Idempotency: skip if already processed
    if (this.processedEvents.has(event.id)) {
      return { received: true, status: 'duplicate' };
    }

    // 3. Route to handler
    try {
      await this.routeEvent(event);
      this.processedEvents.add(event.id);

      // Clean up old processed events (retain 24h)
      setTimeout(() => this.processedEvents.delete(event.id), 24 * 60 * 60 * 1000);

      return { received: true, status: 'processed' };
    } catch (err) {
      // Log error but return 200 to prevent Stripe retries
      await this.auditService.logError('stripe-webhook-failed', {
        eventId: event.id,
        eventType: event.type,
        error: err.message,
      });
      return { received: true, status: 'error' };
    }
  }

  private async routeEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionChanged(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handleSubscriptionChanged(subscription: Stripe.Subscription) {
    const tenant = await this.tenantService.findByStripeCustomerId(
      subscription.customer as string,
    );

    if (!tenant) {
      throw new Error(`Tenant not found for Stripe customer ${subscription.customer}`);
    }

    // Extract plan from subscription metadata
    const plan = subscription.metadata.plan || 'starter';

    await this.tenantService.update(tenant.id, {
      plan,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      quotaMessages: this.getQuotaForPlan(plan),
      rateLimitPerMinute: this.getRateLimitForPlan(plan),
    });

    await this.auditService.logInfo('subscription-changed', {
      tenantId: tenant.id,
      plan,
      status: subscription.status,
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const tenant = await this.tenantService.findByStripeCustomerId(
      invoice.customer as string,
    );

    if (!tenant) return;

    // Grace period: 3 days before downgrade
    const gracePeriodEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    await this.tenantService.update(tenant.id, {
      paymentStatus: 'failed',
      gracePeriodEndsAt: gracePeriodEnd,
    });

    // Schedule downgrade job
    await this.queue.add(
      'downgrade-tenant',
      { tenantId: tenant.id },
      { delay: 3 * 24 * 60 * 60 * 1000 },
    );

    // Send email notification
    await this.emailService.send({
      to: tenant.billingEmail,
      template: 'payment-failed',
      data: {
        tenantName: tenant.name,
        invoiceUrl: invoice.hosted_invoice_url,
        gracePeriodEnd,
      },
    });
  }

  private getQuotaForPlan(plan: string): number {
    const quotas = { free: 100, starter: 1000, pro: 10000, enterprise: 100000 };
    return quotas[plan] || quotas.free;
  }

  private getRateLimitForPlan(plan: string): number {
    const limits = { free: 10, starter: 60, pro: 300, enterprise: 1000 };
    return limits[plan] || limits.free;
  }
}
```

## Recommended Approach Summary

**Architecture decision:** Hybrid app-level + RLS

**Component choices:**
1. **Tenant context propagation:** nestjs-cls (AsyncLocalStorage)
2. **Query scoping:** TenantScopedRepository base class + EntitySubscriber safety net
3. **Database isolation:** PostgreSQL RLS enabled in production only
4. **API key scoping:** Add `tenantId` column to `api_keys`, validate in guard
5. **Rate limiting:** Redis sliding window per-tenant via Lua script
6. **Billing:** Stripe Billing Meters for usage tracking
7. **Onboarding:** Transactional provisioning with async Stripe customer creation

**Migration path:**
1. Add nullable `tenantId` columns (non-blocking)
2. Backfill default tenant (background job)
3. Deploy app-level scoping + tests
4. Add NOT NULL constraints
5. Enable RLS in staging → production

**Timeline estimate:** 7-10 days development + 2 weeks staging validation before production RLS.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TypeORM não possui global query filters nativos (requer implementação manual) | Tenant Isolation Approaches | Se TypeORM adicionar essa feature, código customizado será redundante (minor) |
| A2 | PostgreSQL 12+ suporta ADD COLUMN sem table rewrite quando nullable | Data Migration Strategy | Se versão anterior, migration causará lock de tabela (major) |
| A3 | Redis sliding window é mais justo que fixed window para rate limiting | Redis Rate Limiting | Se fixed window suficiente, Lua script adiciona complexidade desnecessária (minor) |
| A4 | Stripe é melhor que PagSeguro para SaaS global | Billing Integration | Se foco apenas Brasil, PagSeguro pode ter vantagens regulatórias (medium) |
| A5 | AsyncLocalStorage (ALS) não propaga para BullMQ workers automaticamente | Common Pitfalls | Se BullMQ adicionar ALS support, workaround de passar tenantId no payload será desnecessário (minor) |

## Open Questions

1. **Tenant deletion strategy**
   - What we know: Soft-delete vs hard-delete tradeoff; LGPD/GDPR requerem "right to be forgotten"
   - What's unclear: Retention period para audit logs após tenant deletion; backup strategy
   - Recommendation: Soft-delete com hard-delete agendado após 90 dias + export para cold storage

2. **Cross-tenant analytics queries**
   - What we know: Admin dashboard precisa agregar métricas cross-tenant; RLS bloqueia isso
   - What's unclear: Performance de `SET LOCAL row_security = OFF` em queries grandes; index strategy
   - Recommendation: Materialized views para analytics agregadas, refresh diário

3. **Tenant subdomain routing**
   - What we know: Padrão SaaS é `tenant-slug.openwa.com` em vez de header `X-Tenant-ID`
   - What's unclear: Nginx config para wildcard subdomain routing; SSL certificate management (wildcard vs SNI)
   - Recommendation: Defer para Phase 10; começar com header-based routing por simplicidade

4. **API key rotation policy**
   - What we know: Keys devem expirar periodicamente por segurança; precisa notificar tenant antes
   - What's unclear: Rotation frequency (30/60/90 dias?); grace period para dual-key validation
   - Recommendation: 90 dias default com 7 dias grace period; tenant pode gerar nova key antes de expirar antiga

## Sources

### Primary (MEDIUM confidence)

- [Context7: /websites/postgresql] - Row Level Security (RLS) policies, CREATE POLICY syntax, USING/WITH CHECK clauses
- [Context7: /nestjs/docs.nestjs.com] - AsyncLocalStorage integration, ClsModule, AggregateByTenantContextIdStrategy
- [Context7: /typeorm/typeorm] - EntitySubscriber, beforeQuery event, query builder patterns
- [Context7: /websites/stripe] - Billing Meters API, webhook events, usage-based billing
- [Context7: /redis/docs] - Rate limiting patterns (token bucket, sliding window), Lua scripts

### Secondary (LOW confidence - requires validation)

- [ASSUMED] PostgreSQL 12+ ADD COLUMN optimization (nullable without rewrite)
- [ASSUMED] TypeORM lacks native global query filters (verified by absence in docs, not explicit statement)
- [ASSUMED] BullMQ workers do not inherit AsyncLocalStorage context (common Node.js limitation)

## Metadata

**Confidence breakdown:**
- Tenant isolation patterns: MEDIUM - Context7 docs + PostgreSQL official docs fornecem foundation sólida
- API key scoping: MEDIUM - Design baseado em entity existente verificada no codebase
- Billing integration: MEDIUM - Stripe API bem documentada, mas padrões de uso assumidos
- Migration strategy: LOW - PostgreSQL optimization behavior assumido sem teste prático
- Onboarding flow: LOW - Padrões de UX baseados em best practices SaaS, não em docs oficiais

**Research date:** 2026-08-27  
**Valid until:** ~30 days (stable stack, mas Stripe API evolui rapidamente)
