# 🏗️ Arquitetura: Workflow Unificado

## 🎯 Visão Geral

Um workflow que recebe TODOS os eventos (texto e áudio) e roteia inteligentemente.

---

## 📊 Fluxo Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLIENTE ENVIA MENSAGEM                                   │
│ • Texto: "Quanto custa?"                                    │
│ • Áudio: 🎤 "Quanto custa?"                                 │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. OpenWA (Container)                                       │
│ • Recebe mensagem do WhatsApp                               │
│ • Dispara evento: message.received                          │
│ • Tipo: "text" ou "voice"                                   │
└─────────────────────────────────────────────────────────────┘
                         ↓
                    ┌────┴────┐
                    │         │
              ┌─────▼─────┐   │
              │ TEXTO?    │   │ ÁUDIO?
              └─────┬─────┘   │
                    │         │
     ┌──────────────┘         └──────────────┐
     │                                       │
     ▼                                       ▼
┌──────────────────────┐         ┌──────────────────────┐
│ 3. Plugin voice-     │         │ 4. Webhook n8n       │
│ transcription        │         │ (Unificado)          │
│ • Ignora texto       │         │ Event:               │
│ • Processa áudio     │         │ message.received     │
│ • Chama Groq STT     │         │ Type: text           │
│ • Gera transcrição   │         └──────────┬───────────┘
└──────────┬───────────┘                    │
           │                                │
           │ POST                           │
           │ message.transcription          │
           │                                │
           └────────────────┬───────────────┘
                           ▼
           ┌───────────────────────────────┐
           │ 5. Webhook n8n (Unificado)    │
           │ • 1 endpoint pra TUDO         │
           │ • Recebe text E transcription │
           └───────────┬───────────────────┘
                       ▼
           ┌───────────────────────────────┐
           │ Node 0: Detectar Tipo         │
           │ • message.received + text?    │
           │   → route: "text_message"     │
           │ • message.received + voice?   │
           │   → route: "skip"             │
           │ • message.transcription?      │
           │   → route: "audio_transc..."  │
           └───────────┬───────────────────┘
                       ▼
           ┌───────────────────────────────┐
           │ Node Roteamento (IF)          │
           │ • route = text_message?       │
           │   → Output 1 (texto)          │
           │ • route = audio_transcription?│
           │   → Output 2 (áudio)          │
           │ • route = skip?               │
           │   → Termina (aguarda transc.) │
           └─────┬──────────────┬──────────┘
                 │              │
        ┌────────▼────┐    ┌────▼────────┐
        │ Output 1    │    │ Output 2    │
        │ (TEXTO)     │    │ (ÁUDIO)     │
        └────┬────────┘    └────┬────────┘
             ▼                  ▼
┌────────────────────┐  ┌────────────────────┐
│ Node 1a:           │  │ Node 1b:           │
│ Normalizar Texto   │  │ Normalizar Áudio   │
│ • Remove acentos   │  │ • Remove acentos   │
│ • Detecta tipo     │  │ • Detecta urgência │
│ • Detecta urgência │  │ • Simples          │
│ • Detecta categoria│  └────────┬───────────┘
└────────┬───────────┘           │
         │                       │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │ Node 2:               │
         │ Montar Prompt         │
         │ • System prompt       │
         │ • User prompt         │
         │ • Contexto (áudio?)   │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │ Node 3: LLM Chain     │
         │ • Groq qwen 27b       │
         │ • System + User msg   │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │ Node 4:               │
         │ Limpar Resposta       │
         │ • Remove <think>      │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │ Node 5:               │
         │ Enviar WhatsApp       │
         │ • POST OpenWA API     │
         │ • Envia texto         │
         └───────────┬───────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. CLIENTE RECEBE RESPOSTA                                  │
│ • "A consulta é gratuita. Quer agendar? 😊"                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Comparação: Eventos Paralelos

### **Cenário: Cliente Manda ÁUDIO**

#### **O Que Acontece Internamente:**

```
T=0s    Cliente manda áudio 🎤
        │
T=0.1s  OpenWA detecta mensagem tipo "voice"
        │
        ├─────────────────────┬──────────────────────┐
        │                     │                      │
        ▼                     ▼                      ▼
   EVENTO 1            EVENTO 2 (assíncrono)    EVENTO 3 (se habilitado)
message.received     Plugin processa          chatDelivery (off)
  ↓                    ↓
Webhook Unificado    Groq STT (2-3s)
  ↓                    ↓
Node Detectar Tipo   Gera transcrição
  ↓                    ↓
route: "skip"        POST webhook
reason: "Aguardando"   ↓
  ↓                  Webhook Unificado
Workflow PARA          ↓
                    Node Detectar Tipo
                       ↓
                    route: "audio_transcription"
                       ↓
                    LLM processa
                       ↓
                    Bot responde ✅

T=3s    Cliente recebe 1 RESPOSTA
```

---

## 🧩 Anatomia do Node "Detectar Tipo"

```javascript
// Recebe body do webhook
const body = $json.body;

// === CASO 1: Evento de TRANSCRIÇÃO ===
if (body.event === 'message.transcription') {
  // Plugin voice-transcription enviou
  return {
    route: 'audio_transcription',
    text: body.transcription.text,
    language: body.transcription.language,
    chatId: body.chatId,
    messageId: body.messageId
  };
}

// === CASO 2: Mensagem NORMAL (message.received) ===
const messageType = body.data.type;

// Se for ÁUDIO → SKIP (aguardar transcrição)
if (messageType === 'voice' || messageType === 'audio') {
  return {
    route: 'skip',
    reason: 'Aguardando transcrição'
  };
}

// Se for TEXTO → Processar
if (messageType === 'text') {
  return {
    route: 'text_message',
    text: body.data.body,
    chatId: body.data.chatId
  };
}
```

---

## 🔀 Node Roteamento (IF)

```
                ┌──────────────────┐
                │   Roteamento     │
                │   (IF node)      │
                └────────┬─────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    route =         route =         route =
  text_message  audio_transcription  skip
         │               │               │
    Output 1        Output 2        (vazio)
         │               │
    Node 1a         Node 1b
 Normalizar Texto Normalizar Áudio
```

**Configuração do IF:**

```json
{
  "conditions": [
    {
      "id": "text",
      "leftValue": "={{ $json.route }}",
      "rightValue": "text_message",
      "operator": "equals"
    },
    {
      "id": "audio",
      "leftValue": "={{ $json.route }}",
      "rightValue": "audio_transcription",
      "operator": "equals"
    }
  ]
}
```

---

## 📡 Payloads dos Eventos

### **Evento 1: message.received (texto)**

```json
{
  "event": "message.received",
  "data": {
    "id": "wamid.HBgLNTUx...",
    "chatId": "5511999999999@s.whatsapp.net",
    "type": "text",
    "body": "Quanto custa?",
    "from": "5511999999999@s.whatsapp.net",
    "timestamp": 1724544000
  }
}
```

---

### **Evento 2: message.received (áudio)**

```json
{
  "event": "message.received",
  "data": {
    "id": "wamid.HBgLNTUx...",
    "chatId": "5511999999999@s.whatsapp.net",
    "type": "voice",
    "mimetype": "audio/ogg; codecs=opus",
    "from": "5511999999999@s.whatsapp.net",
    "timestamp": 1724544010
  }
}
```

**⚠️ Note:** Não tem `body` (áudio não é texto)

---

### **Evento 3: message.transcription**

```json
{
  "event": "message.transcription",
  "sessionId": "75a54c72-fade-48af-9059-cf56362df076",
  "messageId": "wamid.HBgLNTUx...",
  "chatId": "5511999999999@s.whatsapp.net",
  "status": "completed",
  "source": "speech-to-text",
  "untrusted": true,
  "transcription": {
    "text": "Quanto custa",
    "language": "pt",
    "provider": "groq",
    "model": "whisper-large-v3-turbo"
  }
}
```

---

## 🔐 Segurança

### **Webhook Signing (HMAC-SHA256)**

O plugin `voice-transcription` assina o body:

```
X-OpenWA-Signature: sha256=abc123...
```

Para validar (opcional, mas recomendado):

```javascript
// Node: Validar Assinatura (adicionar antes do Detectar Tipo)
const crypto = require('crypto');

const secret = 'lawapp_webhook_secret_2026';
const signature = $node['Webhook Unificado'].context['headers']['x-openwa-signature'];
const body = JSON.stringify($json.body);

const expectedSignature = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

if (signature !== expectedSignature) {
  throw new Error('Assinatura inválida!');
}

return { json: { valid: true } };
```

---

## 🎛️ Configuração do Plugin

```json
{
  "sttBaseUrl": "https://api.groq.com/openai",
  "sttApiKey": "gsk_...",
  "model": "whisper-large-v3-turbo",
  "language": "pt",
  "provider": "groq",
  "timeoutMs": 20000,
  "enabledMessageTypes": ["voice"],
  "maxSizeBytes": 16777216,
  "maxPerHour": 100,
  "deliveryWebhookUrl": "http://n8n:5678/webhook/whatsapp-unified",
  "deliverySecret": "lawapp_webhook_secret_2026",
  "deliveryTimeoutMs": 5000,
  "chatDelivery": "off"
}
```

**Campos críticos:**
- `deliveryWebhookUrl` → Mesmo webhook do OpenWA
- `enabledMessageTypes` → `["voice"]` (só PTT, não áudios longos)
- `chatDelivery` → `"off"` (workflow responde, não o plugin)

---

## 📊 Métricas

### **O Que Medir**

| Métrica | Como Coletar |
|---------|--------------|
| Mensagens texto/dia | Contar `route: "text_message"` |
| Mensagens áudio/dia | Contar `route: "audio_transcription"` |
| Taxa de sucesso STT | `status: "completed"` / total áudios |
| Tempo médio resposta | `timestamp` final - inicial |
| Áudios skipped | `status: "skipped"` (muito grande, rate limit) |
| Erros LLM | Node 3 falhou |

### **Adicionar Node de Logging**

Depois do node "5. Enviar WhatsApp", adicionar:

```javascript
// Node: Log Metrics
const data = $input.first().json;

const metric = {
  timestamp: new Date().toISOString(),
  chatId: data.chatId,
  messageId: data.messageId,
  isAudio: data.isAudio,
  success: true
};

// Enviar pra Redis ou PostgreSQL
// (implementar depois)

return { json: metric };
```

---

## 🚀 Evolução Futura

### **Fase 1: Unificação** ✅
- [x] Um webhook pra tudo
- [x] Roteamento inteligente
- [x] Áudio não responde 2x

### **Fase 2: Histórico (Redis)**
- [ ] Salvar contexto de conversa
- [ ] Cliente não repete informações
- [ ] Schema: `chat:{chatId}:history`

### **Fase 3: Inteligência**
- [ ] Detectar duplicatas (mesmo texto < 5s)
- [ ] Consultar status real (PostgreSQL)
- [ ] Escalação humana (criar ticket)

### **Fase 4: Métricas**
- [ ] Dashboard Grafana
- [ ] Alertas (taxa erro > 5%)
- [ ] A/B testing (prompts)

---

## 📁 Estrutura de Arquivos

```
/Users/I531631/claude/Pessoal/OpenWA/
├── Whatsapp-Unified-Bot.json              # Workflow novo ✅
├── MIGRAR_PARA_UNIFIED_BOT.md             # Guia de migração ✅
├── ARQUITETURA_UNIFIED_BOT.md             # Este arquivo ✅
├── TESTE_VOICE_TRANSCRIPTION.md           # Guia de teste E2E
├── INSTALAR_VOICE_TRANSCRIPTION.md        # Guia de instalação plugin
├── WhatsApp-Audio-Transcription.json      # DEPRECADO
└── Whatsapp-LLM-Bot-Intake-Inteligente.json # DEPRECADO
```

---

**Arquitetura documentada!** 📐

Agora siga o guia `MIGRAR_PARA_UNIFIED_BOT.md` para implementar.
