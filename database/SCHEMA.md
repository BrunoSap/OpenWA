# Database Schema Documentation

## Overview
4 schemas, 14 tables, 50+ indexes, 4 helper functions

## Schemas

### knowledge (Conversation Management)
- **conversations** - All WhatsApp messages with VECTOR(1536) embeddings
- **clients** - Client aggregation with metadata
- **documents** - Uploaded files with OCR extraction
- **faq** - Frequent questions with embeddings
- **session_context** - Active conversation state

**Key Indexes:**
- `idx_conversations_embedding` - IVFFlat (100 lists) for cosine similarity
- `idx_faq_embedding` - IVFFlat (10 lists) for FAQ matching

### intake_staging (Lead Management)
- **leads** - Local lead storage before LawApp sync
- **lead_documents** - Document references
- **lawapp_sync_queue** - Async sync queue with retry
- **document_reminders** - Progressive reminder tracking

### telegram (Command Center)
- **lead_topics** - Lead → Telegram thread mapping
- **client_tasks** - Team → WhatsApp task queue
- **topic_context** - Persistent discussion context
- **user_permissions** - Access control

### bot_config (Configuration)
- **auto_answer_rules** - Auto-answer vs escalate policies
- **cron_jobs** - Cron job configuration

## Helper Functions

1. **knowledge.find_similar_faq(embedding, threshold, limit)**  
   Returns: `(faq_id, question, answer, similarity)`

2. **knowledge.find_similar_conversations(embedding, exclude_chat, threshold, limit)**  
   Returns: `(conversation_id, chat_id, message_text, timestamp, similarity)`

3. **knowledge.get_client_summary(chat_id)**  
   Returns: JSON with client data, recent messages, documents, lead data

4. **knowledge.calculate_fees(backpay, monthly_benefit, uads)**  
   Returns: JSON with fee breakdown

## Performance

- FAQ lookup: < 10ms (Layer 1)
- RAG search: < 50ms (Layer 2)
- Supports 36.5k conversations/year
- IVFFlat optimal for < 100k rows

## Seed Data

- 4 auto_answer_rules (honorarios escalated)
- 4 cron_jobs (12h, 24h, 1h, 7d)
- 5 FAQ entries (embeddings generated in Phase 2)
