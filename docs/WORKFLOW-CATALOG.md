# n8n Workflow Catalog - OpenWA

**Last Updated:** 2026-08-27  
**Total Workflows:** 18  
**Status:** Production-ready, importable

---

## Quick Reference

| Workflow | Purpose | Status | Documented |
|----------|---------|--------|------------|
| **Whatsapp-Intake-Bot.json** | Lead qualification bot | ✅ Production | ✅ docs/WORKFLOWS.md |
| **Whatsapp-Unified-Bot.json** | Multi-modal unified handler | ✅ Production | ⚠️ Partial |
| **Whatsapp-LLM-Bot-MELHORADO.json** | Enhanced LLM conversation | ✅ Production | ❌ Undocumented |
| **Whatsapp-Unified-Multimodal.json** | Text + audio + image | 🔄 Superseded | ⚠️ See COMPLETE |
| **Whatsapp-Unified-Multimodal-WORKING.json** | Stable multimodal v1 | 🔄 Superseded | ⚠️ See COMPLETE |
| **Whatsapp-Unified-Multimodal-FIXED-Audio.json** | Audio fix iteration | 🔄 Superseded | ⚠️ See COMPLETE |
| **Whatsapp-Unified-Multimodal-FINAL.json** | Final multimodal v2 | 🔄 Superseded | ⚠️ See COMPLETE |
| **Whatsapp-Unified-Multimodal-COMPLETE.json** | Complete multimodal | ✅ Production | ✅ This doc |
| **Whatsapp-Unified-Multimodal-ULTRA-COMPLETE.json** | Latest multimodal | ✅ Production | ✅ This doc |
| **Whatsapp-Unified-Bot-FIXED.json** | Bug fix version | 🔄 Superseded | ⚠️ See Unified |

**Note:** Workflows with versioning (WORKING, FIXED, FINAL, COMPLETE) represent iteration history. Use **ULTRA-COMPLETE** or **COMPLETE** for production.

---

## Production Workflows

### 1. Whatsapp-Intake-Bot.json

**Purpose:** Automated lead qualification via structured conversation

**Flow:**
1. Customer initiates chat
2. Bot asks: name, company, need, urgency
3. Data saved to `intake_staging.leads`
4. Qualified lead exported via webhook

**Triggers:**
- Webhook: `/webhook/whatsapp-intake`
- Keywords: "cadastro", "interesse", "orçamento"

**Variables:**
- `INTAKE_WEBHOOK_URL` — CRM export endpoint
- `URGENCY_THRESHOLD` — auto-escalate if "critical"

**Documentation:** See `docs/WORKFLOWS.md` § "Bot de Intake"

**Test Coverage:** `test/intake-e2e-cycle.e2e-spec.ts`

---

### 2. Whatsapp-Unified-Multimodal-ULTRA-COMPLETE.json

**Purpose:** Complete multimodal handler (text + audio + image + video)

**Flow:**
```
Incoming Message
  ↓
Media Type Detection
  ├─ Text → LLM Chain → RAG Search
  ├─ Audio → Groq Whisper STT → LLM
  ├─ Image → OpenAI Vision → LLM
  └─ Video → Extract frames → Vision → LLM
       ↓
Context Enrichment (Memory)
  ↓
Response Generation
  ↓
WhatsApp Reply
```

**Capabilities:**
- Text: RAG-powered knowledge base search
- Audio: Groq Whisper (PT/EN), fallback OpenAI
- Image: GPT-4 Vision (products, documents, scenes)
- Video: Frame extraction + Vision analysis
- Memory: Last 10 messages context

**Variables:**
- `GROQ_API_KEY` — Whisper STT
- `OPENAI_API_KEY` — Vision + LLM fallback
- `RAG_THRESHOLD` — semantic similarity cutoff (0.7)
- `MEMORY_WINDOW` — message history depth (10)

**Cost:**
- Text: $0 (Groq free)
- Audio: $0 (Groq Whisper free)
- Image: $0.001/image (gpt-4o-mini detail=low)
- Video: $0.003/frame × N frames

**Documentation:** See this doc § "Multimodal Architecture"

**Test Coverage:** 
- `test/audio-stt-*.e2e-spec.ts` (16 tests)
- `test/vision-*.e2e-spec.ts` (17 tests)
- `test/rag-*.e2e-spec.ts` (6 tests)

---

### 3. Whatsapp-LLM-Bot-MELHORADO.json

**Purpose:** Enhanced conversational LLM with context memory

**Flow:**
1. Incoming message
2. Load conversation history (Redis)
3. RAG search if question detected
4. LLM call with context
5. Save response to history
6. Reply to WhatsApp

**Features:**
- Multi-turn conversation memory
- Intent detection (question vs statement)
- Conditional RAG (only for questions)
- Groq primary, OpenAI fallback

**Variables:**
- `CONTEXT_MESSAGES` — history depth (5)
- `RAG_ENABLED` — toggle knowledge base (true)
- `FALLBACK_MODEL` — OpenAI model (gpt-4o-mini)

**Documentation:** See `docs/LLM-ARCHITECTURE.md`

---

## Workflow Architecture Patterns

### Pattern 1: Media Type Router

Used in: `Whatsapp-Unified-Multimodal-ULTRA-COMPLETE.json`

```
┌─────────────────┐
│ Incoming Msg    │
└────────┬────────┘
         │
    ┌────▼─────┐
    │ Switch   │
    │ (media)  │
    └─┬─┬─┬─┬──┘
      │ │ │ │
  ┌───┘ │ │ └───┐
  │     │ │     │
Text  Audio Image Video
  │     │ │     │
  └─────┴─┴─────┘
         │
    ┌────▼─────┐
    │  Merge   │
    └──────────┘
```

**Benefits:**
- Single webhook for all media types
- Parallel processing where possible
- Unified response format

### Pattern 2: RAG + LLM Chain

Used in: Most text-based workflows

```
Question
  ↓
Embedding (OpenAI)
  ↓
pgvector Search (top 5)
  ↓
Similarity Filter (>0.7)
  ↓
Context Builder
  ↓
LLM (Groq/OpenAI)
  ↓
Response
```

**Cost:** ~$0.0001/question (embedding + LLM)

### Pattern 3: Groq-First Fallback

Used in: Audio, LLM calls

```
Groq API
  ├─ Success → Return
  └─ Error → OpenAI API
              ├─ Success → Return
              └─ Error → Fallback message
```

**Rationale:** Groq free tier, OpenAI paid fallback

---

## Deprecated Workflows (Keep for History)

### Iteration Versions

- `Whatsapp-Unified-Multimodal.json` — Initial multimodal (superseded)
- `Whatsapp-Unified-Multimodal-WORKING.json` — Stable v1 (superseded)
- `Whatsapp-Unified-Multimodal-FIXED-Audio.json` — Audio bug fix (superseded)
- `Whatsapp-Unified-Multimodal-FINAL.json` — v2 (superseded by COMPLETE)
- `Whatsapp-Unified-Bot-FIXED.json` — Bug fix (superseded by Unified)

**Why Keep:**
- Rollback capability if ULTRA-COMPLETE breaks
- Historical reference for debugging
- Documentation of iteration process

**Storage:** Keep in repo root, not in production n8n

---

## Import Instructions

### 1. Via n8n UI

1. Open n8n: `http://localhost:5678`
2. Click **Import from File**
3. Select workflow JSON
4. Configure credentials:
   - `GROQ_API_KEY`
   - `OPENAI_API_KEY`
   - `POSTGRES_CONNECTION`
5. Activate workflow

### 2. Via CLI (Bulk Import)

```bash
for workflow in *.json; do
  curl -X POST http://localhost:5678/rest/workflows/import \
    -H "Content-Type: application/json" \
    -d @"$workflow"
done
```

### 3. Via Docker Volume Mount

```yaml
# docker-compose.yml
services:
  n8n:
    volumes:
      - ./:/workflows:ro
```

Then import via UI.

---

## Configuration Requirements

### Credentials

All workflows require:

```bash
# .env
GROQ_API_KEY=gsk_xxx
OPENAI_API_KEY=sk-xxx
POSTGRES_HOST=postgres
POSTGRES_DB=openwa
POSTGRES_USER=openwa
POSTGRES_PASSWORD=xxx
REDIS_URL=redis://redis:6379
```

### n8n Environment

```yaml
# docker-compose.yml
environment:
  - N8N_BASIC_AUTH_ACTIVE=true
  - N8N_BASIC_AUTH_USER=admin
  - N8N_BASIC_AUTH_PASSWORD=xxx
  - WEBHOOK_URL=https://your-domain.com
  - N8N_ENCRYPTION_KEY=xxx
```

---

## Testing Workflows

### Manual Testing

1. Use n8n's "Test Workflow" button
2. Send test webhook:

```bash
curl -X POST http://localhost:5678/webhook/whatsapp-intake \
  -H "Content-Type: application/json" \
  -d '{
    "from": "5511999999999",
    "body": "Quero um orçamento"
  }'
```

### Automated E2E Tests

Tests mock n8n responses:

```typescript
// test/intake-e2e-cycle.e2e-spec.ts
const response = await request(app.getHttpServer())
  .post('/api/messages/ingest')
  .send({ from: '5511999999999', body: 'cadastro' });
  
expect(response.status).toBe(200);
```

See `test/` for full suite.

---

## Monitoring & Logs

### n8n Execution Logs

View in n8n UI:
1. **Executions** tab
2. Filter by workflow
3. View: input, output, duration, errors

### Cost Tracking

Phase 6 Analytics tracks:
- LLM calls per workflow
- Cost per execution
- Latency p50/p95/p99

Query via API:

```bash
curl -H "X-API-Key: $OPERATOR_KEY" \
  http://localhost:3000/api/analytics/cost
```

---

## Workflow Development Guidelines

### Naming Convention

```
Whatsapp-<Feature>-<Variant>.json

Feature: Intake, LLM, Unified, Multimodal
Variant: (blank), FIXED, COMPLETE, ULTRA-COMPLETE
```

### Version Control

1. Create new file for iterations (append suffix)
2. Keep old versions for rollback
3. Document breaking changes in this catalog
4. Update "Production Workflows" table

### Testing Before Commit

1. ✅ Test workflow executes without errors
2. ✅ Credentials work in n8n
3. ✅ Output format matches expected schema
4. ✅ Error handling works (simulate API failure)
5. ✅ Export JSON (pretty-printed, 2-space indent)

---

## Migration from Legacy Workflows

If using older workflows:

1. **Backup current workflows** via n8n UI export
2. **Import new workflow** alongside old (don't replace)
3. **Test new workflow** with real traffic (A/B)
4. **Gradually migrate** webhook URLs
5. **Deactivate old workflow** after 7 days
6. **Archive old JSON** to `n8n-workflows/archive/`

---

## Related Documentation

- `docs/WORKFLOWS.md` — User-facing workflow guide
- `docs/LLM-ARCHITECTURE.md` — n8n-first pattern rationale
- `docs/GUIDES.md` — Implementation guides per feature
- `.planning/phases/01-bot-de-intake-e2e/` — Intake workflow plans

---

## Support

**Issues:** Report via GitHub Issues with:
- Workflow name
- n8n execution ID
- Error message
- Input payload (sanitized)

**Updates:** Check this catalog after each Phase completion
