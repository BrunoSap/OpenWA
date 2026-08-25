# ✅ Voice Transcription — Instalação Completa e Teste E2E

## 🎯 Status da Instalação

### **✅ Plugin Instalado e Configurado**

```json
{
  "id": "voice-transcription",
  "version": "1.2.6",
  "status": "enabled",
  "config": {
    "sttBaseUrl": "https://api.groq.com/openai",
    "sttApiKey": "***" (gsk_HQlQ...),
    "model": "whisper-large-v3-turbo",
    "language": "pt",
    "provider": "groq",
    "timeoutMs": 20000,
    "enabledMessageTypes": ["voice"],
    "maxSizeBytes": 16777216,
    "maxPerHour": 100,
    "deliveryWebhookUrl": "http://n8n:5678/webhook/c3f3aa0f-50b5-4164-8da0-1850ab0b83c5/whatsapp-audio",
    "deliverySecret": "lawapp_webhook_secret_2026",
    "deliveryTimeoutMs": 5000,
    "chatDelivery": "off"
  }
}
```

---

## 🚀 Arquitetura Implementada

```
┌─────────────────────────────────────────────────────────┐
│ 1. WhatsApp                                             │
│ Cliente envia ÁUDIO: "Olá, quanto custa o Lawapp?"     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. OpenWA + Plugin voice-transcription                  │
│ • Detecta mensagem tipo "voice"                         │
│ • Baixa áudio do WhatsApp                               │
│ • Envia pra Groq Whisper API                            │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Groq API (Whisper large-v3-turbo)                    │
│ Transcreve: "Olá, quanto custa o Lawapp?"              │
│ Tempo: ~2-3 segundos                                    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Webhook n8n (POST)                                   │
│ URL: http://n8n:5678/webhook/.../whatsapp-audio        │
│ Payload: { event, transcription: { text, language } }  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Workflow n8n "WhatsApp Audio Transcription"         │
│ Node 1: Processar transcrição                           │
│ Node 2: Montar prompt específico pra áudio             │
│ Node 3: LLM (Groq qwen 27b)                            │
│ Node 4: Limpar resposta                                 │
│ Node 5: Enviar WhatsApp                                 │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 6. WhatsApp (Resposta)                                  │
│ Bot: "Ouvi seu áudio! A consulta é gratuita. Quer      │
│ agendar uma demonstração? 😊"                           │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Workflow n8n Criado

**Arquivo:** `WhatsApp-Audio-Transcription.json`

### **Nodes:**

1. **Webhook Audio** — Recebe POST do plugin
2. **1. Processar Transcrição** — Valida e extrai dados
3. **2. Montar Prompt (Áudio)** — System + User prompt adaptado
4. **3. LLM (Áudio)** — Groq qwen 27b processa
5. **4. Limpar Resposta** — Remove `<think>` tags
6. **5. Enviar WhatsApp** — POST pro OpenWA

### **Como Importar:**

1. Abra n8n: http://localhost:5678
2. **+ Add workflow**
3. Menu **⋮** → **Import from File**
4. Selecione: `/Users/I531631/claude/Pessoal/OpenWA/WhatsApp-Audio-Transcription.json`
5. **Ative** o workflow (toggle verde)

---

## 🧪 Teste End-to-End

### **Passo 1: Verificar Plugin Habilitado**

```bash
export OPENWA_API_KEY="owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"

curl -s -H "X-API-Key: $OPENWA_API_KEY" \
  http://localhost:2785/api/plugins | grep -A 5 '"voice-transcription"' | head -10
```

**Resultado esperado:**
```json
{
  "id": "voice-transcription",
  "name": "Voice Note Transcription",
  "version": "1.2.6",
  "status": "enabled"
}
```

---

### **Passo 2: Importar Workflow n8n**

1. n8n → Import `WhatsApp-Audio-Transcription.json`
2. Ativar workflow
3. Copiar Production URL do webhook:
   ```
   http://n8n:5678/webhook/c3f3aa0f-50b5-4164-8da0-1850ab0b83c5/whatsapp-audio
   ```
4. Confirmar que URL está configurada no plugin (já está!)

---

### **Passo 3: Enviar Áudio de Teste**

**Enviar áudio pelo WhatsApp pro número:**
```
+1 (321) 488-5868
```

**Exemplos de áudio pra gravar:**

#### **Teste 1: Pergunta Simples**
```
🎤 "Olá, eu gostaria de saber quanto custa o Lawapp"
```

**Resultado esperado:**
1. Plugin transcreve áudio (2-3s)
2. Webhook n8n recebe transcrição
3. LLM processa
4. Bot responde:
   ```
   Ouvi seu áudio! A consulta é gratuita.
   
   Quer agendar uma demonstração pra conhecer melhor? 😊
   ```

---

#### **Teste 2: Áudio com Urgência**
```
🎤 "Oi, preciso saber como está meu processo, tô precisando pra comprar remédios"
```

**Resultado esperado:**
```
Ouvi seu áudio! Entendo que é urgente. 🙏

Deixa eu ver seu processo. Qual seu CPF pra eu consultar?
```

---

#### **Teste 3: Áudio com Dúvida**
```
🎤 "Eu sou casada há 20 anos, acabei de me separar. Queria saber como fica a divisão dos bens"
```

**Resultado esperado:**
```
Ouvi seu áudio! Em geral os bens são divididos meio a meio.

Quer agendar uma consulta gratuita pro Dr. Denis avaliar direitinho o seu caso? 😊
```

---

### **Passo 4: Verificar no n8n**

1. n8n → Menu **Executions**
2. Última execução → Clicar
3. Verificar cada node:

**Node 1 (Processar Transcrição):**
```json
{
  "type": "audio_transcription",
  "chatId": "5511999999999@s.whatsapp.net",
  "messageId": "wamid.xxx",
  "text": "Olá, eu gostaria de saber quanto custa o Lawapp",
  "language": "pt",
  "provider": "groq",
  "model": "whisper-large-v3-turbo"
}
```

**Node 2 (Montar Prompt):**
```json
{
  "systemPrompt": "Você é assistente virtual do escritório Dr. Dênis Bernardo...\n⚠️ Esta mensagem veio de um ÁUDIO...",
  "userPrompt": "🎤 ÁUDIO TRANSCRITO:\n\"Olá, eu gostaria de saber quanto custa o Lawapp\"\n\nLÍNGUA: pt\nPROVIDER: groq"
}
```

**Node 3 (LLM):**
```json
{
  "text": "Ouvi seu áudio! A consulta é gratuita. Quer agendar uma demonstração? 😊"
}
```

**Node 5 (Enviar WhatsApp):**
```json
{
  "success": true,
  "messageId": "wamid.yyy"
}
```

---

### **Passo 5: Ver Logs do OpenWA**

```bash
docker logs -f openwa-api --tail 100 | grep -i "transcription\|groq\|webhook"
```

**Logs esperados:**
```
[voice-transcription] Processing audio message wamid.xxx
[voice-transcription] STT request to https://api.groq.com/openai/v1/audio/transcriptions
[voice-transcription] Transcription completed: "Olá, eu gostaria de saber quanto custa o Lawapp"
[voice-transcription] Delivering to webhook: http://n8n:5678/webhook/.../whatsapp-audio
[voice-transcription] Webhook delivery success: 200 OK
```

---

## 📊 Payload Completo do Webhook

**O que n8n recebe quando você manda áudio:**

```json
{
  "event": "message.transcription",
  "sessionId": "75a54c72-fade-48af-9059-cf56362df076",
  "messageId": "wamid.HBgLNTUxMTk5NjE5MDU5ORUCABIYIDNBMzI2QjM2QzE2RUI3OURCNUU2AA==",
  "chatId": "5511996190599@s.whatsapp.net",
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

**Headers:**
```
Content-Type: application/json
X-OpenWA-Signature: sha256=abc123... (HMAC assinado)
```

---

## 🔍 Troubleshooting

### **Áudio não foi transcrito**

**1. Verificar se plugin está enabled:**
```bash
curl -s -H "X-API-Key: $OPENWA_API_KEY" \
  http://localhost:2785/api/plugins | grep -B 2 -A 10 "voice-transcription"
```

Confirmar: `"status": "enabled"`

---

**2. Ver logs do OpenWA:**
```bash
docker logs openwa-api --tail 200 | grep -i "transcription\|error\|warn"
```

**Erros comuns:**

❌ **"STT API error: 401 Unauthorized"**
→ Groq API key inválida
→ Solução: Reconfigurar com key válida

❌ **"Webhook delivery failed: ECONNREFUSED"**
→ n8n não acessível ou workflow não ativado
→ Solução: Ativar workflow, verificar URL

❌ **"Audio too large"**
→ Áudio > 16MB
→ Solução: Áudio do WhatsApp nunca passa de 16MB, mas verificar config

❌ **"Rate limit: max 100/hour exceeded"**
→ Muitos áudios em 1 hora
→ Solução: Aumentar `maxPerHour` no config

---

**3. Testar URL do webhook manualmente:**
```bash
docker exec openwa-api curl -X POST \
  http://n8n:5678/webhook/c3f3aa0f-50b5-4164-8da0-1850ab0b83c5/whatsapp-audio \
  -H "Content-Type: application/json" \
  -d '{"test": "manual", "event": "message.transcription"}'
```

**Resposta esperada:**
```
HTTP 200 OK
```

---

### **Transcrição vem errada**

**Causa:** Áudio com ruído, muito rápido ou sotaque forte

**Soluções:**
1. Falar mais devagar e próximo do microfone
2. Trocar modelo Whisper:
   - `whisper-large-v3` (mais preciso, mais lento)
   - `whisper-large-v3-turbo` (padrão, bom equilíbrio)
3. Especificar língua: `"language": "pt-BR"` (já configurado)

---

### **Bot não responde ao áudio**

**Checklist:**
- [ ] Plugin habilitado?
- [ ] Webhook n8n ativo?
- [ ] Workflow importado e ativado?
- [ ] Credenciais Groq configuradas no n8n?
- [ ] URL do webhook correta no plugin?
- [ ] OpenWA consegue acessar n8n? (testar curl)

---

## 💰 Custos e Limites

### **Groq (Gratuito)**

✅ **Quota diária:** 14.400 transcripts/dia
✅ **Quota por minuto:** 60 requests/min
✅ **Tamanho máximo:** 25MB

**Cálculo:**
- 100 áudios/dia = 0,7% da quota → ✅ Tranquilo
- 1000 áudios/dia = 6,9% da quota → ✅ OK
- 5000 áudios/dia = 34,7% da quota → ✅ Ainda OK

**Monitorar quota:**
https://console.groq.com/usage

---

### **Config do Plugin**

| Config | Valor Atual | Descrição |
|--------|-------------|-----------|
| `maxPerHour` | 100 | Limite por sessão/hora |
| `maxSizeBytes` | 16777216 (16MB) | Áudio maior é ignorado |
| `timeoutMs` | 20000 (20s) | Timeout da API Groq |
| `enabledMessageTypes` | `["voice"]` | Só PTT (não áudios longos) |

---

## ✅ Checklist de Validação

- [x] Plugin instalado (`voice-transcription v1.2.6`)
- [x] Plugin habilitado (`status: "enabled"`)
- [x] Config aplicada (Groq + webhook n8n)
- [x] Webhook URL configurada e acessível
- [x] Workflow n8n criado (`WhatsApp-Audio-Transcription.json`)
- [ ] Workflow importado no n8n **← FAZER AGORA**
- [ ] Workflow ativado (toggle verde) **← FAZER AGORA**
- [ ] Teste: Enviar áudio pelo WhatsApp **← TESTAR**
- [ ] Verificar: Transcrição chegou no n8n **← VALIDAR**
- [ ] Verificar: Bot respondeu corretamente **← VALIDAR**

---

## 🎬 Próximos Passos

### **Após Validar o Teste:**

1. **Integrar com workflow principal** (texto + áudio)
   - Criar node que detecta tipo de mensagem
   - Rotear pra workflow correto

2. **Melhorar resposta pra áudios**
   - Bot pode mandar áudio de volta (TTS)
   - Confirmar sempre que ouviu o áudio

3. **Histórico de áudios** (Redis)
   - Salvar transcrições por cliente
   - Manter contexto entre áudios

4. **Métricas**
   - Quantos áudios/dia?
   - Taxa de sucesso de transcrição?
   - Tempo médio de resposta?

---

## 📁 Arquivos Criados

```
/Users/I531631/claude/Pessoal/OpenWA/
├── voice-transcription.zip              # Plugin baixado
├── WhatsApp-Audio-Transcription.json    # Workflow n8n
├── INSTALAR_VOICE_TRANSCRIPTION.md      # Guia de instalação
└── TESTE_VOICE_TRANSCRIPTION.md         # Este arquivo
```

---

## 🚀 Comando Rápido: Teste Completo

```bash
# 1. Verificar plugin
export OPENWA_API_KEY="owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"
curl -s -H "X-API-Key: $OPENWA_API_KEY" \
  http://localhost:2785/api/plugins | grep -A 3 '"voice-transcription"'

# 2. Ver logs em tempo real
docker logs -f openwa-api --tail 50 | grep -i "transcription"

# 3. Enviar áudio de teste pelo WhatsApp
# Número: +1 (321) 488-5868
# Áudio: "Olá, quanto custa o Lawapp?"

# 4. Verificar execuções no n8n
# Abrir: http://localhost:5678 → Executions
```

---

**Pronto para testar!** 🎤

1. **Importe** o workflow `WhatsApp-Audio-Transcription.json` no n8n
2. **Ative** o workflow (toggle verde)
3. **Envie** um áudio pelo WhatsApp
4. **Verifique** no n8n Executions se chegou a transcrição
5. **Confirme** que o bot respondeu no WhatsApp

**Me avise quando testar!** 🚀
