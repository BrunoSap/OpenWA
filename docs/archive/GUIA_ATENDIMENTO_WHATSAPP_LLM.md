# 🤖 Guia Completo: Atendimento WhatsApp com LLM via n8n + OpenWA

## 📋 Visão Geral

Sistema de atendimento automatizado via WhatsApp que:
- ✅ Entende contexto de conversas naturalmente
- ✅ Recebe e processa anexos (imagens, documentos, áudio)
- ✅ Transcreve áudios para texto automaticamente
- ✅ Integra com Lawapp para criar clientes e fazer intake
- ✅ **Custo extremamente baixo** (< $0.01 por conversa média)
- ✅ Se passa por atendente humano
- ⚠️ Ligações telefônicas via WhatsApp **não são suportadas** (limitação da API não oficial)

---

## 🏗️ Arquitetura Proposta

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  WhatsApp User  │────▶│   OpenWA API    │────▶│  n8n Workflow   │
│  (cliente)      │     │  (container)    │     │  (orquestrador) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                        ┌────────────────────────────────┤
                        │                                │
                        ▼                                ▼
                ┌────────────────┐            ┌──────────────────┐
                │  Groq API      │            │  Lawapp API      │
                │  (LLM + STT)   │            │  (CRM jurídico)  │
                └────────────────┘            └──────────────────┘
                        │
                        ├─ Llama 3.3 70B (grátis até limites)
                        └─ Whisper (speech-to-text grátis)
```

---

## 💰 Análise de Custos (Atualizado 2026)

### **LLM mais barata e eficiente: Groq (RECOMENDADO)**

| Modelo | Provedor | Input ($/1M tokens) | Output ($/1M tokens) | Contexto | Velocidade |
|--------|----------|---------------------|----------------------|----------|------------|
| **Llama 3.3 70B** | **Groq** | **$0.59** | **$0.79** | 128k | **Muito rápida** |
| Llama 3.1 8B | Groq | $0.05 | $0.08 | 128k | Ultrarrápida |
| GPT-4o-mini | OpenAI | $0.15 | $0.60 | 128k | Rápida |
| Claude Haiku 4 | Anthropic | $0.25 | $1.25 | 200k | Rápida |
| Gemini 2.0 Flash | Google | $0.10 | $0.40 | 1M | Rápida |

**Estimativa de custo por conversa:**
- Conversa média: 10 mensagens (500 tokens input + 1000 tokens output)
- **Groq Llama 3.3 70B**: $0.0012 (~R$ 0,007)
- **Groq Llama 3.1 8B**: $0.0001 (~R$ 0,0006) ← **MAIS BARATO**
- GPT-4o-mini: $0.0007 (~R$ 0,004)

### **Speech-to-Text mais barato: Groq Whisper (RECOMENDADO)**

| Serviço | Preço | Limitações |
|---------|-------|------------|
| **Groq Whisper** | **GRÁTIS** até limites | 20 req/min, modelos small/large |
| OpenAI Whisper | $0.006/min | Sem limite de requisições |
| Deepgram Nova-2 | $0.0043/min | Streaming disponível |

**Para 100 áudios de 1min/dia:**
- Groq Whisper: **$0/mês** (dentro dos limites gratuitos)
- OpenAI Whisper: ~$18/mês

---

## 🚀 Arquitetura Detalhada do Sistema

### **Stack Recomendado:**

```yaml
# Infraestrutura
OpenWA: Container Docker já configurado (localhost:2785)
n8n: Container Docker (localhost:5678)
Redis: Para queue de webhooks (opcional mas recomendado)

# APIs Externas
Groq: LLM + Speech-to-Text (chave API gratuita)
Lawapp: API para gestão de clientes jurídicos
```

---

## 📦 Passo 1: Setup Infraestrutura

### **1.1 Configurar OpenWA (já feito!)**

Seu OpenWA já está rodando em `http://localhost:2785`.

**Criar chave API dedicada para n8n:**

```bash
curl -X POST http://localhost:2785/api/auth/api-keys \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "n8n Bot Key",
    "role": "OPERATOR"
  }' | jq -r '.key'
```

Salve a chave retornada!

---

### **1.2 Instalar n8n**

**Opção A: Docker Compose (RECOMENDADO)**

Crie `docker-compose-n8n.yml`:

```yaml
version: '3.8'

services:
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=SuaSenhaForte123
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
      - GENERIC_TIMEZONE=America/Sao_Paulo
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

**Executar:**

```bash
docker-compose -f docker-compose-n8n.yml up -d
```

**Acessar:** http://localhost:5678 (user: admin, senha: SuaSenhaForte123)

---

### **1.3 Instalar Node OpenWA no n8n**

1. Acesse n8n: http://localhost:5678
2. Vá em **Settings → Community Nodes**
3. Clique em **Install**
4. Digite: `@rmyndharis/n8n-nodes-openwa`
5. Clique em **Install**
6. Aguarde instalação e **reinicie** n8n:

```bash
docker restart n8n
```

---

### **1.4 Configurar Credenciais OpenWA no n8n**

1. No n8n, vá em **Credentials → Add Credential**
2. Busque por **OpenWA API**
3. Configure:
   - **Server URL:** `http://host.docker.internal:2785`
   - **API Key:** (cole a chave criada no passo 1.1)
4. **Test** → Deve retornar sucesso
5. **Save**

---

### **1.5 Criar Conta Groq (Grátis)**

1. Acesse: https://console.groq.com/keys
2. Crie conta (GitHub/Google login)
3. Crie uma **API Key**
4. Salve a chave: `gsk_...`

**Limites gratuitos Groq (2026):**
- 30 req/min (Llama 3.3 70B)
- 14,400 tokens/min
- Whisper: 20 req/min

---

## 🤖 Passo 2: Criar Workflow n8n "Atendimento WhatsApp"

### **Visão Geral do Fluxo:**

```
[OpenWA Trigger: message.received]
        │
        ├─ texto → [Análise de Intent + LLM Response]
        │              │
        │              └─ Intent: criar_cliente → [Lawapp API: POST /clients]
        │
        ├─ imagem → [Download anexo] → [Análise com LLM Vision]
        │
        └─ áudio → [Download anexo] → [Groq Whisper STT] → [LLM Response]
```

---

### **2.1 Workflow Completo em JSON**

Crie um novo workflow no n8n e **importe este JSON:**

```json
{
  "name": "Atendimento WhatsApp LLM",
  "nodes": [
    {
      "parameters": {
        "authentication": "openwaApi",
        "sessionId": "default",
        "events": ["message.received"]
      },
      "name": "OpenWA Trigger",
      "type": "@rmyndharis/n8n-nodes-openwa.openWATrigger",
      "position": [250, 300]
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.data.type}}",
              "operation": "equals",
              "value2": "chat"
            }
          ]
        }
      },
      "name": "IF Mensagem de Texto",
      "type": "n8n-nodes-base.if",
      "position": [450, 300]
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.data.type}}",
              "operation": "equals",
              "value2": "ptt"
            }
          ]
        }
      },
      "name": "IF Áudio",
      "type": "n8n-nodes-base.if",
      "position": [450, 500]
    },
    {
      "parameters": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer gsk_SUA_CHAVE_GROQ_AQUI"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "model",
              "value": "llama-3.3-70b-versatile"
            },
            {
              "name": "messages",
              "value": "={{[\n  {\n    role: 'system',\n    content: `Você é um atendente jurídico profissional e empático do escritório Lawapp. Sua função:\n\n1. Saudar o cliente de forma cordial\n2. Identificar o tipo de demanda jurídica\n3. Coletar informações essenciais: nome completo, CPF, telefone, e-mail\n4. Explicar os próximos passos\n5. SEMPRE responder em português brasileiro informal mas profissional\n6. Manter o tom humano, usar emojis ocasionalmente\n7. Se não souber algo, oferecer contato com advogado\n\nDados já coletados: ${JSON.stringify($('Memória Conversa').all())}\n\nQuando tiver: nome + cpf + telefone + email + tipo_demanda, retorne JSON:\n{\"action\":\"create_client\", \"data\": {...}}`\n  },\n  {\n    role: 'user',\n    content: $json.data.body\n  }\n]}}"
            },
            {
              "name": "temperature",
              "value": "0.7"
            },
            {
              "name": "max_tokens",
              "value": "500"
            }
          ]
        },
        "options": {}
      },
      "name": "Groq LLM",
      "type": "n8n-nodes-base.httpRequest",
      "position": [650, 300]
    },
    {
      "parameters": {
        "url": "https://api.groq.com/openai/v1/audio/transcriptions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer gsk_SUA_CHAVE_GROQ_AQUI"
            }
          ]
        },
        "sendBody": true,
        "contentType": "multipart-form-data",
        "bodyParameters": {
          "parameters": [
            {
              "name": "file",
              "value": "={{$binary.audio}}"
            },
            {
              "name": "model",
              "value": "whisper-large-v3"
            },
            {
              "name": "language",
              "value": "pt"
            }
          ]
        }
      },
      "name": "Groq Whisper STT",
      "type": "n8n-nodes-base.httpRequest",
      "position": [650, 500]
    },
    {
      "parameters": {
        "authentication": "openwaApi",
        "resource": "message",
        "operation": "sendText",
        "sessionId": "default",
        "chatId": "={{$json.data.chatId}}",
        "text": "={{$json.choices[0].message.content}}"
      },
      "name": "Enviar Resposta WhatsApp",
      "type": "@rmyndharis/n8n-nodes-openwa.openWA",
      "position": [850, 300]
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.choices[0].message.content}}",
              "operation": "contains",
              "value2": "create_client"
            }
          ]
        }
      },
      "name": "IF Criar Cliente",
      "type": "n8n-nodes-base.if",
      "position": [1050, 300]
    },
    {
      "parameters": {
        "url": "https://api.lawapp.com/v1/clients",
        "authentication": "headerAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer SUA_CHAVE_LAWAPP"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "name",
              "value": "={{$json.data.name}}"
            },
            {
              "name": "cpf",
              "value": "={{$json.data.cpf}}"
            },
            {
              "name": "phone",
              "value": "={{$json.data.phone}}"
            },
            {
              "name": "email",
              "value": "={{$json.data.email}}"
            },
            {
              "name": "demand_type",
              "value": "={{$json.data.demand_type}}"
            },
            {
              "name": "source",
              "value": "whatsapp_bot"
            }
          ]
        }
      },
      "name": "Lawapp: Create Client",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1250, 300]
    },
    {
      "parameters": {
        "authentication": "openwaApi",
        "resource": "message",
        "operation": "sendText",
        "sessionId": "default",
        "chatId": "={{$('OpenWA Trigger').item.json.data.chatId}}",
        "text": "✅ Cadastro realizado com sucesso! Um advogado entrará em contato em até 24h. Protocolo: {{$json.protocol}}"
      },
      "name": "Confirmação Cadastro",
      "type": "@rmyndharis/n8n-nodes-openwa.openWA",
      "position": [1450, 300]
    }
  ],
  "connections": {
    "OpenWA Trigger": {
      "main": [
        [
          {
            "node": "IF Mensagem de Texto",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF Áudio",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF Mensagem de Texto": {
      "main": [
        [
          {
            "node": "Groq LLM",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF Áudio": {
      "main": [
        [
          {
            "node": "Groq Whisper STT",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Groq LLM": {
      "main": [
        [
          {
            "node": "Enviar Resposta WhatsApp",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Groq Whisper STT": {
      "main": [
        [
          {
            "node": "Groq LLM",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Enviar Resposta WhatsApp": {
      "main": [
        [
          {
            "node": "IF Criar Cliente",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF Criar Cliente": {
      "main": [
        [
          {
            "node": "Lawapp: Create Client",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Lawapp: Create Client": {
      "main": [
        [
          {
            "node": "Confirmação Cadastro",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

---

## 🧠 Passo 3: Melhorias Avançadas

### **3.1 Memória de Conversa (Context Window)**

Para manter contexto entre mensagens, adicione um **Redis** como cache:

```yaml
# Adicione ao docker-compose-n8n.yml
  redis:
    image: redis:7-alpine
    container_name: n8n-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

**No n8n, use o node "Redis":**

```javascript
// Salvar contexto
SET conversation:{{$json.data.chatId}} "{{JSON.stringify($json.history)}}" EX 3600

// Recuperar contexto
GET conversation:{{$json.data.chatId}}
```

---

### **3.2 Detecção de Sentimento e Escalação Humana**

Adicione um **IF node** após o LLM:

```javascript
// Se cliente estiver insatisfeito, escalar para humano
IF {{$json.sentiment}} === "negative" AND {{$json.sentiment_score}} < 0.3
  THEN → [Notificar atendente via Slack/Email]
       → [OpenWA: Send Text "Um advogado vai te atender agora!"]
```

---

### **3.3 Análise de Anexos (Documentos/Imagens)**

Para processar **documentos jurídicos** enviados via WhatsApp:

```
[OpenWA Trigger] → [IF: hasMedia]
                      │
                      └─ type: image → [Groq Vision API]
                      └─ type: document → [Download] → [OCR Tesseract] → [LLM Analysis]
```

**Node OCR com Tesseract:**

```bash
# Adicione ao docker-compose
  tesseract:
    image: tesseractshadow/tesseract4re
    container_name: ocr-service
    ports:
      - "8080:8080"
```

---

### **3.4 Rate Limiting e Proteção**

**No OpenWA, ative rate limit:**

```yaml
# .env do OpenWA
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=20      # 20 msg/min por usuário
RATE_LIMIT_WINDOW=60000
```

**No n8n, adicione um IF de spam detection:**

```javascript
// Bloquear se > 5 msgs em 1 minuto
IF {{$('Redis').json.count}} > 5
  THEN → [OpenWA: Block Contact]
       → [Log: Spam detected]
```

---

## ⚠️ Limitações Importantes

### **1. Ligações Telefônicas via WhatsApp**

❌ **NÃO SUPORTADO** pelo OpenWA (nem por nenhuma API não oficial)

**Por quê?**
- WhatsApp Web (usado pelo OpenWA) **não expõe** a API de chamadas de voz
- Baileys (engine alternativa) detecta ligações mas não pode atender/gravar
- A API oficial do WhatsApp Business também **não suporta ligações**

**Alternativas:**

| Solução | Tecnologia | Custo | Complexidade |
|---------|------------|-------|--------------|
| **Twilio Voice** | SIP + Programmable Voice | $0.0085/min | Média |
| **Plivo Voice** | SIP trunking | $0.007/min | Média |
| **Vonage Voice API** | WebRTC | $0.0060/min | Alta |
| **Telnyx** | SIP + WebRTC | $0.004/min | Média |

**Fluxo com ligação telefônica:**

```
[Cliente liga para número Twilio]
       │
       └─ [Twilio Voice Webhook] → [n8n]
                                       │
                                       ├─ [Groq Whisper STT (stream)]
                                       │
                                       ├─ [Groq LLM Response]
                                       │
                                       └─ [Twilio TTS: responder]
```

**Código n8n para Twilio Voice:**

```xml
<!-- Twilio TwiML Response -->
<Response>
  <Gather input="speech" language="pt-BR" speechTimeout="auto" action="https://seu-n8n.com/webhook/voice-response">
    <Say voice="Polly.Camila">
      Olá, sou a assistente virtual do escritório. Como posso ajudar?
    </Say>
  </Gather>
</Response>
```

---

### **2. Lawapp API Integration**

**⚠️ IMPORTANTE:** Você precisa obter:

1. **Endpoint da API Lawapp**: `https://api.lawapp.com/v1` (exemplo)
2. **Chave de API**: Entre em contato com suporte do Lawapp
3. **Documentação de endpoints**: `/clients`, `/cases`, `/intake`

**Estrutura típica de criação de cliente:**

```bash
POST https://api.lawapp.com/v1/clients
Authorization: Bearer YOUR_LAWAPP_KEY
Content-Type: application/json

{
  "name": "João Silva",
  "cpf": "123.456.789-00",
  "email": "joao@email.com",
  "phone": "+5511999999999",
  "demand_type": "trabalhista",
  "source": "whatsapp_bot",
  "intake_data": {
    "description": "Rescisão indevida",
    "urgency": "high",
    "collected_via": "chatbot"
  }
}
```

**Resposta esperada:**

```json
{
  "success": true,
  "client_id": "cli_abc123",
  "protocol": "PRO-2026-001234",
  "next_steps": "Um advogado entrará em contato em até 24h"
}
```

---

## 🎯 Prompt System Otimizado para Atendimento Jurídico

### **System Prompt Completo:**

```javascript
{
  role: 'system',
  content: `Você é a Clara, assistente virtual do escritório Lawapp Advocacia.

PERSONALIDADE:
- Tom amigável mas profissional
- Empática com situações jurídicas
- Usa linguagem simples, sem juridiquês
- Ocasionalmente usa emojis (👋 ⚖️ 📄 ✅)

FUNÇÕES:
1. SAUDAÇÃO: Sempre inicie com "Olá! Sou a Clara 👋"
2. IDENTIFICAÇÃO: Pergunte: nome, CPF, telefone, e-mail
3. QUALIFICAÇÃO: Identifique o tipo de demanda (trabalhista, cível, previdenciário, criminal)
4. URGÊNCIA: Classifique urgência (alta/média/baixa)
5. TRIAGEM: Se não for área de atuação, seja honesta

ÁREAS DE ATUAÇÃO LAWAPP:
✅ Direito Trabalhista
✅ Direito Civil
✅ Direito Previdenciário
✅ Direito do Consumidor
❌ Direito Criminal (não atendemos)
❌ Direito Internacional (não atendemos)

FLUXO DE COLETA:
Etapa 1: "Olá! Sou a Clara 👋 Qual seu nome completo?"
Etapa 2: "Prazer, [NOME]! Qual seu CPF?"
Etapa 3: "Qual melhor telefone de contato?"
Etapa 4: "E seu e-mail?"
Etapa 5: "Entendi. Me conta brevemente sua situação jurídica?"
Etapa 6: [Análise e classificação]

QUANDO CRIAR CLIENTE:
Quando tiver coletado:
- ✅ Nome completo
- ✅ CPF (validado)
- ✅ Telefone
- ✅ E-mail
- ✅ Tipo de demanda identificado

Retorne JSON estruturado:
{
  "action": "create_client",
  "data": {
    "name": "...",
    "cpf": "...",
    "phone": "...",
    "email": "...",
    "demand_type": "trabalhista|civil|previdenciario|consumidor",
    "description": "...",
    "urgency": "high|medium|low"
  }
}

CONVERSAS ANTERIORES:
${JSON.stringify($('Redis: Get Context').first().json || [])}

ÚLTIMA MENSAGEM DO CLIENTE:
"${$json.data.body}}"

RESPONDA DE FORMA NATURAL E HUMANA.`
}
```

---

## 📊 Monitoramento e Analytics

### **Métricas Importantes:**

```javascript
// No n8n, adicione um node "Function" de logging

const metrics = {
  timestamp: new Date(),
  chatId: $json.data.chatId,
  messageType: $json.data.type,
  llmModel: 'llama-3.3-70b',
  tokensUsed: $json.usage.total_tokens,
  cost: ($json.usage.prompt_tokens * 0.00000059) + 
        ($json.usage.completion_tokens * 0.00000079),
  responseTime: Date.now() - startTime,
  sentiment: $json.sentiment,
  intent: $json.intent,
  clientCreated: $json.action === 'create_client'
};

// Salvar no Google Sheets ou PostgreSQL
return metrics;
```

**Dashboard sugerido (Metabase/Grafana):**

- Conversas/dia
- Taxa de conversão (chat → cliente)
- Custo médio por conversa
- Tempo médio de resposta
- Sentimento geral dos atendimentos
- Tipos de demanda mais comuns

---

## 🔒 Segurança e Compliance (LGPD)

### **1. Criptografia de Dados**

```yaml
# No n8n, use variáveis de ambiente criptografadas
N8N_ENCRYPTION_KEY=<chave-forte-256-bits>
```

### **2. Retenção de Dados**

```sql
-- No PostgreSQL do n8n, configure auto-delete
DELETE FROM executions 
WHERE finished_at < NOW() - INTERVAL '90 days';
```

### **3. Consentimento LGPD**

Adicione ao system prompt:

```javascript
PRIMEIRO CONTATO: "Olá! Para te atender, vou coletar alguns dados pessoais. 
Você concorda com nossa Política de Privacidade? (Digite SIM para continuar)"
```

---

## 🚀 Deploy em Produção

### **Opção 1: VPS (DigitalOcean/Hetzner)**

**Especificações mínimas:**
- 2 vCPU
- 4 GB RAM
- 50 GB SSD
- Ubuntu 22.04 LTS

**Custo:** ~$12-20/mês

```bash
# Setup completo
git clone <seu-repo>
cd openwa-production

# Copie docker-compose unificado
docker-compose up -d

# Configure SSL com Caddy
caddy reverse-proxy --from n8n.seudominio.com --to localhost:5678
```

---

### **Opção 2: Railway.app (PaaS)**

1. Conecte repositório GitHub
2. Configure variáveis de ambiente
3. Deploy automático em cada push
4. **Custo:** ~$5/mês (Hobby plan)

---

### **Opção 3: Kubernetes (Escala Alta)**

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openwa-bot
spec:
  replicas: 3
  selector:
    matchLabels:
      app: openwa
  template:
    spec:
      containers:
      - name: openwa
        image: openwa/openwa-api:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
```

---

## 📚 Projetos GitHub Úteis

### **1. OpenWA Plugins**
- **Repo:** https://github.com/rmyndharis/OpenWA-plugins
- **Plugins prontos:** Chatwoot, Typebot, Dialogflow
- **Instale via dashboard:** http://localhost:2785 → Plugins

### **2. n8n WhatsApp Templates**
- **Repo:** https://github.com/n8n-io/n8n-templates
- **Template:** "WhatsApp AI Customer Support"
- **Import direto** no n8n

### **3. Groq Python SDK (para processamento pesado)**
```bash
pip install groq

# Script Python para análise de documentos
from groq import Groq
client = Groq(api_key="gsk_...")

transcription = client.audio.transcriptions.create(
  file=open("audio.ogg", "rb"),
  model="whisper-large-v3",
  language="pt"
)
```

### **4. Typebot (alternativa visual para n8n)**
- **Repo:** https://github.com/baptisteArno/typebot.io
- **Self-hosted flow builder** visual
- **Integração nativa** com WhatsApp via OpenWA

---

## 🎬 Roadmap de Implementação (2 semanas)

### **Semana 1: MVP**
- [x] OpenWA configurado
- [ ] n8n instalado e nodes OpenWA funcionando
- [ ] Workflow básico (texto → LLM → resposta)
- [ ] Groq API configurada
- [ ] Teste com 10 conversas reais

### **Semana 2: Features Avançadas**
- [ ] Speech-to-text (áudio)
- [ ] Memória de contexto (Redis)
- [ ] Integração Lawapp
- [ ] Escalação para humano
- [ ] Métricas e monitoramento

---

## 💡 Dicas Finais

1. **Comece simples:** MVP com apenas texto → LLM → resposta
2. **Teste com usuários reais:** 10-20 conversas para ajustar prompts
3. **Monitore custos:** Groq tem limites grátis, mas acompanhe uso
4. **Tenha fallback humano:** Sempre ofereça "falar com advogado"
5. **LGPD:** Garanta consentimento explícito antes de coletar dados
6. **Performance:** Groq é 10x mais rápido que OpenAI (< 500ms de resposta)

---

## 🆘 Troubleshooting Comum

### **Problema: n8n não acessa OpenWA**

```bash
# Use host.docker.internal em vez de localhost
Server URL: http://host.docker.internal:2785
```

### **Problema: Groq retorna 429 (rate limit)**

```bash
# Adicione retry exponential backoff no n8n
Max Retries: 3
Retry Delay: 2000ms
```

### **Problema: WhatsApp bane a conta**

**Causas comuns:**
- Enviar > 100 msgs/dia para números novos
- Respostas muito rápidas (< 2s)
- Mensagens idênticas em massa

**Soluções:**
```javascript
// Adicione delay humano (1-3s)
await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

// Varie as respostas ligeiramente
temperature: 0.9  // Aumenta variação
```

---

## 📞 Suporte

- **OpenWA Issues:** https://github.com/rmyndharis/OpenWA/issues
- **n8n Community:** https://community.n8n.io
- **Groq Discord:** https://discord.gg/groq
- **Documentação Lawapp:** (solicite ao suporte)

---

**Criado em:** 2026-08-22  
**Atualizado por:** Claude (Opus 4.8)  
**Versão:** 1.0
