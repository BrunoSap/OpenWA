# 📊 Guia de Acesso aos Dashboards - OpenWA

## 🔐 Credenciais

### Grafana (Dashboard Principal)
- **URL**: http://localhost:3000
- **Usuário**: `admin`
- **Senha**: `NovaSenh@Segura2026`

### Prometheus (Métricas Brutas)
- **URL**: http://localhost:9090
- **Autenticação**: Não requer

---

## 📈 Dashboards Disponíveis

Acesse http://localhost:3000 e faça login. Os seguintes dashboards estão disponíveis:

### 1. **OpenWA - WhatsApp Business Metrics** 
**Foco**: Métricas de negócio e operação do WhatsApp

**Painéis incluídos**:
- **HTTP Requests Rate**: Taxa de requisições por método e status
- **Response Time (p95)**: Latência do 95º percentil
- **WhatsApp Messages**: Total de mensagens por tipo
- **Active WhatsApp Sessions**: Sessões ativas em tempo real
- **CPU Usage**: Uso de CPU do sistema
- **Memory Usage**: Uso de memória do sistema

**Quando usar**: Monitoramento diário das operações do WhatsApp

---

### 2. **OpenWA - System Overview**
**Foco**: Saúde da infraestrutura e serviços

**Painéis incluídos**:
- **Status dos Serviços**: OpenWA API, PostgreSQL, Redis (verde/vermelho)
- **Uptime**: Tempo desde última reinicialização
- **System CPU Usage**: Uso de CPU detalhado
- **System Memory**: Memória total vs usada
- **Network Traffic**: Tráfego de rede por interface
- **Disk Space**: Espaço em disco disponível
- **PostgreSQL Connections**: Conexões ativas no banco
- **Redis Connections**: Clientes conectados no Redis

**Quando usar**: Troubleshooting e análise de capacidade

---

### 3. **OpenWA - Multi-Replica Scaling**
**Foco**: Métricas para ambiente com múltiplas réplicas (futuro)

**Painéis incluídos**:
- **Replicas Up**: Quantidade de réplicas saudáveis
- **Request Rate per Replica**: Distribuição de carga
- **Latency p95/p50 per Replica**: Performance por instância
- **Memory Usage per Replica**: Consumo de memória
- **Error Rate per Replica**: Taxa de erros por instância
- **Active Sessions per Replica**: Sessões distribuídas
- **BullMQ Jobs**: Jobs completados/falhados (distribuído)

**Quando usar**: Planejamento de escala horizontal

---

## 🎯 Data Sources Configurados

### Prometheus (padrão)
- **Tipo**: Métricas de séries temporais
- **URL**: http://openwa-prometheus:9090
- **Coleta**: A cada 15 segundos
- **Retenção**: 30 dias

### Loki
- **Tipo**: Logs agregados
- **URL**: http://openwa-loki:3100
- **Coleta**: Via Promtail (tempo real)
- **Retenção**: Configurável

### OpenWA Analytics API
- **Tipo**: JSON API (custom)
- **URL**: http://openwa-api:2785/api/analytics
- **Autenticação**: Bearer token

---

## ⚠️ Status Atual das Métricas

### ✅ Funcionando
- Infraestrutura: CPU, memória, disco, rede
- PostgreSQL: Conexões, queries
- Redis: Conexões, memória
- Prometheus: Self-monitoring
- Grafana: Self-monitoring

### ⚠️ Requer Instrumentação
Os seguintes painéis mostrarão **"No data"** até que a aplicação OpenWA seja instrumentada:

- HTTP Requests Rate
- Response Time (p95)
- WhatsApp Messages
- Active WhatsApp Sessions
- Error Rate

**Motivo**: A aplicação OpenWA precisa expor métricas no formato Prometheus.

---

## 🛠️ Como Adicionar Métricas à Aplicação OpenWA

A aplicação precisa ser instrumentada com o cliente Prometheus. Exemplo básico:

```typescript
// Instalar: npm install prom-client

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

const register = new Registry();

// Contador de mensagens
export const messagesTotal = new Counter({
  name: 'whatsapp_messages_total',
  help: 'Total de mensagens WhatsApp',
  labelNames: ['type'], // sent, received, failed
  registers: [register]
});

// Sessões ativas
export const activeSessions = new Gauge({
  name: 'whatsapp_active_sessions',
  help: 'Sessões WhatsApp ativas',
  registers: [register]
});

// Latência HTTP
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

**Usar nas rotas**:
```typescript
// Incrementar ao enviar mensagem
messagesTotal.inc({ type: 'sent' });

// Atualizar sessões ativas
activeSessions.set(await getActiveSessionsCount());

// Medir latência
const end = httpDuration.startTimer();
// ... processar request ...
end({ method: req.method, route: req.route.path, status: res.statusCode });
```

---

## 🔄 Troubleshooting

### Dashboard vazio ou "No data"
1. Verifique se Prometheus está rodando: `docker ps | grep prometheus`
2. Acesse http://localhost:9090/targets - todos os targets devem estar **UP**
3. Se algum target estiver **DOWN**, verifique a conectividade de rede

### Data source não conecta
1. Verifique os logs: `docker logs openwa-grafana`
2. Confirme que os containers estão na mesma rede
3. Teste conectividade: `docker exec openwa-grafana wget -O- http://openwa-prometheus:9090`

### Métricas da aplicação não aparecem
1. Verifique se o endpoint `/metrics` está exposto
2. Teste diretamente: `curl http://localhost:2785/metrics`
3. Confirme que o Prometheus está coletando: http://localhost:9090/targets

---

## 📚 Recursos Úteis

- **Prometheus Query Language**: https://prometheus.io/docs/prometheus/latest/querying/basics/
- **Grafana Dashboards**: https://grafana.com/docs/grafana/latest/dashboards/
- **prom-client (Node.js)**: https://github.com/siimon/prom-client

---

## 🚀 Próximos Passos

1. **Instrumentar OpenWA API** com métricas Prometheus
2. **Adicionar alertas** no Alertmanager (configurado mas não ativo)
3. **Configurar Loki** para visualizar logs no Grafana
4. **Criar dashboard personalizado** com métricas específicas do seu negócio

---

**Última atualização**: 2026-08-27
