# 🧪 OpenWA - Roadmap Completo de Testes E2E

## 📋 Visão Geral

Este documento mapeia **TODOS** os cenários de teste E2E necessários para validar o funcionamento completo do OpenWA, incluindo:
- ✅ Testes automatizados existentes (54 arquivos)
- ⚠️ Gaps de cobertura identificados
- 🔄 Fluxos críticos que precisam de validação E2E
- 📊 Matriz de cobertura por módulo

---

## 🎯 Status de Cobertura Geral

| Área | Testes Existentes | Gaps Críticos | Prioridade |
|------|-------------------|---------------|------------|
| **Core (Auth/Session)** | ✅ 8 testes | ⚠️ 2 gaps | 🔴 ALTA |
| **Messaging** | ✅ 4 testes | ⚠️ 3 gaps | 🔴 ALTA |
| **Analytics/ML** | ✅ 8 testes | ⚠️ 1 gap | 🟡 MÉDIA |
| **Intake/Memory/RAG** | ✅ 10 testes | ⚠️ 2 gaps | 🟡 MÉDIA |
| **Webhooks/Integration** | ✅ 5 testes | ✅ 0 gaps | 🟢 BAIXA |
| **Multi-tenancy** | ✅ 2 testes | ⚠️ 1 gap | 🔴 ALTA |
| **Infrastructure** | ✅ 9 testes | ⚠️ 3 gaps | 🟡 MÉDIA |
| **Audio/Vision** | ✅ 6 testes | ✅ 0 gaps | 🟢 BAIXA |
| **Billing/Usage** | ❌ 0 testes | ⚠️ 4 gaps | 🔴 ALTA |
| **Automation Rules** | ✅ 1 teste | ⚠️ 2 gaps | 🟡 MÉDIA |

**Total:** 54 testes existentes | 18 gaps críticos

---

## 📚 PARTE 1: Testes Automatizados Existentes

### 1️⃣ **Core: Autenticação & Sessões**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `app.e2e-spec.ts` | Smoke test básico - health endpoint público | ✅ |
| `session-scope.e2e-spec.ts` | Isolamento de sessões por tenant | ✅ |
| `session-proxy.e2e-spec.ts` | Proxy HTTP funciona em sessões | ✅ |
| `session-teardown-pending-http.e2e-spec.ts` | Teardown aguarda requisições pendentes | ✅ |
| `global-routes-session-scope.e2e-spec.ts` | Rotas globais respeitam escopo de sessão | ✅ |
| `infra-session-scope.e2e-spec.ts` | Infraestrutura (Docker) respeita sessão | ✅ |
| `plugins-session-scope.e2e-spec.ts` | Plugins respeitam escopo de sessão | ✅ |
| `mcp-auth.e2e-spec.ts` | Autenticação MCP server | ✅ |

#### ⚠️ Gaps Críticos

1. **Login do Dashboard não validado**
   - Cenário: Usuário faz login com API key no dashboard
   - Validar: Token JWT, sessão persistida, redirect correto
   - **Gap atual:** Erro "Internal server error" não tem teste E2E

2. **Session QR Code Flow completo**
   - Cenário: Criar sessão → gerar QR → escanear → conectar
   - Validar: QR gerado, evento `qr`, evento `ready`, status `connected`
   - **Gap atual:** Não há teste automatizado para o fluxo completo

---

### 2️⃣ **Messaging: Envio & Recebimento**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `message-send.e2e-spec.ts` | Envio de mensagem via API | ✅ |
| `webhooks.e2e-spec.ts` | Webhooks entregam eventos de mensagem | ✅ |
| `webhook-outbox-recovery.e2e-spec.ts` | Recovery de webhooks falhados (outbox) | ✅ |
| `automation-rules.e2e-spec.ts` | Regras de automação processam mensagens | ✅ |

#### ⚠️ Gaps Críticos

1. **Mensagem com mídia (imagem, áudio, vídeo)**
   - Cenário: Enviar imagem via `/api/messages` com `mediaUrl`
   - Validar: Upload, conversão, entrega no WhatsApp
   - **Gap atual:** Só testa mensagem de texto

2. **Recebimento de mensagem via webhook**
   - Cenário: WhatsApp recebe mensagem → webhook dispara
   - Validar: Payload correto, evento `message.received`, n8n recebe
   - **Gap atual:** Teste webhook não valida payload real do WhatsApp

3. **Rate limiting de envio (send pacing)**
   - Cenário: Enviar 50 mensagens/seg → deve throttle
   - Validar: Respeita `SEND_PACING_*` configs
   - **Gap atual:** Não há teste de send pacing

---

### 3️⃣ **Analytics & Machine Learning**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `analytics-kpis.e2e-spec.ts` | KPIs básicos (eventos, latência) | ✅ |
| `analytics-tracer.e2e-spec.ts` | Tracer de eventos analytics | ✅ |
| `analytics-alerts-export.e2e-spec.ts` | Exportação e alertas analytics | ✅ |
| `analytics-dashboard-auth.e2e-spec.ts` | Autenticação dashboard analytics | ✅ |
| `analytics-funnel.e2e-spec.ts` | Funil de conversão (Intake → Lead) | ✅ |
| `analytics-intent.e2e-spec.ts` | Classificação de intents (Anthropic Batch) | ✅ |
| `analytics-satisfaction.e2e-spec.ts` | Survey de satisfação (CSAT) | ✅ |
| `analytics-ml.e2e-spec.ts` | ML outcome prediction (TensorFlow.js) | ✅ |

#### ⚠️ Gaps Críticos

1. **Dashboard Grafana E2E**
   - Cenário: Abrir Grafana → ver métricas em tempo real
   - Validar: Prometheus scraping funciona, dashboards carregam
   - **Gap atual:** Não há teste automatizado para Grafana

---

### 4️⃣ **Intake, Memory & RAG**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `intake-e2e-cycle.e2e-spec.ts` | Ciclo completo intake (lead capture) | ✅ |
| `intake-export.e2e-spec.ts` | Exportação de leads (CSV) | ✅ |
| `intake-tracer.e2e-spec.ts` | Tracer de eventos intake | ✅ |
| `intake-workflow-shape.e2e-spec.ts` | Shape do workflow intake | ✅ |
| `memory-e2e-cycle.e2e-spec.ts` | Ciclo completo memory (summarization) | ✅ |
| `memory-tracer.e2e-spec.ts` | Tracer de eventos memory | ✅ |
| `rag-e2e-cycle.e2e-spec.ts` | Ciclo completo RAG (embed + search) | ✅ |
| `rag-llm-judge.e2e-spec.ts` | LLM judge para qualidade RAG | ✅ |
| `rag-performance.e2e-spec.ts` | Performance de busca RAG | ✅ |
| `search.e2e-spec.ts` | Busca full-text (FTS5/tsvector) | ✅ |

#### ⚠️ Gaps Críticos

1. **RAG com Anthropic Prompt Caching**
   - Cenário: Query RAG → valida cache hits no Claude
   - Validar: `cache_creation_input_tokens` vs `cache_read_input_tokens`
   - **Gap atual:** Não valida prompt caching

2. **Memory retention cleanup**
   - Cenário: Mensagens expiram após `RETENTION_DAYS`
   - Validar: Soft delete → hard delete funciona
   - **Gap atual:** Teste não valida cleanup BullMQ job

---

### 5️⃣ **Webhooks & Integrações**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `webhooks.e2e-spec.ts` | CRUD webhooks + entrega eventos | ✅ |
| `webhook-outbox-recovery.e2e-spec.ts` | Recovery de falhas (exponential backoff) | ✅ |
| `integration-instance.e2e-spec.ts` | Instâncias de integração (n8n, Make) | ✅ |
| `integration-fabric.e2e-spec.ts` | Fabric de integrações (roteamento) | ✅ |
| `queue-on.e2e-spec.ts` | BullMQ queues (quando Redis ON) | ✅ |

#### ✅ Cobertura Completa
Sem gaps críticos identificados.

---

### 6️⃣ **Multi-Tenancy & Isolamento**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `tenant-isolation.e2e-spec.ts` | Isolamento de dados entre tenants | ✅ |
| `tenant-rate-limiting.e2e-spec.ts` | Rate limiting por tenant (Redis) | ✅ |

#### ⚠️ Gaps Críticos

1. **Tenant billing & usage tracking**
   - Cenário: Tenant A consome tokens LLM → Stripe meter events
   - Validar: `UsageService` registra, Stripe recebe, dashboard mostra
   - **Gap atual:** Não há teste E2E de billing

---

### 7️⃣ **Infrastructure & Deployment**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `smoke-production.e2e-spec.ts` | Smoke test produção (Docker) | ✅ |
| `setup-e2e-env.e2e-spec.ts` | Setup ambiente E2E | ✅ |
| `sqlite-chain-boot.e2e-spec.ts` | Boot SQLite (chain migrations) | ✅ |
| `multi-replica.e2e-spec.ts` | 2 réplicas (load balance) | ✅ |
| `multi-replica-3plus.e2e-spec.ts` | 3+ réplicas (high availability) | ✅ |
| `shared-storage.e2e-spec.ts` | Storage compartilhado (S3/volume) | ✅ |
| `health-redis.e2e-spec.ts` | Health check Redis (opcional) | ✅ |
| `telemetry.e2e-spec.ts` | OpenTelemetry traces | ✅ |
| `serve-static.e2e-spec.ts` | Dashboard SPA servido corretamente | ✅ |

#### ⚠️ Gaps Críticos

1. **Postgres migration boot**
   - Cenário: Boot com `DATABASE_TYPE=postgres`
   - Validar: Advisory lock, migrations aplicadas, app inicia
   - **Gap atual:** Teste só valida SQLite

2. **Prometheus metrics scraping**
   - Cenário: Prometheus scrape `/api/api/metrics`
   - Validar: Métricas aparecem no Prometheus, targets UP
   - **Gap atual:** Não valida Prometheus funcionando

3. **Docker Compose stack completo**
   - Cenário: `docker-compose up` → todos serviços sobem
   - Validar: n8n, Grafana, Prometheus, OpenWA conectados
   - **Gap atual:** Não há teste de stack completo

---

### 8️⃣ **Audio & Vision (Multimodal)**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `audio-stt-e2e-cycle.e2e-spec.ts` | Ciclo completo STT (Groq Whisper) | ✅ |
| `audio-stt-cases.e2e-spec.ts` | Casos edge STT (ruído, idiomas) | ✅ |
| `audio-workflow-shape.e2e-spec.ts` | Shape workflow STT | ✅ |
| `vision-e2e-cycle.e2e-spec.ts` | Ciclo completo vision (Claude) | ✅ |
| `vision-accuracy.e2e-spec.ts` | Acurácia vision (LLM judge) | ✅ |
| `vision-workflow-shape.e2e-spec.ts` | Shape workflow vision | ✅ |

#### ✅ Cobertura Completa
Sem gaps críticos identificados.

---

### 9️⃣ **Billing & Usage (CRÍTICO - SEM TESTES)**

#### ❌ Testes NÃO Implementados

**TODOS os cenários abaixo precisam ser criados:**

1. **Stripe meter events enviados**
   - Cenário: LLM call → `UsageService.recordUsage()` → Stripe
   - Validar: Evento aparece no Stripe dashboard

2. **Billing por tenant funciona**
   - Cenário: Tenant A usa 10k tokens, Tenant B usa 5k tokens
   - Validar: Usage separado, billing correto

3. **Subscription management**
   - Cenário: Criar/cancelar subscription via API
   - Validar: Status refletido no banco + Stripe

4. **Grace period enforcement**
   - Cenário: Tenant vence subscription → grace period → block
   - Validar: API retorna 402 Payment Required

---

### 🔟 **Automation Rules**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `automation-rules.e2e-spec.ts` | Regras básicas (keyword match) | ✅ |

#### ⚠️ Gaps Críticos

1. **LLM-powered automation**
   - Cenário: Regra usa LLM para classificar intent → ação
   - Validar: Intent detectado, ação executada (webhook, reply)

2. **Complex rule chaining**
   - Cenário: Regra 1 dispara → Regra 2 dispara → ação final
   - Validar: Chain executa na ordem, sem loops

---

### 1️⃣1️⃣ **Throttling & Rate Limiting**

#### ✅ Testes Implementados

| Arquivo | Cenário | Status |
|---------|---------|--------|
| `ingress-instance-throttle.e2e-spec.ts` | Throttle por instância (in-memory) | ✅ |
| `ingress-ip-throttle.e2e-spec.ts` | Throttle por IP (Nest throttler) | ✅ |
| `tenant-rate-limiting.e2e-spec.ts` | Throttle por tenant (Redis sliding window) | ✅ |

#### ✅ Cobertura Completa
Sem gaps críticos identificados.

---

## 🚨 PARTE 2: Gaps Críticos Prioritizados

### 🔴 Prioridade ALTA (Implementar AGORA)

| # | Gap | Módulo | Risco | Esforço |
|---|-----|--------|-------|---------|
| 1 | **Login do Dashboard E2E** | Auth | 🔴 Alto | 2h |
| 2 | **Session QR Code Flow** | Session | 🔴 Alto | 4h |
| 3 | **Billing Stripe Integration** | Billing | 🔴 Alto | 6h |
| 4 | **Mensagem com mídia** | Message | 🔴 Alto | 3h |
| 5 | **Postgres migration boot** | Infra | 🔴 Alto | 2h |
| 6 | **Tenant billing tracking** | Tenant | 🔴 Alto | 4h |

**Total:** 21 horas

---

### 🟡 Prioridade MÉDIA (Implementar em Sprint 2)

| # | Gap | Módulo | Risco | Esforço |
|---|-----|--------|-------|---------|
| 7 | **Prometheus scraping** | Metrics | 🟡 Médio | 2h |
| 8 | **RAG prompt caching** | RAG | 🟡 Médio | 3h |
| 9 | **Send pacing throttle** | Message | 🟡 Médio | 2h |
| 10 | **LLM automation rules** | Automation | 🟡 Médio | 4h |
| 11 | **Memory retention cleanup** | Memory | 🟡 Médio | 2h |
| 12 | **Docker Compose stack** | Infra | 🟡 Médio | 3h |
| 13 | **Webhook payload validation** | Webhook | 🟡 Médio | 2h |
| 14 | **Grafana dashboard test** | Analytics | 🟡 Médio | 2h |

**Total:** 20 horas

---

### 🟢 Prioridade BAIXA (Nice to Have)

| # | Gap | Módulo | Risco | Esforço |
|---|-----|--------|-------|---------|
| 15 | **Complex rule chaining** | Automation | 🟢 Baixo | 3h |
| 16 | **Subscription management** | Billing | 🟢 Baixo | 4h |
| 17 | **Grace period enforcement** | Billing | 🟢 Baixo | 2h |
| 18 | **Stripe meter events** | Billing | 🟢 Baixo | 3h |

**Total:** 12 horas

---

## 🛠️ PARTE 3: Como Implementar os Testes

### Template Base para Novo Teste E2E

```typescript
// test/[feature]-e2e-cycle.e2e-spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { applyGlobalValidation } from '../src/config/app-validation';

describe('[Feature] E2E Cycle', () => {
  let app: INestApplication;
  let apiKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    // Bootstrap: criar API key
    const authService = app.get(AuthService);
    const { key } = await authService.createKey({
      name: 'e2e-test',
      role: ApiKeyRole.OPERATOR,
    });
    apiKey = key;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Happy Path', () => {
    it('deve completar o fluxo end-to-end', async () => {
      // ARRANGE: Preparar dados
      const payload = { /* ... */ };

      // ACT: Executar ação
      const response = await request(app.getHttpServer())
        .post('/api/endpoint')
        .set('x-api-key', apiKey)
        .send(payload);

      // ASSERT: Validar resultado
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ /* ... */ });
    });
  });

  describe('Edge Cases', () => {
    it('deve falhar gracefully quando [cenário]', async () => {
      // ...
    });
  });

  describe('Performance', () => {
    it('deve processar em menos de [X]ms', async () => {
      const start = Date.now();
      await request(app.getHttpServer())
        .post('/api/endpoint')
        .set('x-api-key', apiKey);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });
  });
});
```

---

### Checklist para Criar Teste E2E

- [ ] **1. Identificar cenário crítico** (do roadmap acima)
- [ ] **2. Criar arquivo** `test/[feature]-e2e-cycle.e2e-spec.ts`
- [ ] **3. Implementar Happy Path** (fluxo principal)
- [ ] **4. Implementar Edge Cases** (erros, timeouts)
- [ ] **5. Implementar Performance Tests** (latência, throughput)
- [ ] **6. Validar dados no banco** (TypeORM repository)
- [ ] **7. Validar eventos emitidos** (EventEmitter2)
- [ ] **8. Validar webhooks disparados** (mock HTTP server)
- [ ] **9. Executar localmente** (`npm run test:e2e -- [arquivo]`)
- [ ] **10. Documentar no roadmap** (atualizar status ✅)

---

## 🎯 PARTE 4: Plano de Execução

### Sprint 1: Gaps Críticos (Prioridade ALTA)

**Objetivo:** Fechar os 6 gaps de maior risco

**Semana 1:**
- ✅ Dia 1-2: Login do Dashboard E2E (`dashboard-login.e2e-spec.ts`)
- ✅ Dia 3-4: Session QR Code Flow (`session-qr-flow.e2e-spec.ts`)

**Semana 2:**
- ✅ Dia 1-3: Billing Stripe Integration (`billing-stripe.e2e-spec.ts`)
- ✅ Dia 4: Mensagem com mídia (`message-media.e2e-spec.ts`)

**Semana 3:**
- ✅ Dia 1: Postgres migration boot (`postgres-boot.e2e-spec.ts`)
- ✅ Dia 2-3: Tenant billing tracking (`tenant-billing.e2e-spec.ts`)

**Entrega Sprint 1:** 6 novos testes E2E | Total: 60 testes

---

### Sprint 2: Gaps Médios (Prioridade MÉDIA)

**Objetivo:** Melhorar cobertura de observability e automação

**Semana 1:**
- ✅ Prometheus scraping
- ✅ RAG prompt caching
- ✅ Send pacing throttle

**Semana 2:**
- ✅ LLM automation rules
- ✅ Memory retention cleanup
- ✅ Docker Compose stack

**Semana 3:**
- ✅ Webhook payload validation
- ✅ Grafana dashboard test

**Entrega Sprint 2:** 8 novos testes E2E | Total: 68 testes

---

### Sprint 3: Nice to Have (Prioridade BAIXA)

**Objetivo:** Cobertura 100%

**Semana 1:**
- ✅ Complex rule chaining
- ✅ Subscription management

**Semana 2:**
- ✅ Grace period enforcement
- ✅ Stripe meter events

**Entrega Sprint 3:** 4 novos testes E2E | Total: 72 testes

---

## 📊 PARTE 5: Cobertura por Módulo (Matriz Completa)

| Módulo | Testes Existentes | Novos Necessários | Total | % Cobertura |
|--------|-------------------|-------------------|-------|-------------|
| Analytics | 8 | 1 | 9 | 89% |
| Audit | 1 | 0 | 1 | 100% |
| Auth | 2 | 1 | 3 | 67% |
| Automation | 1 | 2 | 3 | 33% |
| Billing | 0 | 4 | 4 | 0% ⚠️ |
| Call | 0 | 0 | 0 | N/A |
| Catalog | 0 | 0 | 0 | N/A |
| Channel | 0 | 0 | 0 | N/A |
| Chat-Media | 0 | 0 | 0 | N/A |
| Contact | 0 | 0 | 0 | N/A |
| Docker | 1 | 0 | 1 | 100% |
| Events | 1 | 0 | 1 | 100% |
| Group | 0 | 0 | 0 | N/A |
| Health | 2 | 0 | 2 | 100% |
| Infra | 3 | 2 | 5 | 60% |
| Intake | 4 | 0 | 4 | 100% |
| Integration | 2 | 0 | 2 | 100% |
| Label | 0 | 0 | 0 | N/A |
| LLM | 3 | 1 | 4 | 75% |
| MCP | 1 | 0 | 1 | 100% |
| Media | 1 | 1 | 2 | 50% |
| Memory | 2 | 1 | 3 | 67% |
| Message | 4 | 2 | 6 | 67% |
| Metrics | 1 | 1 | 2 | 50% |
| Onboarding | 0 | 0 | 0 | N/A |
| Plugins | 1 | 0 | 1 | 100% |
| Profile | 0 | 0 | 0 | N/A |
| Queue | 1 | 0 | 1 | 100% |
| Search | 1 | 0 | 1 | 100% |
| Session | 4 | 1 | 5 | 80% |
| Settings | 0 | 0 | 0 | N/A |
| Stats | 0 | 0 | 0 | N/A |
| Status | 0 | 0 | 0 | N/A |
| Status-Store | 0 | 0 | 0 | N/A |
| Takeover | 0 | 0 | 0 | N/A |
| Template | 0 | 0 | 0 | N/A |
| Tenant | 2 | 1 | 3 | 67% |
| Usage | 0 | 1 | 1 | 0% ⚠️ |
| Webhook | 3 | 1 | 4 | 75% |
| **TOTAL** | **54** | **18** | **72** | **75%** |

---

## 🚀 PARTE 6: Como Executar os Testes

### Executar TODOS os testes E2E

```bash
npm run test:e2e
```

### Executar teste específico

```bash
npm run test:e2e -- analytics-ml.e2e-spec.ts
```

### Executar suite específica

```bash
# Todos os testes de analytics
npm run test:e2e -- --testNamePattern="Analytics"

# Todos os testes de tenant
npm run test:e2e -- --testNamePattern="Tenant"
```

### Executar com cobertura

```bash
npm run test:e2e:cov
```

### CI/CD (GitHub Actions)

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:e2e
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## 🎓 PARTE 7: Boas Práticas

### ✅ DO

- ✅ Testar fluxo completo end-to-end (API → DB → Webhook)
- ✅ Usar dados reais (sem mocks quando possível)
- ✅ Validar eventos emitidos (`EventEmitter2`)
- ✅ Validar side effects (banco, webhooks, filas)
- ✅ Testar edge cases (timeouts, erros, limites)
- ✅ Medir performance (latência, throughput)
- ✅ Limpar dados após cada teste (`afterEach`)
- ✅ Usar factories para dados (`test/fixtures/`)

### ❌ DON'T

- ❌ Mockar componentes internos (reduz valor do teste)
- ❌ Testar implementação (testar comportamento)
- ❌ Criar testes flaky (dependentes de tempo/rede)
- ❌ Ignorar cleanup (vazamento de recursos)
- ❌ Testar múltiplos cenários em um it()
- ❌ Copiar/colar código (usar helpers)

---

## 📝 PARTE 8: Checklist de Validação Global

### Antes de Ship para Produção

Use este checklist para garantir que TODAS as áreas foram testadas:

#### Core
- [ ] Login dashboard funciona
- [ ] API key auth funciona
- [ ] Session QR code flow completo
- [ ] Multi-tenant isolation funciona

#### Messaging
- [ ] Enviar mensagem texto
- [ ] Enviar mensagem com imagem
- [ ] Enviar mensagem com áudio
- [ ] Receber mensagem via webhook
- [ ] Rate limiting funciona
- [ ] Send pacing respeita limites

#### Analytics
- [ ] Eventos são registrados
- [ ] KPIs calculam corretamente
- [ ] Funnel analytics funciona
- [ ] Intent classification funciona
- [ ] ML predictions funcionam
- [ ] Dashboards Grafana carregam
- [ ] Prometheus scrape funciona

#### Intake/Memory/RAG
- [ ] Lead capture funciona
- [ ] Memory summarization funciona
- [ ] RAG search funciona
- [ ] Prompt caching funciona
- [ ] Retention cleanup funciona

#### Webhooks
- [ ] Webhook entrega eventos
- [ ] Recovery de falhas funciona
- [ ] Outbox pattern funciona

#### Billing
- [ ] Stripe meter events enviados
- [ ] Usage tracking por tenant
- [ ] Subscription management
- [ ] Grace period enforcement

#### Infrastructure
- [ ] SQLite boot funciona
- [ ] Postgres boot funciona
- [ ] Multi-replica funciona
- [ ] Shared storage funciona
- [ ] Health checks funcionam
- [ ] Telemetry funciona
- [ ] Docker Compose stack sobe completo

#### Automation
- [ ] Regras básicas funcionam
- [ ] LLM automation funciona
- [ ] Rule chaining funciona

---

## 🔄 PARTE 9: Manutenção Contínua

### Quando Adicionar Novo Teste

1. **Nova feature implementada** → criar teste E2E
2. **Bug encontrado em produção** → criar teste de regressão
3. **Refactor grande** → validar testes ainda passam
4. **Nova integração** → criar teste de integração E2E

### Quando Atualizar Roadmap

- ✅ Após criar novo teste (marcar como ✅)
- ⚠️ Após identificar gap (adicionar à lista)
- 🔴 Após incidente produção (priorizar gap)
- 📊 Mensalmente (revisar cobertura)

---

## 📞 Suporte

**Dúvidas sobre testes E2E?**
- Veja exemplos em `test/` (54 testes existentes)
- Siga template acima para novos testes
- Consulte `jest-e2e.json` para configuração

**Problemas ao executar testes?**
- Verifique que `npm install` foi executado
- Verifique que portas estão livres (2785, 5678, etc)
- Veja logs com `npm run test:e2e -- --verbose`

---

**Última atualização:** 2026-08-27
**Versão:** 1.0.0
**Status:** ⚠️ 18 gaps críticos identificados | 75% cobertura atual
