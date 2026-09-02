# 🚀 Deploy Production-Grade - Guia Completo

## ✅ O que foi implementado

### 1. **Error Handler Workflow** (✅ PRONTO)
- Workflow separado que captura TODOS os erros
- Log detalhado em PostgreSQL
- Detecção de high error rate (>10 erros/5min)
- Alerting automático
- Análise de erros retryable

### 2. **Database Schema** (✅ CRIADO)
- Tabelas: `whatsapp_errors`, `whatsapp_alerts`, `whatsapp_health_checks`, `whatsapp_rate_limits`, `whatsapp_performance_metrics`
- 4 views úteis para monitoramento
- 3 funções: `get_error_rate()`, `cleanup_old_monitoring_data()`, `acknowledge_alert()`

### 3. **Hybrid Memory Architecture** (✅ IMPLEMENTADO)
- Redis: Últimas 10 mensagens (contexto rápido)
- PostgreSQL: Histórico completo (auditoria)

### 4. **Security Layer** (✅ IMPLEMENTADO)
- Sanitização universal de PII (CPF, CNPJ, RENAVAM, placas, etc)
- 10 padrões de redação
- Log de auditoria de sanitização

---

## 📦 Arquivos Gerados

```
OpenWA/
├── Whatsapp-Unified-SECURE-v1.json           # Workflow principal (21 nodes)
├── WhatsApp-Error-Handler.json                # Error handler workflow
├── database/
│   └── schema/
│       ├── chat_history.sql                   # Histórico de conversas
│       └── error_handling.sql                 # Error handling + monitoring
├── PRODUCTION_GRADE_UPGRADE.md                # Roadmap completo
├── HYBRID_MEMORY_ARCHITECTURE.md              # Arquitetura de memória
├── N8N_POSTGRES_SETUP.md                      # Setup PostgreSQL
└── SECURITY_ALERT_DATA_LEAK.md                # Documentação de segurança
```

---

## 🔧 Deploy - Passo a Passo

### **Fase 1: Database Setup** ✅ COMPLETO

```bash
# 1. Criar tabela de chat history
cat database/schema/chat_history.sql | docker exec -i openwa-postgres psql -U openwa -d openwa

# 2. Criar tabelas de error handling
cat database/schema/error_handling.sql | docker exec -i openwa-postgres psql -U openwa -d openwa

# 3. Verificar criação
docker exec openwa-postgres psql -U openwa -d openwa -c "\dt whatsapp_*"
```

**Resultado esperado:**
```
 whatsapp_alerts
 whatsapp_chat_history
 whatsapp_errors
 whatsapp_health_checks
 whatsapp_performance_metrics
 whatsapp_rate_limits
```

### **Fase 2: Error Handler Workflow**

```bash
# 1. Importar no n8n
# http://localhost:5678 → Import from File → WhatsApp-Error-Handler.json

# 2. Configurar credencial PostgreSQL (se ainda não existe)
# Settings → Credentials → New → PostgreSQL
#   Name: OpenWA PostgreSQL
#   Host: openwa-postgres
#   Database: openwa
#   User: openwa
#   Password: [verificar docker-compose.yml ou .env]

# 3. Atualizar nodes com a credencial:
#   - 💾 Log Error to PostgreSQL
#   - 📊 Check Error Rate (5min)
#   - 💾 Log Alert

# 4. (Opcional) Configurar Slack alerting
# Se quiser alertas no Slack:
#   - Credentials → New → Slack
#   - Atualizar node "📢 Send Slack Alert"

# 5. Ativar o workflow
# Toggle: OFF → ON
```

### **Fase 3: Configurar Main Workflow para usar Error Handler**

```bash
# 1. Importar workflow principal
# http://localhost:5678 → Import from File → Whatsapp-Unified-SECURE-v1.json

# 2. Obter ID do Error Handler Workflow
# n8n → Workflows → "WhatsApp Bot - Error Handler" → Copiar ID da URL
# Exemplo: http://localhost:5678/workflow/ABC123XYZ

# 3. Configurar Error Handler no workflow principal
# Abrir: "WhatsApp Unified Bot - SECURE"
# Settings → Error Workflow → Selecionar "WhatsApp Bot - Error Handler"

# 4. Configurar credenciais PostgreSQL nos 2 nodes de log:
#   - 💾 Log Mensagem Usuário
#   - 💾 Log Resposta Bot

# 5. Verificar todas as outras credenciais:
#   - OpenWA API (Header Auth)
#   - Groq API
#   - OpenAI API (para Vision)

# 6. Ativar o workflow
```

### **Fase 4: Testar Sistema Completo**

```bash
# 1. Enviar mensagem de teste no WhatsApp
# Qualquer mensagem para o bot

# 2. Verificar logs de chat history
docker exec openwa-postgres psql -U openwa -d openwa -c "
SELECT 
  sender_type,
  message_text,
  input_type,
  created_at
FROM whatsapp_chat_history
ORDER BY created_at DESC
LIMIT 5;
"

# 3. Simular um erro (opcional)
# No workflow principal, desabilitar temporariamente o Groq node
# Enviar mensagem → Deve logar em whatsapp_errors

# 4. Verificar error logs
docker exec openwa-postgres psql -U openwa -d openwa -c "
SELECT 
  workflow_name,
  error_message,
  last_node,
  created_at
FROM whatsapp_errors
ORDER BY created_at DESC
LIMIT 5;
"

# 5. Verificar alertas
docker exec openwa-postgres psql -U openwa -d openwa -c "
SELECT * FROM whatsapp_unresolved_alerts;
"
```

---

## 📊 Monitoramento

### Queries Úteis

```sql
-- 1. Error rate últimas 24h
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as errors
FROM whatsapp_errors
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- 2. Top workflows com erros
SELECT 
  workflow_name,
  COUNT(*) as error_count,
  MAX(created_at) as last_error
FROM whatsapp_errors
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY workflow_name
ORDER BY error_count DESC;

-- 3. Performance stats hoje
SELECT * FROM whatsapp_performance_24h;

-- 4. Mensagens hoje
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE sender_type = 'user') as from_users,
  COUNT(*) FILTER (WHERE sender_type = 'bot') as from_bot,
  COUNT(DISTINCT chat_id) as unique_chats
FROM whatsapp_chat_history
WHERE DATE(created_at) = CURRENT_DATE;

-- 5. Taxa de sanitização
SELECT 
  COUNT(*) as total_bot_messages,
  COUNT(*) FILTER (WHERE (metadata->'_security'->>'sanitized')::boolean = true) as sanitized,
  ROUND(
    COUNT(*) FILTER (WHERE (metadata->'_security'->>'sanitized')::boolean = true) * 100.0 / COUNT(*),
    2
  ) as sanitization_rate_percent
FROM whatsapp_chat_history
WHERE sender_type = 'bot'
  AND created_at > NOW() - INTERVAL '24 hours';
```

### Dashboards Grafana (Futuro)

```bash
# Métricas recomendadas:
# - Error rate (errors/hour)
# - Response time (p50, p95, p99)
# - Message volume (messages/hour)
# - Sanitization rate (%)
# - Cost tracking (USD/day)
# - Service health status
```

---

## 🎯 Próximos Passos (Fase 2-4)

### **Fase 2: Resiliência** (Esta Semana)

1. **Rate Limiting**
   - [ ] Adicionar node "Rate Limiter" após Webhook
   - [ ] Redis counter: `ratelimit:{chatId}` (10 msg/min)
   - [ ] Response amigável quando atingir limite

2. **Circuit Breaker**
   - [ ] Node antes do AI Agent
   - [ ] Redis key: `circuit:groq` (5 falhas → open)
   - [ ] Fallback response quando circuit open

3. **Retry Strategy**
   - [ ] Configurar retry em TODOS os nodes HTTP
   - [ ] Groq: 3x retry, backoff [1s, 2s, 4s]
   - [ ] OpenAI Vision: 3x retry, backoff [1s, 2s, 4s]
   - [ ] OpenWA: 2x retry, backoff [500ms, 1s]

### **Fase 3: Observability** (Próxima Semana)

4. **Health Check Workflow**
   - [ ] Cron 5min
   - [ ] Check: OpenWA, Groq, OpenAI, PostgreSQL, Redis
   - [ ] Log em `whatsapp_health_checks`
   - [ ] Alert se DOWN

5. **Performance Tracking**
   - [ ] Adicionar timestamps em cada node
   - [ ] Calcular latências
   - [ ] Log em `whatsapp_performance_metrics`

### **Fase 4: UX** (Mês 1)

6. **Typing Indicator**
   - [ ] Enviar "digitando..." via OpenWA
   - [ ] Paralelo ao processamento

7. **Input Validation**
   - [ ] Limite 10K caracteres
   - [ ] Detectar spam patterns
   - [ ] Reject com mensagem amigável

---

## 📈 Métricas de Sucesso

| Métrica | Target Production | Status Atual |
|---------|-------------------|--------------|
| Uptime | 99.9% | 🟡 Medir |
| Error Rate | < 1% | 🟡 Medir |
| Response Time (p95) | < 3s | 🟡 Medir |
| Cost per 1K messages | < $1 | 🟡 Medir |
| Sanitization Rate | > 90% (quando necessário) | ✅ Implementado |
| Alert Response Time | < 5min | ✅ Implementado |

---

## 🆘 Troubleshooting

### Erro: "Credential not found"
```bash
# Recriar credencial PostgreSQL no n8n
# Settings → Credentials → New → PostgreSQL
# Atualizar ID nos nodes de log
```

### Erro: "Table does not exist"
```bash
# Re-executar schemas SQL
cat database/schema/chat_history.sql | docker exec -i openwa-postgres psql -U openwa -d openwa
cat database/schema/error_handling.sql | docker exec -i openwa-postgres psql -U openwa -d openwa
```

### Error Handler não está capturando erros
```bash
# 1. Verificar se Error Handler está ATIVO (toggle ON)
# 2. Verificar se main workflow tem errorWorkflow configurado
# 3. Testar com erro intencional (desabilitar node temporariamente)
```

### Performance lenta
```bash
# 1. Verificar índices do PostgreSQL
docker exec openwa-postgres psql -U openwa -d openwa -c "\di whatsapp_*"

# 2. Cleanup dados antigos
docker exec openwa-postgres psql -U openwa -d openwa -c "
SELECT * FROM cleanup_old_monitoring_data(90); -- Keep 90 days
"

# 3. Verificar Redis memory
docker exec openwa-redis redis-cli INFO memory | grep used_memory_human
```

---

## ✅ Checklist Final de Deploy

- [x] ✅ PostgreSQL schemas criados
- [ ] Error Handler workflow importado e ativo
- [ ] Main workflow importado e configurado
- [ ] Todas as credenciais configuradas
- [ ] errorWorkflow linkado no main workflow
- [ ] Teste de mensagem enviada com sucesso
- [ ] Logs de chat_history populando
- [ ] Error logs funcionando (testar com erro intencional)
- [ ] Documentação revisada

**Status:** ✅ **Fase 1 COMPLETA** - Database + Error Handler prontos para deploy!

---

**Próxima Sessão:** Implementar Rate Limiting + Circuit Breaker (Fase 2)
