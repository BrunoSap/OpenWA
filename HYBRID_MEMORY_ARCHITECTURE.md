# 🏗️ Arquitetura de Memória Híbrida - WhatsApp Bot

## 📊 Duas Camadas Complementares

```
┌─────────────────────────────────────────────────────────────┐
│  MENSAGEM RECEBIDA                                          │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
┌──────────────┐  ┌──────────────────┐
│  💾 PostgreSQL│  │  ⚡ Redis Buffer  │
│  (LONGO PRAZO)│  │  (ACESSO RÁPIDO) │
└──────────────┘  └──────────────────┘
│ Histórico      │  │ Últimas 10 msgs  │
│ completo       │  │ por chat         │
│ infinito       │  │ < 100ms read     │
│ queries/       │  │ sessão atual     │
│ analytics      │  └──────────────────┘
└──────────────┘
```

## 🔄 Fluxo Completo

### 1. **Mensagem do Usuário**
```
Webhook OpenWA
    ├─→ 💾 Log PostgreSQL (gravação paralela)
    │   └─ INSERT whatsapp_chat_history (sender_type='user')
    │
    └─→ Detectar Tipo → Processar → AI Agent
                                        ↑
                                        │
                                ⚡ Redis Buffer Window
                                (últimas 10 msgs)
```

### 2. **Resposta do Bot**
```
AI Agent (usa Redis para contexto)
    ↓
Limpar Resposta (sanitização)
    ↓
💾 Log PostgreSQL (resposta sanitizada)
    └─ INSERT whatsapp_chat_history (sender_type='bot', metadata._security)
    ↓
Enviar WhatsApp
```

## 🎯 Por Que Duas Camadas?

| Aspecto | ⚡ Redis Buffer | 💾 PostgreSQL |
|---------|----------------|---------------|
| **Propósito** | Contexto imediato | Histórico permanente |
| **Tamanho** | 10 últimas mensagens | Infinito |
| **Velocidade** | < 100ms | 200-500ms |
| **Persistência** | Volátil (RAM) | Durável (disco) |
| **Usado por** | AI Agent (contexto) | Analytics/Auditoria |
| **Custo** | Memória (~1KB/msg) | Disco (~2KB/msg) |

## 📈 Benefícios da Arquitetura Híbrida

### ✅ Performance (Redis)
- AI Agent lê apenas 10 últimas mensagens (~10KB)
- Resposta em < 100ms mesmo com milhares de conversas
- Sem overhead de query SQL no caminho crítico

### ✅ Persistência (PostgreSQL)
- Histórico completo para compliance (LGPD)
- Queries analíticas sem afetar performance
- Backup/restore de conversas
- Auditoria de sanitização de dados

### ✅ Escalabilidade
- Redis: 100K+ chats simultâneos
- PostgreSQL: Milhões de mensagens arquivadas
- Cada layer otizada para seu caso de uso

## 🔍 Casos de Uso

### Durante a Conversa (Redis)
```javascript
// AI Agent consulta Redis automaticamente
// Últimas 10 mensagens do chat atual
// Contexto: "Você perguntou há 5 minutos sobre X..."
```

### Análise Histórica (PostgreSQL)
```sql
-- Ver todo histórico de um cliente
SELECT * FROM get_chat_history('5511999999999@c.us');

-- Quantas mensagens foram sanitizadas hoje?
SELECT COUNT(*) FROM whatsapp_sanitized_messages
WHERE DATE(created_at) = CURRENT_DATE;

-- Top 10 chats mais ativos
SELECT chat_id, total_messages 
FROM whatsapp_chat_stats
ORDER BY total_messages DESC LIMIT 10;
```

## 🔧 Configuração

### Redis (já configurado)
- Node: "Memória Conversa" (memoryBufferWindow)
- Tamanho: 10 mensagens
- Chave: `memory_{chatId}`

### PostgreSQL (novos nodes)
- Node: "💾 Log Mensagem Usuário" (paralelo ao fluxo)
- Node: "💾 Log Resposta Bot" (após sanitização)
- Tabela: `whatsapp_chat_history`

## 📊 Monitoramento

```sql
-- Queries úteis para monitoramento

-- Mensagens nas últimas 24h
SELECT COUNT(*) FROM whatsapp_chat_history
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Taxa de sanitização
SELECT 
    COUNT(*) FILTER (WHERE (metadata->'_security'->>'sanitized')::boolean = true) * 100.0 / COUNT(*) as sanitization_rate
FROM whatsapp_chat_history
WHERE sender_type = 'bot';

-- Chats ativos hoje
SELECT COUNT(DISTINCT chat_id) FROM whatsapp_chat_history
WHERE DATE(created_at) = CURRENT_DATE;
```

## 🚀 Próximos Passos

1. **Criar tabela no PostgreSQL:**
   ```bash
   docker exec -i n8n-postgres psql -U n8n -d n8n < database/schema/chat_history.sql
   ```

2. **Configurar credencial PostgreSQL no n8n:**
   - Settings → Credentials → New → PostgreSQL
   - Host: `postgres` (interno Docker)
   - Database: `n8n`
   - User/Password: conforme docker-compose

3. **Importar workflow:**
   - n8n → Import → `Whatsapp-Unified-SECURE-v1.json`
   - Atualizar ID da credencial PostgreSQL nos 2 nodes de log

4. **Testar:**
   - Enviar mensagem WhatsApp
   - Verificar log: `SELECT * FROM whatsapp_chat_history ORDER BY created_at DESC LIMIT 10;`

---

**Status:** ✅ Arquitetura completa implementada
**Performance:** Redis (contexto) + PostgreSQL (histórico)
**Compliance:** LGPD-ready com auditoria e sanitização
