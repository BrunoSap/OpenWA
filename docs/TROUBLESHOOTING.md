# Troubleshooting OpenWA

Guia completo de solução de problemas, bugs conhecidos e correções aplicadas.

## Índice
1. [Bugs Corrigidos](#bugs-corrigidos)
2. [Problemas Comuns](#problemas-comuns)
3. [Logs e Diagnóstico](#logs-diagnostico)
4. [Recovery](#recovery)

---

## Bugs Corrigidos

Histórico de bugs identificados e corrigidos no projeto.

### 1. Plugin 404 Error ✅ RESOLVIDO

**Data:** 22 Aug 2026

**Sintoma:**
```
Error: unable to get local issuer certificate
Failed to download plugin from https://...
```

**Causa:**
Docker container n8n sem certificados CA instalados, impossibilitando downloads HTTPS.

**Solução:**
```dockerfile
FROM n8nio/n8n

# Adicionar certificados CA
RUN apk add --no-cache ca-certificates
RUN update-ca-certificates
```

**Ação:**
1. Atualizar Dockerfile
2. Rebuild imagem
3. Restart container

**Status:** ✅ Verificado e funcionando

**Referência:** `archive/FIX_PLUGIN_404.md`

---

### 2. API Key Mismatch ✅ RESOLVIDO

**Data:** 22 Aug 2026

**Sintoma:**
Login falha mesmo com credenciais corretas.

**Causa:**
Usuário usando API key gerada manualmente, mas OpenWA esperava a key do bootstrap.

**Solução:**
```bash
# Obter key correta
docker exec openwa cat /app/data/api-key.txt

# Ou dos logs
docker logs openwa 2>&1 | grep "API Key"
```

**Status:** ✅ Documentado no LOGIN_GUIDE

**Referência:** `archive/LOGIN_GUIDE.md`

---

### 3. WhatsApp Session Disconnect ✅ RESOLVIDO

**Data:** 23 Aug 2026

**Sintoma:**
Sessão WhatsApp desconecta aleatoriamente após algumas horas.

**Causa:**
1. Falta de healthcheck
2. Não handling de reconnection
3. Session data não persistido

**Solução:**
```yaml
# docker-compose.yml
openwa:
  volumes:
    - openwa_data:/app/data  # Persistir sessões
  environment:
    - AUTO_RECONNECT=true
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

**Status:** ✅ Implementado em docker-compose.prod.yml

---

### 4. Multimodal Audio Handling ✅ RESOLVIDO

**Data:** 24 Aug 2026

**Sintoma:**
Mensagens de áudio não processam; workflow trava.

**Causa:**
1. Media download timeout
2. Formato de áudio incompatível
3. Transcription node configurado errado

**Solução:**

**a) Aumentar timeout:**
```javascript
// HTTP Request node (download)
{
  "timeout": 30000  // 30 segundos
}
```

**b) Converter formato:**
```javascript
// Function node
const ffmpeg = require('fluent-ffmpeg');

ffmpeg($binary.data)
  .toFormat('mp3')
  .audioCodec('libmp3lame')
  .audioBitrate(128)
  .save('/tmp/converted.mp3');
```

**c) Groq Whisper config:**
```javascript
{
  "model": "whisper-large-v3",
  "language": "pt",
  "response_format": "json"
}
```

**Status:** ✅ Implementado em Whatsapp-Unified-Multimodal-COMPLETE.json

**Referência:** `archive/IMPLEMENTAR_MULTIMODAL.md`

---

### 5. Voice Transcription Test Failed ✅ RESOLVIDO

**Data:** 24 Aug 2026

**Sintoma:**
Teste de transcrição retorna erro 500.

**Causa:**
1. Endpoint incorreto
2. Audio file não em base64
3. Model parameter missing

**Solução:**
```bash
# Teste correto
curl -X POST http://localhost:5678/webhook-test/voice \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "default",
    "from": "5511999999999@c.us",
    "messageType": "audio",
    "mediaUrl": "http://openwa:3000/media/audio.ogg",
    "duration": 10
  }'
```

**Status:** ✅ Documentado em TESTE_VOICE_TRANSCRIPTION.md

**Referência:** `archive/TESTE_VOICE_TRANSCRIPTION.md`

---

### 6. Knowledge Base Empty Results ⚠️ PARCIAL

**Data:** 24 Aug 2026

**Sintoma:**
RAG search sempre retorna 0 documentos.

**Causas identificadas:**
1. ✅ Embeddings não gerados
2. ✅ Similarity threshold muito alto
3. ⚠️ Embedding dimension mismatch

**Soluções aplicadas:**

**a) Gerar embeddings:**
```bash
node scripts/populate-kb.js
```

**b) Ajustar threshold:**
```sql
-- De 0.8 para 0.6
WHERE 1 - (embedding <=> $1::vector) > 0.6
```

**c) Verificar dimensão:**
```sql
-- Deve ser 1536 (OpenAI text-embedding-3-small)
SELECT vector_dims(embedding) FROM knowledge_base LIMIT 1;
```

**Status:** ⚠️ Parcialmente resolvido; requer monitoring contínuo

**Referência:** `archive/KNOWLEDGE_BASE_ANALYSIS.md`

---

### 7. Workflow Failure (Ultra-Planning) ❌ NÃO RESOLVIDO

**Data:** 23 Aug 2026

**Sintoma:**
Workflow multi-agent falha após 62 minutos; 7 de 9 agents retornam null.

**Causa:**
1. Timeout de 180s muito curto para análise AAA
2. Schema validation muito rígido
3. Paralelismo excessivo (9 agents simultâneos)

**Tentativas de solução:**
- ❌ Aumentar timeout → Ainda falha
- ❌ Simplificar schema → Agents continuam retornando null
- ❌ Reduzir paralelismo → Melhora mas não resolve

**Decisão:**
Abandonar abordagem de workflow automatizado; pivot para implementação manual incremental com validação por componente.

**Status:** ❌ Workflow descontinuado

**Referência:** `archive/WORKFLOW_FAILURE_REPORT.md`

---

## Problemas Comuns

### Container não inicia

**Sintoma:**
```bash
docker-compose up
# Container openwa exits immediately
```

**Diagnóstico:**
```bash
docker-compose logs openwa
```

**Soluções comuns:**

**1. Porta já em uso**
```bash
# Verificar
lsof -i :3000

# Matar processo
kill -9 PID

# Ou mudar porta no docker-compose
ports:
  - "3001:3000"
```

**2. Variável de ambiente faltando**
```bash
# Verificar .env
cat .env | grep REQUIRED_VAR

# Adicionar se faltando
echo "REQUIRED_VAR=value" >> .env
```

**3. Volume permission issues**
```bash
# Corrigir permissões
sudo chown -R 1000:1000 data/
```

---

### WhatsApp QR Code não aparece

**Sintoma:**
Tela de login não mostra QR code.

**Soluções:**

**1. Verificar logs**
```bash
docker logs openwa | grep QR
```

**2. Forçar regeneração**
```bash
# Via API
curl -X POST http://localhost:3000/api/logout \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"sessionId": "default"}'

# Restart session
curl -X POST http://localhost:3000/api/start-session \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"sessionId": "default"}'
```

**3. Limpar cache**
```bash
# Remover session antiga
rm -rf data/sessions/default

# Restart container
docker-compose restart openwa
```

---

### Mensagens não chegam no webhook

**Sintoma:**
WhatsApp recebe mensagens mas n8n não executa workflow.

**Diagnóstico passo-a-passo:**

**1. Verificar webhook configurado**
```bash
curl http://localhost:3000/api/get-webhook \
  -H "Authorization: Bearer YOUR_KEY"

# Resposta esperada:
# {"sessionId": "default", "url": "http://n8n:5678/webhook/..."}
```

**2. Verificar n8n respondendo**
```bash
curl http://localhost:5678/webhook/YOUR_PATH

# Deve retornar algo (não 404)
```

**3. Testar webhook manualmente**
```bash
curl -X POST http://localhost:5678/webhook/YOUR_PATH \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "default",
    "from": "5511999999999@c.us",
    "body": "teste",
    "messageType": "chat"
  }'
```

**4. Verificar network**
```bash
# Containers na mesma network?
docker network inspect openwa_network

# Devem aparecer: openwa, n8n
```

**5. Atualizar webhook (se necessário)**
```bash
curl -X POST http://localhost:3000/api/set-webhook \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "sessionId": "default",
    "url": "http://n8n:5678/webhook/YOUR_PATH"
  }'
```

---

### LLM responses muito lentas

**Sintoma:**
Respostas demoram >30 segundos.

**Causas possíveis:**

**1. Model muito grande**
```javascript
// Trocar para model mais rápido
mixtral-8x7b-32768  // ~2-5s ✅
→ gemma2-9b-it      // ~1-2s (mais rápido)
```

**2. Max tokens muito alto**
```javascript
// Reduzir
max_tokens: 2000  // ❌ Lento
→ max_tokens: 500  // ✅ Rápido
```

**3. RAG search muito pesado**
```sql
-- Reduzir limite
LIMIT 10  -- ❌
→ LIMIT 3  -- ✅
```

**4. Groq rate limit**
```bash
# Adicionar fallback OpenAI
if (groqError.status === 429) {
  useOpenAI();
}
```

---

### Base de conhecimento não atualiza

**Sintoma:**
Novos documentos adicionados mas LLM não usa.

**Checklist:**

**1. Embeddings gerados?**
```sql
SELECT COUNT(*) FROM knowledge_base WHERE embedding IS NULL;
-- Deve ser 0
```

**2. Regenerar embeddings**
```bash
node scripts/regenerate-embeddings.js
```

**3. Cache Redis?**
```bash
# Limpar cache de KB
docker exec -it redis redis-cli -a PASSWORD
KEYS kb:*
DEL kb:*
```

**4. Verificar busca**
```sql
-- Testar query manualmente
SELECT title, 
       1 - (embedding <=> '[...]'::vector) AS sim
FROM knowledge_base
ORDER BY sim DESC
LIMIT 5;
```

---

## Logs e Diagnóstico

### Acessar Logs

**OpenWA:**
```bash
# Real-time
docker-compose logs -f openwa

# Últimas 100 linhas
docker-compose logs --tail=100 openwa

# Filtrar por erro
docker-compose logs openwa | grep ERROR
```

**n8n:**
```bash
docker-compose logs -f n8n

# Executions
# Via UI: n8n > Executions > Filter by "Error"
```

**PostgreSQL:**
```bash
docker-compose logs postgres

# Queries lentas
docker exec -it postgres psql -U postgres -d openwa
```

```sql
-- Log de queries lentas
ALTER DATABASE openwa SET log_min_duration_statement = 1000;

-- Ver queries ativas
SELECT pid, query, state, wait_event
FROM pg_stat_activity
WHERE state = 'active';
```

**Redis:**
```bash
docker-compose logs redis

# Monitor real-time
docker exec -it redis redis-cli -a PASSWORD MONITOR
```

### Health Checks

**Script de diagnóstico completo:**

```bash
#!/bin/bash
# health-check.sh

echo "🔍 OpenWA Health Check"
echo "===================="

# 1. Containers rodando
echo "📦 Containers:"
docker-compose ps

# 2. OpenWA API
echo ""
echo "🔌 OpenWA API:"
curl -s http://localhost:3000/health | jq .

# 3. n8n
echo ""
echo "⚙️ n8n:"
curl -s http://localhost:5678/healthz

# 4. PostgreSQL
echo ""
echo "🐘 PostgreSQL:"
docker exec postgres pg_isready

# 5. Redis
echo ""
echo "📮 Redis:"
docker exec redis redis-cli -a $REDIS_PASSWORD PING

# 6. Disco
echo ""
echo "💾 Disk Usage:"
df -h | grep -E "Filesystem|docker"

# 7. Memória
echo ""
echo "🧠 Memory:"
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"

echo ""
echo "✅ Health check completo"
```

**Executar:**
```bash
chmod +x health-check.sh
./health-check.sh
```

### Métricas (Prometheus)

**Queries úteis:**

```promql
# Taxa de mensagens processadas
rate(openwa_messages_total[5m])

# Latência média LLM
histogram_quantile(0.95, rate(llm_request_duration_seconds_bucket[5m]))

# Taxa de erro
rate(openwa_errors_total[5m])

# Uso de memória
container_memory_usage_bytes{name="openwa"}
```

**Acessar Grafana:**
```
http://localhost:3001
```

---

## Recovery

### Backup e Restore

**Backup completo:**

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# 1. PostgreSQL
docker exec postgres pg_dump -U postgres openwa > $BACKUP_DIR/db.sql

# 2. Volumes
docker run --rm \
  -v openwa_data:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/openwa_data.tar.gz /data

docker run --rm \
  -v n8n_data:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/n8n_data.tar.gz /data

# 3. Config
cp .env $BACKUP_DIR/
cp docker-compose*.yml $BACKUP_DIR/

echo "✅ Backup completo em $BACKUP_DIR"
```

**Restore:**

```bash
#!/bin/bash
# restore.sh

BACKUP_DIR=$1

# 1. PostgreSQL
docker exec -i postgres psql -U postgres openwa < $BACKUP_DIR/db.sql

# 2. Volumes
docker run --rm \
  -v openwa_data:/data \
  -v $BACKUP_DIR:/backup \
  alpine sh -c "cd / && tar xzf /backup/openwa_data.tar.gz"

docker run --rm \
  -v n8n_data:/data \
  -v $BACKUP_DIR:/backup \
  alpine sh -c "cd / && tar xzf /backup/n8n_data.tar.gz"

# 3. Restart
docker-compose restart

echo "✅ Restore completo"
```

### Disaster Recovery

**Cenário: Perda completa do servidor**

1. **Novo servidor:**
   ```bash
   # Instalar Docker
   curl -fsSL https://get.docker.com | sh
   ```

2. **Restaurar código:**
   ```bash
   git clone https://github.com/your-org/openwa.git
   cd openwa
   ```

3. **Restaurar .env:**
   ```bash
   # Do backup
   cp /path/to/backup/.env .
   ```

4. **Restaurar dados:**
   ```bash
   # Executar restore.sh (ver acima)
   ./restore.sh /path/to/backup
   ```

5. **Iniciar serviços:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

6. **Verificar:**
   ```bash
   ./health-check.sh
   ```

**RTO (Recovery Time Objective):** ~30 minutos  
**RPO (Recovery Point Objective):** Último backup (diário = 24h)

---

## Referências

- [Architecture](ARCHITECTURE.md)
- [Setup](SETUP.md)
- [Guides](GUIDES.md)
- [Workflows](WORKFLOWS.md)
- [Bug Reports Archive](archive/)
- [CHANGELOG](../CHANGELOG.md)
