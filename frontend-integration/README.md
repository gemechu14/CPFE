# Frontend integration: HR sync, payroll schedule and arrears

This guide covers the backend changes on branch `feature/hr-employee-sync`. Each company can now get its employees from its own HR system (Frappe `coop_hr`). Payroll uses a cutoff date. Changes in HR after the cutoff are paid or recovered in the next month as **arrears** or **recoveries**.

Build it in this order. Each phase works on its own.

| Phase | What the UI gets | File |
|---|---|---|
| 1 | Company registration, payroll settings, HR connection | [phase-1-company-and-settings.md](phase-1-company-and-settings.md) |
| 2 | HR sync status, read-only synced employees, HR snapshot view | [phase-2-hr-sync.md](phase-2-hr-sync.md) |
| 3 | Payroll definition schedule (open, cutoff and sync-until dates) | [phase-3-payroll-schedule.md](phase-3-payroll-schedule.md) |
| 4 | Payroll run, arrears and recoveries, period close, new payslip fields | [phase-4-payroll-run-and-arrears.md](phase-4-payroll-run-and-arrears.md) |

## Key ideas

- **Each company chooses one employee source**, stored as `PayrollSetting.employeeSource`:
  - `MANUAL`: employees are created in the payroll app, as before.
  - `HR_SYNC`: employees come only from the company's HR system. Every 4 hours the backend pulls new hires, updated details, placement changes, attendance and leave.
- **Each employee has a `source`** (`MANUAL` or `HR_SYNC`). For HR-synced employees, HR-owned data is read-only in payroll.
- **Payroll closes at a cutoff date**, for example the 18th, and pays on the 20th. After the cutoff, the employee is assumed to work the rest of the month at their position on the cutoff day. If HR changes that month later (for example a back-dated promotion or unpaid leave), the next payroll adds or subtracts the difference automatically.
- **Tax, pension and provident fund** use the company's active rules. Ethiopian defaults are seeded: the 2025 tax brackets and 7% / 11% pension.

## Conventions

| Item | Value |
|---|---|
| Base URL | `{API}/api/v1` |
| Auth | `Authorization: Bearer <tokens.access.token>`. The login response is unchanged: `{ isFirstTimeLoggedIn, tokens, permissions }` |
| Dates | ISO strings. Date-only values such as `"2026-10-18"` are accepted on input. |
| Money | Prisma `Decimal` fields (payroll amounts, adjustment `amount`) arrive as **strings**, e.g. `"2219.35"`. Parse them for display and maths. Some older fields are numbers, e.g. `PayrollInfo.basicSalary`. |
| Period | HR month as `"YYYY-MM"`, e.g. `"2026-11"` |

### Error shape

```ts
// Business and validation errors
{ code: number; message: string; details?: { message: string; path: string }[] }

// Permission middleware
{ message: "Access Denied: Missing permission" }          // 403
{ message: "Access Denied: Employee has no roles" }       // 400
```

| Status | Meaning in this feature |
|---|---|
| 400 | Validation error (see `details[].path`), or a business rule, e.g. "Register this company's HR connection before enabling HR sync" |
| 404 | Not found, e.g. no HR snapshot for that period |
| 409 | The employee is managed by HR sync, or the HR connection is already registered by another company |
| 502 | The HR system could not be reached during a sync |

### New permission

| Permission | Needed for |
|---|---|
| `manage_payroll_settings` | Updating settings, the HR connection (save, test, remove), manual sync, editing a definition's schedule, closing a period |
| `view_employee` (existing) | Viewing an employee's HR snapshot |

Read endpoints in this guide need only a logged-in user. Use the `permissions` array from login to hide buttons the user can't use.
