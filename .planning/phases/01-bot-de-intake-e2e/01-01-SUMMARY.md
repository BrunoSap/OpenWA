---
phase: 01-bot-de-intake-e2e
plan: 01
subsystem: api
tags: [nestjs, typeorm, intake, sqlite, postgres, e2e, supertest, class-validator]

# Dependency graph
requires: []
provides:
  - "Modulo intake funcional: IntakeLead + IntakeService + IntakeController + IntakeModule"
  - "Entidade IntakeLead cross-dialect (SQLite/Postgres) na conexao 'data'"
  - "Rotas HTTP: POST /api/sessions/:sessionId/intake/messages (upsert por chat_id) e GET /api/sessions/:sessionId/intake/leads/:chatId"
  - "IntakeService.ingestMessage (upsert idempotente por chat_id) exportado para reuso no fluxo conversacional (Plan 02)"
  - "Tracer E2E provando HTTP -> service -> entidade -> DB -> leitura"
affects: [01-02, 01-03, 01-04]

# Actuals (#2632)
actuals:
  tokens: 4000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Entidade na conexao nomeada 'data' com jsonColumnType() para campo JSON cross-dialect"
    - "Colunas string nullable declaram type:'varchar' explicito (union string|null nao e inferivel pelo TypeORM/better-sqlite3)"
    - "Registro de glob de entidade em DOIS lugares: app.module.ts (runtime) + data-source.ts (migration CLI)"
    - "Upsert idempotente por chave natural (chat_id) no service"

key-files:
  created:
    - src/modules/intake/entities/intake-lead.entity.ts
    - src/modules/intake/intake.service.ts
    - src/modules/intake/intake.controller.ts
    - src/modules/intake/intake.module.ts
    - src/modules/intake/dto/index.ts
    - test/intake-tracer.e2e-spec.ts
  modified:
    - src/app.module.ts
    - src/database/data-source.ts

key-decisions:
  - "Tabela flat 'intake_leads' (sem schema namespace) porque SQLite nao suporta schemas Postgres; migration 003 (intake_staging.leads) e o caminho Postgres de producao, a entidade e o caminho cross-dialect da conexao 'data'"
  - "PrimaryGeneratedColumn numerico (SERIAL/INTEGER), espelhando o schema da migration 003 — nao uuid"
  - "case_data via jsonColumnType() (resolve para simple-json em ambos dialetos), nunca 'jsonb' hardcoded"
  - "Colunas nullable declaram type:'varchar' explicito (fix Rule 1)"

patterns-established:
  - "Modulo de feature na conexao 'data': forFeature([Entity], 'data') + @InjectRepository(Entity, 'data')"
  - "Rotas de intake protegidas por @RequireRole(ApiKeyRole.OPERATOR), sem @Public"
  - "Tracer E2E: Test.createTestingModule + applyGlobalValidation + supertest + getRepositoryToken(Entity, 'data')"

requirements-completed: [INTAKE-01, INTAKE-03, INTAKE-06]

coverage:
  - id: D1
    description: "Uma mensagem WhatsApp de entrada cria/reusa uma intake session persistida por chat_id (INTAKE-01)"
    requirement: INTAKE-01
    verification:
      - kind: e2e
        ref: "test/intake-tracer.e2e-spec.ts#POST /messages creates an in_progress lead (201)"
        status: pass
      - kind: e2e
        ref: "test/intake-tracer.e2e-spec.ts#two POSTs with the same chatId produce exactly one lead (upsert by chat_id)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dados coletados sao gravados na tabela de leads com timestamps e status (INTAKE-03)"
    requirement: INTAKE-03
    verification:
      - kind: e2e
        ref: "test/intake-tracer.e2e-spec.ts#GET /leads/:chatId returns the persisted lead with the sent text in case_data.messages (200)"
        status: pass
    human_judgment: false
  - id: D3
    description: "IntakeService e IntakeController existem e estao registrados no AppModule (INTAKE-06)"
    requirement: INTAKE-06
    verification:
      - kind: e2e
        ref: "test/intake-tracer.e2e-spec.ts (a suite so boota com IntakeModule resolvido no AppModule)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 01: Tracer E2E do Bot de Intake Summary

**Modulo intake NestJS com entidade IntakeLead cross-dialect na conexao 'data', upsert idempotente por chat_id via IntakeService, rotas HTTP OPERATOR, e tracer E2E verde provando HTTP -> service -> entidade -> DB -> leitura.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-26
- **Completed:** 2026-08-26
- **Tasks:** 3
- **Files modified:** 8 (6 criados, 2 modificados)

## Accomplishments
- Entidade `IntakeLead` (`@Entity('intake_leads')`) espelhando os campos nucleares de `intake_staging.leads`, com `@Index` unico em `chat_id` e `case_data` via `jsonColumnType()` (cross-dialect SQLite/Postgres)
- Glob da entidade registrado nas DUAS listas de entities da conexao 'data': `app.module.ts` (runtime) e `data-source.ts` (migration CLI)
- `IntakeService` com upsert idempotente por `chat_id` (`ingestMessage`), leitura por chat_id/id com `NotFoundException`
- `IntakeController` com `POST .../intake/messages` e `GET .../intake/leads/:chatId`, ambos `@RequireRole(ApiKeyRole.OPERATOR)`, DTO validado por class-validator
- `IntakeModule` registrado no `imports[]` do `AppModule`
- Tracer E2E (`test/intake-tracer.e2e-spec.ts`) verde: 3 comportamentos provam a fatia end-to-end

## Task Commits

Cada task committada atomicamente:

1. **Task 1: Entidade IntakeLead cross-dialect + registro nas conexoes 'data'** - `f0704496` (feat)
2. **Task 2: IntakeService + IntakeController + IntakeModule** - `bcce2e73` (feat)
3. **Task 3: IntakeController + teste E2E end-to-end** - `ca17d4b8` (test, inclui fix Rule 1 da entidade)

_Nota: o controller/DTO foram criados junto na Task 2 para manter cada commit compilavel (o IntakeModule referencia o IntakeController)._

## Files Created/Modified
- `src/modules/intake/entities/intake-lead.entity.ts` - Entidade IntakeLead (criado)
- `src/modules/intake/intake.service.ts` - Upsert por chat_id + leitura (criado)
- `src/modules/intake/intake.controller.ts` - Rotas ingest/read OPERATOR (criado)
- `src/modules/intake/intake.module.ts` - Wiring forFeature([IntakeLead], 'data') (criado)
- `src/modules/intake/dto/index.ts` - IngestIntakeMessageDto + IntakeLeadResponse (criado)
- `test/intake-tracer.e2e-spec.ts` - Tracer E2E (criado)
- `src/app.module.ts` - Glob da entidade + import/registro do IntakeModule (modificado)
- `src/database/data-source.ts` - Glob da entidade no dataEntities (modificado)

## Decisions Made
- Tabela flat `intake_leads` sem schema namespace (SQLite nao tem schemas Postgres); a migration 003 e o caminho Postgres de producao
- `PrimaryGeneratedColumn` numerico, nao uuid, espelhando o `SERIAL` da migration 003
- `case_data` sempre via `jsonColumnType()` (simple-json em ambos dialetos)
- Controller/DTO criados na Task 2 (nao adiada para Task 3) para preservar compilacao entre commits

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Colunas string nullable inferidas como tipo Object**
- **Found during:** Task 3 (ao inicializar o TypeORM no boot do teste E2E)
- **Issue:** `phone/cpf/full_name/email` declaradas como `@Column({ nullable: true })` com tipo TS `string | null`; o TypeORM inferiu o tipo do union como `Object`, que o better-sqlite3 rejeita (`DataTypeNotSupportedError: Data type "Object"`)
- **Fix:** Declarado `type: 'varchar'` explicito nessas 4 colunas
- **Files modified:** src/modules/intake/entities/intake-lead.entity.ts
- **Verification:** tracer E2E passa (3/3), tsc limpo
- **Committed in:** ca17d4b8 (Task 3 commit)

**2. [Rule 3 - Blocking] Dependencias nao instaladas + runtime Node incompativel**
- **Found during:** Task 3 (ao rodar `npm run test:e2e`)
- **Issue:** (a) `node_modules` vazio neste checkout; (b) postinstall do puppeteer falhava no download do chrome-headless-shell; (c) Node v26.3.0 ativo, mas o projeto exige Node 22 (`.nvmrc`), causando falha de conexao do TypeORM no boot
- **Fix:** `PUPPETEER_SKIP_DOWNLOAD=true npm ci` (skip documentado do proprio puppeteer, nao substituicao de pacote); `nvm install 22` e execucao do jest sob Node 22.23.2
- **Files modified:** nenhum arquivo versionado (node_modules e gitignored; lockfile respeitado pelo `npm ci`)
- **Verification:** tracer E2E passa sob Node 22
- **Committed in:** N/A (setup de ambiente, sem alteracao versionada)

**3. [Rule 3 - Blocking] beforeAll estourava o timeout default do jest (5s)**
- **Found during:** Task 3
- **Issue:** o boot do AppModule completo excede 5s em cold run neste ambiente, abortando o `beforeAll` mid-connect e surgindo como falso "Unable to connect to the database (data)"
- **Fix:** `jest.setTimeout(60000)` no proprio spec
- **Files modified:** test/intake-tracer.e2e-spec.ts
- **Verification:** suite verde
- **Committed in:** ca17d4b8 (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** Todos os auto-fixes necessarios para correcao/execucao. Sem scope creep. Os itens de ambiente (Node 22, npm ci) sao setup local e nao alteram codigo versionado.

## Issues Encountered
- **Suites E2E pre-existentes tambem falham sob Node 26** (ex.: `app.e2e-spec` com 12 falhas do mesmo erro de conexao). E um problema de ambiente do checkout, nao introduzido por este plano; resolvido rodando sob Node 22 conforme `.nvmrc`.

## Known Stubs
- `IntakeLead.phone/cpf/full_name/email` ficam sempre `null` neste tracer — **intencional**. O tracer cobre apenas a fatia happy (ingest -> persist -> read). O preenchimento estruturado desses campos (nome, telefone, email, urgencia) e o fluxo conversacional do **Plan 02** (INTAKE-02). `case_type` fica `'unknown'` pela mesma razao. Nenhum stub bloqueia o objetivo deste plano.

## User Setup Required
None - nenhuma configuracao de servico externo necessaria. (Nota operacional para a maquina de dev: usar Node 22 conforme `.nvmrc`, e `PUPPETEER_SKIP_DOWNLOAD=true npm ci` se o download do browser puppeteer falhar.)

## Next Phase Readiness
- Wave 2 pode prosseguir: Plans 01-02 (fluxo conversacional + exportacao) e 01-03 (workflow n8n) dependem deste tracer
- `IntakeService` exportado pelo `IntakeModule`, pronto para reuso
- A arquitetura de intake (entidade cross-dialect, registro do modulo, wiring do repositorio) esta provada end-to-end

---
*Phase: 01-bot-de-intake-e2e*
*Completed: 2026-08-26*

## Self-Check: PASSED
- Todos os 6 arquivos criados existem no disco
- Todos os 3 commits de task existem no historico (f0704496, bcce2e73, ca17d4b8)
