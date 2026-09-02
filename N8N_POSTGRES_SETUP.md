# 🔧 Configuração n8n PostgreSQL - Histórico de Conversas

## ✅ Schema Criado com Sucesso

```sql
✅ Tabela: whatsapp_chat_history
✅ 5 índices para performance
✅ 3 views úteis (recent_chats, chat_stats, sanitized_messages)
✅ Dados de teste inseridos
```

## 🔐 Credenciais PostgreSQL

### Conexão Interna (Docker)
- **Host:** `openwa-postgres` (ou `postgres` dentro da rede openwa)
- **Port:** `5432`
- **Database:** `openwa`
- **User:** `openwa`
- **Password:** *(verificar no .env ou docker-compose.yml)*
- **Schema:** `public`

### Como Configurar no n8n

1. **Abrir n8n:** http://localhost:5678

2. **Criar Credencial PostgreSQL:**
   - Menu lateral → **Credentials**
   - **+ New Credential**
   - Buscar: **Postgres**
   - Preencher:
     ```
     Name: OpenWA PostgreSQL
     Host: openwa-postgres
     Database: openwa
     User: openwa
     Password: [verificar no .env]
     Port: 5432
     ```
   - **Save**

3. **Atualizar Workflow:**
   - Importar: `Whatsapp-Unified-SECURE-v1.json`
   - Abrir node: **💾 Log Mensagem Usuário**
   - Credentials → Selecionar: **OpenWA PostgreSQL**
   - Abrir node: **💾 Log Resposta Bot**
   - Credentials → Selecionar: **OpenWA PostgreSQL**
   - **Save Workflow**

## 🧪 Testar Conexão

### Opção 1: Via Docker
```bash
# Ver mensagens de teste
docker exec -i openwa-postgres psql -U openwa -d openwa -c "SELECT * FROM whatsapp_chat_history ORDER BY created_at DESC LIMIT 5;"
```

### Opção 2: Via n8n (depois de importar)
- Executar workflow manualmente
- Enviar mensagem WhatsApp de teste
- Verificar no PostgreSQL:
  ```sql
  SELECT 
    chat_id,
    sender_type,
    message_text,
    created_at
  FROM whatsapp_chat_history
  WHERE chat_id = 'SEU_CHAT_ID'
  ORDER BY created_at DESC;
  ```

## 📊 Queries Úteis

### Ver histórico completo de um chat
```sql
SELECT 
  sender_type,
  message_text,
  input_type,
  created_at
FROM whatsapp_chat_history
WHERE chat_id = '5511999999999@c.us'
ORDER BY created_at ASC;
```

### Estatísticas de hoje
```sql
SELECT 
  COUNT(*) as total_messages,
  COUNT(*) FILTER (WHERE sender_type = 'user') as user_messages,
  COUNT(*) FILTER (WHERE sender_type = 'bot') as bot_messages,
  COUNT(DISTINCT chat_id) as unique_chats
FROM whatsapp_chat_history
WHERE DATE(created_at) = CURRENT_DATE;
```

### Mensagens com dados sanitizados
```sql
SELECT 
  chat_id,
  message_text,
  (metadata->'_security'->>'redactionCount')::int as redactions,
  created_at
FROM whatsapp_chat_history
WHERE sender_type = 'bot'
  AND (metadata->'_security'->>'sanitized')::boolean = true
ORDER BY created_at DESC
LIMIT 10;
```

### Chats mais ativos (top 10)
```sql
SELECT * FROM whatsapp_chat_stnORDER BY total_messages DESC
LIMIT 10;
```

## 🔍 Troubleshooting

### Erro: "Credential not found"
- Certifique-se de criar a credencial PostgreSQL no n8n primeiro
- Atualize o ID da credencial nos 2 nodes de log

### Erro: "Connection refused"
- Verifique se o container `openwa-postgres` está rodando:
  ```bash
  docker ps | grep postgres
  ```
- Teste conexão manual:
  ```bash
  docker exec openwa-postgres pg_isready -U openwa
  ```

### Tabela não existe
- Re-executar script SQL:
  ```bash
  cat database/schema/chat_history.sql | docker exec -i openwa-postgres psql -U openwa -d openwa
  ```

### Senha incorreta
- Verificar variáveis de ambiente:
  ```bash
  docker exec openwa-postgres env | grep POSTGRES_PASSWORD
  ```

## 🎯 Arquitetura Final

```
WhatsApp → Webhook → Detectar Tipo
                ↓
         💾 Log User (PostgreSQL)
                ↓
         Processar → AI Agent ← ⚡ Redis (10 msgs)
                ↓
         Limpar Resposta (sanitização)
                ↓
         💾 Log Bot (PostgreSQL)
                ↓
         Enviar WhatsApp
```

**Redis:** Contexto rápido (últimas 10 msgs)  
**PostgreSQL:** Histórico completo + auditoria + analytics

---

**Status:** ✅ Schema criado, aguardando configuração de credenciais no n8n  
**Próximo passo:** Configurar credencial PostgreSQL e testar com mensagem real
