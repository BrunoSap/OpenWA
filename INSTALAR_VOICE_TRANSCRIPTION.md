# 🎤 Instalar Plugin Voice Transcription — Guia Completo

## 📋 O Que Este Plugin Faz

**Transcreve áudios do WhatsApp automaticamente** e envia pro seu webhook (n8n):

```
Cliente manda áudio → Plugin transcreve (Whisper) → Webhook n8n recebe texto → LLM processa → Responde
```

**Vantagens:**
- ✅ Áudio vira texto automaticamente
- ✅ Funciona fora do fluxo principal (não bloqueia mensagens)
- ✅ Suporta Groq (grátis, rápido) ou OpenAI
- ✅ Pode usar backend local (Speaches - gratuito)
- ✅ Webhook assinado (seguro)

---

## 🎯 Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│ WhatsApp                                                │
│ Cliente manda áudio: "Olá, quanto custa o Lawapp?"     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ OpenWA                                                  │
│ Plugin: voice-transcription                             │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Groq API / OpenAI / Speaches (local)                    │
│ Whisper: transcreve áudio → texto                       │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Webhook n8n (POST)                                      │
│ Recebe: { text: "Olá, quanto custa o Lawapp?" }        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Workflow n8n                                            │
│ Processa texto com LLM → Responde WhatsApp             │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Instalação — Opção 1: Groq (RECOMENDADO)

### **Por que Groq?**
- ✅ Grátis (14.400 transcripts/dia)
- ✅ Rápido (2-3 segundos)
- ✅ Modelo: `whisper-large-v3-turbo`
- ✅ Sem infraestrutura local

---

### **Passo 1: Obter API Key do Groq**

1. Acesse: https://console.groq.com/keys
2. Crie uma API key
3. Copie (começa com `gsk_...`)

**Você já tem:** `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`

---

### **Passo 2: Baixar Plugin**

```bash
cd /Users/I531631/claude/Pessoal/OpenWA

# Clonar repositório dos plugins
git clone https://github.com/rmyndharis/OpenWA-plugins.git

# Entrar no diretório do plugin
cd OpenWA-plugins/voice-transcription

# Verificar estrutura
ls -la
```

---

### **Passo 3: Empacotar Plugin**

O OpenWA precisa de um `.zip` do plugin. Vamos criar:

```bash
# Voltar pra raiz
cd /Users/I531631/claude/Pessoal/OpenWA/OpenWA-plugins

# Criar zip (apenas voice-transcription)
cd voice-transcription
zip -r ../voice-transcription.zip . -x "*.test.ts" -x "node_modules/*" -x ".git/*"

# Verificar
ls -lh ../voice-transcription.zip
```

**Alternativa:** Baixar release pronta:
```bash
curl -L -o voice-transcription.zip \
  https://github.com/rmyndharis/OpenWA-plugins/releases/latest/download/voice-transcription.zip
```

---

### **Passo 4: Instalar Plugin no OpenWA**

```bash
# Definir API key
export OPENWA_API_KEY="owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"

# Fazer upload do plugin
curl -X POST http://localhost:2785/api/plugins/install \
  -H "X-API-Key: $OPENWA_API_KEY" \
  -F "file=@voice-transcription.zip"
```

**Resposta esperada:**
```json
{
  "success": true,
  "plugin": {
    "id": "voice-transcription",
    "version": "1.2.7",
    "status": "installed"
  }
}
```

---

### **Passo 5: Criar Webhook no n8n**

Vamos criar um webhook separado só pra transcrições:

1. Abra n8n: http://localhost:5678
2. Crie novo workflow: **"WhatsApp Audio Transcription"**
3. Adicione node **Webhook**:
   - **HTTP Method:** POST
   - **Path:** `whatsapp-audio`
   - **Respond:** Immediately
4. Clique em **Execute workflow** (ativa o webhook)
5. **Copie a Production URL**, exemplo:
   ```
   http://n8n:5678/webhook/abc123.../whatsapp-audio
   ```

---

### **Passo 6: Configurar Plugin**

```bash
# Session ID do seu WhatsApp
SESSION_ID="75a54c72-fade-48af-9059-cf56362df076"

# URL do webhook n8n (AJUSTAR COM SUA URL)
WEBHOOK_URL="http://n8n:5678/webhook/c3f3aa0f-50b5-4164-8da0-1850ab0b83c5/whatsapp-audio"

# Configurar plugin (Groq)
curl -X PUT "http://localhost:2785/api/plugins/voice-transcription/config?sessionId=$SESSION_ID" \
  -H "X-API-Key: $OPENWA_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "config": {
      "sttBaseUrl": "https://api.groq.com/openai",
      "sttApiKey": "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",
      "model": "whisper-large-v3-turbo",
      "language": "pt",
      "provider": "groq",
      "timeoutMs": 20000,
      "enabledMessageTypes": ["voice"],
      "maxSizeBytes": 16777216,
      "maxPerHour": 60,
      "deliveryWebhookUrl": "'$WEBHOOK_URL'",
      "deliverySecret": "lawapp_webhook_secret_2026",
      "deliveryTimeoutMs": 5000,
      "chatDelivery": "off"
    }
  }'
```

**Resposta esperada:**
```json
{
  "success": true,
  "sessionId": "75a54c72-fade-48af-9059-cf56362df076",
  "config": { ... }
}
```

---

### **Passo 7: Habilitar Plugin**

```bash
# Habilitar plugin
curl -X POST "http://localhost:2785/api/plugins/voice-transcription/enable?sessionId=$SESSION_ID" \
  -H "X-API-Key: $OPENWA_API_KEY"
```

**Resposta esperada:**
```json
{
  "success": true,
  "status": "enabled"
}
```

---

### **Passo 8: Verificar Instalação**

```bash
# Listar plugins instalados
curl -s -H "X-API-Key: $OPENWA_API_KEY" \
  http://localhost:2785/api/plugins | jq '.'

# Ver status do plugin
curl -s -H "X-API-Key: $OPENWA_API_KEY" \
  "http://localhost:2785/api/plugins/voice-transcription/status?sessionId=$SESSION_ID" | jq '.'
```

---

## 🧪 Testar

### **1. Enviar Áudio de Teste**

Mande um áudio pelo WhatsApp pro número: **+1 (321) 488-5868**

Exemplo: "Olá, eu gostaria de saber quanto custa o Lawapp"

---

### **2. Verificar Webhook n8n**

1. Abra n8n → Workflow "WhatsApp Audio Transcription"
2. Menu **Executions** → última execução
3. Veja payload recebido:

```json
{
  "event": "message.transcription",
  "sessionId": "75a54c72-fade-48af-9059-cf56362df076",
  "messageId": "wamid.xxx",
  "chatId": "5511999999999@s.whatsapp.net",
  "status": "completed",
  "source": "speech-to-text",
  "untrusted": true,
  "transcription": {
    "text": "Olá, eu gostaria de saber quanto custa o Lawapp",
    "language": "pt",
    "provider": "groq",
    "model": "whisper-large-v3-turbo"
  }
}
```

---

### **3. Ver Logs do OpenWA**

```bash
docker logs -f openwa-api --tail 50 | grep -i transcription
```

---

## 🔗 Integrar com Workflow Existente

### **Opção A: Webhook Unificado (RECOMENDADO)**

Criar um node que detecta se é texto ou transcrição:

```javascript
// Node: Detectar Tipo de Mensagem
const body = $json.body;

// Verificar se é transcrição
if (body.event === 'message.transcription') {
  return {
    json: {
      type: 'audio_transcription',
      chatId: body.chatId,
      messageId: body.messageId,
      text: body.transcription.text,
      language: body.transcription.language,
      provider: body.transcription.provider
    }
  };
}

// Mensagem de texto normal
if (body.data && body.data.body) {
  return {
    json: {
      type: 'text_message',
      chatId: body.data.chatId,
      messageId: body.data.id,
      text: body.data.body
    }
  };
}

// Tipo desconhecido
return {
  json: {
    type: 'unknown',
    raw: body
  }
};
```

**Fluxo:**
```
Webhook → Detectar Tipo → IF (tipo?) → [texto] → LLM → Responder
                                     → [audio] → LLM → Responder
```

---

### **Opção B: Workflow Separado**

Manter dois workflows:
1. **"Whatsapp LLM Bot"** — só mensagens de texto
2. **"WhatsApp Audio Transcription"** — só áudios

---

## 📊 Configurações Importantes

### **Limites de Uso**

| Config | Valor Padrão | Recomendado LawApp |
|--------|--------------|-------------------|
| `maxSizeBytes` | 16MB | 16MB (WhatsApp max) |
| `maxPerHour` | 60 | 100 (intake intenso) |
| `timeoutMs` | 20s | 20s (Groq é rápido) |
| `enabledMessageTypes` | `["voice"]` | `["voice"]` (só PTT) |

### **chatDelivery (Opcional)**

```json
{
  "chatDelivery": "reply"  // Bot responde: "Você disse: [transcrição]"
}
```

**Opções:**
- `off` — não envia nada pro chat (só webhook)
- `self` — envia pra você mesmo (notas privadas)
- `reply` — responde pro cliente (CUIDADO: visível em grupos)

**Recomendação:** Deixar `off` — workflow n8n processa e responde

---

## 🔐 Segurança

### **1. Validar Webhook Assinado**

O plugin assina o body com HMAC-SHA256. Validar no n8n:

```javascript
// Node: Validar Assinatura
const crypto = require('crypto');

const secret = 'lawapp_webhook_secret_2026';
const signature = $node['Webhook'].context['headers']['x-openwa-signature'];
const body = JSON.stringify($json.body);

// Calcular HMAC esperado
const expectedSignature = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

// Validar
if (signature !== expectedSignature) {
  throw new Error('Assinatura inválida! Webhook não autorizado.');
}

return { json: { valid: true } };
```

---

### **2. SSRF_ALLOWED_HOSTS**

Já configurado no seu `.env`:
```bash
SSRF_ALLOWED_HOSTS=172.20.0.3,n8n
```

Se usar backend local (Speaches), adicionar:
```bash
SSRF_ALLOWED_HOSTS=172.20.0.3,n8n,127.0.0.1
```

---

## 🆘 Troubleshooting

### **Erro: "Plugin not found"**

```bash
# Verificar se o zip foi instalado
curl -s -H "X-API-Key: $OPENWA_API_KEY" \
  http://localhost:2785/api/plugins | jq '.[] | select(.id == "voice-transcription")'
```

Se vazio, reinstalar o plugin.

---

### **Erro: "Webhook delivery failed"**

**Causa:** n8n não acessível ou URL errada

**Solução:**
1. Testar URL do webhook:
   ```bash
   docker exec openwa-api curl -X POST http://n8n:5678/webhook/.../whatsapp-audio \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```
2. Se der erro, corrigir URL no config do plugin

---

### **Erro: "STT API error"**

**Causa:** Groq API key inválida ou quota excedida

**Solução:**
1. Verificar API key: https://console.groq.com/keys
2. Ver quota: https://console.groq.com/usage
3. Se excedeu, esperar reset (14.400/dia)

---

### **Transcrição vem em branco**

**Causa:** Áudio muito curto (< 1s) ou sem fala

**Solução:** Áudio deve ter pelo menos 1-2 segundos de fala clara

---

### **Áudio não é transcrito**

**Checklist:**
- [ ] Plugin habilitado? (`/enable`)
- [ ] Config aplicada pra sessão correta?
- [ ] Webhook URL acessível do container?
- [ ] SSRF_ALLOWED_HOSTS configurado?
- [ ] Groq API key válida?
- [ ] Áudio é tipo `voice` (não `audio`)?

---

## 💰 Custos

### **Groq (Grátis)**
- ✅ 14.400 transcripts/dia
- ✅ Áudio de até 25MB
- ✅ Sem custo

**Cálculo:**
- 100 áudios/dia = 0,7% da quota
- 1000 áudios/dia = 6,9% da quota

### **OpenAI (Pago)**
- Whisper: $0.006/minuto
- 100 áudios de 30s = 50 min = $0.30/dia
- 1000 áudios/dia = $3.00/dia

---

## 🔮 Próximos Passos

### **Fase 1: Testar Plugin** (AGORA)
- [ ] Instalar plugin
- [ ] Configurar Groq
- [ ] Criar webhook n8n
- [ ] Enviar áudio de teste
- [ ] Verificar transcrição

### **Fase 2: Integrar com Workflow**
- [ ] Adicionar node "Detectar Tipo"
- [ ] Roteamento: texto vs áudio
- [ ] LLM processa ambos
- [ ] Testar com cliente real

### **Fase 3: Melhorias**
- [ ] Histórico de áudios (Redis)
- [ ] Notificar se áudio inaudível
- [ ] Responder: "Recebi seu áudio!"
- [ ] Métricas (quantos áudios/dia)

---

## 📁 Estrutura de Arquivos

```
/Users/I531631/claude/Pessoal/OpenWA/
├── OpenWA-plugins/              # Repositório clonado
│   └── voice-transcription/     # Plugin fonte
├── voice-transcription.zip      # Plugin empacotado
└── INSTALAR_VOICE_TRANSCRIPTION.md  # Este guia
```

---

## ✅ Checklist Final

Antes de usar em produção:

- [ ] Plugin instalado e habilitado
- [ ] Config aplicada (Groq + webhook)
- [ ] Webhook n8n criado e testado
- [ ] Áudio de teste funcionou
- [ ] Transcrição chegou no webhook
- [ ] Workflow n8n processa transcrição
- [ ] Bot responde corretamente
- [ ] Validação de assinatura HMAC
- [ ] Logs do OpenWA limpos (sem erros)
- [ ] Quota do Groq monitorada

---

**Pronto pra instalar!** 🚀

Execute os comandos do **Passo 2 ao 7** e me avise quando terminar pra testarmos juntos.
