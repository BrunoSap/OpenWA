# LLM Architecture Pattern - OpenWA

**Created:** 2026-08-27  
**Status:** Documented architectural decision  
**Pattern:** n8n-First LLM Orchestration

---

## Executive Summary

OpenWA uses **n8n-first LLM orchestration** instead of direct API calls in the application layer. This architectural decision prioritizes:
- **Business user control** over prompts and workflows
- **Cost visibility** through n8n execution logs
- **Rapid iteration** without code deployments
- **Multi-provider flexibility** (Groq, OpenAI, future providers)

---

## Architecture Pattern

### Traditional Direct API Approach (Not Used)

```
┌─────────────────┐
│  NestJS App     │
│                 │
│  ┌───────────┐  │
│  │ LLM       │  │──────┐
│  │ Service   │  │      │ Direct API calls
│  └───────────┘  │      │ (hardcoded prompts)
│                 │      │
└─────────────────┘      │
                         ▼
                 ┌───────────────┐
                 │  LLM Provider │
                 │  (Groq/OpenAI)│
                 └───────────────┘
```

**Drawbacks:**
- Prompt changes require code deployment
- No business user visibility into LLM behavior
- Hard to A/B test prompts
- Cost tracking requires custom instrumentation

### OpenWA n8n-First Approach (Implemented)

```
┌─────────────────┐
│  NestJS App     │
│                 │
│  ┌───────────┐  │
│  │ Message   │  │──────┐
│  │ Service   │  │      │ HTTP webhook
│  └───────────┘  │      │ (just forwards)
│                 │      │
└─────────────────┘      │
                         ▼
                 ┌───────────────┐
                 │      n8n      │◄──── Business users edit
                 │               │      prompts/workflows
                 │  ┌─────────┐  │
                 │  │ Workflow│  │
                 │  │ Engine  │  │
                 │  └─────────┘  │
                 │       │       │
                 └───────┼───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │  LLM Provider │
                 │  (Groq/OpenAI)│
                 └───────────────┘
```

**Benefits:**
- Prompts managed in n8n UI (no deployment)
- Execution logs show cost/latency per call
- A/B testing via workflow variants
- Business users can iterate independently
- Provider switching without code changes

---

## Implementation Details

### 1. Message Service (NestJS)

**Role:** Forwards messages to n8n, receives responses

**File:** `src/modules/message/message.service.ts`

```typescript
// Simplified example
async sendToLLM(message: string, sessionId: string) {
  // Forward to n8n webhook
  const response = await this.httpService.post(
    'http://n8n:5678/webhook/whatsapp-llm',
    { message, sessionId }
  );
  return response.data.reply;
}
```

**Key Points:**
- No LLM API keys in NestJS app
- No prompts hardcoded in application
- n8n handles retry logic, fallbacks, provider selection

### 2. n8n Workflows

**Role:** Orchestrate LLM calls, RAG, prompt engineering

**Files:** `n8n-workflows/*.json`

**Example Workflows:**
1. `Whatsapp-Intake-Bot.json` — qualification prompts
2. `WhatsApp-LLM-Chain.json` — multi-turn conversation
3. `WhatsApp-RAG-Search.json` — knowledge base + LLM
4. `WhatsApp-Audio-Transcription.json` — STT + LLM
5. `WhatsApp-Vision-Analysis.json` — image + LLM

**Workflow Structure:**
```
Webhook Trigger
  ↓
RAG Search (if needed)
  ↓
Prompt Template
  ↓
LLM Call (Groq primary, OpenAI fallback)
  ↓
Response Formatter
  ↓
Webhook Response
```

### 3. LLM Service Stub (NestJS)

**Role:** Helper for analytics events, future direct API option

**File:** `src/modules/llm/llm.service.ts`

**Current Implementation:**
- Emits `llm.called` events for analytics (Phase 6)
- Helper: `emitLLMCalledEvent(provider, model, tokens, cost)`
- **Not used for actual LLM calls** (n8n handles that)

**Future Option:**
- Could implement direct API calls if needed
- Use case: ultra-low-latency scenarios (<200ms requirement)
- Pattern already exists in test helpers (`test/helpers/vision-analyze.ts`, `test/helpers/audio-stt-groq-whisper.ts`)

---

## Trade-Offs

### Advantages of n8n-First

✅ **Business Agility**
- Marketing team can A/B test prompts without engineering
- Prompt iterations happen in minutes, not days

✅ **Cost Visibility**
- n8n execution logs show exact tokens/cost per call
- Easy to identify expensive workflows
- No custom instrumentation needed

✅ **Multi-Provider Flexibility**
- Switch Groq → OpenAI via n8n UI toggle
- Add new providers (Anthropic, Cohere) without code changes
- Fallback chains configured visually

✅ **Separation of Concerns**
- NestJS: session management, storage, webhooks
- n8n: AI orchestration, prompts, provider logic
- Clear boundaries

### Disadvantages

⚠️ **Latency Overhead**
- HTTP round-trip NestJS → n8n → LLM adds ~50-100ms
- Mitigation: acceptable for conversational use case (target <3s total)

⚠️ **Operational Complexity**
- Two services to deploy/monitor (NestJS + n8n)
- Mitigation: both containerized, single Docker Compose

⚠️ **Testing Complexity**
- E2E tests must mock n8n webhooks OR run real n8n
- Mitigation: test helpers provide direct API access (`vision-analyze.ts`, `audio-stt-groq-whisper.ts`)

---

## When to Use Direct API

**Consider direct LLM service layer if:**
1. **Ultra-low latency required** (<200ms end-to-end)
   - Example: real-time voice AI, live chat support
2. **High request volume** (>1M calls/day)
   - n8n webhook overhead becomes bottleneck
3. **Deterministic retry logic needed**
   - n8n retry is visual, code-based retry is more predictable

**OpenWA Current Status:**
- Conversational WhatsApp (target <3s) ✅ n8n-first is sufficient
- No ultra-low-latency requirement yet
- n8n pattern working well in production

---

## Test Strategy

### E2E Tests

**Challenge:** n8n orchestration makes E2E tests harder

**Solution:** Test helpers with direct API access

**Files:**
- `test/helpers/audio-stt-groq-whisper.ts` — direct Groq Whisper API
- `test/helpers/vision-analyze.ts` — direct OpenAI Vision API
- `test/rag-*.e2e-spec.ts` — mocks n8n RAG workflow

**Pattern:**
```typescript
// E2E test bypasses n8n for speed
const result = await transcribeOgg(audioBuffer);
expect(result.text).toContain('expected phrase');
```

**Production:** n8n handles same call via workflow

### Unit Tests

**LLM Service:**
- `src/modules/llm/llm.service.spec.ts` tests event emission only
- No actual API calls mocked (n8n responsibility)

---

## Migration Path (If Needed)

If direct API becomes necessary:

1. **Implement `LLMService.callLLM(prompt, options)`**
   - Reuse test helper patterns
   - Add retry logic, fallback chains
   - Instrument with analytics events

2. **Add feature flag `LLM_MODE`**
   - `n8n` (default, current behavior)
   - `direct` (new code path)

3. **Migrate workflows incrementally**
   - Start with high-volume, low-complexity calls
   - Keep n8n for complex orchestration (RAG + multi-step)

4. **Preserve n8n for business users**
   - Marketing prompts stay in n8n
   - Engineering optimizations go direct

---

## Related Documentation

- `docs/WORKFLOWS.md` — n8n workflow catalog
- `docs/GUIDES.md` — LLM integration guide (L480-534)
- `n8n-workflows/*.json` — 10 production workflows
- `.planning/phases/06-analytics-dashboard/06-02-SUMMARY.md` — LLM cost tracking

---

## Decision Log

**Date:** 2026-08-27  
**Decision:** Document n8n-first as intentional architectural pattern (not technical debt)  
**Rationale:** Business agility and cost visibility outweigh latency overhead for conversational WhatsApp use case  
**Alternatives Considered:** Direct API (rejected for this phase)  
**Review Trigger:** If latency requirement drops below 500ms or volume exceeds 1M/day
