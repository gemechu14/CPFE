# Phase 6: Payroll definitions

**Goal:** users can create, list, edit and delete payroll definitions (one per pay period, usually a month). Every payroll run is made against one definition.

## Screens

- **Payroll definitions list**: all definitions, newest period first, with the schedule badge from [Phase 3](phase-3-payroll-schedule.md).
- **Create definition** (single) and **Define the year** (bulk, e.g. 12 months at once).
- **Edit definition**: name and dates only.
- **Dashboard card "Current payroll"**: the active/upcoming definition with processed and unprocessed employee counts.
- **Period pickers** in other screens (payroll run, reports, approvals).

## Concepts

A definition is a named period with a pay date. It has no fixed frequency or fiscal year: the backend takes `startDate`, `endDate` and `payDate` exactly as sent.

| Field | Meaning |
|---|---|
| `payrollName` | Display name, e.g. `"October 2026"`. Must be unique within the company. |
| `startDate`, `endDate` | The period. `endDate` ≥ `startDate`. |
| `payDate` | When salaries are paid. After this date the definition can no longer be edited (6.8). |
| `payPeriod` | Free text label, e.g. `"Monthly"`. Not checked against a list and not used in calculations. |
| `hrPeriod`, `openDate`, `cutoffDate`, `syncUntilDate` | HR sync schedule. Optional; `null` means "use the default from payroll settings". See [Phase 3](phase-3-payroll-schedule.md#concepts). |
| `closedAt` | Set when the period is closed (cutoff passed or closed by hand). See [Phase 3, 3.4](phase-3-payroll-schedule.md). |
| `status` | Prisma enum `created \| ordered \| pending \| approved \| active \| paid`. These endpoints never change it, so it stays `"created"`. |

**How definitions relate to payroll runs:** `POST /payroll` takes `payrollDefinitionId` ([Phase 4, 4.1](phase-4-payroll-run-and-arrears.md)). One employee can have only one payroll per definition. HR-synced employees are calculated from the definition's `hrPeriod` and `cutoffDate`; MANUAL employees use the definition dates for attendance (when required) and the grade and basic salary otherwise (see [Phase 8](phase-8-grades-positions-departments.md#how-grades-feed-payroll)).

What the backend does **not** check: overlapping periods, gaps between periods, the period length, or that `payDate` is inside or after the period. Do these checks in the UI if you need them.

### Shared type

```ts
type PayrollDefinition = {
  id: string;
  payrollName: string;
  startDate: string;          // ISO
  endDate: string;
  payDate: string;
  payPeriod: string;
  status: "created" | "ordered" | "pending" | "approved" | "active" | "paid";
  hrPeriod: string | null;    // "YYYY-MM"; null = default
  openDate: string | null;    // null = default
  cutoffDate: string | null;
  syncUntilDate: string | null;
  closedAt: string | null;
  companyId: string;
  createdAt: string;
  updatedAt: string;
};
```

The raw row shows only **explicit** schedule dates. To show effective dates (defaults filled in) and the state badge, call `GET /payroll-definitions/:id/schedule` ([Phase 3, 3.2](phase-3-payroll-schedule.md)).

---

## 6.1 Create a definition

`POST /payroll-definitions` · logged-in user (no permission check)

```json
{
  "payrollName": "October 2026",
  "startDate": "2026-10-01",
  "endDate": "2026-10-31",
  "payPeriod": "Monthly",
  "payDate": "2026-10-20",

  "hrPeriod": "2026-10",
  "openDate": "2026-10-01",
  "cutoffDate": "2026-10-18",
  "syncUntilDate": "2026-11-18"
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| `payrollName` | string | yes | trimmed, 1–100 chars |
| `startDate` | date | yes | |
| `endDate` | date | yes | ≥ `startDate` |
| `payPeriod` | string | yes | trimmed, 1–100 chars |
| `payDate` | date | yes | |
| `hrPeriod` | string \| null | no | `YYYY-MM` |
| `openDate`, `cutoffDate`, `syncUntilDate` | date \| null | no | open ≤ cutoff ≤ sync-until (for the ones sent) |

Unknown fields are rejected (strict schema).

**201** `{ message: "Created", data: PayrollDefinition }`

| Status | Message | Cause |
|---|---|---|
| 400 | `endDate must be on or after startDate` (`path: "endDate"`) | dates reversed |
| 400 | `Dates must be in order: openDate ≤ cutoffDate ≤ syncUntilDate` (`path: "cutoffDate"`) | schedule out of order |
| 400 | `hrPeriod must be YYYY-MM` | bad format |
| 400 | `Payroll name already exists for this company` | duplicate name |

## 6.2 Create many definitions (bulk)

`POST /payroll-definitions/bulk` · logged-in user (no permission check)

The body is an **array** of the same objects as 6.1 (at least one).

```json
[
  { "payrollName": "January 2027", "startDate": "2027-01-01", "endDate": "2027-01-31", "payPeriod": "Monthly", "payDate": "2027-01-20" },
  { "payrollName": "February 2027", "startDate": "2027-02-01", "endDate": "2027-02-28", "payPeriod": "Monthly", "payDate": "2027-02-20" }
]
```

**201** `{ message: "Successfully defined your payroll.", data: { count: number } }`

- The response has only the number created, not the rows. Reload the list with 6.3.
- All or nothing: if any name already exists in the company → **400** `Payroll names already exist for the company: <names>` and nothing is created.
- Validation errors have paths like `"0.endDate"` (array index first).
- Empty array → **400** `At least one payroll definition is required`.

UI notes:
- A "Generate 12 months" helper that fills names and month boundaries works well. Check that names are unique **inside the array** on the client (see Backend notes).

## 6.3 List all definitions

`GET /payroll-definitions` · logged-in user

**200** `{ message: "Fetched successfully", data: PayrollDefinition[] }`, sorted by `startDate`, newest first. No paging or filters.

## 6.4 List this year's definitions

`GET /payroll-definitions/current-year` · logged-in user

**200** `{ message: "Fetched successfully", data: PayrollDefinition[], count: number }`

Returns definitions that start on or after 1 January and end on or before 31 December of the current year (UTC), newest first. A period that crosses the year boundary is not included.

## 6.5 Current definition (dashboard)

`GET /payroll-definitions/current-month` · logged-in user

**200** `{ message: "Fetched successfully", data: CurrentPayroll }`

```ts
type CurrentPayroll = {
  payrollDefinition: PayrollDefinition | null;
  status: "active" | "upcoming" | "expired" | "none";
  totalEmployees: number;        // all employees in the company (any status)
  processedEmployees: number;    // payroll rows already created for this definition
  unprocessedEmployees: number;  // totalEmployees − processedEmployees
};
```

How the definition is chosen:

| `status` | Rule |
|---|---|
| `active` | today is between `startDate` and `endDate` (latest start wins if several match) |
| `upcoming` | none active; the next one to start |
| `expired` | none active or upcoming; the most recent past one |
| `none` | the company has no definitions; `payrollDefinition` is `null` and all counts are 0 |

UI notes:
- Use this to preselect the period on the run-payroll screen. Show a hint when `status` is not `active`.

## 6.6 Latest created definition

`GET /payroll-definitions/latest` · logged-in user

**200** `{ data: PayrollDefinition | null }`

This is the **most recently created** row (by `createdAt`), not the latest period. After a bulk create it can be any month of that batch.

## 6.7 Get one definition

`GET /payroll-definitions/:id` · logged-in user

**200** `{ data: PayrollDefinition }`. **404** `Payroll definition not found`. A non-UUID id → **400** `Invalid ID`.

## 6.8 Update a definition

`POST /payroll-definitions/:id` · logged-in user (no permission check)

Only these fields, all optional:

```json
{ "payrollName": "Oct 2026", "startDate": "2026-10-01", "endDate": "2026-10-31" }
```

`payDate`, `payPeriod` and the schedule fields can't be changed here. Use [Phase 3, 3.3](phase-3-payroll-schedule.md) for the schedule.

**200** `{ message: "Updated", data: PayrollDefinition }`

| Status | Message | Cause |
|---|---|---|
| 400 | `endDate must be on or after startDate` | both dates sent and reversed |
| 400 | `Payroll name already exists for this company` | name taken by another definition |
| 400 | `Cannot update payroll after pay date` | today is after `payDate` |
| 400 | `Cannot update payroll definition after payroll processing has started` | any payroll on this definition has left status `CREATED` |
| 404 | `Payroll definition not found` | |

UI notes:
- Disable "Edit" once `payDate` has passed.

## 6.9 Delete a definition

`POST /payroll-definitions/remove/:id` · logged-in user (no permission check)

**200** `{ message: "Deleted" }`. **404** `Payroll definition not found`.

This is a **hard delete**. There is no explicit "has payrolls" check, but the database refuses the delete when payroll rows, arrears/recoveries or attendance summaries point to the definition. The API then returns **400** with a raw database message (in production just `"Bad Request"`).

UI notes:
- Only offer "Delete" for definitions with no payroll run. Show a generic "This period is already in use" on 400.

## 6.10 Periods for the approvals screen

`POST /payroll-definitions/approvals/current-last-month` · permission `view_payroll_approval`

No body. **200** `{ message: "Fetched successfully", data: { id: string; payrollName: string }[] }`

Returns every definition that starts on or before the 1st of the current month (UTC), newest first. Despite the name, this is the current month and **all** earlier ones, not only the last one.

## 6.11 Schedule and close

These are documented in Phase 3 and not repeated here:

| Endpoint | See |
|---|---|
| `GET /payroll-definitions/:id/schedule` | [Phase 3, 3.2](phase-3-payroll-schedule.md) |
| `POST /payroll-definitions/:id/schedule` · `manage_payroll_settings` | [Phase 3, 3.3](phase-3-payroll-schedule.md) |
| `POST /payroll/definitions/:id/close` · `manage_payroll_settings` | [Phase 3, 3.4](phase-3-payroll-schedule.md) |

---

## Backend notes

- Create, bulk create, update and delete have **no `checkPermission`**; any logged-in user of the company can call them. Hide the buttons by role on the client until this is fixed.
- Bulk create checks names against the database only. Two items with the same name in one request are both created (there is no unique index on `payrollName`).
- `current-month` counts **all** employees, including inactive ones, so `unprocessedEmployees` can be too high.
- `latest` sorts by `createdAt`, not by period.
- Update with only `startDate` or only `endDate` does not re-check the order against the stored value.
- Delete returns a raw database error instead of a clear message when the definition is in use.

## Done when

- [ ] The list shows all definitions with name, period, pay date and the Phase 3 schedule badge.
- [ ] Single and bulk create forms validate dates (end ≥ start, open ≤ cutoff ≤ sync-until) and unique names before sending.
- [ ] Edit is limited to name and dates and is disabled after the pay date or once processing has started.
- [ ] Delete is offered only for unused definitions and handles the 400.
- [ ] The dashboard card uses `current-month` and shows `status` and the processed/unprocessed counts.
- [ ] Create/edit/delete buttons are hidden for users who shouldn't use them (no backend permission check yet).
