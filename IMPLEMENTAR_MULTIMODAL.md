# 🎯 Guia de Implementação - WhatsApp Multimodal

## 📦 O Que Este Workflow Faz

Suporta **4 tipos** de mensagens no WhatsApp:

| Tipo | Entrada | Processamento | Saída |
|------|---------|---------------|-------|
| **Texto** | "Oi?" | AI Agent (Groq) | Resposta texto |
| **Áudio** | 🎤 Voice note | Plugin voice-transcription → AI Agent | Resposta texto |
| **Imagem** | 📷 Foto | GPT-4o-mini Vision → AI Agent | Análise + resposta |
| **PDF** | 📄 Documento | Extract PDF → AI Agent | Análise do conteúdo |

---

## 🔧 Diferenças do Workflow Original

| Componente | Original (Meta API) | Novo (OpenWA) |
|------------|---------------------|---------------|
| **Trigger** | `whatsAppTrigger` (Meta) | Webhook simples |
| **Voice** | Download + OpenAI Whisper | Plugin voice-transcription (Groq) já transcreve |
| **Image** | OpenAI Vision | GPT-4o-mini Vision (requer credencial OpenAI) |
| **LLM** | GPT-4o-mini | Groq qwen/qwen3.6-27b |
| **Send** | WhatsApp Node (Meta) | HTTP Request (OpenWA API) |
| **Memory** | BufferWindow (wa_id) | BufferWindow (chatId) |

---

## 📋 Pré-Requisitos

### 1. **Credenciais Necessárias**

#### ✅ Você JÁ TEM:
- OpenWA API Key: `owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc`
- Groq API configurado: `4H66gdwqyInkOE5m`
- Plugin voice-transcription instalado

#### ⚠️ PRECISA CONFIGURAR:
- **OpenAI API** (para Vision de imagens)
  - Criar credencial em n8n: Settings → Credentials → OpenAI API
  - Só é usado para análise de imagens (GPT-4o-mini vision)
  - Alternativa: Remover suporte a imagens OU usar outro provider

---

## 🚀 Passos de Implementação

### **Passo 1: Configurar Credencial OpenAI (para imagens)**

```bash
# 1. n8n → Settings → Credentials → Add Credential
# 2. Escolha "OpenAI API"
# 3. Preencha:
#    - API Key: sk-proj-...
#    - Nome: "OpenAI API"
# 4. Salvar
```

**Alternativa:** Se NÃO quiser usar OpenAI Vision:
- Deletar nodes: "Baixar Imagem" + "Analisar Imagem (Vision)" + "Formatar Imagem"
- Ou usar Groq Vision (quando disponível)

---

### **Passo 2: Deletar Workflows Antigos**

```bash
# n8n → Workflows → Deletar:
# 1. "WhatsApp Unified Bot (Texto + Áudio)" ❌
# 2. "WhatsApp Audio Transcription" ❌
# 3. "Whatsapp LLM Bot - Intake Inteligente" ❌
```

---

### **Passo 3: Importar Workflow Multimodal**

```bash
# 1. n8n → + Add workflow
# 2. Menu ⋮ → Import from File
# 3. Selecione: /Users/I531631/claude/Pessoal/OpenWA/Whatsapp-Unified-Multimodal.json
# 4. ATIVAR (toggle verde)
```

---

### **Passo 4: Atualizar OpenWA Webhooks**

```bash
export OPENWA_API_KEY="owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"
SESSION_ID="75a54c72-fade-48af-9059-cf56362df076"

# Webhook principal (text, image, document)
curl -X PUT "http://localhost:2785/api/sessions/$SESSION_ID/config" \
  -H "X-API-Key: $OPENWA_API_KEY" \
  -d '{"webhook":{"url":"http://n8n:5678/webhook/whatsapp-message"}}'

# Plugin voice-transcription (audio → transcrição)
curl -X PUT "http://localhost:2785/api/plugins/voice-transcription/config?sessionId=$SESSION_ID" \
  -H "X-API-Key: $OPENWA_API_KEY" \
  -d '{"config":{"deliveryWebhookUrl":"http://n8n:5678/webhook/whatsapp-message"}}'
```

---

## 🧪 Testar Cada Tipo

### **1. Texto**
```
Enviar: "Oi?"
Esperado: Resposta do bot sem mencionar "áudio"
```

### **2. Áudio**
```
Enviar: 🎤 "Quanto custa uma consulta?"
Esperado: 
  - Execução 1: SKIP (aguardando transcrição)
  - Execução 2 (2-3s depois): Resposta confirmando áudio
```

### **3. Imagem**
```
Enviar: 📷 Foto de um documento
Esperado: "Analisando imagem... [descrição da foto] Como posso ajudar?"
```

### **4. PDF**
```
Enviar: 📄 Arquivo PDF
Esperado: "Analisando documento... [resumo do conteúdo] O que você precisa saber?"
```

---

## 📊 Fluxo de Dados

### **Texto**
```
Webhook → Detectar Tipo (text) → Processar Texto → AI Agent → Limpar → Enviar
```

### **Áudio**
```
🎤 WhatsApp → Plugin voice-transcription (Groq STT) 
           → Webhook (event: message.transcription)
           → Detectar Tipo (audio) → Processar Áudio 
           → AI Agent → Limpar → Enviar
```

### **Imagem**
```
Webhook → Detectar Tipo (image) → Baixar Imagem 
        → Analisar (GPT-4o-mini Vision) → Formatar 
        → AI Agent → Limpar → Enviar
```

### **PDF**
```
Webhook → Detectar Tipo (document) → Baixar Documento 
        → Apenas PDF? → Extrair PDF → Formatar 
        → AI Agent → Limpar → Enviar
```

---

## 🔍 Logs para Debug

```bash
# Ver todas as execuções
docker logs -f n8n --tail 100 | grep -E '\[DETECT\]|\[CLEAN\]|\[AUDIO\]'

# Ver só limpeza de resposta
docker logs -f n8n --tail 50 | grep '\[CLEAN\]'

# Ver eventos OpenWA
docker logs -f openwa-api --tail 50 | grep -i "webhook\|transcription"
```

---

## ⚠️ Limitações e Considerações

### **1. OpenAI Vision (Imagens)**
- **Custo:** ~$0.0025 por imagem (GPT-4o-mini)
- **Alternativa:** Usar Groq Vision (quando disponível) ou desabilitar imagens

### **2. PDF Extraction**
- **Limite:** 3000 chars do texto extraído (para não saturar LLM)
- PDFs com imagens não são processados (só texto)

### **3. Memória de Conversação**
- **Window:** 10 mensagens por conversa
- **Chave:** `memory_{{ chatId }}`
- Cada contato tem memória independente

### **4. Audio**
- Plugin voice-transcription já faz STT via Groq
- NÃO precisa chamar STT novamente
- Transcrição chega em evento separado

---

## 🛠️ Customizações Comuns

### **Mudar LLM**
```javascript
// Node "Groq Chat Model"
{
  "model": "qwen/qwen3.6-27b",  // Trocar por outro modelo Groq
  "options": {}
}
```

### **Aumentar Memória**
```javascript
// Node "Memória Conversa"
{
  "contextWindowLength": 10  // Mudar para 20, 50, etc
}
```

### **Desabilitar Imagens**
```
1. Deletar nodes: "Baixar Imagem", "Analisar Imagem (Vision)", "Formatar Imagem"
2. No node "Detectar Tipo", remover saída "Image"
```

### **Adicionar Mais Formatos de Documento**
```javascript
// Node "Apenas PDF?"
// Adicionar condições para .docx, .txt, etc
{
  "conditions": [
    {
      "leftValue": "={{ $json.mimetype }}",
      "rightValue": "application/pdf",
      "operator": "equals"
    },
    {
      "leftValue": "={{ $json.mimetype }}",
      "rightValue": "application/msword",  // DOCX
      "operator": "equals"
    }
  ]
}
```

---

## ✅ Checklist Final

- [ ] Credencial OpenAI configurada (se usar imagens)
- [ ] Workflow antigo deletado
- [ ] Workflow Multimodal importado e ativo
- [ ] OpenWA webhooks atualizados
- [ ] Teste texto: "Oi?" → Resposta OK ✅
- [ ] Teste áudio: 🎤 → Transcrição + resposta ✅
- [ ] Teste imagem: 📷 → Análise + resposta ✅
- [ ] Teste PDF: 📄 → Extração + resposta ✅
- [ ] Logs aparecem com `[CLEAN]` e `[DETECT]` ✅

---

## 🆘 Problemas Comuns

### **1. Imagem não analisa**
```
Erro: "Credential not found"
Solução: Configurar credencial OpenAI em n8n
```

### **2. PDF não extrai**
```
Erro: "Failed to extract"
Solução: Verificar se mimetype é "application/pdf" (não .doc, .txt, etc)
```

### **3. Áudio não responde**
```
Erro: Transcrição vazia
Solução: Verificar logs do plugin voice-transcription
```

### **4. `<think>` aparece na resposta**
```
Erro: Limpeza falhou
Solução: Logs mostram estratégias 1-4 sendo aplicadas. Se ainda aparecer, revisar node "Limpar Resposta"
```

---

## 📁 Arquivos

```
/Users/I531631/claude/Pessoal/OpenWA/
├── Whatsapp-Unified-Multimodal.json     # ✅ NOVO (importar este)
├── IMPLEMENTAR_MULTIMODAL.md            # Este guia
├── Whatsapp-Unified-Bot-FIXED.json      # Versão anterior (só texto+áudio)
└── CORRECAO_FINAL.md                    # Guia da versão anterior
```

---

**Pronto para multimodal!** 🎉

Importe o workflow e teste com texto, áudio, imagem e PDF.
