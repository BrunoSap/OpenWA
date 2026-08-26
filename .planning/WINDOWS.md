---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-08-26T14:02:58.876Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | stub | src/modules/intake/entities/intake-lead.entity.ts |  | phone/cpf/full_name/email/case_type ficam null/unknown no tracer; preenchimento e o fluxo conversacional do Plan 02 (INTAKE-02) | open |  | 2026-08-26T14:02:58.876Z |  |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "01",
    "file": "src/modules/intake/entities/intake-lead.entity.ts",
    "line": null,
    "description": "phone/cpf/full_name/email/case_type ficam null/unknown no tracer; preenchimento e o fluxo conversacional do Plan 02 (INTAKE-02)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T14:02:58.876Z",
    "resolved_at": null
  }
]
````
