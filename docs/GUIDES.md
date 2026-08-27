# Guias de Uso OpenWA

Guias práticos para implementar e usar funcionalidades específicas do OpenWA.

## Índice
1. [Atendimento WhatsApp com LLM](#atendimento-whatsapp)
2. [Telefonia e Voz](#telefonia-voz)
3. [Suporte Multimodal](#multimodal)
4. [Base de Conhecimento](#knowledge-base)
5. [Bot de Intake](#bot-de-intake)
6. [System Prompts](#system-prompts)

---

## Atendimento WhatsApp com LLM

### Overview

Sistema de chatbot inteligente no WhatsApp usando LLMs (Large Language Models) para atendimento automatizado com contexto e personalização.

### Componentes

1. **OpenWA** - Conecta ao WhatsApp
2. **n8n** - Orquestra o fluxo
3. **LLM** - Groq (Mixtral) ou OpenAI (GPT-4)
4. **Knowledge Base** - Supabase + pgvector
5. **Memory** - Redis para contexto de conversas

### Fluxo de Atendimento

```
Cliente → WhatsApp → OpenWA → n8n → [RAG + LLM] → Resposta → WhatsApp
```

### Implementação Passo-a-Passo

#### 1. Preparar Base de Conhecimento

**Formato do conteúdo:**

```json
{
  "documents": [
    {
      "title": "Horário de Atendimento",
      "content": "Atendemos de segunda a sexta, das 9h às 18h.",
      "category": "info",
      "keywords": ["horário", "atendimento", "funcionamento"]
    },
    {
      "title": "Política de Devolução",
      "content": "Aceitamos devoluções em até 30 dias...",
      "category": "policy",
      "keywords": ["devolução", "troca", "reembolso"]
    }
  ]
}
```

**Gerar embeddings:**

```javascript
// Node n8n: Generate Embeddings
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const items = $input.all();
const results = [];

for (const item of items) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: item.json.content
  });
  
  results.push({
    ...item.json,
    embedding: response.data[0].embedding
  });
}

return results;
```

**Inserir no banco:**

```sql
INSERT INTO knowledge_base (content, embedding, metadata)
VALUES (
  $1,
  $2::vector,
  $3::jsonb
);
```

#### 2. Configurar Webhook OpenWA

**n8n Webhook Node:**

```json
{
  "method": "POST",
  "path": "whatsapp",
  "responseMode": "lastNode",
  "options": {}
}
```

**Payload esperado:**

```json
{
  "sessionId": "default",
  "from": "5511999999999@c.us",
  "body": "Qual o horário de atendimento?",
  "messageType": "chat",
  "timestamp": 1234567890,
  "chatId": "5511999999999@c.us"
}
```

#### 3. Buscar Contexto (RAG)

**Gerar embedding da pergunta:**

```javascript
const userMessage = $json.body;

const response = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: userMessage
});

return {
  query: userMessage,
  queryEmbedding: response.data[0].embedding
};
```

**Buscar documentos similares:**

```sql
SELECT 
  content,
  metadata,
  1 - (embedding <=> $1::vector) AS similarity
FROM knowledge_base
WHERE 1 - (embedding <=> $1::vector) > 0.7
ORDER BY similarity DESC
LIMIT 3;
```

#### 4. Compor Prompt com Contexto

```javascript
const context = $('Postgres').all().map(item => item.json.content).join('\n\n');
const userMessage = $json.query;

const systemPrompt = `Você é um assistente de atendimento ao cliente.

Base de Conhecimento:
${context}

Instruções:
- Use APENAS informações da base de conhecimento
- Seja cordial e profissional
- Respostas concisas (máx 3 parágrafos)
- Se não souber, diga que vai verificar e retorne em breve
- Não invente informações`;

return {
  system: systemPrompt,
  user: userMessage
};
```

#### 5. Chamar LLM

**Groq (recomendado - mais rápido e gratuito):**

```javascript
// HTTP Request Node
{
  "method": "POST",
  "url": "https://api.groq.com/openai/v1/chat/completions",
  "headers": {
    "Authorization": "Bearer {{$env.GROQ_API_KEY}}",
    "Content-Type": "application/json"
  },
  "body": {
    "model": "mixtral-8x7b-32768",
    "messages": [
      {
        "role": "system",
        "content": "{{$json.system}}"
      },
      {
        "role": "user",
        "content": "{{$json.user}}"
      }
    ],
    "temperature": 0.7,
    "max_tokens": 500
  }
}
```

**OpenAI (fallback):**

```javascript
{
  "model": "gpt-4",
  "messages": [...]
}
```

#### 6. Enviar Resposta

**Formatar resposta:**

```javascript
const response = $json.choices[0].message.content;
const chatId = $('Webhook').first().json.chatId;

return {
  chatId,
  message: response
};
```

**OpenWA Send Message:**

```javascript
// HTTP Request to OpenWA API
{
  "method": "POST",
  "url": "http://openwa:3000/api/sendText",
  "headers": {
    "Authorization": "Bearer {{$env.OPENWA_API_KEY}}"
  },
  "body": {
    "chatId": "{{$json.chatId}}",
    "text": "{{$json.message}}",
    "sessionId": "default"
  }
}
```

### Melhorias Avançadas

#### Memory/Context

**Armazenar conversa no Redis:**

```javascript
// Set Node
const redis = require('redis');
const client = redis.createClient({
  url: 'redis://redis:6379',
  password: process.env.REDIS_PASSWORD
});

await client.connect();

const chatId = $json.chatId;
const message = $json.body;
const response = $json.response;

// Recuperar histórico
let history = await client.get(`chat:${chatId}`);
history = history ? JSON.parse(history) : [];

// Adicionar nova interação
history.push({
  user: message,
  assistant: response,
  timestamp: Date.now()
});

// Manter apenas últimas 10 mensagens
if (history.length > 10) {
  history = history.slice(-10);
}

// Salvar
await client.setEx(`chat:${chatId}`, 3600, JSON.stringify(history));

return { saved: true };
```

**Incluir histórico no prompt:**

```javascript
const history = JSON.parse(await redis.get(`chat:${chatId}`)) || [];

const conversationContext = history.map(h => 
  `User: ${h.user}\nAssistant: ${h.assistant}`
).join('\n\n');

const systemPrompt = `[System prompt...]

Histórico da conversa:
${conversationContext}

Mensagem atual do usuário: ${userMessage}`;
```

#### Roteamento Inteligente

**Identificar intenção:**

```javascript
// LLM Node: Intent Classification
{
  "model": "mixtral-8x7b-32768",
  "messages": [{
    "role": "system",
    "content": "Classifique a intenção do usuário em uma das categorias: vendas, suporte, financeiro, outros. Responda APENAS a categoria."
  }, {
    "role": "user",
    "content": "{{$json.body}}"
  }],
  "temperature": 0.1,
  "max_tokens": 10
}
```

**Switch Node:**

```javascript
// Vendas
{{ $json.intent === 'vendas' }}

// Suporte
{{ $json.intent === 'suporte' }}

// Financeiro
{{ $json.intent === 'financeiro' }}

// Default
true
```

#### Fallback para Humano

```javascript
// Se confiança baixa ou intenção "outros"
if ($json.confidence < 0.7 || $json.intent === 'outros') {
  // Notificar equipe humana
  await slack.postMessage({
    channel: '#atendimento',
    text: `🆘 Cliente precisa de atendimento humano\nDe: ${chatId}\nMensagem: ${userMessage}`
  });
  
  // Responder ao cliente
  return {
    chatId,
    message: "Vou transferir você para um atendente. Aguarde um momento! ⏳"
  };
}
```

---

## Telefonia e Voz

> ⚠️ **STATUS: PLANEJADO** — Esta funcionalidade está documentada mas não implementada. 
> Prevista para Roadmap Fase 6 (Advanced Features). A documentação abaixo serve como design de referência.

### Overview

Integração de chamadas de voz com transcrição (STT), síntese (TTS) e processamento por LLM.

### Provedores Recomendados

| Provedor | STT | TTS | Telefonia | Custo |
|----------|-----|-----|-----------|-------|
| **Groq** | ✅ Whisper | ❌ | ❌ | Grátis |
| **OpenAI** | ✅ Whisper | ✅ | ❌ | $0.006/min (STT) |
| **Twilio** | ✅ | ✅ | ✅ | $0.013/min |
| **VibeVoice** | ✅ | ✅ | ✅ | $0.008/min |

**Recomendação:** VibeVoice (melhor custo-benefício para all-in-one)

### Implementação WhatsApp Audio

#### 1. Receber Áudio no Webhook

**OpenWA retorna:**

```json
{
  "messageType": "audio",
  "body": "audio-hash.ogg",
  "mediaUrl": "http://openwa:3000/media/audio-hash.ogg",
  "duration": 15,
  "from": "5511999999999@c.us"
}
```

#### 2. Download do Áudio

```javascript
// HTTP Request Node
{
  "method": "GET",
  "url": "{{$json.mediaUrl}}",
  "options": {
    "encoding": "arraybuffer"
  }
}
```

#### 3. Transcrever com Groq

```javascript
// HTTP Request Node
const FormData = require('form-data');

const audioBuffer = $binary.data;
const form = new FormData();
form.append('file', audioBuffer, 'audio.ogg');
form.append('model', 'whisper-large-v3');
form.append('language', 'pt');
form.append('response_format', 'json');

return {
  method: 'POST',
  url: 'https://api.groq.com/openai/v1/audio/transcriptions',
  headers: {
    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    ...form.getHeaders()
  },
  body: form
};
```

**Resposta:**

```json
{
  "text": "Qual o horário de atendimento?"
}
```

#### 4. Processar com LLM

Mesmo fluxo do atendimento texto (ver seção anterior).

#### 5. Responder

**Opção A: Texto (mais comum no WhatsApp)**

```javascript
// Enviar resposta em texto
{
  "chatId": "{{$json.from}}",
  "text": "{{$json.response}}"
}
```

**Opção B: Áudio (TTS)**

```javascript
// OpenAI TTS
const response = await openai.audio.speech.create({
  model: "tts-1",
  voice: "nova",
  input: $json.response,
  response_format: "opus"
});

const audioBuffer = Buffer.from(await response.arrayBuffer());

// Enviar áudio via OpenWA
await openwa.sendAudio({
  chatId: $json.from,
  audio: audioBuffer.toString('base64'),
  filename: 'response.ogg'
});
```

### Telefonia com VibeVoice

**Fluxo:**

```
Ligação → VibeVoice → Webhook n8n → [STT → LLM → TTS] → VibeVoice → Cliente
```

**Configuração VibeVoice:**

```javascript
// Webhook de chamada recebida
{
  "callId": "abc123",
  "from": "+5511999999999",
  "to": "+5511988888888",
  "status": "ringing"
}

// Responder com ação
return {
  "action": "answer",
  "webhook_url": "https://seu-dominio.com/webhook/vibe-voice"
};
```

**Processar áudio em tempo real:**

```javascript
// Stream de áudio vindo da ligação
const audioStream = $json.audioStream;

// Transcrever
const transcript = await groq.transcribe(audioStream);

// LLM
const response = await groq.chat([
  { role: 'system', content: systemPrompt },
  { role: 'user', content: transcript }
]);

// TTS
const audioResponse = await openai.tts(response);

// Retornar para VibeVoice
return {
  "action": "play",
  "audio_url": audioResponse.url
};
```

Documentação completa: `archive/GUIA_TELEFONIA_VOZ_LLM.md`

---

## Suporte Multimodal

### Overview

Processar mensagens de **texto**, **áudio** (voz) e **imagem** (fotos, documentos) no mesmo workflow.

### Tipos de Mensagem WhatsApp

| Tipo | messageType | Como processar |
|------|-------------|----------------|
| Texto | `chat`, `text` | Direto para LLM |
| Áudio | `audio`, `ptt` | STT → LLM |
| Imagem | `image` | Vision → LLM |
| Vídeo | `video` | Frame extraction → Vision |
| Documento | `document` | OCR → LLM |
| Sticker | `sticker` | Ignorar ou resposta padrão |

### Roteamento por Tipo

**Switch Node:**

```javascript
// Rota 1: Áudio
{{ $json.messageType === 'audio' || $json.messageType === 'ptt' }}

// Rota 2: Imagem
{{ $json.messageType === 'image' }}

// Rota 3: Texto (default)
{{ $json.messageType === 'chat' || $json.messageType === 'text' }}
```

### Processar Imagem

#### 1. Download da Imagem

```javascript
// HTTP Request
{
  "method": "GET",
  "url": "{{$json.mediaUrl}}",
  "options": {
    "encoding": "arraybuffer"
  }
}
```

#### 2. Análise com Vision

**OpenAI GPT-4 Vision:**

```javascript
{
  "model": "gpt-4-vision-preview",
  "messages": [{
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "Descreva esta imagem em detalhes. Se houver texto, transcreva-o."
      },
      {
        "type": "image_url",
        "image_url": {
          "url": `data:image/jpeg;base64,${$json.imageBase64}`
        }
      }
    ]
  }],
  "max_tokens": 500
}
```

**Groq (llama-3.2-90b-vision):**

```javascript
{
  "model": "llama-3.2-90b-vision-preview",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Analyze this image" },
      { "type": "image_url", "image_url": { "url": "..." }}
    ]
  }]
}
```

#### 3. Processar Resultado

```javascript
const imageAnalysis = $json.choices[0].message.content;
const userCaption = $('Webhook').first().json.caption || '';

// Combinar análise + legenda
const fullContext = `
Imagem enviada pelo cliente: ${imageAnalysis}

${userCaption ? `Legenda: ${userCaption}` : ''}
`;

// Continuar para LLM principal
return {
  message: fullContext,
  chatId: $json.chatId
};
```

### Casos de Uso

**1. Cardápio de Restaurante**

Cliente envia foto do prato → Vision descreve → LLM responde valor/ingredientes

**2. Nota Fiscal**

Cliente envia foto da NF → OCR extrai dados → LLM processa reclamação

**3. Documento de Identidade**

Cliente envia RG/CNH → Vision extrai info → Validação automática

**4. Produto com Defeito**

Cliente envia foto do defeito → Vision analisa → LLM gera protocolo de troca

### Workflow Completo

Ver arquivo: `Whatsapp-Unified-Multimodal-COMPLETE.json`

**Resumo do fluxo:**

```
[Webhook]
    ↓
[Type Router]
    ├─ Audio → [STT] ────┐
    ├─ Image → [Vision] ─┤
    └─ Text ─────────────┘
                         ↓
                    [Merge Context]
                         ↓
                    [RAG Search]
                         ↓
                    [LLM Response]
                         ↓
                    [Send Reply]
```

### Custos e Rate Limits Vision

#### Modelos e Preços (Dezembro 2024)

| Modelo | Input (1M tokens) | Output (1M tokens) | Recomendado para |
|--------|-------------------|-------------------|------------------|
| **gpt-4o-mini** | $0.15 | $0.60 | Testes, protótipos, Volume alto |
| **gpt-4o** | $2.50 | $10.00 | Produção, Alta precisão |
| gpt-4-turbo | $10.00 | $30.00 | Legacy (não recomendado) |

**Recomendação:** Use **gpt-4o-mini** para desenvolvimento e testes. A diferença de custo é 17x menor que gpt-4o, com qualidade adequada para a maioria dos casos de uso.

#### Token Counting para Imagens

A API Vision conta tokens de forma diferente dependendo do modo `detail`:

**Low Detail (modo padrão para testes):**
- **85 tokens fixos** por imagem, independente do tamanho
- Use para testes E2E, desenvolvimento, prototipagem
- Custo previsível e baixo

**High Detail (produção):**
- Base: 85 tokens
- Adicional: **170 tokens por tile de 512x512px**
- Imagem é redimensionada para caber em 2048x2048px preservando aspect ratio
- Depois dividida em tiles de 512px
- Exemplo: imagem 2048x2048px = 16 tiles = 85 + (16 × 170) = **2805 tokens**

**Cálculo de tiles:**
```javascript
// Fórmula simplificada
function calcularTiles(width, height) {
  // Escalar para caber em 2048x2048
  const scale = Math.min(2048 / width, 2048 / height);
  const scaledW = Math.ceil(width * scale);
  const scaledH = Math.ceil(height * scale);
  
  // Dividir em tiles 512x512
  const tilesX = Math.ceil(scaledW / 512);
  const tilesY = Math.ceil(scaledH / 512);
  
  return tilesX * tilesY;
}

// Exemplo
const tiles = calcularTiles(1920, 1080); // = 8 tiles
const tokens = 85 + (tiles * 170); // = 1445 tokens
```

#### Estimativa de Custo por Imagem

**Low Detail (testes):**
- 85 tokens × $0.15 / 1M = **$0.00001275** por imagem
- ~78.000 imagens por $1 USD
- Ideal para testes automatizados

**High Detail (produção, imagem típica 1920x1080):**
- ~1445 tokens × $0.15 / 1M = **$0.00021675** por imagem
- ~4.600 imagens por $1 USD
- Use quando precisar de OCR ou detalhes finos

**High Detail (imagem grande 4096x4096):**
- ~11,645 tokens × $0.15 / 1M = **$0.00175** por imagem
- ~570 imagens por $1 USD
- Evite em testes; redimensione antes de enviar

#### Rate Limits (Tier 1 - Free/Novo)

| Modelo | Requests/min | Tokens/min | Requests/dia |
|--------|--------------|------------|--------------|
| gpt-4o-mini | 500 | 200,000 | 10,000 |
| gpt-4o | 500 | 30,000 | 10,000 |

**Observação:** Rate limits aumentam conforme uso histórico (Tiers 2-5). Veja [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits).

#### Boas Práticas para Reduzir Custo

1. **Use `detail: "low"` para testes E2E**
   - Custo fixo de 85 tokens
   - Suficiente para validar fluxo e lógica

2. **Redimensione imagens grandes antes de enviar**
   ```javascript
   // Usar Sharp para redimensionar
   await sharp(inputBuffer)
     .resize(1024, 1024, { fit: 'inside' })
     .toBuffer();
   ```

3. **Cache descrições de imagens fixas**
   - Fixtures de teste não mudam
   - Armazene descrição no fixture README
   - Evite re-processar a mesma imagem

4. **Use fixtures pequenos (<512px) nos testes**
   - 1 tile = 85 + 170 = 255 tokens (high detail)
   - Muito menor que imagens reais

5. **Monitore custo em CI**
   - Helper `analyzeImage` loga tokens usados
   - Revise logs do GitHub Actions
   - Suite de testes Phase 4 gasta ~$0.005 por run

#### Custos Observados (Phase 4)

Conforme medido nos testes E2E de Vision:

- **Tracer test** (1 imagem, low detail): ~85 tokens = $0.00001275
- **Accuracy test** (3 imagens, low detail): ~255 tokens = $0.00003825
- **Full suite** (~10 imagens): ~850 tokens = **$0.00012750**
- **CI run completo** (shape + tracer + accuracy + fallback): **<$0.001**

**Conclusão:** Mesmo rodando testes Vision em todo PR, custo mensal de CI é desprezível (<$5/mês para 5000 PRs).

---

## Knowledge Base

### Estrutura

**Tabela PostgreSQL:**

```sql
CREATE TABLE knowledge_base (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255),
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  category VARCHAR(50),
  keywords TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_embedding ON knowledge_base 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX idx_category ON knowledge_base(category);
CREATE INDEX idx_keywords ON knowledge_base USING GIN(keywords);
```

### Alimentar Base

**Script de importação:**

```javascript
// populate-kb.js
const fs = require('fs');
const { Pool } = require('pg');
const OpenAI = require('openai');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function populateKnowledgeBase(jsonFile) {
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  
  for (const doc of data.documents) {
    // Gerar embedding
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: doc.content
    });
    
    const embedding = embeddingResponse.data[0].embedding;
    
    // Inserir
    await pool.query(
      `INSERT INTO knowledge_base 
       (title, content, embedding, metadata, category, keywords)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        doc.title,
        doc.content,
        `[${embedding.join(',')}]`,
        JSON.stringify(doc.metadata || {}),
        doc.category,
        doc.keywords
      ]
    );
    
    console.log(`✓ ${doc.title}`);
  }
  
  console.log('✅ Done!');
}

populateKnowledgeBase('./data/knowledge.json');
```

**Executar:**

```bash
node scripts/populate-kb.js
```

### Buscar Documentos

**Por similaridade vetorial:**

```sql
SELECT 
  id,
  title,
  content,
  category,
  1 - (embedding <=> $1::vector) AS similarity
FROM knowledge_base
WHERE 1 - (embedding <=> $1::vector) > $2
ORDER BY similarity DESC
LIMIT $3;
```

**Por keyword + vector:**

```sql
SELECT 
  id,
  title,
  content,
  1 - (embedding <=> $1::vector) AS similarity
FROM knowledge_base
WHERE 
  keywords && $2::text[]  -- keyword match
  OR 1 - (embedding <=> $1::vector) > $3  -- vector similarity
ORDER BY similarity DESC
LIMIT 10;
```

### Atualizar Documentos

**Via n8n workflow:**

```javascript
// Triggered por mudança no Google Sheets/Airtable/Notion

const updates = $input.all();

for (const update of updates) {
  // Gerar novo embedding
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: update.json.content
  });
  
  // Update no banco
  await pg.query(
    `UPDATE knowledge_base 
     SET content = $1, embedding = $2, updated_at = NOW()
     WHERE id = $3`,
    [update.json.content, embedding.data[0].embedding, update.json.id]
  );
}
```

### Monitorar Qualidade

**Métricas:**

```sql
-- Documentos mais usados
SELECT 
  kb.title,
  COUNT(*) as usage_count
FROM knowledge_base kb
JOIN usage_logs ul ON ul.kb_id = kb.id
WHERE ul.created_at > NOW() - INTERVAL '7 days'
GROUP BY kb.title
ORDER BY usage_count DESC
LIMIT 10;

-- Documentos nunca usados
SELECT title, created_at
FROM knowledge_base
WHERE id NOT IN (SELECT DISTINCT kb_id FROM usage_logs)
ORDER BY created_at DESC;

-- Coverage por categoria
SELECT 
  category,
  COUNT(*) as doc_count,
  AVG(CHAR_LENGTH(content)) as avg_length
FROM knowledge_base
GROUP BY category;
```

---

## Bot de Intake

### Overview

O Bot de Intake faz **triagem e qualificação de leads** via WhatsApp, coletando 5 campos de forma
conversacional (um por mensagem) e, ao concluir, expondo o lead qualificado para export a um CRM ou
webhook externo. É implementado em `src/modules/intake` (NestJS) e orquestrado pelo workflow n8n
`Whatsapp-Intake-Bot.json`.

O motor conversacional (`advanceIntake`, em `intake-flow.ts`) é uma state machine determinística:
o passo atual é sempre o **primeiro campo ainda vazio**, na ordem canônica abaixo.

### Ordem do Fluxo Conversacional

| # | Campo | Pergunta do bot | Observação |
|---|-------|-----------------|------------|
| 1 | `fullName` | "qual é o seu nome completo?" | — |
| 2 | `phone` | "qual é o seu telefone para contato?" | — |
| 3 | `email` | "qual é o seu e-mail?" | — |
| 4 | `caseType` | "descreva brevemente a sua demanda" | texto livre |
| 5 | `urgencyLevel` | "normal, alta ou crítica" | normaliza pt-BR → `normal`/`high`/`critical`; input inválido repete a pergunta |

Ao coletar o 5º campo, o lead vira `intakeStatus='completed'` (com `intakeCompletedAt`) e o bot
devolve uma confirmação com o resumo dos dados.

### Rotas REST

Todas as rotas exigem uma API key **OPERATOR** (`X-API-Key`). `sessionId` é o id da sessão WhatsApp;
`chatId` é o identificador do chat (chave natural do lead).

#### 1. Ingerir mensagem (avança o fluxo)

```http
POST /api/sessions/:sessionId/intake/messages
X-API-Key: <operator-key>
Content-Type: application/json

{ "chatId": "5511999999999@c.us", "text": "Maria Silva" }
```

Resposta `201` (o lead + a próxima pergunta):

```json
{
  "id": 1,
  "chatId": "5511999999999@c.us",
  "fullName": "Maria Silva",
  "intakeStatus": "in_progress",
  "reply": "Qual é o seu telefone para contato?",
  "step": "collect_phone",
  "completed": false
}
```

O campo `reply` é a mensagem que o bot deve enviar de volta ao usuário no WhatsApp; `completed` vira
`true` quando os 5 campos estão preenchidos.

#### 2. Ler o lead

```http
GET /api/sessions/:sessionId/intake/leads/:chatId
X-API-Key: <operator-key>
```

Resposta `200` com o lead persistido (`404` se não existir).

#### 3. Exportar o lead qualificado

```http
POST /api/sessions/:sessionId/intake/leads/:chatId/export
X-API-Key: <operator-key>
Content-Type: application/json

{ "url": "https://crm.example.com/leads", "headers": { "Authorization": "Bearer ..." } }
```

Resposta `200` (`{ "delivered": true, "status": 200 }`). Faz POST do payload do lead à `url`
informada. **Só leads `completed` são exportáveis** — um lead ainda em coleta retorna `409`. O POST
reusa o mesmo SSRF guard do módulo de webhook.

### Importar o workflow no n8n

1. No n8n, **Workflows → Import from File** e selecione `Whatsapp-Intake-Bot.json`.
2. Configure as variáveis de ambiente do n8n (usadas via `$env` nos nós HTTP):

   | Variável | Descrição | Exemplo |
   |----------|-----------|---------|
   | `OPENWA_BASE_URL` | URL base da API OpenWA | `http://openwa:3000` |
   | `OPENWA_API_KEY` | API key **OPERATOR** enviada em `X-API-Key` | `owa_...` |
   | `OPENWA_SESSION_ID` | id da sessão WhatsApp | `default` |

3. Aponte o webhook de entrada de mensagens do OpenWA para o nó **Webhook Intake** do workflow.
4. Ative o workflow. Cada mensagem recebida chama `POST .../intake/messages` e o `reply` retornado é
   enviado de volta ao usuário; ao completar, o workflow chama `.../export`.

### Validação E2E

O ciclo completo (WhatsApp → coleta dos 5 campos → lead `completed` persistido → export recebido) é
coberto por `test/intake-e2e-cycle.e2e-spec.ts`:

```bash
npm run test:e2e -- intake-e2e-cycle
```

---

## System Prompts

### Princípios

1. **Claro e específico** - Sem ambiguidade
2. **Estruturado** - Sections bem definidas
3. **Com exemplos** - Few-shot quando necessário
4. **Limitações explícitas** - O que NÃO fazer
5. **Tom definido** - Formalidade, cordialidade

### Template Base

```
Você é um [PAPEL] da empresa [EMPRESA].

## Contexto
[Informações sobre o negócio, produto, serviço]

## Seu Objetivo
[O que você deve fazer]

## Base de Conhecimento
[Contexto RAG será inserido aqui]

## Instruções
1. [Instrução específica]
2. [Outra instrução]
3. ...

## Tom e Estilo
- [Tom: profissional, casual, etc]
- [Formalidade: você/tu, senhor/a]
- [Emoji: sim/não]

## Limitações
- NÃO [ação proibida]
- NUNCA [outra ação proibida]
- Se não souber, [o que fazer]

## Formato de Resposta
[Como estruturar a resposta]

## Exemplos
User: [exemplo]
Assistant: [resposta esperada]
```

### Exemplos Práticos

#### Bot de Vendas

```
Você é um consultor de vendas da TechStore, loja de eletrônicos.

## Seu Objetivo
Ajudar clientes a escolher produtos, tirar dúvidas técnicas e fechar vendas.

## Base de Conhecimento
{{CONTEXT}}

## Instruções
1. Cumprimente de forma calorosa
2. Identifique a necessidade do cliente com perguntas abertas
3. Sugira 2-3 produtos adequados
4. Destaque benefícios (não apenas features)
5. Ofereça condições de pagamento
6. Não force a venda - seja consultivo

## Tom
- Amigável e profissional
- Use "você"
- Emojis moderados (👍 ✅ 🎉)
- Máximo 3 parágrafos por resposta

## Limitações
- NÃO invente especificações técnicas
- NÃO prometa descontos não autorizados
- Se o produto não estiver na base, ofereça verificar e retornar

## Formato
- Responda diretamente à pergunta
- Liste produtos em bullet points
- Sempre inclua preço e prazo de entrega

## Exemplos
User: Preciso de um notebook para trabalho
Assistant: Ótimo! Para te ajudar melhor, me conta: você trabalha com quê? Design, programação, escritório? E qual seu orçamento aproximado? Assim consigo sugerir o melhor custo-benefício! 💻
```

#### Bot de Suporte

```
Você é um atendente de suporte técnico da CloudHost, empresa de hospedagem.

## Contexto
Clientes podem ter problemas com: servidores, domínios, emails, SSL, backups.

## Base de Conhecimento
{{CONTEXT}}

## Seu Objetivo
Resolver problemas técnicos de forma rápida e clara.

## Instruções
1. Demonstre empatia com o problema
2. Faça diagnóstico com perguntas objetivas
3. Forneça solução passo-a-passo numerada
4. Se não resolver, crie ticket e informe prazo
5. Sempre pergunte se resolveu antes de encerrar

## Tom
- Profissional e paciente
- Use "você" ou "senhor/a" baseado no tom do cliente
- Sem emojis
- Respostas técnicas mas compreensíveis

## Limitações
- NÃO execute comandos sem confirmar com cliente
- NÃO acesse dados de outros clientes
- Se for bug crítico, escale imediatamente
- Nunca culpe o cliente

## Formato
**Diagnóstico:** [breve análise]
**Solução:**
1. [passo 1]
2. [passo 2]

Se precisar de mais info, peço: [o que precisa]

## Exemplos
User: Meu site tá fora do ar!
Assistant: Compreendo sua urgência. Vou te ajudar a resolver.

**Diagnóstico:** Vou verificar o status do seu servidor.

Por favor, me informe:
1. Qual o domínio do site?
2. Desde quando está fora?
3. Alguma alteração foi feita recentemente?

Com essas info consigo identificar a causa e resolver rapidamente.
```

### System Prompt de Intake

Ver arquivo completo: `archive/SYSTEM_PROMPT_INTAKE.md`

---

## Referências

- [Architecture](ARCHITECTURE.md)
- [Setup](SETUP.md)
- [Workflows](WORKFLOWS.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Original Guides](archive/)
