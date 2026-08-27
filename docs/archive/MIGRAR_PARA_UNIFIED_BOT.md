# 🔄 Migrar para Workflow Unificado

## 🎯 Por Que Unificar?

### **Problema Atual (2 Workflows)**

```
Cliente manda ÁUDIO
       ↓
OpenWA dispara message.received (tipo: voice)
       ↓
Webhook TEXTO processa → ❌ Bot responde sem entender
       ↓
Plugin voice-transcription processa
       ↓
Webhook ÁUDIO processa → ✅ Bot responde com transcrição

RESULTADO: Cliente recebe 2 RESPOSTAS! 😱
```

### **Solução (1 Workflow Unificado)**

```
Cliente manda ÁUDIO
       ↓
OpenWA dispara message.received (tipo: voice)
       ↓
Webhook UNIFICADO detecta → "É áudio, aguardar transcrição" → SKIP
       ↓
Plugin voice-transcription processa
       ↓
Webhook UNIFICADO recebe message.transcription → ✅ Processa

RESULTADO: Cliente recebe 1 RESPOSTA! ✅
```

---

## 📋 Checklist de Migração

### **Passo 1: Desativar Workflows Antigos**

1. Abra n8n: http://localhost:5678
2. **Desative** (toggle vermelho):
   - ❌ "WhatsApp Audio Transcription"
   - ❌ "Whatsapp LLM Bot - Intake Inteligente"

**NÃO delete ainda** — vamos testar primeiro.

---

### **Passo 2: Importar Workflow Unificado**

1. n8n → **+ Add workflow**
2. Menu **⋮** → **Import from File**
3. Selecione: `/Users/I531631/claude/Pessoal/OpenWA/Whatsapp-Unified-Bot.json`
4. Clique **Import**

---

### **Passo 3: Configurar Credentials**

O workflow já vem com os IDs das credentials, mas confirme:

#### **3.1. Groq API**
- Node: "Groq Chat Model"
- Credential: "Groq account" (já configurada)
- ✅ Se já funcionava nos workflows antigos, não precisa alterar

#### **3.2. OpenWA API Key**
- Node: "5. Enviar WhatsApp"
- Credential: "Header Auth account" (já configurada)
- ✅ Se já funcionava, não precisa alterar

---

### **Passo 4: Copiar Production URL**

1. Ative o workflow (toggle verde)
2. Node "Webhook Unificado" → Copiar **Production URL**:
   ```
   http://localhost:5678/webhook/whatsapp-unified
   ```

**IMPORTANTE:** A URL será diferente! Copie a sua.

---

### **Passo 5: Atualizar OpenWA**

#### **5.1. Atualizar Webhook Principal**

```bash
export OPENWA_API_KEY="owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"
SESSION_ID="75a54c72-fade-48af-9059-cf56362df076"

# Atualizar webhook principal (message.received)
curl -X PUT "http://localhost:2785/api/sessions/$SESSION_ID/config" \
  -H "X-API-Key: $OPENWA_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "webhook": {
      "url": "http://n8n:5678/webhook/whatsapp-unified"
    }
  }'
```

**Resultado esperado:**
```json
{
  "success": true,
  "webhook": {
    "url": "http://n8n:5678/webhook/whatsapp-unified"
  }
}
```

---

#### **5.2. Atualizar Plugin voice-transcription**

```bash
# Atualizar webhook do plugin (message.transcription)
curl -X PUT "http://localhost:2785/api/plugins/voice-transcription/config?sessionId=$SESSION_ID" \
  -H "X-API-Key: $OPENWA_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "config": {
      "deliveryWebhookUrl": "http://n8n:5678/webhook/whatsapp-unified"
    }
  }'
```

**Resultado esperado:**
```json
{
  "success": true,
  "message": "Plugin voice-transcription configuration updated"
}
```

---

### **Passo 6: Testar**

#### **6.1. Testar Mensagem de TEXTO**

Envie pelo WhatsApp pro **+1 (321) 488-5868**:
```
Olá, quanto custa uma consulta?
```

**Resultado esperado:**
1. n8n Executions → Nova execução
2. Node "0. Detectar Tipo" → `route: "text_message"`
3. Flui por "1a. Normalizar Texto" → LLM → Resposta
4. Bot responde: "A consulta é gratuita. Quer agendar? 😊"

---

#### **6.2. Testar Mensagem de ÁUDIO**

Envie **áudio** pelo WhatsApp:
```
🎤 "Olá, preciso saber quanto custa"
```

**Resultado esperado:**

**Execução 1:**
1. n8n Executions → Nova execução (message.received)
2. Node "0. Detectar Tipo" → `route: "skip"`, `reason: "Aguardando transcrição"`
3. Workflow para aqui ✅

**Execução 2 (2-3s depois):**
1. n8n Executions → Segunda execução (message.transcription)
2. Node "0. Detectar Tipo" → `route: "audio_transcription"`
3. Flui por "1b. Normalizar Áudio" → LLM → Resposta
4. Bot responde: "Ouvi seu áudio! A consulta é gratuita. Quer agendar? 😊"

---

### **Passo 7: Ver Logs**

```bash
# Ver logs do OpenWA
docker logs -f openwa-api --tail 100 | grep -i "webhook\|transcription"

# Ver logs do n8n
docker logs -f n8n --tail 100
```

---

## 🔍 Troubleshooting

### **Problema: Áudio não gera transcrição**

**Causa:** Plugin não enviou pro webhook unificado

**Solução:**
```bash
# Verificar config do plugin
curl -s -H "X-API-Key: $OPENWA_API_KEY" \
  "http://localhost:2785/api/plugins/voice-transcription/status?sessionId=$SESSION_ID" | jq '.config.deliveryWebhookUrl'
```

**Deve retornar:**
```
"http://n8n:5678/webhook/whatsapp-unified"
```

Se estiver errado, rode o Passo 5.2 novamente.

---

### **Problema: LLM retorna vazio**

**Causa:** Falta `messageType: "user"` no User Prompt

**Solução:** Já corrigido no workflow unificado! Confirme no node "3. LLM Chain":
```json
{
  "message": "={{ $json.userPrompt }}",
  "messageType": "user"  // ← IMPORTANTE!
}
```

---

### **Problema: Bot responde 2x ao áudio**

**Causa:** Workflows antigos ainda ativos

**Solução:**
1. n8n → Workflows
2. Desative:
   - "WhatsApp Audio Transcription"
   - "Whatsapp LLM Bot - Intake Inteligente"

---

### **Problema: Webhook não acessível**

**Causa:** URL interna errada (n8n vs localhost)

**Teste interno (dentro do container OpenWA):**
```bash
docker exec openwa-api curl -X POST \
  http://n8n:5678/webhook/whatsapp-unified \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**Resultado esperado:** HTTP 200

Se der erro, verificar:
```bash
# Ver rede Docker
docker network inspect openwa-network
```

Confirmar que `openwa-api` e `n8n` estão na mesma rede.

---

## 📊 Comparação: Antes vs Depois

| Aspecto | ANTES (2 webhooks) | DEPOIS (unificado) |
|---------|-------------------|-------------------|
| Mensagem texto | ✅ Funciona | ✅ Funciona |
| Mensagem áudio | ❌ Responde 2x | ✅ Responde 1x |
| Histórico | ❌ Fragmentado | ✅ Centralizado |
| Manutenção | ❌ 2 workflows | ✅ 1 workflow |
| Redis/Estado | ❌ Difícil | ✅ Fácil |

---

## ✅ Validação Final

Após migrar, confirme:

- [ ] Workflow unificado ativo (verde)
- [ ] Workflows antigos desativados (vermelho)
- [ ] OpenWA webhook atualizado
- [ ] Plugin voice-transcription webhook atualizado
- [ ] Teste texto: 1 resposta ✅
- [ ] Teste áudio: 1 resposta ✅
- [ ] Logs sem erros

---

## 🗑️ Limpeza (Após Validar)

Quando confirmar que tudo funciona:

1. n8n → Workflows antigos
2. Menu **⋮** → **Delete**:
   - "WhatsApp Audio Transcription"
   - "Whatsapp LLM Bot - Intake Inteligente"

---

## 🚀 Próximos Passos

Após unificar:

### **1. Adicionar Histórico (Redis)**
- Salvar contexto de conversa
- Cliente não precisa repetir informações

### **2. Detectar Duplicatas**
- Mensagem igual em < 5s? Ignorar (cliente clicou 2x)

### **3. Métricas**
- Quantos textos vs áudios/dia?
- Taxa de sucesso de transcrição?
- Tempo médio de resposta?

### **4. Status de Processos**
- Integrar com PostgreSQL
- Cliente pergunta CPF → buscar status real

---

## 📁 Arquivos Criados

```
/Users/I531631/claude/Pessoal/OpenWA/
├── Whatsapp-Unified-Bot.json              # Workflow novo
├── MIGRAR_PARA_UNIFIED_BOT.md             # Este guia
├── WhatsApp-Audio-Transcription.json      # DEPRECADO
└── Whatsapp-LLM-Bot-Intake-Inteligente.json # DEPRECADO
```

---

**Pronto para migrar!** 🚀

Execute os 7 passos acima e me avise quando testar.
