# Phase 3: Payroll definition schedule

**Goal:** for each payroll definition (month), users can see and change when it opens for HR sync, when payroll closes (cutoff), and until when late HR changes are still picked up.

## Concepts

| Date | Meaning | Default when empty |
|---|---|---|
| `openDate` | HR sync starts pulling this month | `startDate` minus `openDaysBefore` (setting) |
| `cutoffDate` | Payroll closes. Days after it are **assumed** worked at the position held on that day; real changes become arrears next month. | `cutoffDay` of the month (setting, default the 18th) |
| `syncUntilDate` | HR sync stops pulling this month. Later changes are no longer turned into arrears automatically. | `syncUntilDay` of the **next** month (setting; defaults to the cutoff day, e.g. 18 Nov for October) |
| `hrPeriod` | Which HR month (`YYYY-MM`) this definition maps to | the month in the middle of `startDate`–`endDate` |

The dates must be in order: **open ≤ cutoff ≤ sync-until**.

Each definition has a **state**:

| `state` | When | UI badge |
|---|---|---|
| `NOT_OPEN` | now < openDate | grey "Not open" |
| `OPEN` | openDate ≤ now ≤ cutoffDate | green "Open" |
| `CLOSED_SYNCING` | cutoffDate < now ≤ syncUntilDate | amber "Closed, receiving late HR changes" |
| `LOCKED` | now > syncUntilDate | dark "Locked" |

---

## 3.1 Create definitions (new optional fields)

`POST /payroll-definitions` and `POST /payroll-definitions/bulk` (array) accept four new **optional** fields:

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

Leave them out to use the defaults. Out-of-order dates → **400** with `details[].path = "cutoffDate"`.

## 3.2 Read a definition's schedule

`GET /payroll-definitions/:id/schedule` → **200** `{ data: PayrollSchedule }`

```ts
type PayrollSchedule = {
  payrollDefinitionId: string;
  payrollName: string;
  startDate: string;
  endDate: string;
  payDate: string;
  hrPeriod: string;         // effective value
  openDate: string;         // effective (explicit or default)
  cutoffDate: string;
  syncUntilDate: string;    // end of that day (23:59:59.999)
  explicit: { hrPeriod: boolean; openDate: boolean; cutoffDate: boolean; syncUntilDate: boolean }; // false means a default from settings
  closedAt: string | null;  // set when the cutoff passed or the period was closed manually
  state: "NOT_OPEN" | "OPEN" | "CLOSED_SYNCING" | "LOCKED";
};
```

UI notes:
- Show each date, and label the defaults with "(default)" when `explicit.x` is false.
- On the payroll definitions list, a small timeline per row works well: `open ── cutoff ── pay ── sync-until`.

## 3.3 Change a definition's schedule

`POST /payroll-definitions/:id/schedule` · permission `manage_payroll_settings`

Send any subset of the four fields. **`null` clears an explicit date back to the default.**

```json
{ "cutoffDate": "2026-11-19" }
{ "syncUntilDate": null }
{ "hrPeriod": "2026-09" }
```

**200** `{ message: "Schedule updated", data: PayrollSchedule }`

**400** cases:

| Message | Cause |
|---|---|
| `Nothing to update` | empty body |
| `Dates must be in order: openDate ≤ cutoffDate ≤ syncUntilDate` | out of order within the request |
| `Effective dates must be in order: open (…) ≤ cutoff (…) ≤ sync until (…)` | out of order once combined with the defaults |
| `Cannot change hrPeriod after payroll has been created for this definition` | `hrPeriod` is locked after a payroll run |

Behaviour:
- The schedule can be edited **at any time**, even after payroll has run. It doesn't change amounts already calculated.
- Moving `cutoffDate` into the future **reopens** a closed period (`closedAt` becomes null).

## 3.4 Close a period now

`POST /payroll/definitions/:id/close` · permission `manage_payroll_settings`

**200** `{ message: "Payroll period closed", data: PayrollDefinition }`. This sets `closedAt` (and `cutoffDate` if it was empty).

Periods also close **automatically** when their cutoff passes, after each sync. Use this button to close early.

## Done when

- [ ] Definition create and bulk forms have optional open, cutoff and sync-until dates and an HR period field (with a date-order check on the client).
- [ ] The definition list or detail shows the schedule, the state badge and "(default)" labels.
- [ ] Schedule edit works, including "reset to default" (sends `null`), and handles the 400 messages.
- [ ] The "Close period" action is available to `manage_payroll_settings` users.
