# 🚀 Guia Prático: Implementação de Testes E2E

## 📖 Como Usar Este Roadmap

Este guia fornece instruções passo-a-passo para implementar os 18 gaps críticos identificados no `E2E_TEST_ROADMAP.md`.

---

## 🎯 Fase 1: Setup Inicial (15 min)

### 1. Instalar Dependências

```bash
# Certifique-se que todas as dependências estão instaladas
npm install

# Instalar dependências específicas para testes
npm install --save-dev @types/supertest supertest stripe
```

### 2. Configurar Ambiente de Teste

```bash
# Copiar template de env para testes
cp .env.example .env.test

# Configurar variáveis críticas
cat >> .env.test << EOF
NODE_ENV=test
DATABASE_TYPE=sqlite
DATABASE_SYNCHRONIZE=true
REDIS_ENABLED=false
QUEUE_ENABLED=false
STRIPE_SECRET_KEY=sk_test_YOUR_KEY  # Apenas se testar billing
EOF
```

### 3. Verificar Setup Existente

```bash
# Executar teste de smoke para garantir que o ambiente funciona
npm run test:e2e -- app.e2e-spec.ts

# Se passar, você está pronto! ✅
```

---

## 🔴 Fase 2: Gaps de Prioridade ALTA (Semana 1-3)

### Gap #1: Dashboard Login E2E

**Arquivo:** `test/templates/GAP-01-dashboard-login.e2e-spec.ts` (já criado)

**Implementação:**

1. **Copiar template para pasta de testes:**
```bash
cp test/templates/GAP-01-dashboard-login.e2e-spec.ts test/dashboard-login.e2e-spec.ts
```

2. **Ajustar imports se necessário:**
```bash
# Verificar se os helpers estão corretos
npm run test:e2e -- dashboard-login.e2e-spec.ts --verbose
```

3. **Implementar endpoint `/api/auth/login` (se ainda não existe):**

```typescript
// src/modules/auth/auth.controller.ts

@Post('login')
@Public()
async login(@Body() loginDto: LoginDto): Promise<{ token: string; expiresIn: number }> {
  const { apiKey } = loginDto;
  
  // Validate API key
  const keyData = await this.authService.validateApiKey(apiKey);
  if (!keyData) {
    throw new UnauthorizedException('Invalid API key');
  }
  
  // Generate JWT
  const token = await this.authService.generateJwt({
    keyId: keyData.id,
    role: keyData.role,
    tenantId: keyData.tenantId,
  });
  
  return {
    token,
    expiresIn: 3600, // 1 hour
  };
}
```

4. **Executar teste:**
```bash
npm run test:e2e -- dashboard-login.e2e-spec.ts
```

5. **Validar cobertura:**
```bash
# Deve passar todos os cenários:
# ✅ Login com API key válida
# ✅ Acesso a rotas protegidas
# ✅ Rejeita key inválida
# ✅ Performance < 500ms
```

**Tempo estimado:** 2 horas

---

### Gap #2: Session QR Code Flow

**Arquivo:** `test/session-qr-flow.e2e-spec.ts` (criar)

**Implementação:**

1. **Criar arquivo de teste:**

```typescript
// test/session-qr-flow.e2e-spec.ts

import { createTestApp, createTestApiKey, waitForEvent } from './e2e/helpers/test-helpers';

describe('Session QR Code Flow E2E (GAP #2)', () => {
  let app: INestApplication;
  let apiKey: string;

  beforeAll(async () => {
    app = await createTestApp();
    const keyData = await createTestApiKey(app);
    apiKey = keyData.key;
  });

  it('should generate QR code when session starts', async () => {
    // Create session
    const response = await request(app.getHttpServer())
      .post('/api/sessions')
      .set('x-api-key', apiKey)
      .send({ name: 'qr-test-session' })
      .expect(201);

    const sessionId = response.body.id;

    // Wait for QR event
    const qrEvent = await waitForEvent(app, 'session.qr', 10000);
    
    expect(qrEvent.sessionId).toBe(sessionId);
    expect(qrEvent.qr).toBeTruthy();
    expect(qrEvent.qr).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64
  });

  it('should transition to connected after QR scan', async () => {
    // Note: This requires manual QR scan or mock
    // For automated testing, mock the WhatsApp connection
    
    const response = await request(app.getHttpServer())
      .post('/api/sessions')
      .set('x-api-key', apiKey)
      .send({ name: 'connection-test' });

    const sessionId = response.body.id;

    // In a real test, you'd scan the QR here
    // For automation, mock the connection event
    const eventEmitter = app.get(EventEmitter2);
    eventEmitter.emit('session.ready', { sessionId });

    // Verify status changed
    await waitForCondition(async () => {
      const status = await request(app.getHttpServer())
        .get(`/api/sessions/${sessionId}`)
        .set('x-api-key', apiKey);
      
      return status.body.status === 'connected';
    }, { timeout: 5000 });
  });
});
```

2. **Executar:**
```bash
npm run test:e2e -- session-qr-flow.e2e-spec.ts
```

**Tempo estimado:** 4 horas

---

### Gap #3: Billing Stripe Integration

**Arquivo:** `test/templates/GAP-03-billing-stripe.e2e-spec.ts` (já criado)

**Implementação:**

1. **Copiar template:**
```bash
cp test/templates/GAP-03-billing-stripe.e2e-spec.ts test/billing-stripe.e2e-spec.ts
```

2. **Configurar Stripe test key:**
```bash
# Adicionar ao .env.test
echo "STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY" >> .env.test
```

3. **Implementar endpoints de billing (se necessário):**

```typescript
// src/modules/billing/billing.controller.ts

@Post('subscriptions')
async createSubscription(@Body() dto: CreateSubscriptionDto) {
  return this.billingService.createSubscription(dto.tenantId, dto.priceId);
}

@Get('usage/:tenantId')
async getUsage(@Param('tenantId') tenantId: string) {
  return this.billingService.getUsageBreakdown(tenantId);
}
```

4. **Executar:**
```bash
npm run test:e2e -- billing-stripe.e2e-spec.ts
```

**Tempo estimado:** 6 horas

---

### Gap #4: Message with Media

**Arquivo:** `test/templates/GAP-04-message-media.e2e-spec.ts` (já criado)

**Implementação:**

1. **Copiar template:**
```bash
cp test/templates/GAP-04-message-media.e2e-spec.ts test/message-media.e2e-spec.ts
```

2. **Criar fixtures de teste:**
```bash
mkdir -p test/fixtures

# Criar imagem de teste (1x1 pixel JPEG)
echo "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==" | base64 -d > test/fixtures/test-image.jpg
```

3. **Executar:**
```bash
npm run test:e2e -- message-media.e2e-spec.ts
```

**Tempo estimado:** 3 horas

---

### Gap #5: Postgres Migration Boot

**Arquivo:** `test/postgres-boot.e2e-spec.ts` (criar)

**Implementação:**

1. **Criar teste:**

```typescript
// test/postgres-boot.e2e-spec.ts

describe('Postgres Migration Boot E2E (GAP #5)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Override env to use Postgres
    process.env.DATABASE_TYPE = 'postgres';
    process.env.DATABASE_HOST = 'localhost';
    process.env.DATABASE_PORT = '5432';
    process.env.DATABASE_NAME = 'openwa_test';
    process.env.DATABASE_USERNAME = 'postgres';
    process.env.DATABASE_PASSWORD = 'postgres';

    app = await createTestApp();
  });

  it('should boot with Postgres and apply migrations', async () => {
    const dataSource = app.get(DataSource);
    
    // Verify connection
    expect(dataSource.isInitialized).toBe(true);
    
    // Verify migrations ran
    const migrations = await dataSource.showMigrations();
    expect(migrations).toBe(false); // All migrations applied
  });

  it('should use advisory lock for concurrent boots', async () => {
    // Start two boots simultaneously
    const boot1 = createTestApp();
    const boot2 = createTestApp();

    const [app1, app2] = await Promise.all([boot1, boot2]);

    // Both should succeed (advisory lock prevents conflicts)
    expect(app1).toBeTruthy();
    expect(app2).toBeTruthy();

    await app1.close();
    await app2.close();
  });
});
```

2. **Executar (requer Postgres rodando):**
```bash
# Subir Postgres via Docker
docker run -d --name postgres-test -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16

# Executar teste
npm run test:e2e -- postgres-boot.e2e-spec.ts

# Cleanup
docker stop postgres-test && docker rm postgres-test
```

**Tempo estimado:** 2 horas

---

### Gap #6: Tenant Billing Tracking

**Arquivo:** `test/tenant-billing-tracking.e2e-spec.ts` (criar)

**Implementação:**

1. **Criar teste:**

```typescript
// test/tenant-billing-tracking.e2e-spec.ts

describe('Tenant Billing Tracking E2E (GAP #6)', () => {
  it('should track usage per tenant separately', async () => {
    const tenantA = await createTestTenant(app, { name: 'Tenant A' });
    const tenantB = await createTestTenant(app, { name: 'Tenant B' });

    // Tenant A uses 1000 tokens
    await request(app.getHttpServer())
      .post('/api/usage')
      .set('x-api-key', apiKey)
      .send({ tenantId: tenantA, resourceType: 'llm_tokens', quantity: 1000 });

    // Tenant B uses 500 tokens
    await request(app.getHttpServer())
      .post('/api/usage')
      .set('x-api-key', apiKey)
      .send({ tenantId: tenantB, resourceType: 'llm_tokens', quantity: 500 });

    // Verify isolation
    const usageA = await request(app.getHttpServer())
      .get(`/api/usage/aggregate?tenantId=${tenantA}`)
      .set('x-api-key', apiKey);

    const usageB = await request(app.getHttpServer())
      .get(`/api/usage/aggregate?tenantId=${tenantB}`)
      .set('x-api-key', apiKey);

    expect(usageA.body[0].totalQuantity).toBe(1000);
    expect(usageB.body[0].totalQuantity).toBe(500);
  });
});
```

2. **Executar:**
```bash
npm run test:e2e -- tenant-billing-tracking.e2e-spec.ts
```

**Tempo estimado:** 4 horas

---

## 🟡 Fase 3: Gaps de Prioridade MÉDIA (Semana 4-6)

### Resumo dos Próximos Gaps

| # | Gap | Arquivo | Esforço |
|---|-----|---------|---------|
| 7 | Prometheus scraping | `prometheus-scraping.e2e-spec.ts` | 2h |
| 8 | RAG prompt caching | `rag-prompt-caching.e2e-spec.ts` | 3h |
| 9 | Send pacing throttle | `send-pacing.e2e-spec.ts` | 2h |
| 10 | LLM automation rules | `llm-automation.e2e-spec.ts` | 4h |
| 11 | Memory retention cleanup | `memory-retention.e2e-spec.ts` | 2h |
| 12 | Docker Compose stack | `docker-stack.e2e-spec.ts` | 3h |
| 13 | Webhook payload validation | `webhook-payload.e2e-spec.ts` | 2h |
| 14 | Grafana dashboard test | `grafana-dashboard.e2e-spec.ts` | 2h |

**Template para criar cada teste:**

```bash
# Para cada gap acima:
cat > test/[nome-do-gap].e2e-spec.ts << 'EOF'
import { createTestApp, createTestApiKey } from './e2e/helpers/test-helpers';

describe('[Nome do Gap] E2E', () => {
  let app: INestApplication;
  let apiKey: string;

  beforeAll(async () => {
    app = await createTestApp();
    const keyData = await createTestApiKey(app);
    apiKey = keyData.key;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should [cenário principal]', async () => {
    // Implementar teste
  });
});
EOF
```

---

## 📊 Fase 4: Execução e Validação

### Script de Execução Completo

```bash
#!/bin/bash
# run-all-e2e-tests.sh

echo "🧪 OpenWA E2E Test Suite"
echo "========================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Test categories
CRITICAL_TESTS=(
  "dashboard-login.e2e-spec.ts"
  "session-qr-flow.e2e-spec.ts"
  "billing-stripe.e2e-spec.ts"
  "message-media.e2e-spec.ts"
  "postgres-boot.e2e-spec.ts"
  "tenant-billing-tracking.e2e-spec.ts"
)

echo "🔴 Running CRITICAL tests (Priority ALTA)..."
for test in "${CRITICAL_TESTS[@]}"; do
  if [ -f "test/$test" ]; then
    echo -n "  Testing $test... "
    if npm run test:e2e -- "$test" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ PASSED${NC}"
      ((PASSED++))
    else
      echo -e "${RED}✗ FAILED${NC}"
      ((FAILED++))
    fi
  else
    echo -e "  ${YELLOW}⊘ SKIPPED${NC} (not implemented yet): $test"
    ((SKIPPED++))
  fi
done

echo ""
echo "📊 Results:"
echo "  ✅ Passed: $PASSED"
echo "  ❌ Failed: $FAILED"
echo "  ⊘ Skipped: $SKIPPED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}⚠️  Some tests failed. Check output above.${NC}"
  exit 1
fi
```

**Tornar executável e rodar:**
```bash
chmod +x run-all-e2e-tests.sh
./run-all-e2e-tests.sh
```

---

## 🎓 Boas Práticas

### ✅ Checklist Antes de Criar Teste

- [ ] Li o roadmap (`E2E_TEST_ROADMAP.md`)
- [ ] Identifiquei o gap específico
- [ ] Criei arquivo de teste com nome descritivo
- [ ] Usei helpers de `test-helpers.ts`
- [ ] Implementei Happy Path primeiro
- [ ] Adicionei Edge Cases
- [ ] Validei performance (se aplicável)
- [ ] Executei localmente e passou
- [ ] Atualizei roadmap (marcar ✅)

### ❌ Erros Comuns a Evitar

- ❌ Não mockar componentes internos (reduz valor)
- ❌ Não testar implementação, testar comportamento
- ❌ Não criar testes flaky (dependentes de timing)
- ❌ Não ignorar cleanup (vazamento de recursos)
- ❌ Não copiar/colar código (usar helpers)

---

## 🆘 Troubleshooting

### Problema: "Cannot find module"

```bash
# Solução: Reinstalar dependências
rm -rf node_modules package-lock.json
npm install
```

### Problema: "Port already in use"

```bash
# Solução: Matar processos na porta 2785
lsof -ti:2785 | xargs kill -9
```

### Problema: "Database locked"

```bash
# Solução: Limpar banco de teste
rm -f test/*.sqlite test/*.db
```

### Problema: Teste timeout

```bash
# Solução: Aumentar timeout no jest-e2e.json
{
  "testTimeout": 60000  // 60 segundos
}
```

---

## 📞 Próximos Passos

1. **Implementar os 6 gaps críticos** (Prioridade ALTA)
2. **Executar suite completa:** `./run-all-e2e-tests.sh`
3. **Validar cobertura:** `npm run test:e2e:cov`
4. **Atualizar roadmap:** Marcar gaps como ✅
5. **Partir para gaps médios** (Prioridade MÉDIA)

**Meta:** Chegar a 90%+ de cobertura E2E em 6 semanas.

---

**Última atualização:** 2026-08-27
**Versão:** 1.0.0
