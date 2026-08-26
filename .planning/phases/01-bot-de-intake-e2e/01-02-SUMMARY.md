---
phase: 01-bot-de-intake-e2e
plan: 02
subsystem: api
tags: [nestjs, typeorm, intake, conversational-flow, pure-function, tdd, webhook, ssrf, jest, supertest]

# Dependency graph
requires:
  - "IntakeService.ingestMessage (upsert idempotente por chat_id) do Plan 01-01"
  - "Entidade IntakeLead cross-dialect na conexao 'data' (Plan 01-01)"
  - "postWebhookPayload (POST SSRF-guarded) de src/modules/webhook/utils/deliver-once.ts"
provides:
  - "Motor conversacional determinístico advanceIntake (pure function) em src/modules/intake/intake-flow.ts"
  - "Coleta estruturada dos 5 campos: nome -> telefone -> email -> demanda -> urgencia (INTAKE-02)"
  - "Lead marcado 'completed' com intake_completed_at ao concluir os 5 campos"
  - "Export do lead qualificado via API REST (GET) e webhook (POST /leads/:chatId/export) (INTAKE-04)"
  - "Guard de export: lead incompleto retorna 409 (ConflictException)"
affects: [01-04]

# Actuals (#2632)
actuals:
  tokens: 12000
  tasks: 3
  commits: 6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "State machine como pure function (sem I/O) — step = primeiro campo vazio na ordem canonica"
    - "Validacao de dominio (urgencyLevel) na camada de fluxo, rejeitando input fora do dominio (T-02-02)"
    - "Reuso do cliente HTTP de entrega de webhook (postWebhookPayload) para export — mesmo SSRF guard, sem cliente novo"
    - "Coluna cross-dialect nullable via dateColumnType() (timestamp/text) para intake_completed_at"
    - "Cap de historico (case_data.messages) nas ultimas 50 entradas (T-02-03)"

key-files:
  created:
    - src/modules/intake/intake-flow.ts
    - src/modules/intake/intake-flow.spec.ts
    - src/modules/intake/intake.service.spec.ts
    - test/intake-export.e2e-spec.ts
  modified:
    - src/modules/intake/intake.service.ts
    - src/modules/intake/intake.controller.ts
    - src/modules/intake/entities/intake-lead.entity.ts
    - src/modules/intake/dto/index.ts

key-decisions:
  - "advanceIntake e pure function: determina step pelo primeiro campo vazio, nunca muta o state de entrada — 100% testavel sem boot NestJS/TypeORM"
  - "urgencyLevel normalizado por sinonimos pt-BR (baixa/normal->normal, alta/high->high, critica/urgente/critical->critical); input nao reconhecido NAO grava e repete a pergunta"
  - "Export reusa postWebhookPayload (SSRF-guarded) do modulo webhook — nao cria cliente HTTP novo (T-02-01)"
  - "POST /leads/:chatId/export retorna 200 (HttpCode) com { delivered, status }, nao 201 — a semantica e 'export attempted', nao 'resource created'"
  - "intake_completed_at cross-dialect via dateColumnType(); gravado como ISO string ao concluir"

patterns-established:
  - "Motor de dominio como pure function separado do service (fluxo em intake-flow.ts, persistencia em IntakeService)"
  - "Teste unit do service com Repository fake em memoria (sem boot TypeORM)"
  - "E2E de export com receiver http.createServer local + WEBHOOK_SSRF_PROTECT=false (padrao webhooks.e2e-spec.ts)"

requirements-completed: [INTAKE-02, INTAKE-04]

coverage:
  - id: D1
    description: "O bot coleta dados estruturados via fluxo passo-a-passo: nome, telefone, email, demanda, urgencia (INTAKE-02)"
    requirement: INTAKE-02
    verification:
      - kind: unit
        ref: "src/modules/intake/intake-flow.spec.ts#Test 3: the full sequence name -> phone -> email -> demand -> urgency reaches completed"
        status: pass
      - kind: unit
        ref: "src/modules/intake/intake.service.spec.ts#Test 3: reply at each step matches the next question of the flow"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cada mensagem avanca o estado do lead; ao completar, intake_status vira 'completed'"
    requirement: INTAKE-02
    verification:
      - kind: unit
        ref: "src/modules/intake/intake.service.spec.ts#Test 2: after the five fields the lead becomes completed with intakeCompletedAt set"
        status: pass
    human_judgment: false
  - id: D3
    description: "Um lead qualificado (completed) e exportavel via API REST e via webhook (INTAKE-04)"
    requirement: INTAKE-04
    verification:
      - kind: e2e
        ref: "test/intake-export.e2e-spec.ts#Test 1: GET /leads/:chatId returns the completed lead as JSON"
        status: pass
      - kind: e2e
        ref: "test/intake-export.e2e-spec.ts#Test 2: POST /leads/:chatId/export POSTs the lead payload to the target URL"
        status: pass
    human_judgment: false
  - id: D4
    description: "Export de lead incompleto e bloqueado (409)"
    requirement: INTAKE-04
    verification:
      - kind: e2e
        ref: "test/intake-export.e2e-spec.ts#Test 3: export of an in_progress lead returns 409"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 02: Fluxo Conversacional + Export do Lead Qualificado Summary

**Motor conversacional determinístico (`advanceIntake`, pure function) que coleta os 5 campos passo-a-passo (nome->telefone->email->demanda->urgencia), marca o lead 'completed' com `intake_completed_at`, e expõe o lead qualificado via API REST (GET) e webhook (POST /export com guard 409 para incompleto).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-26
- **Completed:** 2026-08-26
- **Tasks:** 3
- **Files modified:** 8 (4 criados, 4 modificados)

## Accomplishments
- `intake-flow.ts`: `advanceIntake(state, message)` pure function — determina o step pelo primeiro campo vazio na ordem canonica (fullName, phone, email, caseType, urgencyLevel), grava a resposta, valida `urgencyLevel` contra normal/high/critical (sinonimos pt-BR), e retorna `{ nextState, step, reply, completed }`. Nunca muta o `state` de entrada.
- `IntakeService.ingestMessage` refatorado: monta o flow state a partir dos campos do lead, delega ao `advanceIntake`, aplica `nextState` de volta, e ao completar os 5 campos marca `intake_status='completed'` + `intake_completed_at`. Preserva a idempotencia por chat_id e limita `case_data.messages` a 50 entradas (T-02-03).
- Entidade `IntakeLead`: novo campo `intakeCompletedAt` cross-dialect via `dateColumnType()` (nullable).
- `IntakeService.export`: carrega o lead, lanca `ConflictException` se `intakeStatus !== 'completed'`, monta payload JSON e faz POST reusando `postWebhookPayload` (mesmo SSRF guard do modulo webhook, sem cliente novo).
- `IntakeController`: rota `POST /leads/:chatId/export @RequireRole(OPERATOR)` (200, `{ delivered, status }`); rota `POST /messages` agora retorna o lead + `reply/step/completed` (a proxima pergunta do bot).
- `ExportIntakeDto`: `@IsUrl` url + `@IsOptional() @IsObject()` headers (T-02-01).

## Task Commits

TDD (RED test + GREEN impl) por task:

1. **Task 1: Motor advanceIntake (pure function)** - `94d9c55f` (test RED) + `36145726` (feat GREEN)
2. **Task 2: IntakeService usa o motor e marca completed** - `704ad6b3` (test RED) + `9e2e6a73` (feat GREEN)
3. **Task 3: Export do lead qualificado (API + webhook)** - `8b93ccd1` (test RED) + `5f68ba5d` (feat GREEN)

## Files Created/Modified
- `src/modules/intake/intake-flow.ts` - Motor conversacional determinístico (criado)
- `src/modules/intake/intake-flow.spec.ts` - Unit spec do motor, 6 testes (criado)
- `src/modules/intake/intake.service.spec.ts` - Unit spec do service com repo fake, 5 testes (criado)
- `test/intake-export.e2e-spec.ts` - E2E de export (GET + POST + 409), 3 testes (criado)
- `src/modules/intake/intake.service.ts` - ingestMessage delega ao advanceIntake + metodo export (modificado)
- `src/modules/intake/intake.controller.ts` - retorno com reply/step + rota /export (modificado)
- `src/modules/intake/entities/intake-lead.entity.ts` - campo intakeCompletedAt (modificado)
- `src/modules/intake/dto/index.ts` - ExportIntakeDto (modificado)

## Decisions Made
- `advanceIntake` como pure function separada do service: fluxo 100% testavel sem boot; o service e a unica camada com I/O.
- urgencyLevel validado/normalizado no motor; input fora do dominio NAO grava e repete a pergunta (T-02-02).
- Export reusa `postWebhookPayload` (SSRF-guarded) — sem cliente HTTP duplicado (T-02-01).
- `POST /export` retorna 200 (`@HttpCode(200)`) com `{ delivered, status }` — semantica de "export attempted", nao "created".
- `intake_completed_at` cross-dialect via `dateColumnType()`, gravado como ISO string.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regex de strip de acentos fragil no source**
- **Found during:** Task 1
- **Issue:** a classe de char de diacriticos combinantes ficava como caracteres combinantes crus no arquivo (fragil a re-encode/edicao)
- **Fix:** substituido por escapes Unicode explicitos `/[̀-ͯ]/g` em `normalizeUrgency`
- **Files modified:** src/modules/intake/intake-flow.ts
- **Verification:** intake-flow.spec.ts passa (6/6), incluindo normalizacao de 'critica'/'critical'
- **Committed in:** 36145726 (Task 1 GREEN)

_Nota de ambiente (nao versionado): execucao sob Node 22 conforme `.nvmrc` (o checkout tinha Node 26 ativo), como ja documentado no SUMMARY 01-01._

---

**Total deviations:** 1 auto-fixed (1 blocking/robustez).
**Impact on plan:** Sem scope creep. Plano executado conforme escrito; todas as 3 mitigacoes do threat register (T-02-01/02/03) implementadas.

## Threat Mitigations Applied
- **T-02-01 (Information Disclosure — url de export arbitraria):** `ExportIntakeDto @IsUrl`; `@RequireRole(OPERATOR)`; export so de lead `completed` (409 caso contrario); POST via SSRF guard reutilizado.
- **T-02-02 (Tampering — urgencyLevel fora do dominio):** `advanceIntake` valida contra normal/high/critical e ignora input invalido (repete a pergunta).
- **T-02-03 (DoS — case_data.messages ilimitado):** `ingestMessage` limita a 50 entradas.

## Known Stubs
- `IntakeLead.cpf` continua sempre `null` — **intencional**. CPF nao faz parte dos 5 campos do fluxo INTAKE-02 (nome, telefone, email, demanda, urgencia). Nenhum stub bloqueia o objetivo do plano.

## User Setup Required
None - nenhuma configuracao externa. (Nota operacional dev: Node 22 conforme `.nvmrc`.)

## Next Phase Readiness
- Wave 3 (Plan 01-04) pode prosseguir: o fluxo conversacional completo e o export do lead qualificado estao provados end-to-end.
- `advanceIntake` disponivel para reuso; `IntakeService.export` disponivel para o teste E2E full-flow do Plan 04.

---
*Phase: 01-bot-de-intake-e2e*
*Completed: 2026-08-26*

## Self-Check: PASSED
- Todos os 4 arquivos criados existem no disco (intake-flow.ts, intake-flow.spec.ts, intake.service.spec.ts, test/intake-export.e2e-spec.ts)
- Todos os 6 commits de task existem no historico (94d9c55f, 36145726, 704ad6b3, 9e2e6a73, 8b93ccd1, 5f68ba5d)
- Verificacoes do plano: `advanceIntake` referenciado em intake.service.ts; `ConflictException` presente
- Testes verdes: intake-flow.spec + intake.service.spec (11 unit) e intake-tracer + intake-export E2E
