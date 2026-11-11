# Phase 7: Allowances and deductions

**Goal:** let users manage allowance and deduction types, attach recurring amounts to grades, and add one-off pay or deductions to single employees. The UI should also make clear how each item affects the payroll run.

## Screens

- **Allowance types** (catalogue): name, tax exemption rule
- **Grade allowances**: amount per allowance type per grade
- **Deduction types** (catalogue): name only
- **Grade deductions**: amount per deduction type per grade
- **Additional pay types** and **Employee additional pay** (bonus, one-off payment)
- **Additional deduction types** and **Employee additional deductions** (loan repayment, penalty)

## Definition vs assignment

| Catalogue (definition) | Assignment | Assigned to | Amount stored as |
|---|---|---|---|
| `AllowanceDefinition` | `Allowance` | a **grade** (`gradeId`) | `Float`, arrives as a **number** |
| `DeductionDefinition` | `Deduction` | a **grade** (`gradeId`) | `Float`, arrives as a **number** |
| `AdditionalPayDefinition` | `AdditionalPay` | an **employee** (`employeeId`) | `Decimal`, arrives as a **string** |
| `AdditionalDeductionDefinition` | `AdditionalDeduction` | an **employee** (`employeeId`) | `Decimal`, arrives as a **string** |

- A **definition** is a named item in the company catalogue. Removing a definition only deactivates it (`isActive: false`).
- An **assignment** links a definition to a grade or an employee with an amount. Removing an assignment **deletes** it permanently.
- Assignment responses contain only ids, with no nested definition, grade or employee. Load the definitions, grades and employees lists and join them in the UI.
- Every endpoint is scoped to the logged-in user's company. `companyId` is never sent in the body.

## How they feed the payroll run

The amounts are read **when `POST /payroll` runs** (Phase 4). Nothing is stored per period beforehand.

| Item | MANUAL employees | HR_SYNC employees |
|---|---|---|
| Grade allowances (`/allowances`) | Added for the employee's current grade | **Not used.** Allowances come from the HR feed's benefits |
| Grade deductions (`/deductions`) | Deducted for the employee's current grade | **Not used** |
| Allowance type exemption rule | Applied | Applied, matched to the HR benefit **by name** (case-insensitive) |
| Additional pay | Added to gross, **not taxed** | Added to gross, **not taxed** |
| Additional deductions | Deducted after tax | Deducted after tax |

**Allowance tax rule** (the same for both sources):

- `isExempted: false`: the whole amount is taxable.
- `isExempted: true` and amount **>** `startingAmount`: taxable part = amount − `exemptedAmount`.
- `isExempted: true` and amount **≤** `startingAmount`: the whole amount is taxable.
- `isTaxable` is stored but **not used** by either calculation. Only `isExempted` matters.

Example: transport allowance 2,600, `startingAmount` 2,200, `exemptedAmount` 2,200. Taxable part = 400.

**Additional pay and deductions are not tied to a payroll definition or period.** Every run includes **all** of the employee's existing additional pay and deduction rows. They stay until a user removes them, so a one-off bonus is paid again next month unless it is deleted after the run.

**`type` (`AMOUNT` / `PERCENT`)** on additional pay and deduction types is stored only. The calculation always treats `amount` as a fixed money amount.

---

## 7.1 Allowance types

### `POST /allowance-definitions` · permission `create_system_setting`

```json
{
  "name": "Transport allowance",
  "isTaxable": true,
  "isExempted": true,
  "exemptedAmount": 2200,
  "startingAmount": 2200
}
```

| Field | Type | Rule |
|---|---|---|
| `name` | string | Required, 1–100 chars, trimmed. Not unique. |
| `isTaxable` | boolean | Optional, default `false` |
| `isExempted` | boolean | Optional, default `false` |
| `exemptedAmount` | number \| null | **Key required.** Send `null` when not exempt. If a number, it must be > 0. Numeric strings are accepted. |
| `startingAmount` | number \| null | **Key required**, same rules |
| `isActive` | boolean | Optional, default `true` |

When `isExempted` is `true`, both `exemptedAmount` and `startingAmount` must be numbers. Unknown keys are rejected.

**201** `{ message: "Created", data: AllowanceDefinition }`

```ts
type AllowanceDefinition = {
  id: string;
  name: string;
  isTaxable: boolean;
  isExempted: boolean;
  exemptedAmount: string;        // Decimal string, "0" when not exempt
  startingAmount: string | null; // Decimal string
  companyId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### `GET /allowance-definitions` · permission `view_system_setting`

**200** `{ message: "Fetched successfully", data: AllowanceDefinition[] }`. Active types only.

### `GET /allowance-definitions/:id` · permission `view_system_setting`

**200** `{ data: AllowanceDefinition }`. Inactive types are returned too. **404** `AllowanceDefinition not found`.

### `POST /allowance-definitions/:id` (update) · permission `update_system_setting`

All fields are optional: `name`, `isTaxable`, `isExempted`, `exemptedAmount`, `startingAmount`, `isActive`. If sent, `exemptedAmount` and `startingAmount` must be numbers > 0 (no `null`).

**200** `{ message: "Updated", data: AllowanceDefinition }`. **404** `AllowanceDefinition not found`.

### `POST /allowance-definitions/remove/:id` · permission `delete_system_setting`

Soft delete (`isActive: false`). **200** `{ message: "Deleted", data: AllowanceDefinition }`.

UI notes:
- Show `exemptedAmount` and `startingAmount` only when "Tax exempt" is on. When it is off, send `null` for both on create.
- Help text: "Exemption applies only when the amount is above the starting amount."
- **HR_SYNC companies:** each HR sync creates any missing allowance type for every HR benefit name (`isTaxable: true`, `isExempted: false`, `exemptedAmount: "0"`). Users should edit only the **exemption settings** of these types. **Don't allow renaming them**, because payroll matches the HR benefit by exact name (case-insensitive). A renamed type loses its rule, and the next sync creates the original name again.

## 7.2 Grade allowances

### `POST /allowances` · permission `create_system_setting`

```json
{ "amount": 1500, "allowanceDefinitionId": "uuid", "gradeId": "uuid" }
```

All three are required. `amount` > 0. The allowance type must be active and belong to the company.

**201** `{ message: "Created", data: Allowance }`

```ts
type Allowance = {
  id: string;
  amount: number;               // Float, a number (not a string)
  allowanceDefinitionId: string;
  gradeId: string;
  companyId: string;
};
```

### `GET /allowances` · permission `view_system_setting`

**200** `{ message: "Fetched successfully", data: Allowance[] }`. Every grade allowance in the company. There are no filters, so filter by `gradeId` in the UI.

### `GET /allowances/:id` · permission `view_system_setting`

**200** `{ data: Allowance }`. **404** `Allowance not found`.

### `POST /allowances/:id` (update) · permission `update_system_setting`

Optional fields: `amount`, `allowanceDefinitionId`, `gradeId`. **200** `{ message: "Updated", data: Allowance }`.

### `POST /allowances/remove/:id` · permission `delete_system_setting`

Hard delete. **200** `{ message: "Deleted", data: Allowance }`.

| Status | Message | Cause |
|---|---|---|
| 404 | `Allowance definition not found` | Type is inactive or belongs to another company |
| 404 | `Allowance not found` | Unknown id |
| 400 | Prisma message | Unknown `gradeId` (foreign key) |

UI notes:
- Best shown as a grade × allowance-type matrix. Nothing stops the same type being added twice to one grade, and both rows would be paid, so prevent duplicates in the UI.
- **HR_SYNC companies:** grade allowances are ignored for HR-synced employees. Hide this screen or mark it "Manual employees only".

## 7.3 Deduction types

### `POST /deduction-definitions` · permission `create_system_setting`

```json
{ "name": "Credit association", "isActive": true }
```

`name` is required (1–100 chars). `isActive` is optional.

**201** `{ message: "Created", data: DeductionDefinition }`

```ts
type DeductionDefinition = {
  id: string;
  name: string;
  companyId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### `GET /deduction-definitions` · logged-in user only (no permission check)

**200** `{ message: "Fetched successfully", data: DeductionDefinition[] }`. Active types only.

### `GET /deduction-definitions/:id` · permission `view_system_setting`

**200** `{ data: DeductionDefinition }`. **404** `DeductionDefinition not found`.

### `POST /deduction-definitions/:id` (update) · permission `update_system_setting`

Optional fields: `name`, `isActive`. **200** `{ message: "Updated", data }`.

### `POST /deduction-definitions/remove/:id` · permission `delete_system_setting`

Soft delete. **200** `{ message: "Deleted", data }`.

## 7.4 Grade deductions

Same shape and rules as grade allowances (7.2), with `deductionDefinitionId` instead of `allowanceDefinitionId`.

| Endpoint | Permission | Response |
|---|---|---|
| `POST /deductions` with `{ amount, deductionDefinitionId, gradeId }` (all required) | `create_system_setting` | **201** `{ message: "Created", data: Deduction }` |
| `GET /deductions` | logged-in user only | `{ message: "Fetched successfully", data: Deduction[] }` |
| `GET /deductions/:id` | `view_system_setting` | `{ data: Deduction }` |
| `POST /deductions/:id` with optional `amount`, `deductionDefinitionId`, `gradeId` | `update_system_setting` | `{ message: "Updated", data }` |
| `POST /deductions/remove/:id` (hard delete) | `delete_system_setting` | `{ message: "Deleted", data }` |

```ts
type Deduction = {
  id: string;
  amount: number;               // Float
  deductionDefinitionId: string;
  gradeId: string;
  companyId: string;
};
```

Errors: **404** `Deduction definition not found` or `Deduction not found`.

UI notes:
- Grade deductions are deducted after tax for MANUAL employees.
- **HR_SYNC companies:** they are ignored for HR-synced employees. Mark the screen "Manual employees only".

## 7.5 Additional pay types

### `POST /additional-pay-definitions` · permission `create_system_setting`

```json
{ "name": "Performance bonus", "type": "AMOUNT" }
```

`name` (1–100 chars) and `type` (`"AMOUNT"` | `"PERCENT"`) are both required. Unknown keys are rejected.

**201** `{ message: "Created", data: AdditionalPayDefinition }`

```ts
type AdditionalPayDefinition = {
  id: string;
  name: string;
  type: "AMOUNT" | "PERCENT"; // stored only, see "How they feed the payroll run"
  companyId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### `GET /additional-pay-definitions` · permission `view_system_setting`

**200** `{ message: "Fetched successfully", data: AdditionalPayDefinition[], count: number }`. Active types only, newest first.

### `GET /additional-pay-definitions/:id` · permission `view_system_setting`

**200** `{ data, message: "additional pay defination retrieved successfully" }`. Active types only.

### `POST /additional-pay-definitions/:id` (update) · permission `update_system_setting`

Optional fields: `name`, `type`. **200** `{ message: "Updated", data }`.

### `POST /additional-pay-definitions/delete/:id` · permission `delete_system_setting`

Note the path uses **`/delete/`**, not `/remove/`. Soft delete. **200** `{ message: "Deactivated", data }`.

| Status | Message |
|---|---|
| 409 | `Name already exists for this company.` (create) / `Name already exists` (update) |
| 404 | `Definition not found` (unknown or already deactivated) |

## 7.6 Employee additional pay

### `POST /additional-pay` · permission `create_system_setting`

```json
{ "amount": 3000, "employeeId": "uuid", "additionalPayDefinitionId": "uuid" }
```

All three are required. `amount` > 0.

**201** `{ message: "additional pay created", data: AdditionalPay }`

```ts
type AdditionalPay = {
  id: string;
  amount: string;               // Decimal string
  additionalPayDefinitionId: string;
  employeeId: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
};
```

### `GET /additional-pay` · logged-in user only

**200** `{ message: "additional pay fetched successfully", data: AdditionalPay[] }`. All rows in the company. Filter by `employeeId` in the UI.

### `GET /additional-pay/:id` · permission `view_system_setting`

**200** `{ data, message: "additional pay fetched successfully" }`. **404** `AdditionalPay not found`.

### `POST /additional-pay/:id` (update) · permission `update_system_setting`

```json
{ "amount": 3500 }
```

Only `amount` can be changed. To change the employee or type, delete the row and create a new one. **200** `{ message: "additional pay updated", data }`.

### `POST /additional-pay/remove/:id` · permission `delete_system_setting`

Hard delete. **200** `{ message: "additional pay removed", data }`.

UI notes:
- Works for **both** MANUAL and HR_SYNC employees. HR-synced employees get it on top of their HR-calculated pay.
- **It repeats every month until removed.** Show a clear "Pending in next payroll" list and a "Remove after payroll" reminder or action. The payslip has no separate additional pay lines: it is part of `grossSalary` (and for MANUAL employees, `netSalary`).
- Untaxed: show "Not taxed" next to the amount.

## 7.7 Additional deduction types

Same request and validation as 7.5: `{ "name": string, "type": "AMOUNT" | "PERCENT" }`, both required on create and optional on update.

| Endpoint | Permission | Response |
|---|---|---|
| `POST /additional-deduction-definitions` | `create_system_setting` | **201** `{ message: "Created Successfully", data }`. **409** `Name already exists.` |
| `GET /additional-deduction-definitions` | `view_system_setting` | `{ message: "Fetched successfully", data: AdditionalDeductionDefinition[], count }`. Active only, newest first |
| `GET /additional-deduction-definitions/:id` | `view_system_setting` | `{ message: "Fetched successfully", data: [AdditionalDeductionDefinition] }`. **An array with one item.** **400** `additional deduction is not found` |
| `POST /additional-deduction-definitions/:id` | `update_system_setting` | `{ message: "Updated", data }`. No duplicate-name check |
| `POST /additional-deduction-definitions/delete/:id` | `delete_system_setting` | `{ message: "Deactivated", data }`. **400** `deduction is not found` |

```ts
type AdditionalDeductionDefinition = {
  id: string;
  name: string;
  type: "AMOUNT" | "PERCENT"; // stored only
  companyId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

## 7.8 Employee additional deductions

| Endpoint | Permission | Body | Response |
|---|---|---|---|
| `POST /additional-deduction` | `create_system_setting` | `{ amount, employeeId, additionalDeductionDefinitionId }` (all required) | **201** `{ message: "Created", data }` |
| `GET /additional-deduction` | logged-in user only | – | `{ message: "Fetched successfully", data: AdditionalDeduction[] }` |
| `GET /additional-deduction/:id` | `view_system_setting` | – | `{ data, message: "Fetched successfully" }`. **404** `AdditionalDeduction not found` |
| `POST /additional-deduction/:id` | `update_system_setting` | `{ amount? }` only | `{ message: "additional deduction updated", data }` |
| `POST /additional-deduction/remove/:id` (hard delete) | `delete_system_setting` | – | `{ message: "removed additional deduction", data }` |

Note the path is singular: `/additional-deduction`.

```ts
type AdditionalDeduction = {
  id: string;
  amount: string;               // Decimal string
  employeeId: string;
  additionalDeductionDefinitionId: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
};
```

UI notes:
- Applies to MANUAL and HR_SYNC employees. It is deducted after tax and included in `totalDeduction`.
- Like additional pay, it **repeats every run until removed**. For a loan repaid in instalments, this is useful. For a one-off penalty, remove it after the run.

---

## Backend notes

- Additional pay and deductions are never linked to a payroll definition and are not cleared after a run, so every run includes them again.
- `AllowanceDefinition.isTaxable` and the `AMOUNT` / `PERCENT` `type` are not used in any calculation.
- MANUAL net pay: when an exempt allowance is **≤** `startingAmount`, `exemptedAmount` is still added back to net, so net is too high by that amount. HR_SYNC uses `computeNetPay` and doesn't have this problem. MANUAL taxable can also go negative when `exemptedAmount` > amount (HR clamps it at 0).
- Grade allowances and grade deductions are not applied to HR_SYNC employees.
- `POST /allowances/:id` and `POST /deductions/:id` without `allowanceDefinitionId` / `deductionDefinitionId` look up "any active type in the company". If the company has none, they return 404 `... definition not found`.
- `/additional-deduction-definitions/:id` (get, update, delete) is not scoped to the company. Get and delete return 400 (not 404) when the id is not found. Update with an unknown id returns a raw Prisma 400.
- `/additional-pay` and `/additional-deduction` create don't check that the employee and type belong to the company or that the type is active. An unknown id returns a raw Prisma 400.
- `AdditionalPayDefinition` has a unique key on `(name, companyId, isActive)`. Deactivating a second type with the same name as an already-deactivated one fails with a Prisma 400.
- Allowance-definition updates can't reset `exemptedAmount` or `startingAmount` to 0 or `null` (the value must be > 0). Turning `isExempted` on through an update doesn't require them.

## Done when

- [ ] All four type catalogues can be listed, created, edited and deactivated, using the correct `/remove/` or `/delete/` path for each.
- [ ] The allowance type form shows the exemption fields only when exempt, and sends `null` otherwise.
- [ ] The grade allowance and grade deduction screens join type and grade names, block duplicates, and are labelled "Manual employees only" for HR_SYNC companies.
- [ ] HR-created allowance types can't be renamed. Only their exemption settings are editable.
- [ ] The employee additional pay and deduction screens list current rows per employee, and warn that rows repeat every run until removed.
- [ ] Decimal strings (`exemptedAmount`, additional `amount`) and number amounts (grade `amount`) are both parsed correctly.
