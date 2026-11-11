# Phase 2: HR sync and synced employees

**Goal:** users can see when the HR sync ran and what it did, run it on demand, and work with HR-synced employees, who are read-only for HR-owned data.

## Screens

1. **HR sync → Runs**: a list with status and counts, run details with errors, and a **Sync now** button.
2. **Employees list and detail**: a source badge, read-only HR fields, and blocked actions for HR_SYNC companies.
3. **Employee → HR data** tab: the raw HR record for a month (snapshot).

---

## 2.1 Run a sync now

`POST /hr-sync/run` · permission `manage_payroll_settings`

Optional query `?period=YYYY-MM`. Without it, the backend syncs every period whose payroll definition is open for syncing (see Phase 3), newest first.

**202** `{ message: "HR sync queued. Follow progress in /hr-sync/runs.", data: { jobId: string, period: string } }`

- The sync runs **in the background**. Don't wait on this request. Refresh or poll the runs list instead.
- The scheduled sync also runs on its own every `syncIntervalHours`, for companies with `employeeSource = HR_SYNC` and `syncEnabled = true`.

## 2.2 List and view runs

`GET /hr-sync/runs` → **200** `{ data: HrSyncRun[] }`, the latest 50, newest first.

`GET /hr-sync/runs/:id` → **200** `{ data: HrSyncRun }` · **404** if not found.

```ts
type HrSyncRun = {
  id: string;
  companyId: string;
  period: string;                 // "2026-11"
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  trigger: "SCHEDULED" | "MANUAL";
  startedAt: string;
  finishedAt: string | null;
  fetched: number;                // records received from HR
  created: number;                // new employees
  updated: number;                // changed employees
  unchanged: number;
  skipped: number;                // records from another HR company (tenant guard)
  failed: number;                 // records that could not be saved
  adjustmentsGenerated: number;   // arrears / recoveries created (see Phase 4)
  errors: { employeeRecord?: string; employeeId?: string; message: string }[] | null; // at most 500
};
```

UI notes:
- **Polling:** while any run is `RUNNING`, refresh every 3–5 s. A full first sync of about 7,000 employees takes about 1 minute; regular syncs take a few seconds.
- **Status colours:** `SUCCESS` green; `PARTIAL` amber (some records failed or were skipped, so show `errors`); `FAILED` red (the run stopped; `errors[0].message` says why, e.g. HR unreachable).
- **Header:** show `PayrollSettingView.lastSyncedAt` (Phase 1) as "Last synced …".
- Common `errors[].message` values:
  - A `P2002` unique error on `accountNumber` or `email`: the same account or email already belongs to another employee. HR data must be fixed.
  - `Skipped: HR company "X" is not "Y"`: a tenant guard skip.

## 2.3 Employees

Employee objects from the existing endpoints have new fields:

```ts
// GET /employees/:employeeId (detail): all of these
// GET /employees (list): source and lastSyncedAt only
type EmployeeSyncFields = {
  source: "MANUAL" | "HR_SYNC";
  hrEmployeeRecord: string | null; // HR id, e.g. "EMP-00042" (detail only)
  lastSyncedAt: string | null;
  hrDataHash: string | null;       // internal, ignore (detail only)
};
```

`payrollInfo` has a new `costCenterId`.

For synced employees, position, grade and department come from HR. They appear in the existing history relations (`positionHistory`, `gradeHistory`, `departmentHistory`, where the open row has `toDate: null`).

### Actions blocked when the company is HR_SYNC

These return **409** `"Employees are managed by HR sync. …"` while `employeeSource === "HR_SYNC"`:

| Endpoint | UI |
|---|---|
| `POST /employees` (create) | Hide "Add employee" |
| `POST /employees/upload/employee-sheets` (Excel import) | Hide "Import" |
| `POST /employees/assign-position` | Hide or disable |
| `POST /employees/assign-grade` | Hide or disable |
| `POST /employees/assign-department` | Hide or disable |

Still allowed: password generation and change, roles, viewing.

UI notes:
- Show a "Synced from HR" badge when `source === "HR_SYNC"`, with `lastSyncedAt`.
- Make HR-owned fields read-only for synced employees: name, gender, birth date, phone, email, TIN, hire date, salary, account number, position, grade and department. The next sync overwrites any local change.
- **Logins:** new synced employees **cannot log in** until an admin issues credentials with the existing `POST /employees/generate-password` (`{ email, employeeId }`). Add a "Send login" action in the employee detail.

## 2.4 HR snapshot (raw HR record for a month)

`GET /hr-sync/employees/:employeeId/snapshot?period=YYYY-MM` · permission `view_employee`

**200**

```ts
{
  data: {
    id: string;
    employeeId: string;
    period: string;
    hash: string;
    syncedAt: string;
    payload: {
      from_date: string;          // "2026-11-01"
      to_date: string;            // "2026-11-30"
      record: HrEmployeeRecord;   // exactly what HR returned
    };
  };
}
```

**404** `"No HR snapshot for this period"`

Useful parts of `record` to show in an **HR data** tab:

| Section | Path in `record` |
|---|---|
| Placement history: segments within the month (promotion, transfer, acting) | `placement_history[]` → `from`, `to`, `position.name`, `job_grade.name`, `organization_unit.name`, `salary_amount`, `hr_event`, `movement_reason`, `is_acting` |
| Salary | `salary.salary_amount`, `salary.salary_scale.name`, `salary.step` |
| Benefits | `benefits.items[]` → `benefit_type`, `amount`, `unit` |
| Attendance summary | `attendance.summary` → `working_days`, `present_days`, `absent_days`, `on_leave_days`, `overtime_hours`, `overtime_by_category` |
| Leave | `leave.summary` → `paid_leave_days`, `lwop_days`, `by_type`; `leave.requests[]` |
| Identifiers | `identifiers.tin`, `identifiers.fan`, `identifiers.pension_number` |
| Bank | `bank.net_pay_account` (may be null; flag it, since the employee can't be paid by transfer) |

The live HR feed has **no top-level `placement`**. The current placement is the **latest** `placement_history` segment.

## Done when

- [ ] The runs list shows status and counts and polls while running; run detail shows errors.
- [ ] "Sync now" queues a run (202) and the list updates.
- [ ] Employees show the source badge; the actions in the table above are hidden for HR_SYNC companies; 409 is handled if one is called anyway.
- [ ] The HR data tab shows the snapshot for a chosen month.
- [ ] Synced employees without a salary account are flagged.
