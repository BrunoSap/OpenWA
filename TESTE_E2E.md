# 🚀 Teste E2E Completo - WhatsApp Real

## ✅ Informações Essenciais

**API Key OpenWA:**
```
owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc
```

**URLs dos Serviços:**
- OpenWA API: http://localhost:2785
- n8n: http://localhost:5678
- Grafana: http://localhost:3000 (admin/admin)
- Prometheus: http://localhost:9090

---

## 📱 Passo 1: Conectar WhatsApp (PRIMEIRO!)

### 1.1. Acesse a UI do OpenWA
```bash
# Abra no navegador:
open http://localhost:2785
```

### 1.2. Faça Login
- Cole a API Key acima quando solicitado
- Clique em "Login"

### 1.3. Inicie uma Sessão WhatsApp
1. Click em **"Start New Session"**
2. Nome da sessão: `default`
3. Aguarde o QR Code aparecer
4. **Escaneie com seu WhatsApp** (WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho)
5. Aguarde até aparecer **"✅ Connected"**

⚠️ **IMPORTANTE:** Só continue para o Passo 2 quando o WhatsApp estiver conectado!

---

## 🔧 Passo 2: Configurar n8n (Workflows)

### 2.1. Acesse n8n
```bash
open http://localhost:5678
```

### 2.2. Criar Credenciais OpenWA

1. Click em **Settings** (⚙️) → **Credentials**
2. Click em **"Add Credential"**
3. Selecione **"HTTP Request"** (ou "Generic Credential")
4. Preencha:

```
Name: OpenWA API
Authentication: Header Auth
Header Name: x-api-key
Value: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc
```

5. Click em **"Save"**

### 2.3. Criar Credenciais PostgreSQL

1. Click em **"Add Credential"** novamente
2. Selecione **"Postgres"**
3. Preencha:

```
Name: OpenWA Database
Host: postgres
Port: 5432
Database: openwa
User: postgres
Password: postgres123
```

4. Click em **"Test"** → deve aparecer **✅ Connection successful**
5. Click em **"Save"**

---

## 🎨 Passo 3: Importar Workflow de Teste

### 3.1. Criar Workflow Simples de Teste

1. No n8n, click em **"Workflows"** → **"Add Workflow"**
2. Click nos **3 pontos (⋮)** → **"Import from File"**
3. **OU** crie manualmente seguindo este exemplo:

**Workflow: "WhatsApp Echo Bot"**

```json
{
  "name": "WhatsApp Echo Bot - Teste E2E",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "whatsapp-webhook",
        "responseMode": "lastNode",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300],
      "webhookId": "auto-generated"
    },
    {
      "parameters": {
        "url": "http://openwa-api:2785/api/messages",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "to",
              "value": "={{ $json.from }}"
            },
            {
              "name": "body",
              "value": "🤖 Você disse: {{ $json.body }}\n\n✨ Seu Bot OpenWA está funcionando!"
            }
          ]
        },
        "options": {}
      },
      "name": "Send Reply",
      "type": "n8n-nodes-base.httpRequest",
      "position": [450, 300],
      "credentials": {
        "httpHeaderAuth": {
          "id": "1",
          "name": "OpenWA API"
        }
      }
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Send Reply",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

4. **Salve o workflow**
5. **Ative o workflow** (toggle no canto superior direito deve ficar verde ✅)

### 3.2. Copiar URL do Webhook

1. Click no node **"Webhook"**
2. Copie a **URL de produção** (exemplo: `http://localhost:5678/webhook/abc123`)

---

## 🔗 Passo 4: Conectar OpenWA ao n8n (Webhook)

### 4.1. Configurar Webhook no OpenWA

Execute este comando para registrar o webhook:

```bash
curl -X POST http://localhost:2785/api/webhooks \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://n8n:5678/webhook/COLE_SEU_WEBHOOK_PATH_AQUI",
    "events": ["message.received"],
    "enabled": true
  }'
```

⚠️ **Substitua `COLE_SEU_WEBHOOK_PATH_AQUI`** pelo path do seu webhook (a parte depois de `/webhook/`)

**Exemplo:**
Se sua URL é `http://localhost:5678/webhook/abc123xyz`, use:
```json
"url": "http://n8n:5678/webhook/abc123xyz"
```

---

## 🧪 Passo 5: TESTAR! (A Mágica Acontece Aqui)

### 5.1. Envie uma Mensagem no WhatsApp

1. Abra seu WhatsApp (celular)
2. **Envie uma mensagem para SI MESMO** (o número conectado)
3. Digite qualquer coisa, exemplo: `Olá bot!`

### 5.2. Veja a Mágica ✨

**Você deve receber de volta:**
```
🤖 Você disse: Olá bot!

✨ Seu Bot OpenWA está funcionando!
```

### 5.3. Monitore no n8n

1. Vá para n8n → **"Executions"**
2. Você verá a execução em tempo real
3. Click para ver os dados que passaram pelo workflow

---

## 📊 Passo 6: Ver Analytics no Grafana

### 6.1. Acesse Grafana
```bash
open http://localhost:3000
```
- Login: `admin`
- Senha: `admin`

### 6.2. Veja os Dashboards

1. Click em **"Dashboards"** (☰ menu lateral)
2. Abra **"OpenWA Analytics"**
3. Você verá:
   - 📨 Mensagens enviadas/recebidas
   - ⏱️ Latência de resposta
   - 💰 Custo de LLM (se configurado)
   - 📞 Sessões ativas

---

## 🎯 Workflows Avançados para Testar

### Workflow 2: Bot com LLM (Groq)

```json
{
  "name": "WhatsApp AI Bot - LLM",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "whatsapp-ai"
      }
    },
    {
      "name": "Call Groq",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "authentication": "genericCredentialType",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "model",
              "value": "llama-3.1-70b-versatile"
            },
            {
              "name": "messages",
              "value": "=[{\"role\": \"user\", \"content\": \"{{ $json.body }}\"}]"
            }
          ]
        }
      }
    },
    {
      "name": "Send AI Reply",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://openwa-api:2785/api/messages",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "to",
              "value": "={{ $('Webhook').item.json.from }}"
            },
            {
              "name": "body",
              "value": "={{ $json.choices[0].message.content }}"
            }
          ]
        }
      },
      "credentials": {
        "httpHeaderAuth": "OpenWA API"
      }
    }
  ]
}
```

### Workflow 3: Intake Lead Capture (Salva no Banco)

1. Webhook recebe mensagem
2. Extrai dados com regex (nome, email, telefone)
3. Salva no PostgreSQL (`intake_leads` table)
4. Responde confirmando
5. Monitore no Grafana → **Funnel Analytics**

---

## 🐛 Troubleshooting

### Problema: Webhook não dispara

**Solução:**
```bash
# Verifique se o webhook está registrado
curl -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc" \
  http://localhost:2785/api/webhooks

# Teste manualmente
curl -X POST http://localhost:5678/webhook/SEU_PATH \
  -H "Content-Type: application/json" \
  -d '{"from":"5511999999999","body":"teste"}'
```

### Problema: QR Code não aparece

**Solução:**
```bash
# Reinicie o container OpenWA
docker restart openwa-api

# Verifique logs
docker logs openwa-api -f
```

### Problema: Mensagem não envia

**Solução:**
```bash
# Teste a API diretamente
curl -X POST http://localhost:2785/api/messages \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "body": "Teste direto da API"
  }'
```

---

## 🎉 Sucesso! Agora você tem:

✅ WhatsApp conectado ao OpenWA  
✅ n8n processando mensagens  
✅ Bot respondendo automaticamente  
✅ Analytics em tempo real no Grafana  
✅ Dados salvos no PostgreSQL  
✅ Multi-tenant isolation ativo  
✅ Billing tracking (Stripe) configurado  
✅ ML predictions rodando (TensorFlow.js)  

**A MÁGICA ESTÁ COMPLETA! 🚀✨**
