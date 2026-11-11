# Phase 4: Payroll run, arrears and recoveries, payslip

**Goal:** run payroll for HR-synced employees (any number, 7,000+ included), review arrears and recoveries before running, and show them on payslips.

## How the amounts work (for labels and help text)

- **Basic salary** is split by days across the month's placement segments. Example: a promotion on the 16th pays 15 days at the old salary and 16 days at the new one.
- **Before the month ends, the run is PROVISIONAL.** Everything after the cutoff is assumed: the employee works every remaining day at the position held on the cutoff date. After the month ends, the run is FINAL.
- When HR later changes a month that was already paid, every sync recalculates that month with the final data. The difference becomes a **PENDING adjustment**, which the **next payroll run picks up automatically**.
  - Positive amount = **arrears** (owed to the employee).
  - Negative amount = **recovery** (overpaid, deducted).
- Arrears are taxed in the month they are paid. Pension and provident fund also apply to salary arrears.
- Tax, pension and PF use the company's active rules (Ethiopian 2025 brackets; pension 7% / 11%).

Worked example: October was paid on the 18th at 14,200. HR then enters a promotion back-dated to 16 October (18,500). October's final amount is 16,419.35, so November's payroll includes **+2,219.35 BASIC arrears**.

---

## 4.0 Preview before running (dry run)

`POST /payroll/preview` · same body as 4.1, but `employeeIds` is **optional**

```json
{ "payrollDefinitionId": "uuid" }
```

- **Without `employeeIds`:** every ACTIVE employee who has **not been run yet** for that month. Use this for the "Not yet run" list.
- **With `employeeIds`:** just those employees, e.g. to check a selection before 4.1.

Runs the same calculation as 4.1 but **saves nothing** and starts no approvals. Call it as often as you like, e.g. after each HR sync.

The existing "not yet run" list, `GET /payroll/definition/:id` ([Phase 9, 9.1](phase-9-payroll-approval-payment-reports.md#91-review-the-months-payroll)), also works for HR-synced employees now, with the same amounts as this preview. Keep using it if the screen already does. Use this preview when you also want totals, warnings and skipped employees.

**200**

```ts
{
  message: "Payroll preview (not saved)";
  data: {
    payrollDefinition: { id: string; payrollName: string; startDate: string; endDate: string; payDate: string };
    mode: "PROVISIONAL" | "FINAL" | null;  // null when no HR-synced employee is in the preview
    cutoffDate: string | null;             // "2026-11-18"
    summary: {
      requested: number;           // ids sent
      calculated: number;          // rows below
      skipped: number;
      withWarnings: number;
      pendingAdjustments: number;  // arrears / recoveries that the run would pay
    };
    totals: PreviewAmounts;        // sum of all rows
    rows: (PreviewAmounts & {
      employeeId: string;
      name: string;
      employeeIdNumber: string | null;
      source: "MANUAL" | "HR_SYNC";
      accountNumber: string | null;
      calculationBasis: CalculationBasis | null; // see 4.3
      warnings: string[];
    })[];
    skipped: { employeeId: string; name: string; reason: string }[];
  };
}

type PreviewAmounts = {          // plain numbers here, rounded to 2 decimals
  basicSalary: number; totalAllowance: number; grossSalary: number; taxableIncome: number;
  incomeTax: number; employeePensionAmount: number; employerPensionAmount: number;
  employeeProvidentFundAmount: number; employerProvidentFundAmount: number;
  totalDeduction: number; netSalary: number;
};
```

| `warnings[]` value | Meaning |
|---|---|
| `Payroll already exists for this period` | The run (4.1) will reject the request while this employee is included. Deselect them. |
| `No bank account` | Can be paid but not by bank transfer (HR has no `net_pay_account`). |
| `Net salary is zero or negative` | Usually missing salary in HR. Check the HR data tab (Phase 2). |

| `skipped[].reason` | Meaning |
|---|---|
| `Not an HR-synced employee (system or admin account)` | In an HR_SYNC company, accounts not from HR (e.g. `cbo.admin`) are never paid. |
| `No HR data synced for YYYY-MM` | Run HR sync first (Phase 2). The run (4.1) would fail with 400 for these. |

UI notes:
- **Flow:** select the definition and employees → **Preview** → review totals, warnings and the per-employee breakdown (`calculationBasis`) → **Run payroll** (4.1) with the employees you keep.
- Show `mode` and `cutoffDate` as a banner: "Provisional: calculated at cutoff 18 Nov".
- Amounts here are **numbers**. After the run, the same fields on `Payroll` rows are Decimal **strings**.

## 4.1 Run payroll (unchanged request, faster)

`POST /payroll`

```json
{ "payrollDefinitionId": "uuid", "employeeIds": ["uuid", "…"] }
```

**201**

```ts
{
  message: "Payroll Create Successfully";
  data: {
    payroll: {
      message: string; // "Payroll created successfully: 7500 HR-synced, 0 attendance-based, 0 standard calculations"
      attendanceBasedCalculation: boolean;
      summary: { total: number; hrSynced: number; attendanceBased: number; standard: number; skipped: number };
      skipped: { employeeId: string; name: string; reason: string }[]; // e.g. the company admin login in HR_SYNC companies
      payrolls: { id: string; employeeId: string }[];
    };
  };
}
```

- **Batch size:** 7,000+ employees in one request is fine (about 7–8 s), so there's no need to split it. Show a loading state.
- **Atomic:** if anything fails, nothing is created.
- Errors:

| Status | Message | UI |
|---|---|---|
| 400 | `No HR data synced for N employee(s) in period YYYY-MM (e.g. <id>). Run HR sync first.` | Offer "Sync now" (Phase 2) |
| 400 | `Payroll already exists for one or more employees in this period` | Already run |
| 400 | `One or more employees not found` | Non-active or unknown ids |
| 400 | `None of the selected employees can be paid in this payroll` | Everyone was skipped (e.g. only the admin account was selected) |
| 400 | `<name> requires attendance but has no attendance device ID` | MANUAL attendance-based employee without a device id |
| 400 | `First workflow stage has no assigned employees` | Approval workflow setup |
| 404 | `No active workflow found for payroll` | Approval workflow setup |

Approvals work as before: each payroll gets a `Request` and an `ApprovalInstance`.

## 4.2 Review arrears and recoveries

`GET /payroll/adjustments?payrollDefinitionId=<uuid>&status=PENDING|APPLIED|CANCELLED` (both filters optional)

`payrollDefinitionId` matches either the month being **corrected** (source) or the month it was **paid in** (target).

**200** `{ data: PayrollAdjustment[], count: number }`

```ts
type PayrollAdjustment = {
  id: string;
  employeeId: string;
  sourcePayrollDefinitionId: string;          // month being corrected
  targetPayrollDefinitionId: string | null;   // month it was paid in (null while PENDING)
  component: "BASIC" | "ACTING" | "ALLOWANCE" | "OVERTIME" | "LWOP";
  amount: string;            // Decimal as string; "+" arrears, "-" recovery
  isTaxable: boolean;
  status: "PENDING" | "APPLIED" | "CANCELLED";
  reason: string | null;     // e.g. "Arrears for 2026-10: basic changed after provisional payroll"
  needsReview: boolean;      // true when the employee is no longer ACTIVE (it won't be picked up automatically)
  details: {
    paid: number;            // what was paid for this component
    final: number;           // what it should have been
    alreadyApplied: number;  // corrections already paid
    snapshotHash: string;
    finalSegments: { from: string; to: string; days: number; divisor: number; monthlySalary: number; amount: number; actingAmount: number; assumed: boolean }[];
  } | null;
  appliedAt: string | null;
  createdAt: string;
  employee: { id: string; name: string; employeeIdNumber: string | null; status: string };
  sourcePeriod: { id: string; payrollName: string; startDate: string };
  targetPeriod: { id: string; payrollName: string; startDate: string } | null;
};
```

UI notes:
- **Where it appears:** before the user clicks "Run payroll" for a month, show **"Pending arrears and recoveries"**: `GET /payroll/adjustments?status=PENDING`. These will be included in the run.
- **Table columns:** employee, from month (`sourcePeriod.payrollName`), component, amount (green +, red −), reason, and a details drawer (`paid` → `final`, plus `finalSegments`).
- **`needsReview`:** highlight these. The employee has left or isn't ACTIVE, so the recovery has to be settled by hand.
- **Values change between syncs:** PENDING amounts are recalculated every sync until they are paid. Only APPLIED rows are final.
- **Paid view:** after the run, `GET /payroll/adjustments?payrollDefinitionId=<that month>&status=APPLIED` lists what was paid in that month.

## 4.3 New fields on payroll rows (payslip)

Wherever existing endpoints return `Payroll` rows:

```ts
type PayrollRowAdditions = {
  employeeProvidentFundAmount: string;   // Decimal string, deducted from net
  employerProvidentFundAmount: string;   // company cost
  calculationBasis: CalculationBasis | null; // null for MANUAL employees
};

type CalculationBasis = {
  source: "HR_SYNC";
  mode: "PROVISIONAL" | "FINAL";
  cutoffDate: string;          // "2026-10-18"
  period: string;              // "2026-10"
  snapshotHash: string;
  components: { basic: number; acting: number; allowance: number; overtime: number; lwop: number };
  detail: {
    allowances: { name: string; amount: number }[];
    overtimeByCategory: Record<string, { hours: number; rate: number; amount: number }>;
    lwopDays: number;
    absentDays: number;
    segments: { from: string; to: string; days: number; divisor: number; monthlySalary: number; amount: number; actingAmount: number; assumed: boolean }[];
    monthlySalary: number;
  };
  appliedAdjustmentIds: string[]; // arrears / recoveries included in this payslip
  calculatedAt: string;
};
```

### Payslip layout for HR-synced employees

| Section | Source |
|---|---|
| Basic (prorated) | `calculationBasis.components.basic` plus `.acting`; segments from `detail.segments` (mark `assumed: true` days as "assumed after cutoff") |
| Allowances | `detail.allowances[]` |
| Overtime | `detail.overtimeByCategory` (hours × rate) |
| Unpaid leave / absence | `−components.lwop` (`detail.lwopDays`, `detail.absentDays`) |
| **Arrears / recoveries** | Load the adjustments in `appliedAdjustmentIds` (or `GET /payroll/adjustments?payrollDefinitionId=<this month>&status=APPLIED`, filtered by employee). One line each: "Arrears Oct 2026 – Basic +2,219.35" |
| Gross / taxable / tax / pension / PF / net | existing fields plus `employeeProvidentFundAmount` |
| Label | `PROVISIONAL` → "Calculated at cutoff (18 Oct); later changes settle next month" |

## Done when

- [ ] The run-payroll screen has a **Preview** step (4.0) with totals, warnings, skipped employees and the per-employee breakdown before **Run payroll**.
- [ ] The run-payroll screen shows pending arrears and recoveries first, and handles the "Run HR sync first" error with a Sync now action.
- [ ] The arrears table, with its details drawer and the `needsReview` highlight, is in place.
- [ ] The payslip shows prorated segments, allowances, overtime, unpaid leave, arrears lines and PF.
- [ ] The PROVISIONAL label is shown with the cutoff date.
