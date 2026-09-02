# 🎯 Implementação Completa de Métricas com Drill-Down

## ✅ O que foi Implementado

### 1. **Serviço de Métricas** (`src/modules/metrics/metrics.service.ts`)
- ✅ Métricas Prometheus (Counter, Histogram, Gauge)
- ✅ Store em memória para drill-down (últimas 1000 requisições/mensagens/sessões)
- ✅ Métodos de busca e filtro
- ✅ Coleta automática de métricas do Node.js (CPU, memória, event loop)

### 2. **Interceptor HTTP** (`src/modules/metrics/metrics.interceptor.ts`)
- ✅ Captura automática de TODAS as requisições HTTP
- ✅ Armazena: method, path, status, duration, body, response, IP, user-agent
- ✅ Sanitização de campos sensíveis (password, token, secret)
- ✅ Limitação de tamanho (10KB por request/response)

### 3. **Controller REST** (`src/modules/metrics/metrics.controller.ts`)
- ✅ Endpoint Prometheus: `GET /api/metrics` 
- ✅ Drill-down de requisições: `GET /api/metrics/requests`
- ✅ Drill-down de mensagens: `GET /api/metrics/messages`
- ✅ Drill-down de sessões: `GET /api/metrics/sessions`
- ✅ Detalhes individuais: `GET /api/metrics/{type}/{id}`

### 4. **Módulo NestJS** (`src/modules/metrics/metrics.module.ts`)
- ✅ Módulo global para usar em qualquer lugar
- ✅ Interceptor registrado automaticamente
- ✅ Integrado no app.module.ts

---

## 🔧 Configuração Necessária

### Passo 1: Adicionar token de métricas no `.env`

Abra o arquivo `.env` e adicione:

```bash
# Métricas Prometheus
METRICS_TOKEN=metrics_access_2026
```

### Passo 2: Reiniciar a aplicação

```bash
docker-compose restart openwa-api
```

Ou se estiver rodando localmente:

```bash
npm run start:dev
```

---

## 📊 Endpoints Disponíveis

### 1. Métricas Prometheus
```bash
# Formato Prometheus (para o Prometheus scraper)
GET http://localhost:2785/api/metrics
Authorization: Bearer metrics_access_2026
```

**Métricas incluídas**:
- `http_requests_total{method, path, status}` - Total de requisições
- `http_request_duration_milliseconds{method, path, status}` - Latência
- `http_requests_in_flight` - Requisições em andamento
- `whatsapp_messages_total{type, status}` - Total de mensagens WhatsApp
- `whatsapp_active_sessions` - Sessões ativas
- `whatsapp_message_duration_milliseconds{type}` - Tempo de envio/recebimento
- `whatsapp_errors_total{type, error_code}` - Erros do WhatsApp
- Métricas padrão do Node.js: CPU, memória, event loop, GC

---

### 2. Drill-Down: Requisições HTTP

#### Listar requisições recentes
```bash
GET http://localhost:2785/api/metrics/requests?limit=50

# Exemplo de resposta:
[
  {
    "id": "uuid-aqui",
    "timestamp": "2026-08-27T17:30:00.000Z",
    "method": "POST",
    "path": "/api/messages/send",
    "statusCode": 200,
    "duration": 245,
    "userAgent": "WhatsApp/2.23.1",
    "ip": "192.168.1.100",
    "body": {"to": "5511999999999", "text": "Olá!"},
    "response": {"messageId": "msg123", "status": "sent"}
  }
]
```

#### Filtrar requisições
```bash
# Requisições com erro
GET http://localhost:2785/api/metrics/requests?status=500

# Requisições lentas (> 1 segundo)
GET http://localhost:2785/api/metrics/requests?minDuration=1000

# Requisições de um endpoint específico
GET http://localhost:2785/api/metrics/requests?path=/api/messages

# Requisições POST
GET http://localhost:2785/api/metrics/requests?method=POST
```

#### Detalhe de uma requisição
```bash
GET http://localhost:2785/api/metrics/requests/{id}

# Resposta: JSON completo da requisição + response
```

---

### 3. Drill-Down: Mensagens WhatsApp

#### Listar mensagens recentes
```bash
GET http://localhost:2785/api/metrics/messages?limit=100

# Exemplo de resposta:
[
  {
    "id": "msg-uuid",
    "timestamp": "2026-08-27T17:30:00.000Z",
    "type": "sent",
    "chatId": "5511999999999@c.us",
    "from": "5511888888888@c.us",
    "to": "5511999999999@c.us",
    "body": "Olá, tudo bem?",
    "mediaType": null,
    "status": "delivered",
    "metadata": {...}
  }
]
```

#### Filtrar mensagens
```bash
# Mensagens enviadas
GET http://localhost:2785/api/metrics/messages?type=sent

# Mensagens de um chat específico
GET http://localhost:2785/api/metrics/messages?chatId=5511999999999

# Buscar por conteúdo
GET http://localhost:2785/api/metrics/messages?body=boleto

# Mensagens com erro
GET http://localhost:2785/api/metrics/messages?type=failed
```

#### Detalhe de uma mensagem
```bash
GET http://localhost:2785/api/metrics/messages/{id}

# Resposta: JSON completo com corpo da mensagem, mídia, metadata
```

---

### 4. Drill-Down: Sessões WhatsApp

#### Listar todas as sessões
```bash
GET http://localhost:2785/api/metrics/sessions

# Exemplo de resposta:
[
  {
    "id": "session-uuid",
    "sessionId": "my-whatsapp-session",
    "status": "active",
    "startTime": "2026-08-27T15:00:00.000Z",
    "lastActivity": "2026-08-27T17:30:00.000Z",
    "messageCount": 1234,
    "errorCount": 2,
    "phoneNumber": "5511888888888",
    "metadata": {...}
  }
]
```

#### Listar apenas sessões ativas
```bash
GET http://localhost:2785/api/metrics/sessions?status=active
```

#### Detalhe de uma sessão
```bash
GET http://localhost:2785/api/metrics/sessions/{id}
```

---

### 5. Estatísticas Gerais
```bash
GET http://localhost:2785/api/metrics/stats

# Resposta:
{
  "requests": {
    "total": 1000,  // Total armazenado
    "recent": 10    // Últimos 10
  },
  "messages": {
    "total": 500,
    "recent": 10
  },
  "sessions": {
    "total": 5,
    "active": 3
  }
}
```

---

## 🎨 Como Usar no Grafana

### 1. Criar variáveis de template

No dashboard do Grafana, crie estas variáveis:

```
Name: request_id
Type: Query
Query: label_values(http_requests_total, request_id)
```

### 2. Adicionar painel com Data Link

Crie um painel de série temporal:

**Query**:
```promql
rate(http_requests_total[5m])
```

**Data Links** (configurar no painel):
```
Title: View Request Details
URL: http://localhost:2785/api/metrics/requests?path=${__field.labels.path}&method=${__field.labels.method}
```

### 3. Exemplo de painel com drill-down

```json
{
  "title": "HTTP Requests with Drill-Down",
  "targets": [
    {
      "expr": "rate(http_requests_total[5m])",
      "legendFormat": "{{method}} {{path}} {{status}}"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "links": [
        {
          "title": "View Recent Requests",
          "url": "http://localhost:2785/api/metrics/requests?path=${__field.labels.path}&status=${__field.labels.status}"
        }
      ]
    }
  }
}
```

---

## 🔍 Como Funciona o Drill-Down

### Fluxo de Dados:

```
1. Requisição HTTP chega → Interceptor captura
2. Metrics Service armazena em memória (Map<id, RequestDetail>)
3. Prometheus scraper coleta contadores/histogramas
4. Grafana exibe gráficos agregados
5. Usuário clica em "drill-down link"
6. Browser abre endpoint REST com filtros
7. API retorna JSON com detalhes completos
```

### Exemplo prático:

**Cenário**: Você vê no Grafana que há muitos erros 500 em `/api/messages/send`

**Ação**:
1. Clique no gráfico → Link para drill-down
2. Abre: `http://localhost:2785/api/metrics/requests?path=/api/messages&status=500`
3. Veja lista de requests com erro
4. Clique em um para ver: `http://localhost:2785/api/metrics/requests/{id}`
5. Veja body completo, response, erro, IP, user-agent

---

## 🚀 Próximos Passos

### 1. Atualizar Prometheus

O arquivo `prometheus/prometheus.yml` já está configurado corretamente:

```yaml
- job_name: 'openwa-api'
  static_configs:
    - targets: ['openwa-api:2785']
  metrics_path: '/api/metrics'
  bearer_token: 'metrics_access_2026'
```

Se não estiver, adicione a linha `bearer_token`.

### 2. Instrumentar Eventos WhatsApp

Para que as métricas de mensagens funcionem, você precisa chamar o service quando uma mensagem for enviada/recebida:

```typescript
// Exemplo: src/modules/message/message.service.ts
import { MetricsService } from '../metrics/metrics.service';

constructor(
  private readonly metricsService: MetricsService
) {}

async sendMessage(data: SendMessageDto) {
  const startTime = Date.now();
  
  try {
    const result = await this.whatsappClient.sendMessage(data);
    
    // Registrar mensagem enviada
    this.metricsService.recordWhatsAppMessage({
      id: result.messageId,
      timestamp: new Date(),
      type: 'sent',
      chatId: data.to,
      from: this.sessionId,
      to: data.to,
      body: data.text,
      status: 'sent',
    });
    
    // Registrar duração
    this.metricsService.recordWhatsAppMessageDuration(
      'sent',
      Date.now() - startTime
    );
    
    return result;
  } catch (error) {
    // Registrar erro
    this.metricsService.recordWhatsAppError('send', error.code);
    throw error;
  }
}
```

### 3. Criar Dashboard Grafana Completo

Vou criar um dashboard JSON com drill-down links configurados.

---

## 📝 Limitações Atuais

- **Armazenamento**: Últimas 1000 requisições/mensagens/sessões em memória
  - Se reiniciar a API, perde o histórico
  - Para produção, considere salvar no PostgreSQL
  
- **Autenticação**: Bearer token simples
  - Para produção, considere integrar com o sistema de auth existente

- **Performance**: Store em memória Map() é O(1) para busca por ID
  - Busca com filtros é O(n) - pode ser lento com muitos dados

---

## 🎯 Resumo

✅ **Implementado**:
- Coleta automática de métricas HTTP
- Store para drill-down até conteúdo de requisições
- Endpoints REST para navegação detalhada
- Integração com Prometheus
- Sanitização de dados sensíveis

⚠️ **Requer**:
- Adicionar `METRICS_TOKEN` no `.env`
- Reiniciar aplicação
- Instrumentar eventos WhatsApp manualmente
- Criar dashboard Grafana com data links

🚀 **Próximo**:
- Dashboard Grafana com drill-down completo
- Exemplos de instrumentação WhatsApp
- [OPCIONAL] Migrar store para PostgreSQL

---

**Arquivo criado em**: 2026-08-27 12:15
