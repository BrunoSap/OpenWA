---
phase: 01-bot-de-intake-e2e
plan: 03
subsystem: automation
tags: [n8n, workflow, intake, httpRequest, webhook, jest, e2e, env-secrets]

# Dependency graph
requires:
  - "Rotas HTTP do modulo intake (Plan 01): POST /api/sessions/:sessionId/intake/messages"
provides:
  - "Workflow n8n importavel Whatsapp-Intake-Bot.json orquestrando ingest -> reply (INTAKE-05)"
  - "Teste de shape (test/intake-workflow-shape.e2e-spec.ts) garantindo JSON valido, rota correta e ausencia de segredos literais"
affects: [01-04]

# Actuals (#2632)
actuals:
  tokens: 2200
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Workflow n8n fino/orquestrador: delega maquina de estado ao backend (fonte unica da verdade), nao reimplementa no n8n"
    - "Segredos e base url apenas por $env (OPENWA_BASE_URL, OPENWA_API_KEY); nenhuma credencial literal no JSON"
    - "Shape test de workflow: readFileSync + JSON.parse + asserts de tipo de node + negative-grep de segredos"

key-files:
  created:
    - Whatsapp-Intake-Bot.json
    - test/intake-workflow-shape.e2e-spec.ts
  modified: []

key-decisions:
  - "Node httpRequest usa specifyBody=json + jsonBody via JSON.stringify({chatId,text}) para body limpo"
  - "sessionId resolvido do payload com fallback para $env.OPENWA_SESSION_ID e depois 'default' (workflow configuravel sem hardcode)"
  - "Node '3. Preparar Reply' usa reply do backend quando presente (Plan 02) e ack padrao como fallback ate o fluxo conversacional popular reply"
  - "Reenvio via POST /api/sessions/:sessionId/messages/send-text, mesmo padrao do Whatsapp-Unified-Bot-FIXED.json"

patterns-established:
  - "Workflow n8n como JSON no root do repo (mesmo local dos demais workflows)"
  - "Header x-api-key referenciando $env, validado por negative-grep no shape test"

requirements-completed: [INTAKE-05]

coverage:
  - id: D1
    description: "Existe workflow n8n importavel que orquestra o fluxo de intake (INTAKE-05)"
    requirement: INTAKE-05
    verification:
      - kind: e2e
        ref: "test/intake-workflow-shape.e2e-spec.ts#parses as valid JSON with name, non-empty nodes array and connections object"
        status: pass
      - kind: e2e
        ref: "test/intake-workflow-shape.e2e-spec.ts#has at least one webhook entry node"
        status: pass
    human_judgment: false
  - id: D2
    description: "O node httpRequest delega ao backend /intake/messages com header de API key via $env"
    requirement: INTAKE-05
    verification:
      - kind: e2e
        ref: "test/intake-workflow-shape.e2e-spec.ts#has an httpRequest node whose parameters reference the /intake/messages route"
        status: pass
      - kind: e2e
        ref: "test/intake-workflow-shape.e2e-spec.ts#references OpenWA base url and api key via $env, never as literals"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nenhum segredo literal no workflow (guarda T-03-01)"
    requirement: INTAKE-05
    verification:
      - kind: e2e
        ref: "test/intake-workflow-shape.e2e-spec.ts#contains NO literal secrets — only $env references (guards T-03-01)"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 03: Workflow n8n do Bot de Intake Summary

**Workflow n8n `Whatsapp-Intake-Bot.json` importavel e fino/orquestrador — webhook recebe a mensagem WhatsApp do OpenWA, delega a coleta estruturada a API `/intake/messages` (fonte unica da verdade, Plan 01) via `$env`, e reenvia a reply ao cliente; teste de shape verde garante JSON valido, rota correta e ausencia de segredos literais.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-08-26
- **Completed:** 2026-08-26
- **Tasks:** 2
- **Files:** 2 criados

## Accomplishments
- `Whatsapp-Intake-Bot.json` (5 nodes) com as chaves top-level `name`, `nodes`, `connections`, `active`(false), `settings`, `meta`, `tags` — mesma forma dos workflows existentes, importavel no n8n
- Node `webhook` (path `intake`) extrai `chatId`/`text`/`sessionId` do evento OpenWA (formatos `{body:{data}}` ou plano)
- Node `httpRequest` POST para `={{$env.OPENWA_BASE_URL}}/api/sessions/{{$json.sessionId}}/intake/messages` com body `{chatId,text}` e header `x-api-key` via `={{$env.OPENWA_API_KEY}}` (rota OPERATOR do Plan 01)
- Node `httpRequest` de reenvio da `reply` via `/messages/send-text` (mesmo padrao do Whatsapp-Unified-Bot-FIXED.json)
- `connections` ligando webhook -> extrair -> ingest -> preparar reply -> enviar
- Teste de shape `test/intake-workflow-shape.e2e-spec.ts` (5/5 verde): valida JSON, node webhook, httpRequest com `/intake/messages`, refs `$env` e negative-grep de segredos

## Task Commits

1. **Task 1: Workflow Whatsapp-Intake-Bot.json orquestrando ingest -> reply** - `b2edd404` (feat)
2. **Task 2: Teste de shape do workflow** - `82c9f398` (test)

## Files Created/Modified
- `Whatsapp-Intake-Bot.json` - Workflow n8n de intake (criado)
- `test/intake-workflow-shape.e2e-spec.ts` - Teste de shape (criado)

## Decisions Made
- Body dos httpRequest via `specifyBody=json` + `jsonBody` com `JSON.stringify` para corpo JSON limpo e determinístico
- `sessionId` resolvido do payload com fallback `$env.OPENWA_SESSION_ID` -> `'default'`, mantendo o workflow configuravel sem hardcode
- Node de reply usa `reply` do backend quando presente e um ack padrao como fallback ate o fluxo conversacional (Plan 02) popular `reply`

## Deviations from Plan

None - plano executado exatamente como escrito.

## Threat Model Compliance
- **T-03-01 (Information Disclosure — segredo hardcoded):** mitigado. Base URL e API key apenas por `$env`; teste de shape faz negative-grep de padroes de chave (`sk-`, `gsk_`, `Bearer <token>`) e exige `$env` em todo header `x-api-key`.
- **T-03-02 (Spoofing — webhook n8n aberto):** aceito no escopo do JSON; autenticacao do webhook e config de deploy sao tratados no Plan 04.

## Known Stubs
- Node `3. Preparar Reply` usa um ack padrao como fallback enquanto o backend nao devolve o campo `reply` — **intencional**. A `reply` conversacional estruturada e o fluxo do **Plan 02** (INTAKE-02); o workflow ja consome `apiResponse.reply` quando presente, sem alteracao futura no JSON necessaria. Nao bloqueia o objetivo (INTAKE-05: workflow importavel que orquestra o intake).

## User Setup Required
- Configurar no n8n (Settings > Environments) as variaveis: `OPENWA_BASE_URL` (ex.: `http://openwa-api:2785`), `OPENWA_API_KEY` (chave OPERATOR/ADMIN do OpenWA) e opcionalmente `OPENWA_SESSION_ID`.
- Nota operacional de dev: rodar sob Node 22 (`.nvmrc`) para os testes e2e.

## Next Phase Readiness
- Plan 01-04 (Wave 3) pode prosseguir: o workflow importavel existe e delega ao backend de intake ja provado (Plan 01)

---
*Phase: 01-bot-de-intake-e2e*
*Completed: 2026-08-26*

## Self-Check: PASSED
- `Whatsapp-Intake-Bot.json` existe no disco (5 nodes, shape valido)
- `test/intake-workflow-shape.e2e-spec.ts` existe e passa (5/5)
- Commits `b2edd404` e `82c9f398` no historico
