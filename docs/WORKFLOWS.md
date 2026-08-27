# Workflows n8n OpenWA

Documentação completa dos workflows n8n para WhatsApp automation.

## Índice
1. [Como Importar Workflows](#importar)
2. [Workflows Disponíveis](#workflows)
3. [Migração para Unified Bot](#migracao)
4. [Troubleshooting de Workflows](#troubleshooting)

---

## Importar Workflows

### Passo-a-Passo

1. **Acesse n8n**
   ```
   http://localhost:5678
   ```

2. **Navegue para Workflows**
   - Click em "Workflows" no menu lateral
   - Click em "+ Add Workflow"

3. **Importar JSON**
   - Click nos 3 pontos (⋮) no canto superior direito
   - Selecione "Import from File"
   - Escolha o arquivo `.json` do workflow

4. **Configurar Credenciais**
   
   Após importar, você precisará configurar:
   
   **a) OpenWA Credential**
   ```
   Nome: OpenWA API
   Type: HTTP Request
   URL: http://openwa:3000
   Authentication: Bearer Token
   Token: [SUA_OPENWA_API_KEY]
   ```
   
   **b) Groq Credential**
   ```
   Nome: Groq
   Type: HTTP Request  
   URL: https://api.groq.com
   Authentication: Bearer Token
   Token: [SUA_GROQ_API_KEY]
   ```
   
   **c) PostgreSQL Credential**
   ```
   Nome: PostgreSQL
   Host: postgres
   Port: 5432
   Database: openwa
   User: postgres
   Password: [SUA_POSTGRES_PASSWORD]
   ```

5. **Ativar Webhook**
   
   - Click no node "Webhook"
   - Copie a URL gerada (ex: `http://localhost:5678/webhook/abc123`)
   - Configure no OpenWA (ver seção de setup)

6. **Ativar Workflow**
   
   - Toggle "Active" no canto superior direito
   - Status deve mudar para verde ✅

7. **Testar**
   
   - Envie mensagem no WhatsApp
   - Monitore execuções em "Executions"
   - Verifique erros no painel

### Variáveis de Ambiente

Alguns workflows usam variáveis de ambiente. Configure em `Settings > Environments`:

```javascript
GROQ_API_KEY=gsk_xxx
OPENAI_API_KEY=sk-xxx
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJxxx
REDIS_URL=redis://redis:6379
```

### Troubleshooting de Importação

**Erro: "Missing credentials"**
- Todos os nodes que requerem credenciais devem ser configurados
- Não skip nenhum node vermelho ⚠️

**Erro: "Webhook already exists"**
- Desative workflows antigos com mesmo path
- Ou edite o path do webhook

**Erro: "Node not found: OpenWA"**
- Plugin OpenWA não está instalado
- Ver [SETUP.md - Plugins](SETUP.md#plugins)

---

## Workflows Disponíveis

### 1. Whatsapp-Unified-Multimodal-COMPLETE.json

**Recomendado para produção** ✅

**Funcionalidades:**
- ✅ Texto
- ✅ Áudio (STT via Groq Whisper)
- ✅ Imagem (Vision via GPT-4)
- ✅ Knowledge Base (RAG)
- ✅ Context Memory (Redis)
- ✅ Error Handling

**Nodes:**
- HTTP Webhook (trigger)
- Switch (message type router)
- HTTP Request (download media)
- Groq Whisper (STT)
- OpenAI Vision (image analysis)
- PostgreSQL (KB search)
- LLM Chat (Groq Mixtral)
- Redis (memory)
- OpenWA Send Message

**Configuração:**

```javascript
// Webhook Path
/webhook/whatsapp

// Groq Model
mixtral-8x7b-32768

// Temperature
0.7

// Max Tokens
1024
```

**Arquivo:** `Whatsapp-Unified-Multimodal-COMPLETE.json` (tamanho: ~23KB)

### 2. Whatsapp-Unified-Bot-FIXED.json

**Versão simplificada** (apenas texto)

**Funcionalidades:**
- ✅ Texto
- ✅ Knowledge Base (RAG)
- ❌ Áudio
- ❌ Imagem

**Quando usar:**
- Setup inicial / aprendizado
- Não precisa multimodal
- Recursos limitados

**Arquivo:** `Whatsapp-Unified-Bot-FIXED.json` (tamanho: ~15KB)

### 3. Whatsapp-LLM-Bot-MELHORADO.json

**Bot básico** (sem RAG)

**Funcionalidades:**
- ✅ Texto
- ❌ Knowledge Base
- ❌ Áudio
- ❌ Imagem

**Quando usar:**
- MVP rápido
- Teste de conceito
- Não precisa KB

**Arquivo:** `Whatsapp-LLM-Bot-MELHORADO.json` (tamanho: ~11KB)

### 4. WhatsApp-Audio-Transcription.json

**Workflow especializado** para transcrição

**Funcionalidades:**
- ✅ Áudio → Texto
- ✅ Retorna transcrição
- ❌ Não envia para LLM

**Quando usar:**
- Transcrição apenas (sem resposta automática)
- Integrar com outros sistemas
- Auditar conversas

**Arquivo:** `WhatsApp-Audio-Transcription.json` (tamanho: ~8KB)

### Comparação de Workflows

| Workflow | Texto | Áudio | Imagem | RAG | Memory | Produção |
|----------|-------|-------|--------|-----|--------|----------|
| COMPLETE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Sim |
| FIXED | ✅ | ❌ | ❌ | ✅ | ❌ | ⚠️ Parcial |
| MELHORADO | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Não |
| Audio-Trans | ❌ | ✅ | ❌ | ❌ | ❌ | 🔧 Utility |

---

## Migração para Unified Bot

Se você está usando workflows antigos separados (um para texto, outro para áudio, etc), migre para o **Unified Bot**.

### Por Que Migrar?

**Problemas com workflows separados:**
- ❌ Contexto perdido entre workflows
- ❌ Difícil manter consistência
- ❌ Duplicação de lógica
- ❌ Mais recursos consumidos

**Vantagens do Unified Bot:**
- ✅ Um único ponto de entrada
- ✅ Contexto compartilhado
- ✅ Manutenção simplificada
- ✅ Menos recursos

### Processo de Migração

#### 1. Backup dos Workflows Atuais

```bash
# Exportar workflows atuais via n8n UI
# Ou backup manual
cp *.json backups/
```

#### 2. Importar Unified Bot

Siga instruções de [Como Importar](#importar) para:
- `Whatsapp-Unified-Multimodal-COMPLETE.json`

#### 3. Configurar Credenciais

Todas as credenciais dos workflows antigos podem ser reaproveitadas.

#### 4. Migrar System Prompt

Se você customizou o system prompt nos workflows antigos:

**Localizar:**
- Node "LLM Chat" ou "Agent"
- Campo "System Message"

**Copiar para o Unified Bot:**
- Abra workflow novo
- Localize node "Groq Chat"
- Cole no campo "System Message"

#### 5. Migrar Knowledge Base

Se você tinha KB nos workflows antigos:

```sql
-- Exportar dados antigos
COPY (SELECT * FROM old_knowledge_base) TO '/tmp/kb_export.csv' CSV HEADER;

-- Importar no novo schema
COPY knowledge_base FROM '/tmp/kb_export.csv' CSV HEADER;
```

#### 6. Testar Cenários

Teste cada tipo de mensagem:

```
✅ Texto simples
✅ Áudio curto (~5s)
✅ Áudio longo (~30s)
✅ Imagem (JPEG)
✅ Imagem (PNG)
✅ Imagem com texto (OCR)
✅ Sequência de mensagens (contexto)
```

#### 7. Desativar Workflows Antigos

**NÃO delete ainda!**

- Apenas desative (toggle OFF)
- Monitore por 7 dias
- Se tudo OK, pode deletar

#### 8. Atualizar Webhook no OpenWA

Se o webhook path mudou:

```bash
# Obter nova URL
# n8n UI > Workflow > Webhook node > copy URL

# Atualizar no OpenWA
curl -X POST http://localhost:3000/api/set-webhook \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "sessionId": "default",
    "url": "http://n8n:5678/webhook/NEW_PATH"
  }'
```

### Checklist de Migração

- [ ] Backup dos workflows atuais
- [ ] Unified Bot importado
- [ ] Credenciais configuradas
- [ ] System prompt migrado
- [ ] Knowledge Base migrada (se aplicável)
- [ ] Todos os tipos de mensagem testados
- [ ] Contexto/memory funcionando
- [ ] Webhook atualizado
- [ ] Workflows antigos desativados
- [ ] Monitoramento por 7 dias
- [ ] Workflows antigos deletados (após período de teste)

### Rollback (Se Necessário)

Se algo der errado:

1. **Reativar workflow antigo**
   - Toggle ON no workflow antigo
   
2. **Desativar Unified Bot**
   - Toggle OFF

3. **Reverter webhook**
   ```bash
   curl -X POST http://localhost:3000/api/set-webhook \
     -H "Authorization: Bearer YOUR_KEY" \
     -d '{"sessionId": "default", "url": "OLD_WEBHOOK_URL"}'
   ```

4. **Investigar problema**
   - Logs do n8n
   - Logs do OpenWA
   - Execution history

5. **Corrigir e tentar novamente**

---

## Troubleshooting de Workflows

### Workflow não executa

**Sintoma:** Webhook recebe mensagem mas workflow não roda

**Causas possíveis:**
1. Workflow não está ativo (toggle OFF)
2. Webhook path errado
3. Credenciais inválidas

**Solução:**
```bash
# 1. Verificar status
n8n UI > Workflows > Status deve estar verde

# 2. Verificar webhook
n8n UI > Workflow > Webhook node > Copy URL
# Comparar com URL configurada no OpenWA

# 3. Testar credenciais
# Cada node vermelho indica credencial faltando
```

### Erro: "Unauthorized"

**Sintoma:** `401 Unauthorized` nos logs

**Causa:** API key incorreta

**Solução:**
```bash
# Verificar OpenWA key
docker exec openwa cat /app/data/api-key.txt

# Atualizar no n8n
n8n UI > Credentials > OpenWA API > Editar > Colar key
```

### Erro: "Model not found"

**Sintoma:** `model 'xyz' not found`

**Causa:** Model name errado ou indisponível

**Solução:**
```javascript
// Modelos válidos Groq
mixtral-8x7b-32768  // Recomendado
llama-3.1-70b-versatile
llama-3.2-90b-vision-preview  // Para imagens

// No node LLM Chat
Model: mixtral-8x7b-32768
```

### Áudio não transcreve

**Sintoma:** Mensagens de áudio não geram resposta

**Checklist:**
1. ✅ Switch node tem rota para `messageType === 'audio'`
2. ✅ Groq Whisper node configurado
3. ✅ Download de mídia funcionando

**Debug:**
```javascript
// Adicionar Function node após Switch
console.log('Message type:', $json.messageType);
console.log('Media URL:', $json.mediaUrl);
return $json;
```

### Imagem não analisa

**Sintoma:** Mensagens de imagem não processam

**Checklist:**
1. ✅ Switch node tem rota para `messageType === 'image'`
2. ✅ OpenAI Vision ou Groq Vision configurado
3. ✅ Image base64 encode correto

**Debug:**
```javascript
// Function node após download
const buffer = $binary.data;
console.log('Image size:', buffer.length);
const base64 = buffer.toString('base64');
console.log('Base64 length:', base64.length);
return { imageBase64: base64 };
```

### Memory/Context não funciona

**Sintoma:** Bot não lembra conversas anteriores

**Checklist:**
1. ✅ Redis node configurado
2. ✅ Redis rodando (`docker ps | grep redis`)
3. ✅ Key pattern correto (`chat:{chatId}`)

**Debug:**
```bash
# Conectar no Redis
docker exec -it redis redis-cli -a YOUR_REDIS_PASSWORD

# Verificar keys
KEYS chat:*

# Ver conteúdo
GET chat:5511999999999@c.us

# Limpar se necessário
DEL chat:5511999999999@c.us
```

### KB/RAG não retorna contexto

**Sintoma:** LLM responde sem usar base de conhecimento

**Checklist:**
1. ✅ PostgreSQL com pgvector instalado
2. ✅ Tabela `knowledge_base` existe
3. ✅ Tabela tem dados (`SELECT COUNT(*) FROM knowledge_base;`)
4. ✅ Embeddings estão populados (coluna `embedding` não-null)

**Debug:**
```sql
-- Verificar estrutura
\d knowledge_base

-- Contar documentos
SELECT COUNT(*) FROM knowledge_base;

-- Verificar embeddings
SELECT id, title, 
       CASE WHEN embedding IS NULL THEN 'NULL' ELSE 'OK' END
FROM knowledge_base
LIMIT 10;

-- Testar busca vetorial manualmente
SELECT title, content, 
       1 - (embedding <=> '[0.1, 0.2, ...]'::vector) AS similarity
FROM knowledge_base
ORDER BY similarity DESC
LIMIT 3;
```

### Timeout em Executions

**Sintoma:** Workflow para no meio, timeout error

**Causas:**
1. LLM muito lento
2. Download de mídia grande
3. Limite de timeout do n8n

**Solução:**
```bash
# Aumentar timeout do n8n
# docker-compose.yml

n8n:
  environment:
    - EXECUTIONS_TIMEOUT=300  # 5 minutos
    - EXECUTIONS_TIMEOUT_MAX=600  # 10 minutos max
```

### Rate Limit

**Sintoma:** `429 Too Many Requests`

**Causa:** Muitas requisições para API (Groq, OpenAI)

**Solução:**
```javascript
// Adicionar Queue node antes do LLM
// Limitar taxa
{
  "rateLimit": {
    "limit": 10,
    "interval": 60000  // 10 req por minuto
  }
}

// Ou usar n8n Redis Queue
```

---

## Referências

- [Architecture](ARCHITECTURE.md)
- [Setup](SETUP.md)
- [Guides](GUIDES.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Workflow Files](../archive/)
