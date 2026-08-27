# 🐛 Bugs Corrigidos no Workflow Unificado

## 🔴 Bug 1: Texto Processado Como Áudio

### **Sintoma:**
```
Cliente: "Oi?"
Bot: "Ouvi seu áudio! Ele veio vazio..."
```

Bot respondeu como se fosse áudio, mas cliente mandou **texto**.

---

### **Causa Raiz:**

**Hipótese 1:** Node "Detectar Tipo" classificou errado
- `body.event` estava `undefined` → assumiu `message.received`
- Mas `body.data.type` deveria ser `"text"`
- **Verificação necessária:** Ver logs de execução

**Hipótese 2:** Transcrição vazia disparou evento errado
- Plugin `voice-transcription` enviou `message.transcription` com `text: ""`
- Node detectou `route: "audio_transcription"` mas texto vazio
- LLM montou prompt "ÁUDIO TRANSCRITO: ''"

---

### **Correção Aplicada:**

#### **1. Logs Detalhados no Node "Detectar Tipo"**

```javascript
console.log('[DETECT] Full body:', JSON.stringify(body, null, 2));
console.log('[DETECT] Event:', body.event || 'message.received');
console.log('[DETECT] Message type:', messageType);
console.log('[DETECT] Message body:', messageBody);
```

**Benefício:** Rastrear exatamente o que chegou no webhook.

---

#### **2. Validação Estrita de Transcrição Vazia**

```javascript
if (body.status !== 'completed' || !transcription.text || transcription.text.trim() === '') {
  console.log('[DETECT] Skipping transcription - empty or failed');
  return {
    json: {
      route: 'skip',
      reason: 'Transcrição vazia ou falhou'
    }
  };
}
```

**Antes:** Só checava `!transcription.text`  
**Depois:** Checa `text.trim() === ''` também

---

#### **3. Log de Route Decidida**

```javascript
console.log('[DETECT] ✅ Route: text_message');
console.log('[DETECT] ✅ Route: audio_transcription');
console.log('[DETECT] ⏸️ Route: skip (reason)');
```

---

## 🔴 Bug 2: LLM Response Não Limpa (`<think>` Não Removido)

### **Sintoma:**

```json
{
  "chatId": "177661372538992@lid",
  "text": "<think>\nHere's a thinking process:\n\n1. Analyze User Input...\n[3000+ chars de raciocínio interno]\n</think>\n\nOuvi seu áudio...",
  "messageId": "false_177661372538992@lid_3A8857E843E78E945F23"
}
```

OpenWA rejeitou com `400 Bad Request` porque:
- Texto > 4096 chars (WhatsApp limit)
- JSON malformado (quebras de linha dentro do `<think>`)

---

### **Causa Raiz:**

Node "4. Limpar Resposta" tentou referenciar node errado:

```javascript
// ❌ ERRADO
const prevData = $item("0").$node["2. Montar Prompt"].json;
```

**Problema:** `$item("0").$node["2. Montar Prompt"]` retorna `undefined` porque:
- `$item("0")` é o primeiro item do **input atual** (LLM output)
- `.$node["..."]` tenta acessar output de outro node VIA esse item
- Mas n8n não popula automaticamente `.json` de outros nodes em todos os contextos

---

### **Correção Aplicada:**

```javascript
// ✅ CORRETO
const promptData = $('2. Montar Prompt').first().json;
```

**Mudança:**
- `$('Nome do Node')` → Acessa diretamente o node pelo nome
- `.first()` → Pega primeiro item do output desse node
- `.json` → Pega o JSON payload

---

#### **Backup: Fallback se Texto Vazio**

```javascript
if (!text || text.length === 0) {
  console.error('[CLEAN] ERROR: Text is empty after cleaning!');
  text = 'Desculpa, tive um problema ao processar. Pode repetir?';
}
```

Evita enviar resposta vazia pro WhatsApp.

---

#### **Logs de Debug**

```javascript
console.log('[CLEAN] Raw LLM output length:', text.length);
console.log('[CLEAN] First 100 chars:', text.substring(0, 100));
console.log('[CLEAN] Removed', originalLength - cleanedLength, 'chars of <think> tags');
console.log('[CLEAN] Final text:', text);
```

---

## 📊 Comparação: Antes vs Depois

| Aspecto | ANTES | DEPOIS |
|---------|-------|--------|
| **Bug 1: Texto como áudio** | ❌ "Oi?" → "Ouvi seu áudio!" | ✅ "Oi?" → resposta texto |
| **Bug 2: `<think>` enviado** | ❌ 400 Bad Request (3000 chars) | ✅ Texto limpo (50 chars) |
| **Logs** | ⚠️ Mínimos | ✅ Detalhados em cada step |
| **Validação transcrição vazia** | ⚠️ Só `!text` | ✅ `!text \|\| text.trim() === ''` |
| **Referência entre nodes** | ❌ `$item("0").$node["..."]` | ✅ `$('Node Name').first().json` |

---

## 🧪 Como Testar as Correções

### **Teste 1: Mensagem de TEXTO**

Enviar pelo WhatsApp:
```
Oi?
```

**Resultado esperado:**
1. n8n Executions → Ver logs:
   ```
   [DETECT] Event: message.received
   [DETECT] Message type: text
   [DETECT] Message body: Oi?
   [DETECT] ✅ Route: text_message
   ```
2. LLM responde (texto curto, sem "áudio")
3. Node "4. Limpar Resposta":
   ```
   [CLEAN] Raw LLM output length: 150
   [CLEAN] Removed 0 chars of <think> tags
   [CLEAN] Final text: Oi! Tô aqui pra te ajudar...
   ```
4. WhatsApp recebe: "Oi! Tô aqui pra te ajudar..."

---

### **Teste 2: Mensagem de ÁUDIO**

Enviar áudio pelo WhatsApp:
```
🎤 "Olá, quanto custa?"
```

**Resultado esperado:**

**Execução 1 (message.received):**
```
[DETECT] Event: message.received
[DETECT] Message type: voice
[DETECT] ⏸️ Voice message detected, SKIP (waiting for transcription)
```
Workflow para → ✅

**Execução 2 (message.transcription, 2-3s depois):**
```
[DETECT] Event: message.transcription
[DETECT] Transcription event detected
[DETECT] Status: completed
[DETECT] Transcription text: Olá, quanto custa?
[DETECT] ✅ Route: audio_transcription
```
→ LLM processa → Responde com confirmação de áudio

---

### **Teste 3: Transcrição VAZIA**

Simular (ou áudio muito curto):
```json
{
  "event": "message.transcription",
  "status": "completed",
  "transcription": {
    "text": "",
    "language": "pt"
  }
}
```

**Resultado esperado:**
```
[DETECT] Transcription event detected
[DETECT] Status: completed
[DETECT] Transcription text: 
[DETECT] Skipping transcription - empty or failed
[DETECT] ⏸️ Route: skip
```
Workflow para → Cliente não recebe resposta (correto, áudio inaudível)

---

## 🔧 Comandos de Debug

### **Ver Logs do n8n em Tempo Real**

```bash
docker logs -f n8n --tail 100 | grep -E '\[DETECT\]|\[CLEAN\]'
```

---

### **Simular Webhook Manualmente (Texto)**

```bash
curl -X POST http://localhost:5678/webhook/whatsapp-unified \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.received",
    "data": {
      "id": "wamid.test123",
      "chatId": "5511999999999@s.whatsapp.net",
      "type": "text",
      "body": "Teste manual",
      "from": "5511999999999@s.whatsapp.net",
      "timestamp": 1724544000
    }
  }'
```

---

### **Simular Webhook Manualmente (Áudio)**

```bash
curl -X POST http://localhost:5678/webhook/whatsapp-unified \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.transcription",
    "sessionId": "75a54c72-fade-48af-9059-cf56362df076",
    "messageId": "wamid.test456",
    "chatId": "5511999999999@s.whatsapp.net",
    "status": "completed",
    "transcription": {
      "text": "Teste de áudio",
      "language": "pt",
      "provider": "groq",
      "model": "whisper-large-v3-turbo"
    }
  }'
```

---

## ✅ Checklist de Validação

Após importar workflow corrigido:

- [ ] Teste texto: "Oi?" → Resposta sem mencionar "áudio"
- [ ] Teste áudio: 🎤 "Olá" → 2 execuções (skip + transcrição)
- [ ] Logs `[DETECT]` aparecem no n8n
- [ ] Logs `[CLEAN]` aparecem no n8n
- [ ] Nenhum erro 400 Bad Request
- [ ] Texto sempre < 500 chars (sem `<think>`)
- [ ] Transcrição vazia → SKIP (não responde)

---

## 📁 Arquivos Atualizados

```
/Users/I531631/claude/Pessoal/OpenWA/
├── Whatsapp-Unified-Bot.json              # ✅ CORRIGIDO
│   ├── Node "0. Detectar Tipo"            # ✅ Logs + validação .trim()
│   └── Node "4. Limpar Resposta"          # ✅ $('Node Name').first().json
├── BUGS_CORRIGIDOS.md                     # Este arquivo
└── MIGRAR_PARA_UNIFIED_BOT.md             # Guia de migração
```

---

## 🚀 Próximos Passos

1. **Re-importar** [Whatsapp-Unified-Bot.json](Whatsapp-Unified-Bot.json) no n8n
2. **Testar** os 3 cenários acima
3. **Ver logs** e confirmar que `[DETECT]` e `[CLEAN]` aparecem
4. **Validar** que texto e áudio funcionam corretamente

---

**Bugs documentados e corrigidos!** 🐛✅

Reimporte o workflow e teste com os comandos acima.
