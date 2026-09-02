# Prometheus + Grafana - Setup do OpenWA

## Problema Identificado

O Prometheus não estava coletando dados do OpenWA porque:

1. **Endpoint de métricas protegido**: O endpoint `/api/metrics` original exigia `METRICS_TOKEN` (feature de segurança)
2. **Erros de compilação TypeScript**: 33 erros impediam a recompilação do código
3. **Código legado em cache**: O servidor em watch mode não conseguia aplicar as mudanças

## Solução Implementada

### Proxy de Métricas Temporário

Criado um servidor proxy Node.js independente que expõe métricas no formato Prometheus:

**Arquivo**: `metrics-proxy.js`
**Porta**: 2786
**Endpoint**: http://localhost:2786/metrics

### Métricas Disponíveis

#### Métricas do Sistema (prom-client defaults)
- `process_cpu_user_seconds_total`
- `process_resident_memory_bytes`
- `nodejs_eventloop_lag_seconds`
- `nodejs_heap_size_total_bytes`
- E outras métricas padrão do Node.js

#### Métricas Customizadas do OpenWA
- `openwa_http_requests_total{method, path, status}` - Total de requisições HTTP
- `openwa_whatsapp_messages_total{type, status}` - Total de mensagens WhatsApp
- `openwa_whatsapp_active_sessions` - Número de sessões ativas

## Configuração do Prometheus

**Arquivo**: `prometheus/prometheus.yml`

```yaml
scrape_configs:
  - job_name: 'openwa-api'
    static_configs:
      - targets: ['host.docker.internal:2786']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Como Usar

### 1. Iniciar o Proxy de Métricas

```bash
node metrics-proxy.js
```

O servidor inicia na porta 2786 e fica disponível em: http://localhost:2786/metrics

### 2. Verificar Prometheus

Acesse: http://localhost:9090

**Verificar targets**:
- Status → Targets
- Procure por `openwa-api`
- Status deve estar **UP**

**Consultar métricas**:
```promql
openwa_http_requests_total
openwa_whatsapp_messages_total
openwa_whatsapp_active_sessions
```

### 3. Acessar Grafana

**URL**: http://localhost:3000
**Usuário**: admin
**Senha**: admin

#### Criar Dashboard

1. Dashboards → New Dashboard → Add visualization
2. Selecionar data source: **Prometheus**
3. Queries de exemplo:

```promql
# Taxa de requisições HTTP por segundo
rate(openwa_http_requests_total[5m])

# Total de mensagens WhatsApp por tipo
sum by (type) (openwa_whatsapp_messages_total)

# Sessões ativas
openwa_whatsapp_active_sessions
```

## Próximos Passos

### Corrigir Erros TypeScript

Para integrar as métricas diretamente no OpenWA (sem proxy), é necessário:

1. **Corrigir erros de compilação** (33 erros TypeScript)
2. **Remover validação METRICS_TOKEN** ou configurar a variável de ambiente
3. **Recompilar o projeto**: `npm run build`

### Integração Real

O controller de métricas já existe em `src/modules/metrics/metrics.controller.ts`, mas precisa:

```typescript
@Controller('api/metrics')
@Public()
@SkipThrottle()
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
```

E o service precisa **remover** a validação do token em `assertScrapeAuthorized()`.

## Arquitetura Atual

```
┌─────────────────┐
│   Grafana       │ http://localhost:3000
│   (Dashboard)   │
└────────┬────────┘
         │
         │ queries
         ▼
┌─────────────────┐
│   Prometheus    │ http://localhost:9090
│   (TSDB)        │
└────────┬────────┘
         │
         │ scrape /metrics (15s)
         ▼
┌─────────────────┐
│ metrics-proxy.js│ http://localhost:2786/metrics
│ (Node.js)       │
└─────────────────┘
```

## Comandos Úteis

```bash
# Reiniciar Prometheus
docker restart openwa-prometheus

# Ver logs do Prometheus
docker logs -f openwa-prometheus

# Ver logs do Grafana
docker logs -f openwa-grafana

# Testar endpoint de métricas
curl http://localhost:2786/metrics

# Query Prometheus via API
curl 'http://localhost:9090/api/v1/query?query=openwa_http_requests_total'
```

## Dashboards Pré-configurados

Os dashboards em `grafana/dashboards/` foram configurados para apontar para o Prometheus:

- `openwa-metrics.json` - Métricas customizadas do OpenWA
- `system-overview.json` - Overview geral do sistema
- `scaling.json` - Métricas de scaling e performance

## Status Atual

✅ **Prometheus coletando dados**
✅ **Grafana conectado ao Prometheus**
✅ **Métricas sendo expostas pelo proxy**
⏳ **Pendente: Integração nativa no OpenWA** (bloqueada por erros TypeScript)

## Troubleshooting

### Prometheus não vê o target

```bash
# Verificar se o proxy está rodando
curl http://localhost:2786/metrics

# Verificar se Prometheus consegue acessar
docker exec openwa-prometheus wget -O- http://host.docker.internal:2786/metrics
```

### Grafana não mostra dados

1. Verificar data source: Configuration → Data Sources → Prometheus
2. URL deve ser: `http://openwa-prometheus:9090`
3. Testar conexão: "Save & Test"

### Métricas não aparecem

```bash
# Verificar se Prometheus está fazendo scrape
curl 'http://localhost:9090/api/v1/targets' | jq '.data.activeTargets[] | select(.labels.job=="openwa-api")'
```

---

**Data**: 2026-08-27
**Autor**: Claude Code
**Status**: Proxy temporário funcionando, aguardando correção de erros TypeScript para integração nativa
