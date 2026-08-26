# ✅ n8n + OpenWA Integração Completa

## 🎉 Status Atual

### Containers Ativos
```
✅ openwa-api         - API WhatsApp (porta 2785)
✅ openwa-postgres    - Database compartilhado
✅ openwa-redis       - Cache/Queue compartilhado
✅ n8n                - Workflow automation (porta 5678)
✅ n8n-worker         - Worker para queue mode
```

### Integração
- ✅ n8n usa **PostgreSQL do OpenWA** (database: n8n)
- ✅ n8n usa **Redis do OpenWA** para queue
- ✅ n8n na **mesma rede** do OpenWA (openwa-network)
- ✅ Plugin OpenWA **instalado** no n8n

---

## 🚀 Acessar n8n

```bash
# Abrir no navegador
open http://localhost:5678

# Credenciais
Usuário: admin
Senha: admin123
```

---

## 🔧 Configurar Credencial OpenWA no n8n

### 1. Obter API Key do OpenWA

```bash
export API_KEY="owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"
echo $API_KEY
```

### 2. Adicionar Credencial

1. No n8n, vá em **Settings** (engrenagem) → **Credentials**
2. Clique em **+ New Credential**
3. Busque por **"OpenWA"** ou **"OpenWA API"**
4. Preencha:
   - **Name:** `OpenWA Local`
   - **Server URL:** `http://openwa-api:2785`
   - **API Key:** `owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc`
5. Clique em **Test** para validar
6. **Save**

**⚠️ IMPORTANTE:** Use `http://openwa-api:2785` (hostname interno do Docker), NÃO `localhost:2785`

---

## 📋 Workflow WhatsApp → LLM → Resposta

### Workflow Básico

```json
{
  "name": "WhatsApp LLM Chatbot",
  "nodes": [
    {
      "parameters": {
        "sessionId": "75a54c72-fade-48af-9059-cf56362df076",
        "events": ["message"]
      },
      "name": "OpenWA Trigger",
      "type": "n8n-nodes-openwa.openWaTrigger",
      "typeVersion": 1,
      "position": [250, 300],
      "credentials": {
        "openWaApi": {
          "name": "OpenWA Local"
        }
      }
    },
    {
      "parameters": {
        "operation": "text",
        "model": "llama-3.3-70b-versatile",
        "messages": {
          "values": [
            {
              "role": "system",
              "content": "Você é um assistente do Lawapp. Seja profissional, educado e objetivo. Responda em português-BR."
            },
            {
              "role": "user",
              "content": "={{ $json.message.body }}"
            }
          ]
        }
      },
      "name": "Groq LLM",
      "type": "n8n-nodes-base.groq",
      "typeVersion": 1,
      "position": [450, 300],
      "credentials": {
        "groqApi": {
          "name": "Groq Account"
        }
      }
    },
    {
      "parameters": {
        "operation": "sendMessage",
        "sessionId": "75a54c72-fade-48af-9059-cf56362df076",
        "chatId": "={{ $('OpenWA Trigger').item.json.message.from }}",
        "messageType": "text",
        "text": "={{ $json.message.content }}"
      },
      "name": "Send Reply",
      "type": "n8n-nodes-openwa.openWa",
      "typeVersion": 1,
      "position": [650, 300],
      "credentials": {
        "openWaApi": {
          "name": "OpenWA Local"
        }
      }
    }
  ],
  "connections": {
    "OpenWA Trigger": {
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
    "Groq LLM": {
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

### Como Importar

1. No n8n, clique em **Workflows** → **+ Add workflow**
2. Menu **⋮** (três pontos) → **Import from File**
3. Copie o JSON acima em um arquivo `workflow-whatsapp-llm.json`
4. Importe o arquivo

---

## 🔑 Configurar API Keys

### Groq API (LLM)

1. No n8n, vá em **Settings → Credentials**
2. **+ New Credential**
3. Busque **"Groq"**
4. Preencha:
   - **Name:** `Groq Account`
   - **API Key:** Obtenha em https://console.groq.com/keys
5. **Save**

### Anthropic (via Proxy Local)

Se quiser usar Anthropic via proxy local:

1. **Settings → Credentials → + New Credential**
2. Busque **"Anthropic"**
3. Preencha:
   - **Name:** `Anthropic Local Proxy`
   - **Base URL:** `http://host.docker.internal:6656/anthropic`
   - **API Key:** `193072ce-bcf2-43a6-8619-2136ab5381c8`
4. **Save**

**✅ TESTADO:** Proxy funcionando corretamente do container n8n

---

## ✅ Testar Workflow

### 1. Ativar Workflow

1. Abra o workflow importado
2. Clique em **Active** (toggle no topo)
3. Verifique se status mudou para "Active"

### 2. Enviar Mensagem de Teste

Envie mensagem WhatsApp para: **+1 (321) 488-5868**

Exemplo:
```
Olá! Quanto custa o Lawapp?
```

### 3. Verificar Execuções

1. No n8n, vá em **Executions** (menu lateral)
2. Veja as execuções em tempo real
3. Clique em uma execução para ver detalhes

---

## 🎯 Workflow Avançado: Com Contexto de Conversa

Para manter contexto de múltiplas mensagens, adicione nodes Redis:

```
OpenWA Trigger
    ↓
[Get Redis] - Buscar histórico
    ↓
[Build Context] - Montar mensagens
    ↓
Groq LLM
    ↓
[Save Redis] - Salvar resposta
    ↓
Send Reply
```

### Nodes Necessários

1. **Redis Get** (buscar histórico)
   - Operation: `Get`
   - Key: `conversation:{{ $('OpenWA Trigger').item.json.message.from }}`

2. **Function** (montar contexto)
   ```javascript
   const history = JSON.parse($input.first().json.value || '[]');
   const newMessage = {
     role: 'user',
     content: $('OpenWA Trigger').item.json.message.body
   };
   
   return {
     messages: [
       { role: 'system', content: 'Você é assistente do Lawapp...' },
       ...history.slice(-10), // Últimas 10 mensagens
       newMessage
     ]
   };
   ```

3. **Redis Set** (salvar resposta)
   - Operation: `Set`
   - Key: `conversation:{{ $('OpenWA Trigger').item.json.message.from }}`
   - Value: JSON com histórico atualizado
   - Expire: `86400` (24h)

---

## 📊 Monitoramento

### Ver Logs

```bash
# n8n principal
docker logs -f n8n

# n8n worker
docker logs -f n8n-worker

# OpenWA
docker logs -f openwa-api
```

### Métricas Redis

```bash
# Conectar ao Redis
docker exec -it openwa-redis redis-cli

# Ver todas as keys
KEYS *

# Ver info
INFO stats

# Ver conversas ativas
KEYS conversation:*
```

### Status dos Containers

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

---

## 🔧 Troubleshooting

### n8n não encontra OpenWA

**Erro:** `ECONNREFUSED openwa-api:2785`

**Solução:** Verificar se containers estão na mesma rede:

```bash
# Verificar rede do n8n
docker inspect n8n | grep -A 5 Networks

# Verificar rede do OpenWA
docker inspect openwa-api | grep -A 5 Networks

# Ambos devem estar em "openwa-network"
```

### Plugin OpenWA não aparece

```bash
# Reinstalar plugin
docker exec -u root n8n npm install -g @rmyndharis/n8n-nodes-openwa --legacy-peer-deps

# Reiniciar n8n
docker restart n8n n8n-worker

# Verificar instalação
docker exec n8n npm list -g @rmyndharis/n8n-nodes-openwa
```

### Sessão OpenWA desconecta

```bash
# Ver sessões ativas
curl -s -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc" \
  http://localhost:2785/api/sessions | jq '.[] | {name, status, phone}'

# Reconectar sessão
# Acessar http://localhost:2785 → Sessions → Scan QR Code
```

### Workflow não executa

**Checklist:**
1. ✅ Workflow está **ativo** (toggle verde)?
2. ✅ Credencial OpenWA está **configurada**?
3. ✅ Sessão WhatsApp está **READY**?
4. ✅ SessionId correto no workflow?

---

## 🚀 Comandos Úteis

```bash
# Parar tudo
docker compose -f docker-compose.n8n.yml down

# Iniciar apenas n8n
docker compose -f docker-compose.n8n.yml up -d

# Ver logs em tempo real
docker compose -f docker-compose.n8n.yml logs -f

# Reiniciar após mudanças
docker compose -f docker-compose.n8n.yml restart

# Remover tudo (incluindo volumes)
docker compose -f docker-compose.n8n.yml down -v
```

---

## 📈 Próximos Passos

1. ✅ **Configurar Groq API key**
2. ✅ **Importar workflow básico**
3. ✅ **Testar enviando mensagem**
4. ⏭️ Adicionar contexto de conversa (Redis)
5. ⏭️ Adicionar rate limiting
6. ⏭️ Adicionar fallback para OpenAI/Anthropic
7. ⏭️ Configurar monitoramento (Grafana)

---

**Status:** ✅ n8n + OpenWA integrados | Pronto para criar workflows | Aguardando configuração de credenciais
