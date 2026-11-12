# Phase 10: Payroll simulation

A **what-if** view of payroll: what each employee would be paid in one month, a range of months or a whole year. It uses the same calculation as the real run and **saves nothing**. No payroll rows are created, no approvals start, and arrears are not marked as applied.

Users can simulate:
- **all employees** or **selected employees**;
- **one month** (`fromPeriod` only), **a range** (`fromPeriod` + `toPeriod`), or **a year** (`year`).

The maximum is 24 months per simulation.

Permission: **`simulate_payroll`**. Company admin roles get it from `npm run seed`. Give it to other roles from the role screen. Hide the Simulation menu when the user's `permissions` (from login) don't include it.

## Screens

1. **Simulation form:** pick the period (month or year) and the employees (all, or a multi-select). There are two options, both on by default:
   - "Use real amounts for months already run" (`useActuals`)
   - "Include pending arrears / recoveries" (`includeAdjustments`)
2. **Progress:** shown only when the response is `RUNNING`, e.g. a year for thousands of employees. Poll until it is `COMPLETED`.
3. **Result:**
   - totals cards (gross, tax, pension, PF, net, and employer cost);
   - a month-by-month table (`result.months`);
   - a paged employee table with search.
4. **Employee drawer:** click a row to see each month with its earnings and deductions lines.

## Flow

```
POST /payroll/simulations ──► 200 COMPLETED ─────────────────────────────┐
                         └──► 202 RUNNING ─► poll GET /payroll/simulations/:id (every 1–2 s)
                                                    until COMPLETED / FAILED ┘
                                                              │
         GET /payroll/simulations/:id/employees?page=&limit=&search=   (table pages)
         GET /payroll/simulations/:id/employees/:employeeId            (drawer, with lines)
```

- **Small runs** (up to 6,000 employee-months, e.g. 500 employees for a year or 6,000 for one month) finish in the same request and return **200**.
- **Bigger runs** return **202** immediately with `status: "RUNNING"`, and the backend keeps working. For reference, 10,000 employees × 12 months takes about 10–15 seconds.
- **Results are kept for 1 hour** (`expiresAt`). Paging and searching read the stored result and never recalculate. After it expires, the simulation endpoints return **404** and the user must run it again.
- **One running simulation per company.** Starting another while one is running returns **409**.

---

## 10.1 Start a simulation

`POST /api/v1/payroll/simulations`

Body: send **either** `year` **or** `fromPeriod` (with optional `toPeriod`), not both.

| Field | Type | Default | Notes |
|---|---|---|---|
| `year` | number | | e.g. `2026` → Jan–Dec 2026 |
| `fromPeriod` | `"YYYY-MM"` | | one month if `toPeriod` is left out |
| `toPeriod` | `"YYYY-MM"` | `fromPeriod` | max 24 months from `fromPeriod` |
| `employeeIds` | uuid[] | all ACTIVE employees | in HR_SYNC companies, only HR-synced employees |
| `useActuals` | boolean | `true` | months already run show the saved payroll amounts |
| `includeAdjustments` | boolean | `true` | pending arrears and recoveries are added once, in the first simulated month after the month they correct |

```bash
# Whole company, whole year
curl -X POST "$API/api/v1/payroll/simulations" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "year": 2026 }'

# Two employees, December only, ignore what's already been run
curl -X POST "$API/api/v1/payroll/simulations" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "fromPeriod": "2026-12", "employeeIds": ["a17be471-260c-4d6f-bdb9-f81dbec82946", "9d0c…"], "useActuals": false }'
```

**200** (finished) or **202** (still running). The `data` object is the same `Simulation` shape in both cases:

```json
{
  "message": "Simulation completed (nothing is saved)",
  "data": {
    "id": "d4b74873-fc6d-4d96-a43d-2237ce7f6978",
    "status": "COMPLETED",
    "params": { "fromPeriod": "2026-01", "toPeriod": "2026-12", "useActuals": true, "includeAdjustments": true },
    "progress": { "processedEmployees": 32, "totalEmployees": 32, "percent": 100 },
    "createdAt": "2026-11-12T09:10:02.114Z",
    "updatedAt": "2026-11-12T09:10:02.352Z",
    "finishedAt": "2026-11-12T09:10:02.352Z",
    "durationMs": 238,
    "expiresAt": "2026-11-12T10:10:02.114Z",
    "error": null,
    "result": {
      "totals": {
        "basicSalary": 22378357.56, "totalAllowance": 1919080, "grossSalary": 24297437.56,
        "taxableIncome": 24293127.46, "incomeTax": 7846594.61,
        "employeePensionAmount": 1566183.31, "employerPensionAmount": 2461145.23,
        "employeeProvidentFundAmount": 1546305.06, "employerProvidentFundAmount": 2429907.98,
        "totalDeduction": 10963393.1, "netSalary": 13334044.46
      },
      "months": [
        {
          "period": "2026-01",
          "payrollDefinitionId": "3e72fb63-8fd9-4e4e-b3a0-5844a6d07541",
          "payrollName": "January 2026",
          "startDate": "2026-01-01",
          "endDate": "2026-01-31",
          "employees": 30,
          "basis": { "PROJECTED": 30, "NOT_EMPLOYED": 2 },
          "totals": {
            "basicSalary": 1788137, "totalAllowance": 151390, "grossSalary": 1939527, "taxableIncome": 1939527,
            "incomeTax": 625534.45, "employeePensionAmount": 125169.59, "employerPensionAmount": 196695.07,
            "employeeProvidentFundAmount": 125169.59, "employerProvidentFundAmount": 196695.07,
            "totalDeduction": 875873.63, "netSalary": 1063653.37
          }
        },
        {
          "period": "2026-11",
          "payrollDefinitionId": "f9b92f84-c671-4867-a907-17ce638b2213",
          "payrollName": "November 2026",
          "startDate": "2026-11-01",
          "endDate": "2026-11-30",
          "employees": 32,
          "basis": { "ACTUAL": 8, "HR_DATA": 24 },
          "totals": { "netSalary": 1197321.4, "…": "…" }
        }
      ],
      "employees": { "total": 32, "withWarnings": 21, "skipped": 0 },
      "skipped": []
    }
  }
}
```

While `RUNNING`, `result` is `null` and `progress.percent` goes up as batches of 500 employees finish.

`skipped` lists selected employees that were not simulated, as `{ employeeId, name, reason }`. Possible reasons:
- "Employee not found in this company"
- "Employee is TERMINATED" (or another non-active status)
- "Not an HR-synced employee (system or admin account)"

### Errors

| Status | When |
|---|---|
| 400 | Validation: both `year` and `fromPeriod`, `toPeriod` without `fromPeriod`, bad `YYYY-MM`, more than 24 months, or "No employees to simulate" |
| 403 / 400 | Missing `simulate_payroll` permission, or the user has no role |
| 409 | "Another simulation is still running for this company (id …)". Offer to open that one, or wait. |

---

## 10.2 Poll a simulation

`GET /api/v1/payroll/simulations/:id` → **200** `{ data: Simulation }`

```bash
curl "$API/api/v1/payroll/simulations/$SIM_ID" -H "Authorization: Bearer $TOKEN"
```

- `RUNNING`: show `progress.percent` and poll again in 1–2 s.
- `COMPLETED`: show `result`, then load the employee table.
- `FAILED`: show `error`. "Simulation was interrupted — run it again" means the server restarted mid-run.
- **404**: expired (older than 1 hour) or from another company. Ask the user to run it again.

---

## 10.3 Employee table (paged)

`GET /api/v1/payroll/simulations/:id/employees`

| Query | Default | Notes |
|---|---|---|
| `page` | 1 | |
| `limit` | 50 | max 200 |
| `search` | | part of the name or employee ID number, case-insensitive |
| `warningsOnly` | `false` | `true` = only rows with warnings |

Rows are sorted by name.

```bash
curl "$API/api/v1/payroll/simulations/$SIM_ID/employees?page=1&limit=50&search=adisu" \
  -H "Authorization: Bearer $TOKEN"
```

**200**

```json
{
  "data": {
    "simulationId": "d4b74873-fc6d-4d96-a43d-2237ce7f6978",
    "page": 1, "limit": 50, "total": 1, "totalPages": 1,
    "rows": [
      {
        "employeeId": "a17be471-260c-4d6f-bdb9-f81dbec82946",
        "name": "Adisu Taye Abo",
        "employeeIdNumber": "EMP-00015",
        "source": "HR_SYNC",
        "totals": {
          "basicSalary": 633737.97, "totalAllowance": 42540, "grossSalary": 676277.97, "taxableIncome": 676277.97,
          "incomeTax": 212097.29, "employeePensionAmount": 44361.66, "employerPensionAmount": 69711.18,
          "employeeProvidentFundAmount": 40614.49, "employerProvidentFundAmount": 63822.77,
          "totalDeduction": 297073.44, "netSalary": 379204.53
        },
        "months": [
          {
            "period": "2026-01", "basis": "PROJECTED",
            "basicSalary": 53531, "totalAllowance": 3545, "grossSalary": 57076, "taxableIncome": 57076,
            "incomeTax": 17926.6, "employeePensionAmount": 3747.17, "employerPensionAmount": 5888.41,
            "employeeProvidentFundAmount": 3747.17, "employerProvidentFundAmount": 5888.41,
            "totalDeduction": 25420.94, "netSalary": 31655.06
          },
          { "period": "2026-11", "basis": "ACTUAL", "grossSalary": 57076, "employeeProvidentFundAmount": 0, "netSalary": 35402.23, "…": "…" },
          { "period": "2026-12", "basis": "PROJECTED", "grossSalary": 57076, "netSalary": 31655.06, "…": "…" }
        ],
        "warnings": ["No bank account"]
      }
    ]
  }
}
```

Returns **409** if the simulation is not `COMPLETED` yet.

---

## 10.4 One employee, with lines

`GET /api/v1/payroll/simulations/:id/employees/:employeeId`

This uses the simulation's settings and recalculates just this employee. Each month also has `lines`: the named earnings and deductions, same format as the payroll preview ([phase 4, 4.0](phase-4-payroll-run-and-arrears.md)). For every month, sum(`lines.earnings`) − sum(`lines.deductions`) = `netSalary`.

```bash
curl "$API/api/v1/payroll/simulations/$SIM_ID/employees/a17be471-260c-4d6f-bdb9-f81dbec82946" \
  -H "Authorization: Bearer $TOKEN"
```

**200**

```json
{
  "data": {
    "simulationId": "d4b74873-…",
    "params": { "fromPeriod": "2026-01", "toPeriod": "2026-12", "useActuals": true, "includeAdjustments": true },
    "employeeId": "a17be471-…",
    "name": "Adisu Taye Abo",
    "employeeIdNumber": "EMP-00015",
    "source": "HR_SYNC",
    "totals": { "…": "same as the row in 10.3" },
    "months": [
      {
        "period": "2026-12",
        "basis": "PROJECTED",
        "basicSalary": 53531, "totalAllowance": 3545, "grossSalary": 57076, "taxableIncome": 57076,
        "incomeTax": 17926.6, "employeePensionAmount": 3747.17, "employerPensionAmount": 5888.41,
        "employeeProvidentFundAmount": 3747.17, "employerProvidentFundAmount": 5888.41,
        "totalDeduction": 25420.94, "netSalary": 31655.06,
        "lines": {
          "earnings": [
            { "name": "Basic salary", "amount": 53531, "type": "BASIC", "taxable": true },
            { "name": "Housing Allowance", "amount": 3300, "type": "ALLOWANCE" },
            { "name": "Transportation Allowance", "amount": 245, "type": "ALLOWANCE" }
          ],
          "deductions": [
            { "name": "Income tax", "amount": 17926.6, "type": "INCOME_TAX" },
            { "name": "Pension (employee)", "amount": 3747.17, "type": "PENSION" },
            { "name": "Provident fund (employee)", "amount": 3747.17, "type": "PROVIDENT_FUND" }
          ]
        }
      }
    ],
    "warnings": ["No bank account"]
  }
}
```

`lines` is `null` for an `ACTUAL` month that was run before line items existed. It's left out for `NOT_EMPLOYED` and `NO_DATA` months.

---

## Types

```ts
type AmountKey =
  | "basicSalary" | "totalAllowance" | "grossSalary" | "taxableIncome" | "incomeTax"
  | "employeePensionAmount" | "employerPensionAmount"
  | "employeeProvidentFundAmount" | "employerProvidentFundAmount"
  | "totalDeduction" | "netSalary";
type Amounts = Record<AmountKey, number>;          // numbers, not strings, rounded to 2 dp

type MonthBasis =
  | "ACTUAL"        // payroll already run for this month: saved amounts (useActuals)
  | "HR_DATA"       // calculated from the HR data synced for this month
  | "PROJECTED"     // no HR data for this month: latest HR data, full month, no overtime/unpaid leave
  | "GRADE_SETUP"   // MANUAL employee: current basic salary + grade allowances/deductions
  | "NOT_EMPLOYED"  // month ends before the hire date (zeros)
  | "NO_DATA";      // nothing to calculate from (zeros; see warnings)

interface SimMonthSummary {
  period: string;                       // "YYYY-MM"
  payrollDefinitionId: string | null;   // null = no definition for that month, simulated on the calendar month
  payrollName: string;                  // "Simulated 2027-01" when there's no definition
  startDate: string; endDate: string;   // "YYYY-MM-DD"
  employees: number;                    // employees with an amount this month
  basis: Partial<Record<MonthBasis, number>>;
  totals: Amounts;
}

interface Simulation {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  params: { fromPeriod: string; toPeriod: string; employeeIds?: string[]; useActuals: boolean; includeAdjustments: boolean };
  progress: { processedEmployees: number; totalEmployees: number; percent: number };
  createdAt: string; updatedAt: string; finishedAt: string | null; durationMs: number | null;
  expiresAt: string;
  error: string | null;
  result: null | {
    totals: Amounts;
    months: SimMonthSummary[];
    employees: { total: number; withWarnings: number; skipped: number };
    skipped: { employeeId: string; name: string; reason: string }[];
  };
}

interface SimEmployeeMonth extends Amounts {
  period: string;
  basis: MonthBasis;
  arrears?: number;                     // + arrears / − recovery included this month
  lines?: PayrollLines | null;          // only from 10.4 (PayrollLines: see phase 4)
}

interface SimEmployeeRow {
  employeeId: string; name: string; employeeIdNumber: string | null; source: "MANUAL" | "HR_SYNC";
  totals: Amounts;
  months: SimEmployeeMonth[];           // same order as result.months
  warnings: string[];
}
```

Warnings you'll see:
- "No bank account"
- "Net salary is zero or negative in some months"
- "No HR data synced"
- "No grade assigned"
- "No payroll info"
- "Attendance not simulated (full month assumed)"

## UI notes

- **Explain the basis.** Colour or tag month cells by `basis`. Add a legend saying that **PROJECTED** months assume the employee's current salary, allowances and placement for the full month, with no overtime and no unpaid leave. Future overtime or leave can't be known in advance.
- **Employer cost** = `grossSalary + employerPensionAmount + employerProvidentFundAmount`, worth showing as its own card.
- **Year view:** months as columns and employees as rows, with `netSalary` per cell and `totals.netSalary` at the end. Use `result.months[i].totals` for the footer.
- **Select employees:** reuse the employee picker. For "everyone", leave `employeeIds` out rather than sending 10,000 ids.
- **Disable the Run button while one is running.** On 409, show the running simulation's id from the message.
- **Export:** page through 10.3 with `limit=200` and build the CSV/Excel on the client.

## Backend notes

- **No database tables.** Results live in Redis under `payroll-sim:*` for 1 hour.
- **Same calculation as the real run.** HR employees use the same calculator as `POST /payroll` and `POST /payroll/preview`. MANUAL employees use the same grade formula as the run. Attendance-required MANUAL employees are assumed to have full attendance.
- **Performance:**
  - company data is loaded once;
  - employees are processed in batches of 500, with a fixed number of queries per batch;
  - HR snapshots are loaded with the bulky attendance detail removed in SQL when the month doesn't need it;
  - the API stays responsive between batches.

  Local test: 10,000 employees × 12 months in about 6–12 s, using about 100 MB of memory.
- **Additional pay and deductions** assigned to an employee are counted in **every** simulated month, the same as the run does today.
