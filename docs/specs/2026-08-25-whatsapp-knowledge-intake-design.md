# WhatsApp Bot - Sistema de Gestão de Conhecimento e Intake Automatizado

**Data:** 2026-08-25  
**Autor:** Bruno Ricciardi (com Claude Opus 4.8)  
**Status:** Aprovado para implementação  
**Fase Inicial:** Fase 1 - Schema + pgvector

---

## 1. Visão Geral

Sistema completo de gestão de conhecimento multi-cliente para bot WhatsApp (OpenWA + n8n + Groq), com:

- **Gestão de conhecimento:** Histórico completo de conversas com embeddings vetoriais (pgvector)
- **Intake automatizado:** Fluxo conversacional adaptativo por tipo de caso
- **Sistema de 3 camadas:** FAQ direto (zero custo) → RAG (contexto similar) → LLM full context
- **Telegram Command Center:** "War room" colaborativo com LLM tools para equipe
- **Follow-ups automáticos:** Cron jobs detectam inatividade e cobram documentos
- **Dashboard web:** Interface visual para gerenciar políticas de auto-resposta e cron jobs
- **Integração LawApp:** Staging tables locais + sync assíncrono via API

### 1.1 Objetivos de Negócio

1. **Reduzir custo de atendimento:** 50%+ das perguntas respondidas por FAQ (zero custo LLM)
2. **Escalar atendimento:** Bot gerencia múltiplos clientes simultaneamente 24/7
3. **Não perder leads:** Follow-ups automáticos detectam abandono e reengajam
4. **Melhorar conversão:** Intake estruturado coleta todos dados necessários antes de enviar pra Dr. Denis
5. **Empoderar equipe:** Telegram Command Center permite time colaborar com LLM sobre cada cliente

### 1.2 Stack Tecnológico

- **WhatsApp:** OpenWA (Docker)
- **Orquestração:** n8n (workflows)
- **Database:** PostgreSQL 15+ com extensão pgvector
- **LLM:** Groq (qwen3.6-27b primary, whisper-large-v3-turbo STT)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dims)
- **Storage:** MinIO/S3/GDrive (documentos)
- **Telegram:** Bot API (command center)
- **Dashboard:** HTML estático servido via nginx (mesmo servidor n8n/OpenWA)

---

## 2. Arquitetura de Dados

### 2.1 Schema `knowledge` (Gestão de Conhecimento)

**Propósito:** Armazenar histórico completo de conversas, documentos e contexto de clientes.

#### 2.1.1 Tabela `knowledge.conversations`

Todas mensagens WhatsApp (texto, áudio transcrito, imagens com Vision).

```sql
CREATE SCHEMA IF NOT EXISTS knowledge;

CREATE TABLE knowledge.conversations (
    id SERIAL PRIMARY KEY,
    
    -- Identificação
    chat_id VARCHAR(100) NOT NULL,
    message_id VARCHAR(100) NOT NULL UNIQUE,
    session_id VARCHAR(100),
    
    -- Sender
    from_user VARCHAR(100),  -- 'client' ou 'bot'
    
    -- Timing
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Conteúdo
    message_type VARCHAR(20),  -- text, audio, image, document, video
    message_text TEXT,  -- Texto direto ou transcrito (se áudio)
    
    -- Mídia
    raw_media JSONB,
    storage_path TEXT,
    extracted_data JSONB,
    
    -- Embedding para RAG
    embedding VECTOR(1536),  -- OpenAI text-embedding-3-small
    
    INDEX idx_chat_timestamp (chat_id, timestamp),
    INDEX idx_session (session_id),
    INDEX idx_from_user (from_user),
    INDEX idx_message_type (message_type)
);

-- Índice de similaridade vetorial (IVFFlat)
CREATE INDEX idx_conversations_embedding 
ON knowledge.conversations 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**Campos principais:**
- `chat_id`: Identificador único do cliente no WhatsApp (`5588994471956@c.us`)
- `message_id`: ID único da mensagem (OpenWA)
- `session_id`: Agrupa mensagens de uma "conversa contínua" (ex: `127_2026-08-25`)
- `embedding`: Vetor de 1536 dimensões para busca semântica
- `extracted_data`: Dados estruturados extraídos de OCR/Vision (RG, CPF, etc)

**Volume esperado:**
- 10 clientes/dia × 10 msgs = 100 msgs/dia
- 36.500 msgs/ano
- 6KB por embedding × 36.5k = ~220MB/ano ✅ Viável

---

#### 2.1.2 Tabela `knowledge.clients`

Agregação por cliente (metadados, classificação, resumo semântico).

```sql
CREATE TABLE knowledge.clients (
    id SERIAL PRIMARY KEY,
    
    -- Identificação
    chat_id VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    cpf VARCHAR(14) UNIQUE,
    full_name VARCHAR(200),
    
    -- Timing
    first_seen TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    total_messages INT DEFAULT 0,
    
    -- Classificação
    client_type VARCHAR(50),  -- new, returning, vip
    case_types TEXT[],  -- ['aposentadoria_rural', 'divorcio']
    current_stage VARCHAR(50),  -- discovery, intake, documents, approved, rejected
    
    -- Integração LawApp
    lawapp_id UUID,
    
    -- Metadata flexível
    metadata JSONB,
    
    -- Resumo semântico (gerado por LLM)
    context_summary TEXT,
    
    INDEX idx_client_cpf (cpf),
    INDEX idx_client_phone (phone),
    INDEX idx_client_stage (current_stage),
    INDEX idx_client_lawapp (lawapp_id)
);
```

**Campo `context_summary` (exemplo):**
```
"João Silva, 67 anos, trabalhou 28 anos na roça sem registro.
Quer aposentadoria rural por idade. Já tem RG, CPF, ITR.
Falta: declaração do sindicato. Histórico de 3 conversas,
sempre educado e pontual."
```

---

#### 2.1.3 Tabela `knowledge.documents`

Arquivos enviados pelo cliente (RG, CPF, comprovantes, etc).

```sql
CREATE TABLE knowledge.documents (
    id SERIAL PRIMARY KEY,
    
    -- Relacionamentos
    client_id INT REFERENCES knowledge.clients(id) ON DELETE CASCADE,
    conversation_id INT REFERENCES knowledge.conversations(id) ON DELETE SET NULL,
    
    -- Classificação
    document_type VARCHAR(50),  -- rg, cpf, cnh, comprovante_residencia, etc
    
    -- Arquivo
    file_name VARCHAR(255),
    mime_type VARCHAR(100),
    storage_path TEXT NOT NULL,  -- s3://bucket/path ou /minio/path
    
    -- Extração
    extracted_text TEXT,  -- OCR completo
    structured_data JSONB,  -- Dados estruturados
    
    -- Validação
    verified BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_doc_client (client_id),
    INDEX idx_doc_type (document_type),
    INDEX idx_doc_verified (verified)
);
```

**Campo `structured_data` (exemplo RG):**
```json
{
  "numero": "1234567",
  "nome": "João Silva Santos",
  "data_nascimento": "1957-03-15",
  "orgao_expedidor": "SSP-CE",
  "confidence": 0.95
}
```

---

#### 2.1.4 Tabela `knowledge.faq`

Perguntas frequentes com embeddings para matching semântico (Layer 1).

```sql
CREATE TABLE knowledge.faq (
    id SERIAL PRIMARY KEY,
    
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    
    category VARCHAR(50),  -- cobranca, documentos, prazos, etc
    keywords TEXT[],
    
    -- Analytics
    use_count INT DEFAULT 0,
    last_used TIMESTAMP,
    
    -- Embedding
    embedding VECTOR(1536),
    
    INDEX idx_faq_category (category)
);

CREATE INDEX idx_faq_embedding 
ON knowledge.faq 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 10);
```

**Exemplo de FAQ:**
```sql
INSERT INTO knowledge.faq (question, answer, category, keywords, embedding) VALUES
(
  'Quanto vocês cobram?',
  'Cobramos 30% dos valores atrasados + 30% de 12 parcelas vincendas + UADs (R$ 159,21 cada). Pode parcelar em até 40% do valor total.',
  'cobranca',
  ARRAY['quanto custa', 'honorários', 'valor', 'preço'],
  (SELECT embedding FROM generate_embedding('Quanto vocês cobram?'))
);
```

---

#### 2.1.5 Tabela `knowledge.session_context`

Estado da conversa ativa (fluxo de intake, dados coletados, perguntas pendentes).

```sql
CREATE TABLE knowledge.session_context (
    session_id VARCHAR(100) PRIMARY KEY,
    chat_id VARCHAR(100) NOT NULL,
    
    -- Fluxo atual
    current_flow VARCHAR(50),  -- intake_rural, intake_divorcio, faq, smalltalk
    current_step VARCHAR(50),  -- ask_age, ask_work_duration, request_rg, etc
    
    -- Dados coletados nesta sessão
    collected_data JSONB,
    
    -- Perguntas pendentes
    pending_questions TEXT[],
    
    -- Expiração
    expires_at TIMESTAMP,  -- 24h após última msg
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_session_chat (chat_id),
    INDEX idx_session_expires (expires_at)
);
```

---

### 2.2 Schema `intake_staging` (Intake Local)

**Propósito:** Armazenar leads completos localmente ANTES de sincronizar com LawApp API.

#### 2.2.1 Tabela `intake_staging.leads`

```sql
CREATE SCHEMA IF NOT EXISTS intake_staging;

CREATE TABLE intake_staging.leads (
    id SERIAL PRIMARY KEY,
    
    -- Identificação
    chat_id VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    cpf VARCHAR(14),
    full_name VARCHAR(200),
    birth_date DATE,
    email VARCHAR(200),
    address JSONB,
    
    -- Caso
    case_type VARCHAR(50) NOT NULL,  -- aposentadoria_rural, divorcio, pensao_morte, etc
    case_subtype VARCHAR(50),
    urgency_level VARCHAR(20) DEFAULT 'normal',  -- normal, high, critical
    case_data JSONB NOT NULL,
    
    -- Documentos
    documents_collected TEXT[],  -- ['rg', 'cpf', 'comprovante']
    documents_missing TEXT[],    -- ['declaracao_sindicato']
    
    -- Status
    intake_status VARCHAR(50) DEFAULT 'in_progress',  -- in_progress, completed, approved, rejected, stalled
    intake_completed_at TIMESTAMP,
    intake_started_at TIMESTAMP DEFAULT NOW(),
    
    -- Cross-selling
    additional_opportunities JSONB,
    
    -- Honorários
    fee_structure JSONB,
    
    -- Sync LawApp
    lawapp_synced BOOLEAN DEFAULT FALSE,
    lawapp_opportunity_id UUID,
    lawapp_sync_attempted_at TIMESTAMP,
    lawapp_sync_error TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_leads_chat (chat_id),
    INDEX idx_leads_cpf (cpf),
    INDEX idx_leads_status (intake_status),
    INDEX idx_leads_sync (lawapp_synced, intake_status)
);
```

**Campo `case_data` (exemplo aposentadoria rural):**
```json
{
  "age": 67,
  "work_duration_years": 28,
  "has_registered_work": false,
  "worked_with_carteira": false,
  "property_ownership": "proprio",
  "has_itr": true,
  "rural_union_member": true,
  "estimated_backpay": 15000,
  "monthly_benefit": 1500,
  "estimated_uads": 60
}
```

**Campo `fee_structure` (calculado):**
```json
{
  "atrasados_30_percent": 4500,
  "vincendas_30_percent": 5400,
  "uads_total": 9552.60,
  "total": 19452.60,
  "parcelamento_options": {
    "10x": 778.10,
    "15x": 518.73
  }
}
```

---

#### 2.2.2 Tabela `intake_staging.lead_documents`

Documentos enviados durante intake (referencia arquivos no storage).

```sql
CREATE TABLE intake_staging.lead_documents (
    id SERIAL PRIMARY KEY,
    lead_id INT REFERENCES intake_staging.leads(id) ON DELETE CASCADE,
    
    document_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    
    -- Storage
    storage_provider VARCHAR(20),  -- minio, s3, gdrive
    storage_path TEXT NOT NULL,
    storage_url TEXT,
    
    -- Extração
    extracted_text TEXT,
    structured_data JSONB,
    ocr_confidence FLOAT,
    
    -- Validação
    validated BOOLEAN DEFAULT FALSE,
    validation_notes TEXT,
    
    uploaded_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_doc_lead (lead_id),
    INDEX idx_doc_type (document_type)
);
```

---

#### 2.2.3 Tabela `intake_staging.lawapp_sync_queue`

Fila de sincronização com LawApp API (retry logic).

```sql
CREATE TABLE intake_staging.lawapp_sync_queue (
    id SERIAL PRIMARY KEY,
    lead_id INT REFERENCES intake_staging.leads(id),
    
    sync_type VARCHAR(50),  -- create_opportunity, update_documents, etc
    payload JSONB NOT NULL,
    
    -- Retry
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    next_retry_at TIMESTAMP,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
    error_message TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    
    INDEX idx_sync_status (status, next_retry_at)
);
```

---

### 2.3 Schema `telegram` (Command Center)

**Propósito:** Integração com Telegram para equipe colaborar com LLM sobre clientes.

#### 2.3.1 Tabela `telegram.lead_topics`

Mapeia cada lead para um topic (thread) no Telegram Supergroup.

```sql
CREATE SCHEMA IF NOT EXISTS telegram;

CREATE TABLE telegram.lead_topics (
    lead_id INT PRIMARY KEY REFERENCES intake_staging.leads(id),
    
    telegram_group_id BIGINT NOT NULL,  -- ID do supergrupo
    telegram_topic_id BIGINT NOT NULL,  -- ID do topic (thread)
    
    topic_created_at TIMESTAMP DEFAULT NOW(),
    topic_title VARCHAR(200),  -- "Lead #127 - João Silva"
    is_archived BOOLEAN DEFAULT FALSE
);
```

---

#### 2.3.2 Tabela `telegram.client_tasks`

Tasks que equipe pede pro bot executar no WhatsApp.

```sql
CREATE TABLE telegram.client_tasks (
    id SERIAL PRIMARY KEY,
    lead_id INT REFERENCES intake_staging.leads(id),
    
    task_type VARCHAR(50),  -- ask_question, request_document, schedule_call
    task_data JSONB NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- pending, sent, answered, failed
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    answered_at TIMESTAMP,
    
    -- Resposta do cliente
    client_response TEXT,
    client_response_data JSONB,
    
    INDEX idx_tasks_pending (lead_id, status)
);
```

**Exemplo `task_data` (ask_question):**
```json
{
  "question": "Você tem conta no Banco do Brasil?",
  "context": "Para receber a aposentadoria",
  "requested_by_user": "Dr. Denis"
}
```

---

#### 2.3.3 Tabela `telegram.topic_context`

Contexto persistente da conversa da equipe no Telegram.

```sql
CREATE TABLE telegram.topic_context (
    topic_id BIGINT PRIMARY KEY,
    lead_id INT REFERENCES intake_staging.leads(id),
    
    conversation_summary TEXT,
    team_decisions JSONB[],
    mentioned_documents TEXT[],
    
    last_updated TIMESTAMP DEFAULT NOW()
);
```

---

#### 2.3.4 Tabela `telegram.user_permissions`

Controle de acesso (para futuro multi-tenancy).

```sql
CREATE TABLE telegram.user_permissions (
    telegram_user_id BIGINT PRIMARY KEY,
    full_name VARCHAR(200),
    role VARCHAR(50),  -- admin, intake, paralegal, viewer
    
    -- Permissões
    can_approve_leads BOOLEAN DEFAULT FALSE,
    can_reject_leads BOOLEAN DEFAULT FALSE,
    can_ask_client BOOLEAN DEFAULT TRUE,
    can_view_documents BOOLEAN DEFAULT TRUE,
    can_calculate_fees BOOLEAN DEFAULT TRUE,
    
    added_at TIMESTAMP DEFAULT NOW(),
    added_by_user_id BIGINT
);
```

---

### 2.4 Schema `bot_config` (Configuração)

**Propósito:** Controlar comportamento do bot via dashboard web.

#### 2.4.1 Tabela `bot_config.auto_answer_rules`

Controla quais tópicos são auto-respondidos vs escalados pra humano.

```sql
CREATE SCHEMA IF NOT EXISTS bot_config;

CREATE TABLE bot_config.auto_answer_rules (
    id SERIAL PRIMARY KEY,
    
    topic VARCHAR(50) UNIQUE NOT NULL,  -- 'honorarios', 'documentos', 'prazos', etc
    
    auto_answer_enabled BOOLEAN DEFAULT TRUE,
    escalate_to_human BOOLEAN DEFAULT FALSE,
    
    escalation_message TEXT,
    
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed inicial
INSERT INTO bot_config.auto_answer_rules (topic, auto_answer_enabled, escalate_to_human, escalation_message) VALUES
('honorarios', FALSE, TRUE, 'Vou conectar você com alguém da equipe para falar sobre valores! Um momento...'),
('documentos', TRUE, FALSE, NULL),
('prazos', TRUE, FALSE, NULL),
('urgencia_violencia', FALSE, TRUE, 'Situação de urgência detectada. Encaminhando para atendimento prioritário...');
```

---

#### 2.4.2 Tabela `bot_config.cron_jobs`

Configuração de cron jobs (frequência, enable/disable).

```sql
CREATE TABLE bot_config.cron_jobs (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    
    frequency_seconds INT NOT NULL,  -- 3600 = 1h, 86400 = 24h
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    
    enabled BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed inicial
INSERT INTO bot_config.cron_jobs (id, name, frequency_seconds, enabled) VALUES
('follow-up-leads', 'Follow-up Leads Inativos', 43200, TRUE),  -- 12h
('document-reminders', 'Cobrar Documentos Faltantes', 86400, TRUE),  -- 24h
('lawapp-sync', 'Sincronizar com LawApp', 3600, TRUE),  -- 1h
('clean-old-sessions', 'Limpar Sessões Antigas', 604800, TRUE);  -- 7d
```

---

#### 2.4.3 Tabela `intake_staging.document_reminders`

Tracking de lembretes de documentos faltantes.

```sql
CREATE TABLE intake_staging.document_reminders (
    id SERIAL PRIMARY KEY,
    lead_id INT REFERENCES intake_staging.leads(id),
    
    document_type VARCHAR(50) NOT NULL,
    requested_at TIMESTAMP DEFAULT NOW(),
    
    -- Reminder tracking
    reminder_count INT DEFAULT 0,
    last_reminder_at TIMESTAMP,
    next_reminder_at TIMESTAMP,
    
    -- Estratégia
    reminder_frequency_hours INT DEFAULT 48,
    max_reminders INT DEFAULT 3,
    
    -- Status
    received BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMP,
    gave_up BOOLEAN DEFAULT FALSE,
    
    INDEX idx_next_reminder (next_reminder_at, received, gave_up)
);
```

---

## 3. Sistema de 3 Camadas (FAQ → RAG → LLM)

### 3.1 Layer 1: FAQ Direct Lookup

**Propósito:** Responder perguntas frequentes sem custo de LLM (matching semântico).

**Fluxo:**
1. Cliente envia mensagem: "Quanto custa?"
2. Gerar embedding da pergunta (OpenAI API)
3. Query: `SELECT * FROM knowledge.find_similar_faq(embedding, 0.85, 1)`
4. Se similarity >= 0.85 → Responder direto ✅
5. Se similarity < 0.85 → Layer 2

**Função helper:**
```sql
CREATE OR REPLACE FUNCTION knowledge.find_similar_faq(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.8,
    match_count INT DEFAULT 3
)
RETURNS TABLE (
    faq_id INT,
    question TEXT,
    answer TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.id,
        f.question,
        f.answer,
        1 - (f.embedding <=> query_embedding) AS similarity
    FROM knowledge.faq f
    WHERE 1 - (f.embedding <=> query_embedding) >= match_threshold
    ORDER BY f.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

**Performance:**
- FAQ pequeno (~50 entries) → IVFFlat com 10 clusters
- Query < 10ms
- Zero custo LLM ✅

---

### 3.2 Layer 2: RAG (Buscar Contexto Similar)

**Propósito:** Usar conversas similares de outros clientes como contexto pro LLM.

**Fluxo:**
1. Não achou FAQ satisfatório
2. Query: `SELECT * FROM knowledge.find_similar_conversations(embedding, chat_id, 0.75, 5)`
3. Buscar últimas 10 mensagens deste cliente
4. Montar prompt:
   - System: Personalidade do bot
   - Context: 5 conversas similares encontradas
   - History: 10 msgs do cliente atual
   - Question: Pergunta atual
5. Chamar Groq LLM (qwen3.6-27b)
6. Custo: ~$0.0001 por resposta

**Função helper:**
```sql
CREATE OR REPLACE FUNCTION knowledge.find_similar_conversations(
    query_embedding VECTOR(1536),
    exclude_chat_id VARCHAR(100),
    match_threshold FLOAT DEFAULT 0.75,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    conversation_id INT,
    chat_id VARCHAR(100),
    message_text TEXT,
    timestamp TIMESTAMP,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.chat_id,
        c.message_text,
        c.timestamp,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM knowledge.conversations c
    WHERE 
        c.chat_id != exclude_chat_id
        AND c.embedding IS NOT NULL
        AND 1 - (c.embedding <=> query_embedding) >= match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

---

### 3.3 Layer 3: Full LLM (Fallback)

**Propósito:** Quando contexto RAG não é suficiente, buscar TODO contexto.

**Fluxo:**
1. LLM da Layer 2 não tem certeza (retorna "não sei" ou similar)
2. Buscar:
   - TODAS mensagens do cliente
   - Todos documentos enviados
   - Dados do lead (intake_staging)
3. Chamar LLM maior (ex: gpt-4o-mini)
4. Custo: ~$0.001 por resposta (10x Layer 2)

**Uso:** Apenas ~5% das perguntas (resto resolvido em Layer 1/2)

---

### 3.4 Auto-Answer Policy (Controle Granular)

**Propósito:** Escolher quais tópicos são auto-respondidos vs escalados pra humano.

**Implementação:**
```javascript
// n8n node: Check Auto-Answer Policy
const messageText = $input.item.json.message_text.toLowerCase();

// Detectar categoria (keyword matching)
let category = 'general';
if (messageText.match(/quanto|valor|custo|honorário|preço/)) {
  category = 'honorarios';
} else if (messageText.match(/violência|agressão|perigo|urgente/)) {
  category = 'urgencia_violencia';
}

// Buscar política
const policy = await postgres.query(`
  SELECT * FROM bot_config.auto_answer_rules WHERE topic = $1
`, [category]);

if (policy.length > 0 && !policy[0].auto_answer_enabled) {
  // ESCALAR PRA HUMANO
  return {
    escalate: true,
    escalation_message: policy[0].escalation_message,
    category: category,
    urgency: category === 'urgencia_violencia' ? 'critical' : 'normal'
  };
}

// Continuar com auto-answer
return { escalate: false };
```

**Notificação Telegram (quando escalar honorários):**
```
🔔 Cliente Perguntou sobre honorarios

👤 Cliente: João Silva Santos
📱 Chat: 5588994471956@c.us
💬 Pergunta: "Quanto vocês cobram?"

💰 Estimativa Automática:
• Atrasados (30%): R$ 4.500,00
• Vincendas (30% × 12): R$ 5.400,00
• 60 UADs: R$ 9.552,60
• TOTAL: R$ 19.452,60
Parcelamento: até 10x de 40% do total

⏳ Aguardando resposta da equipe...
```

---

## 4. Telegram Command Center (War Room)

### 4.1 Arquitetura

**Escolha:** 1 Supergrupo com Topics (threads) ao invés de grupos separados.

**Vantagens:**
- ✅ Escala para 1000+ leads
- ✅ Busca unificada (Ctrl+F)
- ✅ Menos bagunça na sidebar
- ✅ Membros podem mutar tópicos específicos

**Estrutura:**
```
Telegram Supergroup: "LawApp Command Center"
├─ 📋 Topic: Lead #127 - João Silva (aposentadoria rural)
├─ 📋 Topic: Lead #128 - Maria Santos (divórcio)
├─ 📋 Topic: Lead #129 - Pedro Costa (pensão por morte)
└─ 📢 Topic: Notificações Gerais (broadcast)
```

---

### 4.2 LLM com Tool Calling

**Propósito:** LLM pode executar ações (não só RAG passivo).

**Tools disponíveis:**

1. **`query_lead_data(lead_id, fields)`** - Buscar dados estruturados
2. **`search_conversations(lead_id, query)`** - RAG nas conversas
3. **`list_documents(lead_id)`** - Ver docs enviados
4. **`get_document_content(doc_id)`** - Ler OCR de um doc
5. **`ask_client(lead_id, question)`** - Instruir bot a perguntar no WhatsApp
6. **`update_lead_notes(lead_id, note)`** - Salvar observação interna
7. **`calculate_fees(case_data)`** - Calcular honorários
8. **`check_deadlines(lead_id)`** - Ver se tem prazo judicial
9. **`list_leads_by_status(status)`** - Query agregada multi-cliente
10. **`count_by_case_type()`** - Estatísticas agregadas

**Exemplo de uso:**
```
Dr. Denis: "@LawAppBot quantos clientes estão devendo documentos?"

Bot executa tool: list_leads_by_status('documents_missing')

Bot responde:
"📊 7 clientes aguardando documentos:
• João Silva - falta: Declaração Sindicato
• Maria Santos - falta: Certidão Casamento, RG cônjuge
• Pedro Costa - falta: Comprovante residência
[...]"
```

---

### 4.3 Commands Bilingues (PT + EN)

**Propósito:** Equipe pode usar português ou inglês.

**Mapeamento:**
```
/resumo <id>    ou /summary <id>     → Resumo completo do lead
/documentos <id> ou /docs <id>       → Listar documentos
/historico <id>  ou /timeline <id>   → Linha do tempo
/perguntar <id> "pergunta" ou /ask <id> "question" → Bot pergunta ao cliente
/aprovar <id>    ou /approve <id>    → Aprovar lead
/rejeitar <id> "motivo" ou /reject <id> "reason" → Rejeitar lead
/honorarios <id> ou /fees <id>       → Calcular honorários
/buscar <termo>  ou /search <term>   → Buscar cliente
/pendentes      ou /pending          → Listar leads pendentes
```

**Implementação:**
```javascript
// n8n node: Parse Command
const message = $input.item.json.text;
const aliases = {
  'resumo': 'summary',
  'documentos': 'docs',
  'historico': 'timeline',
  'perguntar': 'ask',
  'aprovar': 'approve',
  'rejeitar': 'reject',
  'honorarios': 'fees',
  'buscar': 'search',
  'pendentes': 'pending'
};

const parts = message.slice(1).split(' ');
const rawCommand = parts[0];
const args = parts.slice(1);

const command = aliases[rawCommand] || rawCommand;

return { command, args };
```

---

### 4.4 Bidirectional Flow (WhatsApp ↔ Telegram)

**Propósito:** Equipe pede → Bot pergunta no WhatsApp → Resposta volta pro Telegram.

**Fluxo completo:**
```
1. Dr. Denis no Telegram:
   "/ask 127 Você tem conta no Banco do Brasil?"

2. n8n detecta comando → cria task:
   INSERT INTO telegram.client_tasks (lead_id, task_type, task_data, status)
   VALUES (127, 'ask_question', '{"question": "..."}', 'pending')

3. Workflow whatsapp-telegram-bridge detecta task nova → envia WhatsApp:
   "Oi João! O Dr. Denis analisou seu caso... [pergunta]"
   
   UPDATE telegram.client_tasks SET status = 'sent', sent_at = NOW()

4. João responde no WhatsApp:
   "Sim, tenho conta na agência 1234"

5. n8n detecta resposta → atualiza task:
   UPDATE telegram.client_tasks 
   SET status = 'answered', answered_at = NOW(), client_response = '...'

6. n8n notifica Telegram (no topic do lead):
   "✅ João respondeu: 'Sim, tenho conta na agência 1234'"
```

---

### 4.5 Notificações Inteligentes

**Níveis de urgência:**

🔴 **URGENTE** (notifica @everyone):
- Lead mencionou violência doméstica
- Prazo judicial < 3 dias
- Cliente abandonou conversa há 24h (estava quase concluindo)

🟡 **ATENÇÃO** (notifica silencioso):
- Lead completou intake (aguardando aprovação)
- Cliente enviou documento novo
- Cliente respondeu pergunta específica que equipe pediu

🟢 **INFO** (só registra, não notifica):
- Mensagem casual do cliente ("bom dia")
- Bot respondeu FAQ automaticamente
- Cliente visualizou mensagem

---

## 5. Follow-ups Automáticos

### 5.1 Níveis de Automação

#### Nível 1: Timeout Passivo
❌ Cliente abandona → Lead morre

#### Nível 2: Follow-up Reativo (Cron)
✅ Job agendado detecta inatividade e dispara mensagem

#### Nível 3: Follow-up Inteligente (LLM)
🚀 LLM analisa contexto e decide quando/o quê

---

### 5.2 Workflow `follow-up-cron.json`

**Trigger:** Schedule 2x/dia (09:00, 15:00)

**Query leads inativos:**
```sql
SELECT 
    l.id,
    l.chat_id,
    l.full_name,
    l.case_type,
    l.documents_missing,
    NOW() - c.last_seen AS inactive_duration
FROM intake_staging.leads l
JOIN knowledge.clients c ON c.chat_id = l.chat_id
WHERE 
    l.intake_status = 'in_progress'
    AND NOW() - c.last_seen > INTERVAL '24 hours'
ORDER BY inactive_duration DESC;
```

**Mensagens contextuais:**
```javascript
const hoursInactive = lead.inactive_duration.hours;
const missing = lead.documents_missing || [];

let message = '';

if (hoursInactive < 48) {
  // 24-48h: gentil
  message = `Oi ${lead.full_name}! 😊 Tudo bem por aí? Percebi que a gente estava conversando sobre sua ${lead.case_type} e parou. Se tiver alguma dúvida, é só chamar!`;
  
} else if (hoursInactive < 72 && missing.length > 0) {
  // 48-72h: lembrete de documento
  message = `Oi ${lead.full_name}! 👋 Só passando pra lembrar que pra finalizar seu processo de ${lead.case_type}, ainda falta você enviar:\n\n`;
  missing.forEach(doc => message += `📄 ${doc}\n`);
  message += `\nConsegue enviar essa semana? É rapidinho! 🚀`;
  
} else {
  // 72h+: verificar interesse
  message = `Oi ${lead.full_name}! Há alguns dias você estava interessado(a) em resolver sua ${lead.case_type}. Ainda tem interesse? Se preferir deixar pra depois, sem problema — é só me avisar quando quiser retomar. 😊`;
}
```

---

### 5.3 Document Reminders (Cron)

**Workflow:** `document-reminder-cron.json`  
**Trigger:** 4x/dia

**Query:**
```sql
SELECT * FROM intake_staging.document_reminders
WHERE 
    next_reminder_at < NOW()
    AND received = FALSE
    AND reminder_count < max_reminders
    AND gave_up = FALSE;
```

**Mensagens progressivas:**
```
Reminder 1 (48h):
"Oi João! Só lembrando que ainda preciso da sua CNH pra finalizar. Consegue enviar hoje? 📸"

Reminder 2 (96h):
"Oi João! Percebi que ainda falta a CNH. Tem alguma dificuldade pra enviar? Posso te ajudar!"

Reminder 3 (144h):
"Oi João, última tentativa aqui 😅 Sem a CNH não consigo dar andamento no seu processo. Se não conseguir enviar até sexta, vou precisar pausar seu atendimento. Me avisa se precisar de algo!"
```

**Após 3 tentativas:**
```sql
UPDATE intake_staging.document_reminders
SET gave_up = TRUE
WHERE id = ?;

UPDATE intake_staging.leads
SET intake_status = 'stalled'
WHERE id = ?;
```

---

## 6. Dashboard Web de Gestão

### 6.1 Arquitetura

**Solução:** HTML estático servido via nginx (mesmo servidor n8n/OpenWA)

**Caminho:** `/openwa/dashboard/index.html`

**Backend:** n8n webhook `/webhook/admin-config`

**Zero infra adicional** ✅

---

### 6.2 Funcionalidades

#### 6.2.1 Gestão de Auto-Answer Policies

Interface visual com toggles:
```
┌────────────────────────────────────────────────────────┐
│ Tópico          | Auto-Resposta | Escalar Humano      │
├────────────────────────────────────────────────────────┤
│ Honorários      │ [❌ OFF]      │ [✅ ON]             │
│ Documentos      │ [✅ ON]       │ [❌ OFF]            │
│ Prazos          │ [✅ ON]       │ [❌ OFF]            │
│ Urgência/Violên │ [❌ OFF]      │ [✅ ON] (crítico)   │
└────────────────────────────────────────────────────────┘
```

**API call:**
```javascript
await fetch('https://n8n.domain.com/webhook/admin-config', {
  method: 'POST',
  body: JSON.stringify({
    action: 'update_rule',
    topic: 'honorarios',
    auto_answer_enabled: false,
    escalate_to_human: true
  })
});
```

---

#### 6.2.2 Gestão de Cron Jobs

Interface com dropdowns de frequência:
```
┌────────────────────────────────────────────────────────┐
│ Nome                    | Frequência  | Status | Ações │
├────────────────────────────────────────────────────────┤
│ Follow-up Leads         │ [12h ▼]    │ ✅ Ativo│ ⏸ ⚙ │
│ Cobrar Documentos       │ [24h ▼]    │ ✅ Ativo│ ⏸ ⚙ │
│ Sync LawApp             │ [1h  ▼]    │ ✅ Ativo│ ⏸ ⚙ │
│ Limpar Sessões Antigas  │ [7d  ▼]    │ ✅ Ativo│ ⏸ ⚙ │
└────────────────────────────────────────────────────────┘
```

**Opções de frequência:**
- 1h, 6h, 12h, 24h, 7d

**API call:**
```javascript
await fetch('https://n8n.domain.com/webhook/admin-config', {
  method: 'POST',
  body: JSON.stringify({
    action: 'update_cron',
    cron_id: 'follow-up-leads',
    frequency_seconds: 43200  // 12h
  })
});
```

---

#### 6.2.3 Estatísticas em Tempo Real

```
📊 Estatísticas (Últimas 24h)
┌────────────────────────────────────────────────────────┐
│ • 47 mensagens recebidas                                │
│ • 23 respondidas por FAQ (48% - zero custo)             │
│ • 19 respondidas por RAG+LLM ($0.02)                    │
│ • 5 escaladas para humano                               │
│ • 3 follow-ups enviados                                 │
│ • 12 documentos coletados                               │
└────────────────────────────────────────────────────────┘
```

**Refresh:** Auto-refresh a cada 30s (JavaScript)

---

## 7. n8n Workflows (Visão Geral)

### 7.1 Principais

1. **`whatsapp-main.json`** - Orquestrador principal
   - Recebe webhook OpenWA
   - Parse data
   - Get/Create client
   - Save conversation
   - Route by message type

2. **`knowledge-search.json`** - Sistema 3 camadas
   - Generate embedding
   - Check auto-answer policy
   - Layer 1: FAQ lookup
   - Layer 2: RAG + LLM
   - Layer 3: Full context LLM
   - Send WhatsApp response

3. **`telegram-command-center.json`** - War room
   - Receive Telegram commands
   - Parse command (PT/EN)
   - Execute command (SQL queries, LLM tools)
   - Reply to Telegram

4. **`whatsapp-telegram-bridge.json`** - Bidirectional
   - Cliente responde WhatsApp → detectar task pendente → notificar Telegram
   - Documento novo → OCR + notificar Telegram

---

### 7.2 Auxiliares

5. **`follow-up-cron.json`** - Follow-ups automáticos
6. **`document-reminder-cron.json`** - Cobrar documentos
7. **`lawapp-sync-queue.json`** - Sync staging → LawApp API
8. **`admin-config-webhook.json`** - Backend do dashboard

---

## 8. Plano de Implementação

### Fase 1: Foundation (Schema + pgvector) ⭐ PRIMEIRA FASE
- ✅ Criar schemas (knowledge, intake_staging, telegram, bot_config)
- ✅ Instalar pgvector extension
- ✅ Criar todas tabelas com índices
- ✅ Criar funções SQL helper (find_similar_faq, find_similar_conversations, get_client_summary)
- ✅ Seed inicial (FAQ, auto_answer_rules, cron_jobs)
- ✅ Testes de performance (inserir 1000 embeddings dummy, testar IVFFlat speed)

### Fase 2: Core Workflows
- ✅ whatsapp-main.json
- ✅ knowledge-search.json (3 layers)
- ✅ Integrar OpenAI embeddings
- ✅ Integrar Groq LLM
- ✅ Testes E2E (cliente envia msg → bot responde)

### Fase 3: Telegram Integration
- ✅ telegram-command-center.json
- ✅ whatsapp-telegram-bridge.json
- ✅ LLM tools implementation
- ✅ Commands bilingues
- ✅ Notificações inteligentes

### Fase 4: Automations
- ✅ follow-up-cron.json
- ✅ document-reminder-cron.json
- ✅ lawapp-sync-queue.json

### Fase 5: Dashboard
- ✅ dashboard HTML/CSS/JS
- ✅ admin-config-webhook.json
- ✅ Deploy nginx config

---

## 9. Métricas de Sucesso

### 9.1 Performance
- ✅ FAQ lookup < 10ms
- ✅ RAG query < 50ms
- ✅ LLM response < 3s
- ✅ 50%+ mensagens respondidas por FAQ (zero custo)

### 9.2 Negócio
- ✅ Redução 70% tempo de intake manual
- ✅ Zero leads perdidos por inatividade (follow-ups automáticos)
- ✅ 100% documentos coletados antes de enviar pra Dr. Denis
- ✅ Equipe pode gerenciar 3x mais clientes simultâneos

### 9.3 Qualidade
- ✅ Zero alucinações críticas (perguntas de honorários escaladas pra humano)
- ✅ 95%+ satisfação do cliente (medir via feedback opcional)
- ✅ Tempo médio de resposta < 5min (24/7)

---

## 10. Segurança e Compliance

### 10.1 Dados Sensíveis
- ✅ CPF, RG: criptografados em repouso (PostgreSQL encryption)
- ✅ Documentos: storage separado (MinIO/S3) com acesso controlado
- ✅ Embeddings: NÃO contém PII (apenas vetores semânticos)

### 10.2 LGPD
- ✅ Cliente pode solicitar exclusão de dados (DELETE CASCADE)
- ✅ Logs de auditoria (quem acessou quais dados)
- ✅ Retenção: 5 anos (padrão jurídico)

### 10.3 Rate Limiting
- ✅ OpenAI API: max 1000 embeddings/min
- ✅ Groq API: max 500 requests/min
- ✅ WhatsApp: max 60 msgs/min (limite OpenWA)

---

## 11. Custos Estimados (Mensal)

### 11.1 LLM/Embeddings
- OpenAI embeddings: 100 msgs/dia × 30 dias × $0.02/1M tokens = **$0.60/mês**
- Groq LLM: 50 msgs/dia × 30 dias × $0.0001 = **$0.15/mês**
- **Total LLM: ~$1/mês** ✅ (desprezível)

### 11.2 Infraestrutura
- VPS 8GB (n8n + PostgreSQL + OpenWA): **$40/mês**
- Storage MinIO (100GB): **$5/mês**
- **Total Infra: $45/mês**

### 11.3 Total
**~$46/mês** para sistema completo 24/7 ✅

---

## 12. Riscos e Mitigações

### 12.1 LLM Alucinação
**Risco:** Bot dá informação errada sobre honorários/prazos  
**Mitigação:** Auto-answer policy desabilita honorários (escala pra humano)

### 12.2 Escalabilidade pgvector
**Risco:** Após 100k conversas, IVFFlat fica lento  
**Mitigação:** Migrar pra HNSW index ou Qdrant (planejado Fase 6)

### 12.3 API LawApp Indisponível
**Risco:** Não consegue sincronizar leads  
**Mitigação:** Staging tables locais + retry queue (3 tentativas)

### 12.4 WhatsApp Ban
**Risco:** OpenWA account banido por "spam"  
**Mitigação:** Rate limiting 60 msgs/min, delay 2s entre msgs

---

## 13. Anexos

### 13.1 Referências
- OpenWA Docs: https://docs.openwa.dev
- pgvector: https://github.com/pgvector/pgvector
- n8n Best Practices: https://docs.n8n.io/hosting/scaling/
- Groq API: https://console.groq.com/docs

### 13.2 Arquivos de Contexto
- `/Users/I531631/claude/Pessoal/OpenWA/KNOWLEDGE_BASE_ANALYSIS.md` - FAQ + fluxos extraídos
- `/Users/I531631/claude/Pessoal/LawApp/docs/conversas com clientes/` - 38 conversas históricas

---

**FIM DO SPEC**

---

## Aprovações

- [ ] **Bruno Ricciardi** - Arquitetura geral
- [ ] **Dr. Denis** - Fluxos de intake e honorários
- [ ] **Equipe Técnica** - Viabilidade implementação

**Data de Aprovação:** _______________

**Prioridade:** 🔴 Alta (impacto direto em receita)

**Prazo Estimado Fase 1:** 3-5 dias (com ultracode AAA quality)
