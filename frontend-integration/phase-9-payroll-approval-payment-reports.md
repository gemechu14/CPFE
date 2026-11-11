# Phase 9: Payroll review, approval, payment and reports

**Goal:** after a payroll run ([Phase 4](phase-4-payroll-run-and-arrears.md)), users can review the month's payroll, approve it through the workflow stages, send salaries to the bank, and download payslip and leave reports.

## End-to-end flow

1. **Set up once:** an active `PAYROLL` approval workflow with at least one stage that has approvers (9.2). Employees need a verified bank account (9.5). The company needs a verified master account (an `Account` row with `isMaster`, `isVerified` and `isActive` all true). This API has no endpoint to create it.
2. **Run payroll:** `POST /payroll` ([Phase 4, 4.1](phase-4-payroll-run-and-arrears.md#41-run-payroll-unchanged-request-faster)). Each new `Payroll` row starts as `status: "CREATED"` and `paymentStatus: "UNPAID"`. The backend also creates a `Request` (`type: "PAYROLL"`, `moduleId` = payroll id), an `ApprovalInstance` (`PENDING`, active stage = first stage) and a `PENDING` `StageStatus` for each approver in the first stage.
3. **Review:** list the month's rows (9.1).
4. **Approve:** each approver loads their queue (`GET /payroll/approvals/instance`) and approves or rejects (9.3). When the last stage completes, the payroll row becomes `status: "APPROVED"`.
5. **Pay:** `POST /payment` with the approved payroll ids (9.4). `paymentStatus` goes `UNPAID → PENDING`, then the bank webhook sets it to `PAID` or `FAILED`.
6. **Reports:** payslip list and Excel/CSV downloads (9.6).

```
Payroll.status:        CREATED ──(last stage approved)──▶ APPROVED
Payroll.paymentStatus: UNPAID ──(POST /payment accepted)──▶ PENDING ──(bank webhook)──▶ PAID | FAILED
ApprovalInstance:      PENDING ──▶ APPROVED | REJECTED   (resubmit creates a new PENDING instance, version + 1)
```

Payroll rows for HR-synced employees also carry `calculationBasis`, `employeeProvidentFundAmount` and `employerProvidentFundAmount`. See [Phase 4, 4.3](phase-4-payroll-run-and-arrears.md#43-new-fields-on-payroll-rows-payslip). Endpoints below that return full `Payroll` rows include these fields.

## Screens

1. **Payroll → This month**: tabs for *Not yet paid*, *Approved* and *Paid*, plus a "close to pay date" banner.
2. **Approvals → My queue**: the payroll rows waiting for me, with Approve and Reject (one or many).
3. **Approval details** drawer: stages, who approved, comments, audit log, and Resubmit for rejected requests.
4. **Settings → Approval workflows**: list, create (stages and approvers), and view stages.
5. **Payments**: pay the selected approved rows, the result per employee, and transaction history.
6. **Employee → Bank account**: verify the account number with the bank, then mark it verified.
7. **Reports**: the payslip table (paginated), Excel/CSV downloads, and the leave report download.

## Shared types

```ts
// Full Payroll row. Decimal fields arrive as strings.
type Payroll = {
  id: string;
  employeeId: string;
  payrollDefinitionId: string;
  grossSalary: string; basicSalary: string; taxableIncome: string; incomeTax: string;
  totalDeduction: string; totalAllowance: string; netSalary: string;
  employeePensionAmount: string; employerPensionAmount: string;
  employeeProvidentFundAmount: string; employerProvidentFundAmount: string;
  status: "CREATED" | "PENDING" | "APPROVED" | "FAILED";
  paymentStatus: "UNPAID" | "PENDING" | "PAID" | "FAILED";
  calculationBasis: CalculationBasis | null; // Phase 4, 4.3
  createdAt: string; updatedAt: string;
};

type PayrollEmployeeSummary = {
  id: string;
  name: string;
  payrollInfo: { employmentType: "PERMANENT" | "CONTRACT" | "HOURLY" | "SEASONAL" | null; basicSalary: number | null; tinNumber: string | null } | null;
  gradeHistory: { grade: { name: string } }[]; // current grade only
};

type PayrollWithEmployee = Payroll & { employee: PayrollEmployeeSummary };
```

Most `/payroll` responses are `{ data, message }`. `/payment` responses are `{ success, message, data?, error? }`.

---

## 9.1 Review the month's payroll

"Current month" below means the company's payroll definition that covers today. If none does, the backend uses the next upcoming one, and if there is none, the most recent past one.

### List rows by state

| Endpoint | Returns |
|---|---|
| `GET /payroll/published` | Current month rows where `paymentStatus` is not `PAID` (any approval status) |
| `GET /payroll/approved` | Current month rows with `status: "APPROVED"` |
| `GET /payroll/paid` | Current month rows with `paymentStatus: "PAID"` |

No permission is needed, only a logged-in user. There is no pagination.

**200** `{ data: PayrollWithEmployee[], message: string }`

### Payment preview list

`GET /payroll/process/payments`

**200** `{ data: PaymentPreviewRow[], message }`. These are current month rows with `status: "CREATED"`, which means **not yet approved**.

```ts
type PaymentPreviewRow = {
  totalAllowance: string; totalDeduction: string; taxableIncome: string; grossSalary: string; netSalary: string;
  employee: PayrollEmployeeSummary; // payrollInfo here has basicSalary, employmentType, tinNumber
};
```

**404** `Current payroll definition not found` when the company has no payroll definition at all.

### Pay-date window check

`GET /payroll/isvalid-date/:id` (`id` = payroll definition UUID) or `GET /payroll/isvalid-date` (current month)

**200**

```ts
{ success: true; data: { isValid: boolean }; message: string }
```

`isValid` is `true` when the definition's `endDate` is 0 to 5 days away. **404** `Payroll definition not found`.

### Preview for employees not yet in the run

`GET /payroll/definition/:id` (`id` = payroll definition UUID)

**200** `{ data: CalculatedPayroll[], message }`

This does **not** return existing payroll rows. It returns an unsaved estimate for each ACTIVE employee of **my company** who has **no** payroll row for that definition yet.

- **MANUAL employees:** calculated from grade, as before. Employees without `payrollInfo` or a current grade are left out.
- **HR-synced employees:** calculated from the HR snapshot, exactly like the run ([Phase 4](phase-4-payroll-run-and-arrears.md)). Employees without synced HR data for the month are left out. In HR_SYNC companies, non-HR accounts (e.g. `cbo.admin`) are left out.
- HR-synced rows also have `employeeProvidentFundAmount`, `employerProvidentFundAmount` and `calculationBasis` (Phase 4, 4.3), as plain numbers.

```ts
type CalculatedPayroll = {
  employeeId: string;
  payrollDefinitionId: string;
  grossSalary: number; basicSalary: number; taxableIncome: number; incomeTax: number;
  totalDeduction: number; totalAllowance: number; netSalary: number;
  employeePensionAmount: number; employerPensionAmount: number; // plain numbers, not strings
  employeeProvidentFundAmount?: number; employerProvidentFundAmount?: number; // HR-synced rows only
  calculationBasis?: CalculationBasis | null;                                 // HR-synced rows only
  status: "CALCULATED";
  createdAt: string; updatedAt: string;
  employee: PayrollEmployeeSummary;
};
```

**404** `Payroll definition not found` (also for another company's definition).

`GET /payroll/non-payroll-employees?id=<payrollDefinitionId>`

**200** `{ data: { name: string; gradeHistory: EmployeeGradeHistory[]; positionHistory: EmployeePositionHistory[] }[], message }`: ACTIVE employees without a row for that definition. The histories contain only current records (`toDate = null`), with raw ids and no names. **404** `Payroll definition not found`.

### Stub endpoints (don't use)

| Endpoint | Behaviour today |
|---|---|
| `GET /payroll/current-month` | **200** `{ message }` with no `data` (the service body is commented out) |
| `GET /payroll/payroll-setup` | **200** `{ message }` with no `data` |
| `GET /payroll/process/payment/:id` | **200** `{ message }` with no `data` |

### Already documented in Phase 4

- `POST /payroll`: run payroll ([4.1](phase-4-payroll-run-and-arrears.md#41-run-payroll-unchanged-request-faster))
- `GET /payroll/adjustments`: arrears and recoveries ([4.2](phase-4-payroll-run-and-arrears.md#42-review-arrears-and-recoveries))
- `POST /payroll/definitions/:id/close`: close a period ([README](README.md))

There is **no** endpoint to delete or recalculate a payroll row, or to get a single row by id.

UI notes:
- For the *This month* screen, use `/published` for "not yet paid", `/approved` for "ready to pay", and `/paid`. Group them by `status`/`paymentStatus` badges.
- Show the "pay date is close" banner when `isvalid-date` returns `isValid: true`.
- For HR-synced rows, show the PROVISIONAL/FINAL label and the PF columns from Phase 4, 4.3.

## 9.2 Approval workflow setup

### Create a workflow

`POST /approvals/createWorkflow` · permission `create_system_setting`

```json
{
  "name": "Payroll approval",
  "requestType": "PAYROLL",
  "isFullyParallel": false,
  "departmentId": "uuid (optional)",
  "stages": [
    { "order": 1, "isParallel": false, "approvalRules": { "type": "all" }, "employeeIds": ["uuid", "uuid"] },
    { "order": 2, "isParallel": false, "approvalRules": { "type": "anyN", "required": 1 }, "employeeIds": ["uuid", "uuid"] }
  ]
}
```

| Field | Rule |
|---|---|
| `name` | 1–100 chars, letters, digits, space, `. , _ - /` |
| `requestType` | `ATTENDANCE` · `LEAVE` · `PAYROLL` · `PROGRAM` |
| `stages` | 1–50 items, `order` integer ≥ 0 and unique |
| `stages[].employeeIds` | 1–100 unique employee UUIDs |
| `approvalRules` | `{ type: "all", required?: number }` (every approver), `{ type: "anyN", required: n }` (n ≤ number of approvers), or `{ type: "weighted", threshold: n, weights: { [employeeId]: weight } }` (threshold ≤ sum of weights, and a weight for every approver) |

**201** `{ message: "Workflow created", data: ApprovalWorkflow }`

```ts
type ApprovalWorkflow = {
  id: string; name: string; companyId: string; departmentId: string | null;
  requestType: "ATTENDANCE" | "LEAVE" | "PAYROLL" | "PROGRAM";
  isFullyParallel: boolean; isActive: boolean; createdAt: string; updatedAt: string;
};
```

- Creating a workflow **deactivates** the previous active workflow of the same `requestType`. There is no update endpoint, so to change approvers, create a new workflow.
- Stages run in `order`. When one stage completes, the next one starts. With `isFullyParallel: true`, the instance is approved once all active stages are complete. Payroll runs only ever start the first stage, so use `isFullyParallel: false` for payroll.
- `isParallel` on a stage is stored but not used.
- Errors: **400** validation, or `Invalid employee ID(s): …`. **500** with the message for other failures.

### List and view

`GET /approvals/workflows` · permission `view_system_setting` → **200** `{ message, data: { id, name, requestType }[] }` (active workflows of my company)

`GET /approvals/workflows/:departmentId` · permission `view_system_setting` → same shape, filtered by department. **404** `Department not found`.

`GET /approvals/workflows/:workflowId/stages` · permission `view_system_setting` → **200** `{ message, data: WorkflowWithStages[] }` (an array with 0 or 1 item, active workflows only)

```ts
type WorkflowWithStages = {
  id: string;
  requestType: string;
  stages: {
    id: string; workflowId: string; isParallel: boolean; order: number;
    approvalRules: { type: "all" | "anyN" | "weighted"; required?: number; threshold?: number; weights?: Record<string, number> };
    createdAt: string; updatedAt: string;
    stageEmployees: { employee: { name: string } }[];
  }[]; // not sorted, so sort by `order` on the client
};
```

### Delegation rule

`POST /approvals/createDelegation` · permission `create_system_setting`

```json
{ "requestType": "PAYROLL", "fromEmployeeId": "uuid", "toEmployeeId": "uuid" }
```

**201** `{ message: "Delegation rule created", data: { id, requestType, fromEmployeeId, toEmployeeId, createdAt, updatedAt } }` · **400** `Both fromEmployeeId and toEmployeeId must be valid employees` or `Delegation rule already exists for this pair of employees`.

Delegation applies only to requests made through `POST /approvals/createRequest`. Payroll runs don't apply it. See the Backend notes.

### Generic request (not used for payroll)

`POST /approvals/createRequest` (no permission)

```json
{ "requestType": "LEAVE", "moduleId": "uuid" }
```

**201** `{ message: "Request created", data: { request: { id }, instance: { id } } }` · **404** `No approval workflow found.` · **409** `Request of this type already exists for this user.` · **400** `Workflow has no stages.`, `Fully parallel workflows must have exactly one stage`, `First stage has no assigned employees`.

Payroll requests are created by `POST /payroll` itself, so don't call this for payroll.

## 9.3 Approve or reject payroll

### My queue

`GET /payroll/approvals/instance` · permission `create_payroll_approval`

**200** `{ data: PendingPayrollApproval[], message }`: payroll rows where I have a `PENDING` stage status on a currently active stage.

```ts
type PendingPayrollApproval = {
  id: string; // payroll id
  grossSalary: string; basicSalary: string; netSalary: string; taxableIncome: string; incomeTax: string;
  totalAllowance: string; totalDeduction: string; employeePensionAmount: string; employerPensionAmount: string;
  employee: { name: string; grade: string | null } | null;
  approvalInstanceId: string | null; // send as instanceId
  stageIds: string[];                // send stageIds[0] as stageId
};
```

**400** `Failed to fetch pending payrolls` on any internal error. This list doesn't include PF, `calculationBasis` or the period.

### Approve or reject one

`POST /approvals/action` (no permission check, but the user must be an approver of that stage)

```json
{ "instanceId": "uuid", "stageId": "uuid", "action": "APPROVED", "comment": "optional, ≤ 1000 chars" }
```

`action` is `"APPROVED"` or `"REJECTED"`.

**200** `{ message: "Action performed", data: { instanceId: string; stageId: string; status: "APPROVED" | "REJECTED" } }`

`data.status` echoes the action. It is not the instance status.

| Status | Message | Meaning |
|---|---|---|
| 400 | `Approval instance not found` | Bad `instanceId` |
| 400 | `Stage not active or invalid` | The stage isn't the current one, or the instance is already approved or rejected |
| 403 | `User not authorized for stage` | The user isn't an approver of this stage |
| 400 | `No pending stage status` | No stage status for this user |

What happens:
- **Approve:** my stage status becomes `APPROVED`. If the stage rule is met (`all`, `anyN` or `weighted`), the next stage becomes active and its approvers get `PENDING` statuses. When there is no next stage, the instance becomes `APPROVED` and the **payroll row's `status` becomes `"APPROVED"`**. The requester is notified.
- **Reject:** my stage status becomes `REJECTED`, the instance becomes `REJECTED` (no active stages), and the requester is notified. **The payroll row is not changed** (it stays `CREATED`).
- The comment is saved as an `ApprovalComment`.

### Approve or reject many

`POST /approvals/approve` (no permission check)

```json
[
  { "instanceId": "uuid", "stageId": "uuid", "action": "APPROVED" },
  { "instanceId": "uuid", "stageId": "uuid", "action": "APPROVED", "comment": "ok" }
]
```

**200** `{ message: "Bulk approval processed", count: number, data: { instanceId, stageId, status }[] }`

The items run in parallel. If one fails, the whole request returns that error, **but the items that succeeded stay saved**. Reload the queue after any error.

### Resubmit a rejected request

`POST /approvals/resubmit/:instanceId` (no permission check, only the original requester)

```json
{ "reason": "optional, ≤ 1000 chars" }
```

**201** `{ message: "Request resubmitted", data: ApprovalInstance }`. This is a new instance with `version + 1`, `parentInstanceId` set, and the first stage active again.

**404** `Original approval instance not found` · **400** `Only rejected requests can be resubmitted` · **403** `Only the original requestor can resubmit`.

### Details and audit log

`GET /approvals/instance/:id` → **200** `{ message: "Instance details", data: ApprovalInstanceDetails | null }`

```ts
type ApprovalInstanceDetails = {
  id: string; requestId: string; workflowId: string; activeStageIds: string[];
  status: "PENDING" | "APPROVED" | "REJECTED"; version: number;
  parentInstanceId: string | null; resubmissionReason: string | null; createdAt: string; updatedAt: string;
  workflow: ApprovalWorkflow & { stages: (Stage & { stageEmployees: { id; stageId; employeeId; weight: number | null }[] })[] };
  stageStatuses: { id; instanceId; stageId; approvedBy: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "DELEGATED"; comments: string | null; approvedAt: string | null; Delegation: unknown[] }[];
  ApprovalComment: { id; instanceId; authorId; comment; createdAt }[];
  ApprovalNotification: { id; instanceId; recipientId; message; read: boolean; createdAt }[];
  ApprovalAuditLog: { id; instanceId; action: string; performedBy: string; details: string | null; createdAt }[];
};
```

`GET /approvals/audit-log?instanceId=<uuid>` → **200** `{ message: "Audit log", data: ApprovalAuditLog[] }` (oldest first). `action` values include `"rejected"`, `"resubmitted"` and `"delegate"`. Approvals are not logged here.

UI notes:
- The queue gives you `approvalInstanceId` and `stageIds` per row. Use them directly for Approve/Reject, with a multi-select bulk Approve.
- Names in `stageStatuses` and audit logs are employee ids. Map them to names yourself.
- No endpoint lists all payroll approval instances or maps a payroll id to its instance, except the approver's own queue.

## 9.4 Pay approved payroll

### Send payment

`POST /payment` (same as `POST /payment/process`). No permission check.

```json
{ "payrollIds": ["uuid", "…"] }
```

At least one id is required.

Each id is checked. Invalid ones are skipped with a reason, and valid ones are sent to the bank **one by one**:

| Check | Reason when it fails |
|---|---|
| Row exists | `Payroll record not found` |
| Belongs to the payroll definition that covers **today** | `Payroll does not belong to current active payroll definition` |
| `status === "APPROVED"` | `Payroll must be approved before continuing` |
| `paymentStatus === "UNPAID"` | `Payroll payment status is '<status>'. Only 'UNPAID' status is eligible for payment` |
| Employee `payrollInfo.accountNumber` set | `Employee does not have account number set` |
| `payrollInfo.isVerified` | `Employee account is not verified` |
| `payrollInfo.isActive` | `Employee payroll info is not active` |

**200** in every handled case. Check `success`:

```ts
type PaymentResponse = {
  success: boolean;      // true if at least one payment was accepted by the bank
  message: string;       // "All (3) payments completed successfully" | "Partial success: 2 payments completed, 1 failed (1 invalid payrolls skipped)" | …
  error?: string;
  data?: {
    totalRequested: number;
    totalValidPayrolls: number;
    totalInvalidPayrolls: number;
    successfulPayments: number;
    failedPayments: number;
    totalSuccessfulAmount: number;
    results: { payrollId: string; employeeId: string; employeeName?: string; success: boolean; amount?: number; orderId?: string; error?: string }[];
    invalidPayrollsSummary?: { payrollId: string; employeeId?: string; employeeName?: string; reason: string }[];
  };
};
```

Other outcomes:
- No valid ids: `success: false`, `message: "No valid payrolls found for processing"`, `data: { totalRequested, validPayrolls, invalidPayrolls, invalidReasons }`.
- No payroll definition covers today, or no verified master account: `success: false`, `message: "Failed to process bulk payment"`, `error: <reason>` (no `data`).
- An unexpected crash: **500** `{ success: false, message: "Internal server error", error }`.

After the bank accepts a payment, `paymentStatus` becomes `PENDING`. The bank later calls the backend webhook, which sets `PAID` (or `FAILED`) and stores the bank `transactionId`.

### Transaction history

`GET /payment/history?limit=50&offset=0` · permission `read_payment`

`limit` defaults to 50 and `offset` to 0. They aren't validated.

**200** `{ success: true, message, data: TransactionBatch[] }` (newest first). On error: **500** `{ success: false, message, error }`.

```ts
type TransactionBatch = {
  id: string; batchId: string; idempotencyKey: string; debitAccount: string;
  totalAmount: number; // Float, a number
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string; updatedAt: string;
  transactions: (TransactionHistory & { batch: Omit<TransactionBatch, "transactions"> })[];
};
type TransactionHistory = {
  id: string; transactionBatchId: string; transactionId: string; // "" until the bank webhook arrives
  employeeId: string; payrollDefinitionId: string; payrollId: string;
  creditAccountNumber: string; orderId: string; amount: number;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string; updatedAt: string;
};
```

Each paid payroll gets **its own batch**, with one transaction in it.

### One batch

`GET /payment/batch/:batchId` (no permission check). `batchId` is the batch's `batchId` field, **not** `id`.

**200** `{ success: true, message, data: TransactionBatch }` (transactions without the nested `batch`) · **404** `{ success: false, message: "Transaction batch not found" }`.

UI notes:
- Build the pay screen from `GET /payroll/approved`, filtered to `paymentStatus === "UNPAID"`. Send the selected ids.
- Show `results[]` as a table (green or red per employee) and list `invalidPayrollsSummary` reasons. Payment can take a while because each employee is a separate bank call, so show a loading state.
- Payment works only while today is inside the payroll definition's start and end dates.
- Refresh `/payroll/paid` or `/payment/history` later to see the `PAID` status from the webhook.

## 9.5 Employee bank account verification

### Check an account with the bank

`POST /accounts/verify` · permission `create_employee`

```json
{ "accountNumber": "1000123456789" }
```

Digits only.

**200** when found:

```ts
{
  message: "Account verification successful";
  data: { exists: { customerInfo: { FULLNAME: string; ACCOUNTNUMBER: string; PHONENUMBER?: string; BIRTHDATE?: string; CATEGORY?: string; MARITAL?: string; EMAIL?: unknown; UnquieCustomerId?: string } } };
}
```

| Status | Body | Meaning |
|---|---|---|
| **200** | `{ code: 200, message: "Account verification failed. Please check the account number and try again" }` (no `data`) | The bank doesn't know the account. **Check for `data`, not the status code.** |
| 400 | `Invalid response from external verification service` | Bad response from the bank |
| 503 | `Failed to connect to account verification service` | The bank service can't be reached |

### Mark the account verified

`POST /accounts/verification-status/:payrollInfoId` · permission `create_employee`

```json
{ "isVerified": true }
```

**200** `{ message: "Account verification status updated successfully", data: PayrollInfo }` · **404** `Payroll information not found`.

```ts
type PayrollInfo = {
  id: string; employeeId: string; tinNumber: string | null; hireDate: string | null; basicSalary: number | null;
  currency: string; employmentType: string | null; payFrequency: string | null;
  accountNumber: string | null; isVerified: boolean; isActive: boolean; costCenterId: string | null;
};
```

UI notes: call `verify` and show `FULLNAME` next to the employee's name. If they match, call `verification-status` with `isVerified: true`. Payment (9.4) skips employees whose account isn't verified.

## 9.6 Reports

All report routes need only a logged-in user.

```ts
type PayslipReportRow = {
  fullName: string; employeeType: string; grade: string; department: string; position: string; // "N/A" when missing
  basicSalary: number; totalAllowance: number; totalDeduction: number; incomeTax: number;
  taxableIncome: number; grossSalary: number; netSalary: number; // plain numbers
  paymentStatus: string;
};
```

### Payslip table for a month (paginated)

`GET /reports/payslip/bulk/:payrollDefinitionId?page=1&limit=10`

`page` must be ≥ 1 (default 1). `limit` must be from 1 to 100 (default 10). Other query keys are rejected.

**200**

```ts
{
  success: true; message: string;
  data: PayslipReportRow[]; // sorted by employee name
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
```

**404** `Payroll definition not found`.

### One employee's payslips

`GET /reports/payslip/individual/:employeeId?payrollDefinitionId=<uuid>`

`payrollDefinitionId` is optional.

**200** `{ success: true, message, data: PayslipReportRow[] }`. With `payrollDefinitionId` you get that month (0 or 1 row). Without it you get **every** month, newest first.

**404** `Employee not found` or `No payslip records found for this employee`.

### Downloads

| Endpoint | File |
|---|---|
| `GET /reports/payslip/bulk/:payrollDefinitionId/download?format=excel\|csv` | All rows for the month: `payslip-report-YYYY-MM-DD.xlsx` / `.csv` |
| `GET /reports/payslip/individual/:employeeId/download?format=excel\|csv[&payrollDefinitionId=uuid]` | `payslip-<Full-Name>-YYYY-MM-DD.xlsx` / `.csv` |
| `GET /reports/leave/annual/download?leaveTypeId=uuid&format=excel\|csv[&departmentId=uuid]` | `leave-report-YYYY-MM-DD.xlsx` / `.csv` |

`format` is required.

- Excel: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- CSV: `Content-Type: text/csv; charset=utf-8`
- Both send `Content-Disposition: attachment; filename="…"`.

Payslip columns: Full Name, Employee Type, Grade, Department, Position, Basic Salary, Total Allowance, Total Deduction, Income Tax, Taxable Income, Gross Salary, Net Salary, Payment Status.

The leave report uses the **AL template** when the leave type's `shortName` is `"AL"`: ID, Employee Name, Date Of Employment, Term Of Employment, Department, Total Leave, Leave Taken, Leave Balance, Monthly Leave Days, Total Annual Leave Month, AL Allocation. Other leave types use the first eight of those columns. Leave report errors: **404** `Leave type not found`, **403** `Leave type does not belong to your company`.

Fetching a file (the request needs the Bearer header, so a plain `<a href>` won't work):

```ts
const res = await api.get(`/reports/payslip/bulk/${defId}/download`, {
  params: { format: "excel" },
  responseType: "blob",
});
const name = /filename="(.+)"/.exec(res.headers["content-disposition"] ?? "")?.[1] ?? "payslip-report.xlsx";
const url = URL.createObjectURL(res.data);
const a = Object.assign(document.createElement("a"), { href: url, download: name });
a.click();
URL.revokeObjectURL(url);
```

If the download fails, the error body also arrives as a Blob. Read it with `JSON.parse(await err.response.data.text())` to show the message. To read `Content-Disposition` cross-origin, the server must expose that header. If it doesn't, fall back to a default name.

UI notes:
- The payslip report has **no** pension, provident fund, arrears or `calculationBasis` columns. For a full HR-synced payslip, build it from the payroll row (`/payroll/published`, `/approved` or `/paid`) plus `GET /payroll/adjustments` as described in [Phase 4, 4.3](phase-4-payroll-run-and-arrears.md#43-new-fields-on-payroll-rows-payslip).
- Amounts in reports are numbers, not strings.

## Backend notes

- **Payslip report lacks arrears, PF and pension:** `PayslipReportRow` has no `employeePensionAmount`, `employeeProvidentFundAmount`, `employerProvidentFundAmount`, applied arrears or recoveries, or `calculationBasis`. Downloaded payslips for HR-synced employees are incomplete.
- **Reports and approval reads aren't scoped by company:** `/reports/payslip/*`, `/payroll/non-payroll-employees`, `/approvals/instance/:id` and `/approvals/audit-log` accept any id from any company.
- **`/payroll/approved`, `/published` and `/paid` with no payroll definition:** `getCurrentMonth` returns `{ payrollDefinition: null }` (never falsy), so the filter becomes `payrollDefinitionId: undefined` and Prisma returns rows from **all companies**.
- `GET /payroll/definition/:id` returns only estimates for employees without a payroll row. Existing rows are built but dropped. (HR-synced employees are now estimated from HR data.)
- `GET /payroll/process/payments` lists `CREATED` (unapproved) rows without payroll `id`, so it can't drive `POST /payment`, which needs `APPROVED` ids.
- `GET /payroll/non-payroll-employees` returns no employee `id`.
- `GET /payroll/current-month`, `/payroll-setup` and `/process/payment/:id` are stubs that return no `data`.
- Payroll runs create approval instances directly. They skip delegation rules, notifications and audit logs, unlike `createRequest`.
- Rejection doesn't change `Payroll.status`, and a rejected payroll can't be re-run because the row exists and there's no delete endpoint. Resubmit is the only path.
- `handleApproval` doesn't check that my stage status is still `PENDING` or `DELEGATED`. A delegate (not a stage employee) gets 403.
- `POST /approvals/createWorkflow` deactivates the active workflow of that `requestType` **in any company** (the lookup has no `companyId`).
- `POST /approvals/createDelegation` writes an `ApprovalNotification` with `instanceId: ""`. This likely fails the foreign key, so the endpoint probably returns 500.
- `POST /approvals/approve` uses `Promise.all`, so partial success is possible on error.
- `POST /payment` has no permission check. Its bank URL is hard-coded to `http:localhost:4000` (it ignores `PAYMENT_API_BASE_URL`). The invalid-status reason prints `payroll.status` instead of `paymentStatus`. A `FAILED` payment can't be retried because only `UNPAID` is accepted.
- `POST /accounts/verify` reports "not found" as an error with HTTP **200**.
- `/payroll` has 15 routes, not 18.

## Done when

- [ ] The *This month* screen lists unpaid, approved and paid rows, with status badges and PF and PROVISIONAL info for HR-synced rows.
- [ ] Admins can create a payroll workflow (stages, rules, approvers) and view its stages.
- [ ] Approvers see their queue, approve or reject one or many with a comment, and see instance details and the audit log. Requesters can resubmit rejected ones.
- [ ] The pay screen sends approved, unpaid ids and shows per-employee results and invalid reasons. Payment history and batch details are viewable.
- [ ] Employee bank accounts can be verified with the bank and marked verified, handling the 200-with-no-`data` failure.
- [ ] The payslip table paginates, and the bulk, individual and leave reports download as Excel or CSV via `responseType: "blob"`.
- [ ] HR-synced payslips show arrears and PF from payroll rows and adjustments, not from the payslip report.
