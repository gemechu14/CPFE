# Phase 8: Grades, positions and departments

**Goal:** users can manage the company's grades (with salary range), positions and department tree, and the UI respects rows owned by HR sync.

## Screens

- **Grades**: list with salary range and the grade's allowances and deductions; create, edit, deactivate.
- **Positions**: list; create, edit, deactivate.
- **Departments**: top-level list, a tree view per department, sub-department create; edit, deactivate.
- **Employee forms** that pick a grade, position or department (assign actions, see [Phase 2](phase-2-hr-sync.md)).

## Key ideas

### How grades feed payroll

For **MANUAL** employees (`POST /payroll`, [Phase 4](phase-4-payroll-run-and-arrears.md)):

- **Basic salary** comes from the employee's active `PayrollInfo.basicSalary`, not from the grade.
- The **grade** decides which **allowances and deductions** apply: every `Allowance` and `Deduction` row linked to the employee's open grade (`gradeHistory` with `toDate: null`) is added.
- The grade's `minSalary`/`maxSalary` is only a range check when a salary is set: `POST /employees/assign-grade` and employee rehire return **400** `Basic salary must be between <min> and <max>` outside it. Employee create does not check it (the check is commented out).
- An employee with no open grade, or more than one, can't be calculated: the whole run fails (the error is `Grade not found for employee <id>` / `Multiple active grades found for employee <id>`).

For **HR_SYNC** employees the salary comes from the HR snapshot ([Phase 4](phase-4-payroll-run-and-arrears.md)); the grade's range is not used.

### HR-owned rows (`externalId`)

When the company's `employeeSource` is `HR_SYNC`, every sync creates or updates positions, grades and departments from HR and sets **`externalId`** (the HR id, e.g. `POS-00310`, `G-10`, `OU-0450`):

| Model | Sync sets | Sync create defaults |
|---|---|---|
| Position | `positionName`, `isActive: true` | `description: null` |
| Grade | `name`, `isActive: true` | `minSalary: 0`, `maxSalary: 0` |
| Department | `deptName`, `isActive: true` | `shorthandRepresentation` built from the name, no parent |

The sync re-applies the HR name and reactivates the row whenever the stored name differs from HR. So a local rename or delete of an HR row is undone at the next sync.

UI rules:
- Treat any row with `externalId !== null` as **read-only, HR-owned**: show an "HR" badge and hide Edit and Delete. The backend does **not** block these calls.
- In HR_SYNC mode, `POST /employees/assign-grade`, `/assign-position` and `/assign-department` return **409** `Employees are managed by HR sync. …` (see [Phase 2](phase-2-hr-sync.md)). Hide them.
- Local (non-HR) rows can still be created in HR_SYNC mode; they just won't be assigned by the sync.

### Permissions

| Permission | Endpoints |
|---|---|
| `view_system_setting` | all GETs |
| `create_system_setting` | create grade, position, department, sub-department |
| `update_system_setting` | update |
| `delete_system_setting` | delete (deactivate) |

### Delete is a soft delete

All three "delete" endpoints set `isActive: false`. Lists return only active rows. Existing employee assignments are not changed.

---

## 8.1 Grades

```ts
type Grade = {
  id: string;
  name: string;
  minSalary: number;       // Float, arrives as a number
  maxSalary: number;
  companyId: string;
  externalId: string | null; // set → HR-owned
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### 8.1.1 Create a grade

`POST /grades` · permission `create_system_setting`

```json
{ "name": "G-5", "minSalary": 8000, "maxSalary": 12000 }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | yes | trimmed, 1–100 chars |
| `minSalary` | number | yes | > 0 (numeric strings are accepted) |
| `maxSalary` | number | yes | > 0, and > `minSalary` |

**201** `{ message: "Grade created successfully", data: Grade }`

| Status | Message |
|---|---|
| 400 | `Amount must be positive` (field path) |
| 400 | `Maximum salary must be greater than minimum salary` |
| 400 | `Grade already exists in this company` |

Overlapping salary ranges between grades are allowed.

### 8.1.2 List grades

`GET /grades` · permission `view_system_setting`

**200** `{ data: GradeWithRules[] }`, active grades only, newest first.

```ts
type GradeWithRules = Grade & {
  allowances: { amount: number; allowanceDefinition: { name: string } }[];
  deductions: { amount: number; deductionDefinition: { name: string } }[];
};
```

### 8.1.3 Get one grade

`GET /grades/:id` · permission `view_system_setting`

**200** `{ message: "Grade retrieved successfully", data: Grade & { company: Company } }`. **404** `Grade not found`. Non-UUID → **400** `Invalid ID`.

### 8.1.4 Update a grade

`POST /grades/:id` · permission `update_system_setting`

All fields optional:

```json
{ "name": "G-5A", "minSalary": 9000, "maxSalary": 13000, "isActive": true }
```

**200** `{ message: "Grade updated successfully", data: Grade }`

| Status | Message |
|---|---|
| 400 | `Grade with this name already exists in the company` |
| 400 | `Amount must be positive` |
| 404 | `Grade not found` |

Unlike create, update does **not** check `maxSalary > minSalary`. Check it on the client. `isActive: true` can be used to restore a deleted grade (its name keeps the delete suffix, see 8.1.5).

### 8.1.5 Delete a grade

`POST /grades/delete/:id` · permission `delete_system_setting`

**200** `{ message: "Grade deleted successfully" }`. **404** `Grade not found`.

Soft delete: sets `isActive: false` and renames the grade to `<name>_YYYY-MM-DD_HH-MM-SS` so the name can be reused.

## 8.2 Positions

```ts
type Position = {
  id: string;
  positionName: string;
  description: string | null;
  companyId: string;
  externalId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  company?: Company;   // included by list and get-one
};
```

### 8.2.1 Create a position

`POST /positions` · permission `create_system_setting`

```json
{ "positionName": "Senior Accountant", "description": "Finance team" }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| `positionName` | string | yes | trimmed, 1–100 chars |
| `description` | string | no | max 1000 chars, trimmed |

**201** `{ message: "Position created", data: Position }`. **400** `Position already exists in this company` (exact-name match, includes inactive rows).

### 8.2.2 List positions

`GET /positions` · permission `view_system_setting`

**200** `{ data: Position[] }`, active only, newest first, each with `company`.

### 8.2.3 Get one position

`GET /positions/:id` · permission `view_system_setting`

**200** `{ data: Position }` (with `company`). Not found → **404** `{ message: "Position not found" }` (no `code` field). The id is not validated as a UUID.

### 8.2.4 Update a position

`POST /positions/:id` · permission `update_system_setting`

```json
{ "positionName": "Lead Accountant", "description": "…" }
```

Both optional. **200** `{ message: "Position updated", data: Position }`

| Status | Message |
|---|---|
| 409 | `Position name must be unique` |
| 404 | `Position not found` |

### 8.2.5 Delete a position

`POST /positions/delete/:id` · permission `delete_system_setting`

**200** `{ message: "Position deactivated", data: Position }`. **404** `Position not found`.

## 8.3 Departments

```ts
type Department = {
  id: string;
  deptName: string;
  parentId: string | null;   // null = top level
  location: string | null;
  shorthandRepresentation: string;
  companyId: string;
  externalId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### 8.3.1 Create a top-level department

`POST /departments` · permission `create_system_setting`

```json
{ "deptName": "Finance", "shorthandRepresentation": "FIN", "location": "Head office" }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| `deptName` | string | yes | trimmed, 1–100 chars |
| `shorthandRepresentation` | string | yes | trimmed, 1–100 chars |
| `location` | string | no | trimmed, 1–100 chars |

**201** `{ message: "Department created", data: Department }`. **400** `Department already exists in this company`.

### 8.3.2 Create a sub-department

`POST /departments/sub-department` · permission `create_system_setting`

```json
{ "deptName": "Payroll Unit", "parentDepartmentId": "uuid", "shorthandRepresentation": "PAY", "location": "Floor 3" }
```

| Field | Type | Required |
|---|---|---|
| `deptName` | string | yes |
| `parentDepartmentId` | UUID | yes |
| `shorthandRepresentation` | string | no (stored as `""`) |
| `location` | string | no |

**201** `{ message: "Sub-department created", data: Department }`

| Status | Message |
|---|---|
| 404 | `Parent department not found` |
| 400 | `Parent department must belong to the same company` |

No duplicate-name check for sub-departments.

### 8.3.3 List top-level departments

`GET /departments` · permission `view_system_setting`

**200** `{ data: (Department & { company: Company })[], count: number }`. Active, top-level only (`parentId: null`), newest first. Load children with 8.3.4 or 8.3.5.

### 8.3.4 Get one department (full tree)

`GET /departments/:id` · permission `view_system_setting`

**200** `{ message: "Department retrieved successfully", data: DepartmentTree | null }`

```ts
type DepartmentTree = Department & {
  company: Company;
  assignments: { id: string; employeeId: string; departmentId: string; fromDate: string; toDate: string | null }[];
  children: DepartmentTree[];   // all levels, recursively
};
```

- Not found returns **200 with `data: null`**, not 404.
- `children` includes inactive sub-departments; filter on `isActive`.
- `assignments` includes closed rows; the current members have `toDate: null`.

### 8.3.5 List direct sub-departments

`GET /departments/sub-department/:id` · permission `view_system_setting`

**200** `{ message: "Department retrieved successfully", data: Department[] }`: active direct children of `:id`. **404** `Parent department not found`.

### 8.3.6 Update a department

`POST /departments/:id` · permission `update_system_setting`

```json
{ "deptName": "Finance & Accounts", "shorthandRepresentation": "FINA", "location": "HQ" }
```

All optional. The parent can't be changed. **200** `{ message: "Department updated", data: Department }`. **404** `Department not found`. No duplicate-name check.

### 8.3.7 Delete a department

`POST /departments/delete/:id` · permission `delete_system_setting`

**200** `{ message: "Department deactivated", data: Department }`. **404** `Department not found`.

Children are **not** deactivated with the parent. Warn the user, or deactivate the children first.

---

## UI notes

- Show an "HR" badge on rows with `externalId` and make them read-only. HR grades show a `0 – 0` range; display "Set in HR" instead.
- Grade pickers for MANUAL employees should show the range and check the basic salary against it before sending.
- Build the department tree from `GET /departments` + `GET /departments/:id` (one call per top-level department), or lazily with 8.3.5.

## Backend notes

- Get-one, update and delete for grades, positions and departments (and the sub-department lookups) look rows up by `id` only, **not by company**. Another company's id would work. Only send ids from your own lists.
- Nothing blocks editing or deleting HR-owned (`externalId`) rows; the next sync partly reverts it (name and `isActive`).
- Grade update skips the `maxSalary > minSalary` check.
- `GET /departments/:id` returns 200 with `data: null` when not found; `GET /positions/:id` returns a 404 without `code`.
- `POST /employees/assign-grade` copies the whole active `PayrollInfo` row (including its `id` and the unique `employeeId`) into a new row, which looks like it will always fail with a database 400. Test this before relying on it.

## Done when

- [ ] Grades, positions and departments have list, create, edit and delete screens gated by the `*_system_setting` permissions.
- [ ] Rows with `externalId` show an "HR" badge and have no edit or delete actions.
- [ ] The grade form checks min > 0, max > min (on create and edit).
- [ ] The department screen shows the tree, supports sub-departments, and warns that deleting a parent leaves children active.
- [ ] Assign grade/position/department actions are hidden in HR_SYNC mode and the 409 is handled.
