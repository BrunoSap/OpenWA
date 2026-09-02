# ✅ DASHBOARDS CONFIGURADOS - GUIA RÁPIDO

## 🎯 Status Atual

### ✅ FUNCIONANDO AGORA
- **Grafana**: http://localhost:3000 (admin / NovaSenh@Segura2026)
- **Prometheus**: http://localhost:9090
- **5 Exporters ativos**: Sistema, PostgreSQL, Redis, Grafana, Prometheus

### 📊 Métricas Disponíveis
- ✅ CPU, Memória, Disco, Rede (node_exporter)
- ✅ PostgreSQL: Conexões, queries, database size
- ✅ Redis: Conexões, memória, comandos
- ✅ Prometheus e Grafana: Self-monitoring
- ⚠️ OpenWA API: Requer instrumentação

---

## 🚀 Como Acessar AGORA

1. Abra: **http://localhost:3000**
2. Login: `admin` / `NovaSenh@Segura2026`
3. Clique em **Dashboards** → Veja os 3 dashboards
4. **ATUALIZE a página** no Grafana para ver os dados!

---

## 📈 Dashboards Disponíveis

### 1. OpenWA - System Overview ⭐ RECOMENDADO
**Dados funcionando agora**:
- ✅ Status dos serviços (OpenWA API, PostgreSQL, Redis)
- ✅ Uptime
- ✅ CPU Usage do sistema
- ✅ Memória (Total: 8.3GB detectado)
- ✅ Tráfego de rede
- ✅ Espaço em disco
- ✅ Conexões PostgreSQL
- ✅ Conexões Redis

### 2. OpenWA - WhatsApp Business Metrics
**Status**: Parcialmente funcional
- ⚠️ HTTP Requests: Aguardando instrumentação da API
- ⚠️ Response Time: Aguardando instrumentação da API
- ⚠️ WhatsApp Messages: Aguardando instrumentação da API
- ✅ CPU e Memória: Funcionando

### 3. OpenWA - Multi-Replica Scaling
**Status**: Para uso futuro (quando escalar horizontalmente)

---

## 🎯 Próximos Passos

### Para ter métricas completas da API OpenWA:

A aplicação precisa expor um endpoint `/metrics` no formato Prometheus. Exemplo:

```typescript
// Instalar: npm install prom-client
import { register, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

// Coletar métricas padrão (CPU, memória, event loop)
collectDefaultMetrics({ register });

// Métricas customizadas
export const messagesTotal = new Counter({
  name: 'whatsapp_messages_total',
  help: 'Total de mensagens WhatsApp',
  labelNames: ['type'], // sent, received, failed
  registers: [register]
});

export const httpDuration = new Histogram({
  name: 'http_request_duration_milliseconds',
  help: 'Duração das requisições HTTP',
  labelNames: ['method', 'route', 'status'],
  buckets: [50, 100, 200, 500, 1000, 2000, 5000],
  registers: [register]
});

// Endpoint de métricas
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## 🔧 Arquitetura Implementada

```
┌─────────────────────────────────────────────┐
│           GRAFANA (Port 3000)                │
│  Dashboards + Visualizações                  │
└────────────────┬────────────────────────────┘
                 │
                 │ consulta
                 ▼
┌─────────────────────────────────────────────┐
│        PROMETHEUS (Port 9090)                │
│  Coleta e armazena métricas                  │
└────┬────────────────────────────────────────┘
     │
     │ scrape a cada 15s
     │
     ├─► node_exporter (9100) ────► Sistema (CPU, Mem, Disk)
     │
     ├─► postgres_exporter (9187) ─► PostgreSQL
     │
     ├─► redis_exporter (9121) ────► Redis
     │
     ├─► prometheus (9090) ────────► Self-monitoring
     │
     └─► openwa-api (2785) ────────► ❌ Aguardando /metrics
```

---

## 🐛 Troubleshooting

### Dashboard vazio ou "No data"
1. **Aguarde 30 segundos** - Prometheus coleta a cada 15s
2. **Atualize a página** do Grafana (F5)
3. Verifique targets: http://localhost:9090/targets (todos devem estar UP exceto openwa-api)

### Target DOWN no Prometheus
```bash
# Ver logs do exporter problemático
docker logs openwa-node-exporter
docker logs openwa-postgres-exporter
docker logs openwa-redis-exporter

# Reiniciar se necessário
docker restart openwa-node-exporter
```

### Grafana não conecta ao Prometheus
```bash
# Verificar rede
docker network inspect openwa-network

# Testar conectividade
docker exec openwa-grafana wget -O- http://openwa-prometheus:9090
```

---

## 📦 Containers Rodando

```bash
# Ver todos os containers de observabilidade
docker ps | grep -E "prometheus|grafana|exporter"

# Resultado esperado:
# openwa-grafana           ✅
# openwa-prometheus        ✅
# openwa-node-exporter     ✅
# openwa-postgres-exporter ✅
# openwa-redis-exporter    ✅
```

---

## 🔑 Credenciais

### Grafana
- URL: http://localhost:3000
- User: `admin`
- Pass: `NovaSenh@Segura2026`

### Prometheus
- URL: http://localhost:9090
- Sem autenticação

---

## 📚 Documentos Relacionados

- `docker-compose.observability.yml` - Stack de monitoramento
- `prometheus/prometheus.yml` - Config do Prometheus
- `prometheus/alerts.yml` - Regras de alerta
- `grafana/provisioning/` - Config do Grafana
- `grafana/dashboards/` - Dashboards JSON

---

**Última atualização**: 2026-08-27 12:10
**Status**: ✅ Sistema de monitoramento operacional com métricas de infraestrutura
