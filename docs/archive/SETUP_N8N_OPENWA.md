# 🚀 Setup n8n + OpenWA - Guia Completo

## ✅ Status Atual

- ✅ n8n rodando em `http://localhost:5678`
- ✅ Plugin `@rmyndharis/n8n-nodes-openwa@0.9.3` instalado
- ✅ PostgreSQL + Redis + 2 workers configurados
- ✅ OpenWA API rodando em `http://openwa-api:2785` (rede interna)

---

## 📋 Próximos Passos

### 1. Acessar n8n

```bash
# Abrir no navegador
open http://localhost:5678

# Credenciais
Usuário: admin
Senha: admin123
```

---

### 2. Verificar se Plugin OpenWA Está Disponível

**IMPORTANTE:** O plugin foi instalado manualmente via npm no container. Se não aparecer na interface:

```bash
# Reinstalar plugin (caso container seja recriado)
docker exec -u root n8n sh -c "npm install -g @rmyndharis/n8n-nodes-openwa --legacy-peer-deps"
docker restart n8n
```

**Na interface n8n:**
1. Clique no **"+"** para adicionar um novo node
2. Busque por **"OpenWA"**
3. Devem aparecer os nodes:
   - **OpenWA Trigger** (recebe mensagens do WhatsApp)
   - **OpenWA** (envia mensagens e executa ações)

---

### 3. Configurar Credenciais OpenWA

#### 3.1. Obter API Key do OpenWA

```bash
# Listar sessões ativas e obter API key
curl -X GET http://localhost:2785/api/sessions

# Ou verificar nos logs do OpenWA
docker logs openwa-api 2>&1 | grep "API Key" | tail -1
```

A API key foi gerada automaticamente na primeira inicialização do OpenWA.

#### 3.2. Adicionar Credencial no n8n

1. No n8n, vá em **Settings → Credentials**
2. Clique em **+ New Credential**
3. Busque por **"OpenWA API"**
4. Preencha:
   - **Name:** `OpenWA Local`
   - **Server URL:** `http://openwa-api:2785` ⚠️ **IMPORTANTE:** usar hostname interno do Docker
   - **API Key:** Cole a chave obtida no passo 3.1
5. Clique em **Test** e depois **Save**

---

### 4. Importar Workflow de Exemplo

#### 4.1. Criar Workflow do Zero

**Opção A: WhatsApp → LLM → Resposta Automática**

```json
{
  "name": "WhatsApp LLM Chatbot",
  "nodes": [
    {
      "parameters": {
        "sessionId": "lawapp_bot",
        "events": ["message"]
      },
      "name": "OpenWA Trigger",
      "type": "n8n-nodes-openwa.openWaTrigger",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "model": "llama-3.3-70b-versatile",
        "messages": {
          "values": [
            {
              "role": "system",
              "content": "Você é um assistente jurídico do Lawapp. Seja profissional, educado e objetivo."
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
        "sessionId": "lawapp_bot",
        "chatId": "={{ $('OpenWA Trigger').item.json.message.from }}",
        "message": "={{ $json.message.content }}"
      },
      "name": "Send WhatsApp Reply",
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
      "main": [[{"node": "Groq LLM", "type": "main", "index": 0}]]
    },
    "Groq LLM": {
      "main": [[{"node": "Send WhatsApp Reply", "type": "main", "index": 0}]]
    }
  }
}
```

**Como importar:**
1. No n8n, clique em **Workflows** → **+ Add workflow**
2. Clique no menu **⋮** (três pontos) → **Import from File**
3. Copie o JSON acima em um arquivo `workflow-lawapp.json`
4. Importe o arquivo

---

### 5. Ativar Sessão OpenWA

Antes de testar o workflow, a sessão WhatsApp precisa estar ativa:

```bash
# 1. Criar sessão
curl -X POST http://localhost:2785/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "lawapp_bot",
    "engine": "whatsapp-web.js"
  }'

# 2. Obter QR Code
curl -X GET http://localhost:2785/api/sessions/lawapp_bot/qr

# 3. Escanear QR Code no WhatsApp:
# WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
```

---

### 6. Testar Workflow

1. No n8n, abra o workflow importado
2. Clique em **Test workflow** (botão superior direito)
3. Envie uma mensagem para o número WhatsApp conectado
4. Verifique os logs no n8n:
   - **OpenWA Trigger** deve receber a mensagem
   - **Groq LLM** deve processar e gerar resposta
   - **Send WhatsApp Reply** deve enviar a resposta

---

## 🔧 Troubleshooting

### Plugin OpenWA não aparece no n8n

```bash
# Verificar se plugin está instalado
docker exec n8n npm list -g @rmyndharis/n8n-nodes-openwa

# Se não estiver, reinstalar
docker exec -u root n8n sh -c "npm install -g @rmyndharis/n8n-nodes-openwa --legacy-peer-deps"
docker restart n8n
```

### Erro "Cannot connect to OpenWA API"

**Causa:** URL incorreta nas credenciais.

**Solução:** 
- Usar `http://openwa-api:2785` (hostname interno do Docker)
- NÃO usar `http://localhost:2785` (não funciona dentro do container n8n)

### Sessão OpenWA desconecta

```bash
# Verificar status da sessão
curl http://localhost:2785/api/sessions/lawapp_bot

# Recriar QR Code
curl -X POST http://localhost:2785/api/sessions/lawapp_bot/restart
```

### Workflow não recebe mensagens

**Checklist:**
1. ✅ Sessão OpenWA está **CONNECTED**?
2. ✅ Workflow está **ativado** (toggle verde no n8n)?
3. ✅ OpenWA Trigger está configurado com `sessionId: "lawapp_bot"`?
4. ✅ Webhook do n8n está registrado no OpenWA?

```bash
# Verificar webhooks registrados
curl http://localhost:2785/api/sessions/lawapp_bot/webhooks
```

---

## 📊 Monitoramento

### Ver execuções do workflow

No n8n:
1. Menu lateral → **Executions**
2. Filtrar por workflow "WhatsApp LLM Chatbot"
3. Ver detalhes de cada execução (input/output de cada node)

### Logs do OpenWA

```bash
# Logs em tempo real
docker logs -f openwa-api

# Últimas 100 linhas
docker logs openwa-api --tail 100
```

### Logs do n8n

```bash
# Logs em tempo real
docker logs -f n8n

# Últimas 50 linhas
docker logs n8n --tail 50
```

---

## 🔐 Segurança - Produção

Antes de ir para produção, alterar:

```bash
# .env
N8N_PASSWORD=SUA_SENHA_FORTE_AQUI
N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
```

Reiniciar stack:
```bash
docker compose -f docker-compose.n8n-only.yml down
docker compose -f docker-compose.n8n-only.yml up -d
```

---

## 📚 Referências

- [OpenWA API Docs](https://docs.openwa.dev)
- [n8n Community Node: OpenWA](https://www.npmjs.com/package/@rmyndharis/n8n-nodes-openwa)
- [n8n Docs](https://docs.n8n.io)
- [Groq API](https://console.groq.com)

---

## 🎯 Próximo Passo

Após configurar o OpenWA no n8n, revisar:
- **GUIA_ATENDIMENTO_WHATSAPP_LLM.md** — Workflow completo com contexto do Lawapp
- **ANALISE_GAPS_SOLUCOES.md** — Gaps de produção identificados
- **ARQUITETURA_GLOBAL.md** — Arquitetura multi-região

---

**Status:** ✅ n8n pronto para uso | Plugin instalado | Aguardando configuração de credenciais
