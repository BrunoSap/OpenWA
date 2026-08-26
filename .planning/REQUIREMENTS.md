# Requirements: OpenWA Platform

**Defined:** 2026-08-26
**Core Value:** Plataforma completa de automação WhatsApp com IA multimodal, validada end-to-end

## v1 Requirements

Requirements para completar e validar os fluxos E2E principais. Cada requirement mapeia para fases do roadmap.

### Bot de Intake (E2E-7)

- [x] **INTAKE-01**: Sistema cria sessão de intake quando cliente inicia conversa
- [x] **INTAKE-02**: Bot coleta dados estruturados via fluxo conversacional (nome, telefone, email, demanda, urgência)
- [x] **INTAKE-03**: Dados salvos em `intake_staging.*` com timestamps e metadata
- [x] **INTAKE-04**: Lead qualificado exportável via webhook ou API REST
- [x] **INTAKE-05**: Workflow n8n orquestra fluxo completo e é importável
- [x] **INTAKE-06**: Controller e service implementados para gerenciar intake sessions
- [ ] **INTAKE-07**: Teste E2E valida ciclo: WhatsApp → coleta → banco → export

### Validação LLM+RAG (E2E-3)

- [ ] **RAG-01**: Teste E2E simula mensagem WhatsApp com pergunta sobre KB
- [ ] **RAG-02**: Teste valida que busca pgvector retorna documentos relevantes
- [ ] **RAG-03**: Teste valida que LLM usa contexto da KB na resposta
- [ ] **RAG-04**: Teste cobre caso: busca exata com match 100%
- [ ] **RAG-05**: Teste cobre caso: busca semântica fuzzy
- [ ] **RAG-06**: Teste cobre caso: sem match, fallback genérico
- [ ] **RAG-07**: Latência end-to-end medida e <3s no teste
- [ ] **RAG-08**: Taxa de acerto RAG medida (precisão@k)
- [ ] **RAG-09**: Testes rodam automaticamente no CI/CD

### Validação Áudio STT (E2E-4)

- [ ] **STT-01**: Teste E2E simula áudio WhatsApp (formato .ogg)
- [ ] **STT-02**: Teste valida download do áudio do webhook
- [ ] **STT-03**: Teste valida transcrição via Groq Whisper
- [ ] **STT-04**: Teste valida que LLM processa transcrição e responde
- [ ] **STT-05**: Teste cobre caso: áudio limpo em português
- [ ] **STT-06**: Teste cobre caso: áudio limpo em inglês
- [ ] **STT-07**: Teste cobre caso: áudio com ruído de fundo
- [ ] **STT-08**: Acurácia transcrição medida (>90% em áudio limpo)
- [ ] **STT-09**: Latência medida (<5s para 10s de áudio)
- [ ] **STT-10**: Fallback quando transcrição falha (timeout, erro API)

### Implementação Vision (E2E-5)

- [ ] **VISION-01**: Workflow n8n processa mensagem de imagem do WhatsApp
- [ ] **VISION-02**: Workflow baixa imagem via media controller
- [ ] **VISION-03**: Workflow envia imagem para GPT-4 Vision API
- [ ] **VISION-04**: Workflow compõe prompt com análise da imagem + contexto
- [ ] **VISION-05**: Workflow envia resposta contextualizada via OpenWA
- [ ] **VISION-06**: Teste E2E simula imagem de produto
- [ ] **VISION-07**: Teste E2E simula documento/screenshot
- [ ] **VISION-08**: Teste E2E simula foto de ambiente
- [ ] **VISION-09**: Teste valida descrição correta do conteúdo da imagem
- [ ] **VISION-10**: Workflow é importável e configurável (chaves API, prompts)
- [ ] **VISION-11**: Documentação inclui custos GPT-4 Vision e rate limits

## v2 Requirements

Deferred para milestones futuros. Identificados na reanálise mas fora do escopo atual.

### Telefonia (Fase 6 Futura)

- **TEL-01**: Integração com provedor VoIP (VibeVoice ou similar)
- **TEL-02**: Chamadas de voz com STT em tempo real
- **TEL-03**: Síntese de voz (TTS) para respostas do bot
- **TEL-04**: Workflow n8n para orquestrar chamadas
- **TEL-05**: Teste E2E chamada → transcrição → LLM → TTS → áudio resposta

### Long-term Memory

- **MEM-01**: Persistir contexto além de Redis (PostgreSQL ou vector DB)
- **MEM-02**: Recall de conversas antigas (>30 dias)
- **MEM-03**: Sumarização automática de histórico longo

### Dashboard Analytics

- **DASH-01**: Métricas: taxa conversão bot→humano
- **DASH-02**: Métricas: latência LLM (p50, p95, p99)
- **DASH-03**: Métricas: top intents detectados
- **DASH-04**: Métricas: funil de intake (abandono por etapa)
- **DASH-05**: Métricas: uso por sessão (mensagens/dia)

### Multi-tenant

- **TENANT-01**: API keys scoped por tenant
- **TENANT-02**: Rate limiting por tenant
- **TENANT-03**: Isolamento de recursos (sessions, KB, memory)
- **TENANT-04**: Billing/usage tracking por tenant

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| WhatsApp Business API oficial | Open-WA usa web scraping (mais flexível para MVP) |
| Real-time chat UI | OpenWA é API/backend, UI é responsabilidade do cliente |
| OAuth login (Google, Facebook) | API key suficiente para v1 |
| Mobile app nativo | Foco em API REST, clients são externos |
| Video chamadas | Complexidade alta, defer para v3+ |
| Blockchain/Web3 | Não relevante para automação WhatsApp |

## Traceability

Mapeamento requirements → fases do roadmap. Atualizado conforme execução.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INTAKE-01 | Phase 1 | Complete |
| INTAKE-02 | Phase 1 | Complete |
| INTAKE-03 | Phase 1 | Complete |
| INTAKE-04 | Phase 1 | Complete |
| INTAKE-05 | Phase 1 | Complete |
| INTAKE-06 | Phase 1 | Complete |
| INTAKE-07 | Phase 1 | Pending |
| RAG-01 | Phase 2 | Pending |
| RAG-02 | Phase 2 | Pending |
| RAG-03 | Phase 2 | Pending |
| RAG-04 | Phase 2 | Pending |
| RAG-05 | Phase 2 | Pending |
| RAG-06 | Phase 2 | Pending |
| RAG-07 | Phase 2 | Pending |
| RAG-08 | Phase 2 | Pending |
| RAG-09 | Phase 2 | Pending |
| STT-01 | Phase 3 | Pending |
| STT-02 | Phase 3 | Pending |
| STT-03 | Phase 3 | Pending |
| STT-04 | Phase 3 | Pending |
| STT-05 | Phase 3 | Pending |
| STT-06 | Phase 3 | Pending |
| STT-07 | Phase 3 | Pending |
| STT-08 | Phase 3 | Pending |
| STT-09 | Phase 3 | Pending |
| STT-10 | Phase 3 | Pending |
| VISION-01 | Phase 4 | Pending |
| VISION-02 | Phase 4 | Pending |
| VISION-03 | Phase 4 | Pending |
| VISION-04 | Phase 4 | Pending |
| VISION-05 | Phase 4 | Pending |
| VISION-06 | Phase 4 | Pending |
| VISION-07 | Phase 4 | Pending |
| VISION-08 | Phase 4 | Pending |
| VISION-09 | Phase 4 | Pending |
| VISION-10 | Phase 4 | Pending |
| VISION-11 | Phase 4 | Pending |

**Coverage:**

- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0 ✓

**Phase breakdown:**

- Phase 1 (Bot Intake): 7 requirements
- Phase 2 (Validação LLM+RAG): 9 requirements
- Phase 3 (Validação Áudio STT): 10 requirements
- Phase 4 (Implementação Vision): 11 requirements

---
*Requirements defined: 2026-08-26 após reanálise de objetivos E2E*
*Last updated: 2026-08-26 after initial definition*
