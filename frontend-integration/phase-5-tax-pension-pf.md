# Phase 5: Tax slabs, pension and provident fund

**Goal:** let a company see and manage the tax brackets, pension rule and provident fund (PF) rule that payroll uses.

## Screens

1. **Settings → Income tax**: the company's active brackets, with **Add bracket**, **Remove**, and **Reset to default**.
2. **Settings → Pension**: the company's active employee and employer rates, with **Edit**, **Remove**, and **Reset to default**.
3. **Settings → Provident fund**: the same as pension. PF is **off** until the company turns it on (see 5.4).

---

## Key ideas

- **Rules belong to the company.** `companyId` always comes from the logged-in user. Never send it in the body.
- **Two layers of data:**
  - The **rule definition** (`TaxSlab`, `Pension`, `ProvidentFund`) holds the numbers. Rows with `isDefault: true` are the system defaults that every company shares.
  - The **company link** (`CompanyTaxRule`, `CompanyPensionRule`, `CompanyProvidentFundRule`) attaches a definition to a company, with `isActive`. **Payroll uses only active links.**
- **"Remove" does not delete anything.** It sets the company link to `isActive: false`.
- **"Reset"** deactivates all of the company's links for that rule type, then activates the system defaults.
- **"Assign default"** activates the system defaults and leaves the company's other active links as they are.
- **Numbers, not strings:** these models use `Float`, so rates and incomes arrive as JSON **numbers**, e.g. `15`. This differs from the payroll amounts in Phase 4. Rates are percentages: `7` means 7%.
- **New companies:** when a company is registered (Phase 1), the backend activates the default tax brackets and the default pension rule in the same transaction. **PF is not activated** because it would double the deduction with pension. Registration fails with `404 "No default tax slabs found"` if the database has no default brackets.

### Seeded defaults (`prisma/seed.ts`)

Monthly employment income in ETB (Income Tax Amendment Proclamation No. 1395/2025):

| Bracket (`name`) | `minIncome` | `maxIncome` | `rate` % | `deductible` |
|---|---|---|---|---|
| ET income tax 0 – 2,000 | 0 | 2000 | 0 | 0 |
| ET income tax 2,001 – 4,000 | 2000 | 4000 | 15 | 300 |
| ET income tax 4,001 – 7,000 | 4000 | 7000 | 20 | 500 |
| ET income tax 7,001 – 10,000 | 7000 | 10000 | 25 | 850 |
| ET income tax 10,001 – 14,000 | 10000 | 14000 | 30 | 1350 |
| ET income tax over 14,000 | 14000 | 999999999 | 35 | 2050 |

| Rule | Employee % | Employer % | Auto-assigned to new companies |
|---|---|---|---|
| Pension (Proclamation No. 1268/2022) | 7 | 11 | Yes |
| Provident fund | 7 | 11 (can be changed with `SEED_PF_EMPLOYEE` / `SEED_PF_EMPLOYER` at seed time) | **No**, it is an option only |

### Permissions

| Permission | Needed for |
|---|---|
| `view_system_setting` | All `GET` endpoints |
| `create_system_setting` | Adding a bracket, pension rule or PF rule |
| `update_system_setting` | Edit (pension and PF), reset, assign default |
| `delete_system_setting` | Remove |

---

## How payroll uses these

Payroll loads the company's **active** rules each time it runs (`loadCompanyRules` in `hrPayroll.service.ts` and `payroll.util.ts`).

- **Tax:** find the bracket where `minIncome <= taxable <= maxIncome` (both ends inclusive). Then `tax = taxable × rate / 100 − deductible`, never below 0. If no bracket matches, tax is 0.
  - Example: taxable 12,000 → 30% bracket → 12,000 × 0.30 − 1,350 = **2,250**.
  - A value on a boundary (e.g. 4,000) matches two brackets. The seeded brackets give the same tax either way (4,000 × 15% − 300 = 4,000 × 20% − 500 = 300).
- **Pension:** employee pension = basic × employee% / 100 (deducted from net). Employer pension = basic × employer% / 100 (company cost). "Basic" is the earned basic after unpaid leave, plus basic-type arrears.
- **PF:** the same base and formula as pension, with the PF rule's rates. Employee PF is deducted from net (`employeeProvidentFundAmount`, Phase 4). If the company has no active PF rule, both PF amounts are 0.
- **Only one pension rule and one PF rule are used.** Payroll takes the *first* active link it finds, in no defined order. Keep **exactly one** active rule per type. To change rates, use **Edit** (5.2.4, 5.3.4), not **Add**.

---

## 5.1 Income tax brackets (`/taxslab`)

```ts
type TaxSlab = {
  id: string;
  name: string | null;
  description: string | null;
  type: "INCOME_TAX" | "EXEMPTION";
  rate: number | null;          // %
  deductible: number | null;
  incomeTaxPayable: number | null;
  minIncome: number;
  maxIncome: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type CompanyTaxRule = {
  id: string;          // the company link id, used by "remove"
  companyId: string;
  taxSlabId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### 5.1.1 List the company's active brackets

`GET /taxslab` · permission `view_system_setting`

**200**

```ts
{
  message: "Taxslab retrieved successfully";
  data: {
    id: string;            // TaxSlab id, NOT the CompanyTaxRule id
    minIncome: number;
    maxIncome: number;
    description: string | null;
    type: "INCOME_TAX" | "EXEMPTION";
    rate: number | null;
  }[];
}
```

The list has no `deductible` and no `name`. To show them, load each bracket with 5.1.3. The list is not sorted, so sort by `minIncome` in the UI.

### 5.1.2 List the system default brackets

`GET /taxslab/default` · permission `view_system_setting`

**200** `{ message: "Taxslab retrieved successfully", data: TaxSlab[] }`. These are all rows with `isDefault: true`. Use this list for a "Default values" preview before **Reset**.

### 5.1.3 Get one bracket

`GET /taxslab/:ruleId` · permission `view_system_setting`

`ruleId` must be a UUID and is a **TaxSlab id** (the `id` from 5.1.1 or 5.1.2).

**200** `{ message: "Taxslab removed successfully", data: TaxSlab }`. The message text is wrong; ignore it.

| Status | Message |
|---|---|
| 400 | `Validation Error` (not a UUID) |
| 404 | `Tax slab not found` |

### 5.1.4 Add a bracket

`POST /taxslab` · permission `create_system_setting`

```json
{
  "name": "Over 20,000",
  "description": "Custom bracket",
  "type": "INCOME_TAX",
  "rate": 35,
  "deductible": 2050,
  "minIncome": 20000,
  "maxIncome": 999999999
}
```

| Field | Rule |
|---|---|
| `minIncome`, `maxIncome` | **Required.** Number, or a numeric string. Must be **> 0** |
| `rate`, `deductible`, `incomeTaxPayable` | Optional. Number > 0 |
| `name` | Optional. 1–100 characters, trimmed |
| `description` | Optional. Up to 1,000 characters |
| `type` | Optional. `"INCOME_TAX"` (default) or `"EXEMPTION"` |
| any other key | Rejected (`strict`). `isDefault` cannot be set |

**201** `{ message: "Taxslab addedd successfully", data: CompanyTaxRule }`. A new `TaxSlab` is created and linked to the company as active.

| Status | Message |
|---|---|
| 400 | `Validation Error`, e.g. `details[].path = "minIncome"`, "Amount must be positive" |
| 400 | `Tax slab already exists for this income range` (same min and max already linked to the company, **active or removed**) |

The backend does **not** check for overlapping brackets or `min < max`. Check both in the form.

### 5.1.5 Remove a bracket

`POST /taxslab/remove/:ruleId` · permission `delete_system_setting` · no body

`ruleId` is the **CompanyTaxRule id**, not the TaxSlab id. The rule must belong to the user's company.

**200** `{ message: "Taxslab removed successfully", data: CompanyTaxRule }`, with `isActive: false`.

| Status | Message |
|---|---|
| 404 | `Tax rule not found` |

### 5.1.6 Reset to default

`POST /taxslab/tax/reset` · permission `update_system_setting` · no body

This deactivates **all** of the company's brackets, then activates the defaults.

**200** `{ message: "Taxslab reset to default successfully", data: TaxSlab[] }` (the default brackets)

| Status | Message |
|---|---|
| 404 | `Company not found`, `No default tax slabs found` |

### 5.1.7 Assign default brackets

`POST /taxslab/assign/default` · permission `update_system_setting` · no body

This activates every default bracket that is not already active. Custom brackets stay active.

**200** `{ message: "default taxslab assigned successfully", data: TaxSlab[] }`. Errors are the same as 5.1.6.

UI notes:
- Show the brackets as a table: range, rate %, deductible, and a worked example ("At 12,000: tax 2,250").
- Warn when brackets overlap or leave gaps. Income in a gap is taxed at 0.
- Prefer **Reset to default** over **Assign default**. Assign keeps custom brackets, which can then overlap the defaults.

---

## 5.2 Pension (`/pension`)

```ts
type Pension = {
  id: string;
  employeeContribution: number; // %
  employerContribution: number; // %
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type CompanyPensionRule = {
  id: string;          // rule id, used by remove and edit
  companyId: string;
  pensionId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### 5.2.1 Get the company's active pension rule

`GET /pension` · permission `view_system_setting`

**200**

```ts
{
  message: "Pension retrieved successfully";
  data: {
    id: string;                    // CompanyPensionRule id
    employeeContribution: number;
    employerContribution: number;
  }[];                             // expect 0 or 1 item
}
```

### 5.2.2 Default pension

`GET /pension/default` · permission `view_system_setting` → **200** `{ message: "Pension retrieved successfully", data: Pension[] }`

`GET /pension/:ruleId` · permission `view_system_setting` → **200** `{ message: "Pension retrieved successfully", data: Pension }`

For the second endpoint, `ruleId` is a **Pension id**. The list in 5.2.1 does not return Pension ids, so this endpoint is only useful with ids from `/pension/default`. It returns **404** `Pension fund not found`.

### 5.2.3 Add a pension rule

`POST /pension` · permission `create_system_setting`

```json
{ "employeeContribution": 7, "employerContribution": 11 }
```

Both fields are required and must be > 0 (a number or a numeric string). No other keys are allowed.

**201** `{ message: "Pension added successfully", data: CompanyPensionRule }`

| Status | Message |
|---|---|
| 400 | `Validation Error` |
| 400 | `Pension rule already exists for this contribution range` (an active rule with the same rates) |

Adding does **not** deactivate the current rule. Use this only when the company has no active rule. Otherwise use 5.2.4.

### 5.2.4 Edit the pension rule

`POST /pension/rules/update/:ruleId` · permission `update_system_setting`

The body is the same as 5.2.3, and **both fields are required**. `ruleId` is the CompanyPensionRule id from 5.2.1.

In one transaction, this deactivates the old rule and creates a new one with the new rates.

**200** `{ message: "Updated", data: CompanyPensionRule }`. This is the **new** rule, so replace the id you hold.

| Status | Message |
|---|---|
| 404 | `Pension rule not found` (unknown or already inactive) |
| 400 | `Pension rule already exists for this contribution range` |

### 5.2.5 Remove the pension rule

`POST /pension/:ruleId` · permission `delete_system_setting` · no body

`ruleId` is the CompanyPensionRule id. **200** `{ message: "Pension removed successfully", data: CompanyPensionRule }`, with `isActive: false`. It returns **404** `Pension rule not found` if the rule is unknown or already inactive.

Without an active rule, payroll deducts **no pension**.

### 5.2.6 Reset and assign default

| Endpoint | Permission | Effect | 200 |
|---|---|---|---|
| `POST /pension/rules/reset` | `update_system_setting` | Deactivates all of the company's pension rules, then activates the default | `{ message: "Pension reset to default successfully", data: Pension[] }` |
| `POST /pension/assign/default` | `update_system_setting` | Activates the default and keeps the other active rules | `{ message: "Default pension fund assigned successfully", data: Pension[] }` |

Errors (404): `Company not found`, `No default pension funds found`.

UI notes:
- Show one card: "Employee 7% · Employer 11%", with **Edit** and **Reset to default (7% / 11%)**.
- If `data.length > 1`, show a warning ("More than one pension rule is active; payroll will use only one") and offer **Reset**.
- If `data` is empty, show "No pension is deducted" and an **Add** or **Reset** button.
- Do not use **Assign default** if a custom rule is active, because it leaves two rules active.

---

## 5.3 Provident fund (`/provident-fund`)

The types are the same as for pension (`ProvidentFund`, `CompanyProvidentFundRule` with `providentFundId`).

| # | Endpoint | Permission | Request | 200/201 response |
|---|---|---|---|---|
| 5.3.1 | `GET /provident-fund` | `view_system_setting` | none | `{ message: "Provident Fund retrieved successfully", data: { id /* rule id */, employeeContribution, employerContribution }[] }` |
| 5.3.2 | `GET /provident-fund/default` | `view_system_setting` | none | `{ message: "Provident Fund retrieved successfully", data: ProvidentFund[] }` |
| 5.3.2 | `GET /provident-fund/:ruleId` | `view_system_setting` | `ruleId` = **ProvidentFund id** (UUID) | `{ message: "Provident Fund retrieved successfully", data: ProvidentFund }` · 404 `Provident fund not found` |
| 5.3.3 | `POST /provident-fund` | `create_system_setting` | `{ employeeContribution, employerContribution }`, both > 0, strict | **201** `{ message: "Provident Fund added successfully", data: CompanyProvidentFundRule }` · 400 `Provident fund rule already exists for this contribution range` |
| 5.3.4 | `POST /provident-fund/rules/update/:ruleId` | `update_system_setting` | Same body, both required; `ruleId` = rule id | `{ message: "Updated", data: CompanyProvidentFundRule }` (new rule) · 404 `Provident Fund rule not found` |
| 5.3.5 | `POST /provident-fund/:ruleId` | `delete_system_setting` | none; `ruleId` = rule id (UUID), must belong to the company | `{ message: "Provident Fund removed successfully", data: CompanyProvidentFundRule }` · 404 `Provident fund rule not found` |
| 5.3.6 | `POST /provident-fund/restore/reset` | `update_system_setting` | none | `{ message: "Provident Fund reset to default successfully", data: ProvidentFund[] }` |
| 5.3.6 | `POST /provident-fund/assign/default` | `update_system_setting` | none | `{ message: "default provident fund assigned successfully", data: ProvidentFund[] }` |

The reset and assign endpoints return 404 `Company not found` or `No default provident funds found`.

Note that the reset path is `/restore/reset`, not `/rules/reset` as for pension.

## 5.4 Turning PF on and off

- **On:** `POST /provident-fund/assign/default` (seeded 7% / 11%), or `POST /provident-fund` with custom rates.
- **Change rates:** 5.3.4.
- **Off:** `POST /provident-fund/:ruleId` with the active rule's id.

UI notes:
- Default to a toggle, "Provident fund: Off", because new companies have no PF rule.
- When turning it on, explain that PF is deducted **in addition to** pension, on the same basic.
- Show the same "more than one active rule" warning as for pension.

---

## Backend notes (known issues, not frontend bugs)

- `GET /taxslab` returns TaxSlab ids, but `POST /taxslab/remove/:ruleId` needs the CompanyTaxRule id. **The UI cannot remove a bracket using only the list**, so the backend needs to add the rule id to the list. The list also has no `deductible` or `name`.
- `amount` validation is `> 0`, so a bracket with `minIncome: 0`, `rate: 0` or `deductible: 0` (like the seeded first bracket) **cannot be created** through the API.
- The tax duplicate check also matches removed brackets, so a removed range cannot be added again (only **Reset** brings defaults back).
- Pension `POST /:ruleId` (remove) and `rules/update/:ruleId` are **not scoped to the user's company**. They work on any company's rule id. PF `rules/update/:ruleId` has the same problem. PF remove and tax remove are scoped.
- The `rules/update/:ruleId` routes validate only the body, not the `:ruleId` param. Both fields are required, and the unused `updatePension` schema (optional fields) is not wired in.
- PF update is not transactional. If creating the new rule fails (e.g. a duplicate), the old rule stays deactivated and the company has no PF.
- Reset is not transactional. If no defaults exist, the company's rules are already deactivated before the 404.
- `GET /:ruleId` endpoints take definition ids (TaxSlab, Pension, ProvidentFund), not company-rule ids, and are not company-scoped. `GET /taxslab/:ruleId` is registered twice (harmless), and its message says "removed".
- Payroll picks one active pension or PF rule with `findFirst` and no ordering. Several active rules give unpredictable rates.
- "Remove" endpoints use `POST`, not `DELETE`.

## Done when

- [ ] The tax screen lists the active brackets sorted by `minIncome`, can add a bracket (with overlap and min < max checks), and has **Reset to default** with a preview from `/taxslab/default`.
- [ ] The pension card shows the active rates, with Edit (using the update endpoint), Reset, and the warnings for an empty list and for more than one rule.
- [ ] The PF toggle starts Off for new companies and turns on through assign default or a custom add, with Edit and Off.
- [ ] Rates are handled as numbers (percent), not strings.
- [ ] Buttons are hidden by the `*_system_setting` permissions.
