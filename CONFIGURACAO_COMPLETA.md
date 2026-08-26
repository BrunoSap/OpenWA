# 🚀 Configuração Completa - OpenWA Integrado

**Status:** ✅ OpenWA rodando | ✅ Sessão WhatsApp conectada | ⏭️ Configurar automação LLM

---

## 📊 Status Atual

### Containers Ativos
```bash
✅ openwa-api (porta 2785)
✅ openwa-postgres (porta 5432)
✅ openwa-redis (porta 6379)
✅ openwa-docker-proxy
```

### Sessão WhatsApp
```
✅ ID: 75a54c72-fade-48af-9059-cf56362df076
✅ Nome: atendente-test1
✅ Status: READY (conectado)
✅ Telefone: +1 (321) 488-5868
✅ Nome: Home Comfort HQ
```

### Plugins Habilitados
```
✅ whatsapp-web.js (engine principal)
✅ baileys (engine alternativo)
```

### API Key
```
owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc
```

---

## 🎯 Próximo Passo: Configurar Chatbot LLM

### Opção 1: Via Webhooks + Script Node.js (RECOMENDADO)

**Vantagens:**
- ✅ Tudo dentro do OpenWA (sem serviços externos)
- ✅ Controle total do fluxo
- ✅ Menor latência
- ✅ Mais simples de debugar

**Arquitetura:**
```
┌──────────────────────────────────────────────────┐
│  WhatsApp (Cliente)                              │
└────────────┬─────────────────────────────────────┘
             │ Mensagem
             ▼
┌──────────────────────────────────────────────────┐
│  OpenWA API                                      │
│  - Recebe mensagem via webhook interno           │
│  - Envia para processador LLM                    │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  Script Node.js (dentro do container OpenWA)     │
│  1. Consulta Redis para contexto da conversa    │
│  2. Chama Groq API (LLM)                         │
│  3. Aplica fallback (OpenAI → Anthropic)         │
│  4. Salva contexto no Redis                      │
│  5. Envia resposta via OpenWA API                │
└──────────────────────────────────────────────────┘
```

**Implementação:**

1. **Criar script de automação:**

```bash
# Dentro do container OpenWA
docker exec -it openwa-api sh
```

```javascript
// /app/data/automation/whatsapp-llm-bot.js

const axios = require('axios');
const Redis = require('ioredis');

const redis = new Redis({
  host: 'openwa-redis',
  port: 6379
});

const OPENWA_API = 'http://localhost:2785/api';
const OPENWA_KEY = process.env.OPENWA_API_KEY;
const SESSION_ID = '75a54c72-fade-48af-9059-cf56362df076';

// Multi-provider LLM failover
const LLM_PROVIDERS = [
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    apiKey: process.env.GROQ_API_KEY,
    cost: 0.0012
  },
  {
    name: 'openai',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    cost: 0.0007
  },
  {
    name: 'anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-haiku-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY,
    cost: 0.001
  }
];

// Sistema de contexto de conversa
async function getConversationContext(chatId) {
  const key = `conversation:${chatId}`;
  const messages = await redis.lrange(key, -10, -1);
  return messages.map(m => JSON.parse(m));
}

async function saveMessageToContext(chatId, role, content) {
  const key = `conversation:${chatId}`;
  const message = { role, content, timestamp: Date.now() };
  await redis.rpush(key, JSON.stringify(message));
  await redis.expire(key, 86400); // 24h TTL
}

// LLM com failover
async function callLLM(messages, attempt = 0) {
  const provider = LLM_PROVIDERS[attempt];
  if (!provider) {
    throw new Error('All LLM providers failed');
  }

  try {
    console.log(`[LLM] Tentando ${provider.name}...`);
    
    if (provider.name === 'anthropic') {
      // Anthropic usa formato diferente
      const response = await axios.post(
        provider.url,
        {
          model: provider.model,
          max_tokens: 1024,
          messages: messages.map(m => ({
            role: m.role === 'system' ? 'user' : m.role,
            content: m.content
          }))
        },
        {
          headers: {
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      return {
        provider: provider.name,
        content: response.data.content[0].text,
        cost: provider.cost
      };
    } else {
      // OpenAI-compatible (Groq, OpenAI)
      const response = await axios.post(
        provider.url,
        {
          model: provider.model,
          messages,
          temperature: 0.7,
          max_tokens: 1024
        },
        {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      return {
        provider: provider.name,
        content: response.data.choices[0].message.content,
        cost: provider.cost
      };
    }
  } catch (error) {
    console.error(`[LLM] ${provider.name} falhou:`, error.message);
    
    // Rate limit? Tentar próximo provider
    if (error.response?.status === 429 || error.code === 'ETIMEDOUT') {
      return await callLLM(messages, attempt + 1);
    }
    
    throw error;
  }
}

// Enviar mensagem via OpenWA
async function sendMessage(chatId, text) {
  await axios.post(
    `${OPENWA_API}/sessions/${SESSION_ID}/messages/send`,
    {
      to: chatId,
      text,
      type: 'text'
    },
    {
      headers: { 'x-api-key': OPENWA_KEY }
    }
  );
}

// Processador principal
async function processMessage(data) {
  const { from, body, isGroupMsg } = data;
  
  // Ignorar mensagens de grupo
  if (isGroupMsg) return;
  
  // Ignorar mensagens vazias ou de mídia
  if (!body || body.trim().length === 0) return;
  
  console.log(`[Mensagem] ${from}: ${body}`);
  
  // Delay humano
  const delay = Math.random() * 2000 + 1000;
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Marcar como "digitando..."
  await axios.post(
    `${OPENWA_API}/sessions/${SESSION_ID}/presence/typing`,
    { chatId: from },
    { headers: { 'x-api-key': OPENWA_KEY } }
  );
  
  // Buscar contexto da conversa
  const context = await getConversationContext(from);
  
  // Salvar mensagem do usuário
  await saveMessageToContext(from, 'user', body);
  
  // Preparar mensagens para LLM
  const messages = [
    {
      role: 'system',
      content: `Você é um assistente do Lawapp, plataforma jurídica brasileira.
      
Diretrizes:
- Seja profissional, educado e objetivo
- Responda sempre em português brasileiro
- Para questões jurídicas, oriente a consultar um advogado
- Não invente informações sobre produtos/serviços
- Seja breve (max 2-3 parágrafos)

Informações disponíveis:
- Plataforma: Lawapp (gestão jurídica)
- Suporte: Segunda a Sexta, 9h-18h BRT
- Email: suporte@lawapp.com.br`
    },
    ...context,
    { role: 'user', content: body }
  ];
  
  try {
    // Chamar LLM com failover
    const llmResponse = await callLLM(messages);
    
    console.log(`[LLM] Resposta via ${llmResponse.provider} (custo: $${llmResponse.cost}/1k tokens)`);
    
    // Salvar resposta do assistente
    await saveMessageToContext(from, 'assistant', llmResponse.content);
    
    // Enviar resposta
    await sendMessage(from, llmResponse.content);
    
    console.log(`[Enviado] Resposta para ${from}`);
    
  } catch (error) {
    console.error('[Erro]', error.message);
    
    // Mensagem de fallback
    await sendMessage(
      from,
      'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes ou entre em contato via suporte@lawapp.com.br'
    );
  }
  
  // Limpar status "digitando"
  await axios.post(
    `${OPENWA_API}/sessions/${SESSION_ID}/presence/available`,
    { chatId: from },
    { headers: { 'x-api-key': OPENWA_KEY } }
  ).catch(() => {});
}

// Webhook listener
async function startWebhookListener() {
  const express = require('express');
  const app = express();
  
  app.use(express.json());
  
  // Endpoint para receber mensagens do OpenWA
  app.post('/webhook/message', async (req, res) => {
    try {
      const { event, data } = req.body;
      
      if (event === 'message') {
        // Processar em background
        processMessage(data).catch(console.error);
      }
      
      res.json({ status: 'ok' });
    } catch (error) {
      console.error('[Webhook]', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  const PORT = 3001;
  app.listen(PORT, () => {
    console.log(`[Bot] Webhook listener rodando na porta ${PORT}`);
  });
}

// Inicializar
startWebhookListener().catch(console.error);
```

2. **Configurar webhook no OpenWA:**

```bash
export API_KEY="owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"
export SESSION_ID="75a54c72-fade-48af-9059-cf56362df076"

curl -X POST http://localhost:2785/api/sessions/$SESSION_ID/webhooks \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:3001/webhook/message",
    "events": ["message"],
    "enabled": true
  }'
```

3. **Adicionar variáveis de ambiente:**

```bash
# Editar docker-compose.yml e adicionar ao serviço openwa-api:
environment:
  - OPENWA_API_KEY=owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc
  - GROQ_API_KEY=${GROQ_API_KEY}
  - OPENAI_API_KEY=${OPENAI_API_KEY}
  - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
```

4. **Instalar dependências e rodar:**

```bash
docker exec openwa-api sh -c "npm install express axios ioredis"
docker exec openwa-api node /app/data/automation/whatsapp-llm-bot.js &
```

---

### Opção 2: Via n8n Externo

Se preferir usar n8n para orquestração visual:

1. **Webhook do OpenWA → n8n:**
   - OpenWA envia mensagens via webhook para n8n
   - n8n processa LLM
   - n8n envia resposta de volta via OpenWA API

**Desvantagem:** Requer mais um serviço rodando.

---

## 🔧 Configurações Adicionais Necessárias

### 1. Groq API Key

```bash
# Obter em: https://console.groq.com/keys
echo "GROQ_API_KEY=gsk_YOUR_KEY_HERE" >> .env
```

### 2. Configurar Rate Limiting

```javascript
// Dentro do script, adicionar controle de taxa:
const rateLimiter = new Map();

function canSendMessage(chatId) {
  const now = Date.now();
  const lastSent = rateLimiter.get(chatId) || 0;
  
  // Max 1 mensagem a cada 2 segundos por chat
  if (now - lastSent < 2000) {
    return false;
  }
  
  rateLimiter.set(chatId, now);
  return true;
}
```

### 3. Configurar Limite Diário

```javascript
async function checkDailyLimit(chatId) {
  const key = `daily:${new Date().toDateString()}:${chatId}`;
  const count = await redis.incr(key);
  await redis.expire(key, 86400);
  
  if (count > 50) {
    throw new Error('Limite diário excedido');
  }
  
  return count;
}
```

---

## 📊 Monitoramento

### Ver logs do bot:

```bash
docker logs -f openwa-api | grep -E "\[Bot\]|\[LLM\]|\[Mensagem\]"
```

### Ver métricas Redis:

```bash
docker exec openwa-redis redis-cli INFO stats
docker exec openwa-redis redis-cli DBSIZE
```

### Estatísticas de uso:

```bash
docker exec openwa-redis redis-cli --scan --pattern "conversation:*" | wc -l
docker exec openwa-redis redis-cli --scan --pattern "daily:*" | xargs -I {} redis-cli GET {}
```

---

## 🚀 Próximos Passos

1. ✅ Configurar Groq API key
2. ⏭️ Criar script de automação
3. ⏭️ Registrar webhook
4. ⏭️ Testar enviando mensagem para +1 (321) 488-5868
5. ⏭️ Monitorar logs
6. ⏭️ Ajustar prompts conforme necessário

---

**Status:** Pronto para implementar chatbot LLM | Arquitetura definida | Aguardando Groq API key
