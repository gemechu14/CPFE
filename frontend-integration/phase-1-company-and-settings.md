# Phase 1: Company, payroll settings and HR connection

**Goal:** a company admin can choose where employees come from (MANUAL or HR_SYNC), register the company's HR system, test it, and turn the sync on.

## Screens

1. **Company registration**: the existing screen gets one small change to its response.
2. **Settings → Payroll**: employee source, sync, cutoff and pay days, and the defaults for payroll definition schedules.
3. **Settings → HR connection**: URL, API key, API secret, HR company name, a **Test connection** button, and **Remove**.

---

## 1.1 Register company (changed response)

`POST /company/register` (public). The request is unchanged.

```json
{ "organizationName": "Cooperative Bank of Oromia", "companyCode": "CBO", "phoneNumber": "0911000001", "email": "optional@x.com", "notes": "optional" }
```

**201** `{ message, data }`. `data` now includes **`adminUsername`**:

```json
{ "message": "Company created successfully!", "data": { "id": "uuid", "organizationName": "Cooperative Bank of Oromia", "companyCode": "CBO", "adminUsername": "cbo.admin", "...": "..." } }
```

- Show `adminUsername` after registration. Every company now has its own admin, `<companycode>.admin`, which logs in with the default password. On first login, `isFirstTimeLoggedIn: true` means the user must change the password.
- New companies get the default Ethiopian tax brackets and pension automatically. Their employee source starts as `MANUAL`.

---

## 1.2 Payroll settings

### Read

`GET /payroll-settings` → **200** `{ data: PayrollSettingView }`

```ts
type PayrollSettingView = {
  id: string;
  companyId: string;
  employeeSource: "MANUAL" | "HR_SYNC";
  syncEnabled: boolean;
  syncIntervalHours: number;        // default 4
  cutoffDay: number;                // default 18
  payDay: number;                   // default 20
  openDaysBefore: number;           // default 0, see Phase 3
  syncUntilDay: number | null;      // null means the same day as cutoffDay, see Phase 3
  prorationBasis: "CALENDAR" | "WORKING";
  overtimeRates: Record<string, number> | null; // e.g. { "Normal Day": 1.5, "Night": 1.75, "Weekly Rest": 2, "Public Holiday": 2.5 }
  hrCostCenter: string | null;      // optional HR feed filters
  hrRegion: string | null;
  hrZone: string | null;
  hrCity: string | null;
  hrWoreda: string | null;
  lastSyncedAt: string | null;
  // HR connection (never includes the secret)
  hrBaseUrl: string | null;
  hrApiKey: string | null;          // masked, e.g. "1c98…d4"
  hrCompanyName: string | null;
  hrConnectionConfigured: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### Update

`PUT /payroll-settings` · permission `manage_payroll_settings`

Send only the fields that change. Unknown fields are rejected.

| Field | Type / range |
|---|---|
| `employeeSource` | `"MANUAL"` \| `"HR_SYNC"` |
| `syncEnabled` | boolean |
| `syncIntervalHours` | 1–24 |
| `cutoffDay` | 1–28 |
| `payDay` | 1–31 |
| `openDaysBefore` | 0–60 |
| `syncUntilDay` | 1–31 or `null` |
| `prorationBasis` | `"CALENDAR"` \| `"WORKING"` |
| `overtimeRates` | `{ [category]: 0–10 }` or `null` |
| `hrCostCenter`, `hrRegion`, `hrZone`, `hrCity`, `hrWoreda` | string or `null` |

**200** `{ message: "Payroll settings updated", data: PayrollSettingView }`

**400** if you turn on `syncEnabled` with `employeeSource: "HR_SYNC"` before an HR connection is registered. Disable the toggle until `hrConnectionConfigured` is true.

UI notes:
- When `employeeSource === "MANUAL"`, hide the HR connection and sync sections.
- Switching to `HR_SYNC` blocks manual employee creation (see Phase 2). Ask the user to confirm.

---

## 1.3 HR connection

### Save or update

`PUT /payroll-settings/hr-connection` · permission `manage_payroll_settings`

```json
{
  "baseUrl": "http://10.8.101.104/",
  "apiKey": "1c98…",
  "apiSecret": "…",
  "companyName": "Cooperative Bank of Oromia"
}
```

| Field | Rule |
|---|---|
| `baseUrl` | Must be a URL. In production, `https` is required, except for private-network hosts (10.x, 172.16–31.x, 192.168.x). |
| `apiKey` | required |
| `apiSecret` | Required the first time. **Leave it out to keep the stored secret** (for example when editing only the URL). |
| `companyName` | The HR company name (`identity.company` in the feed). Records from any other company are skipped. |

**200** `{ message: "HR connection saved", data: PayrollSettingView }`

**409** `"This HR system and company are already registered by another company"`

UI notes:
- The secret is never returned. Use a password field with the placeholder "•••••• (unchanged)" when `hrConnectionConfigured` is true.
- Show `hrApiKey` masked as received.

### Test

`POST /payroll-settings/hr-connection/test` · permission `manage_payroll_settings`

Always **200**. Check `data.ok`:

```ts
type TestResult =
  | { ok: true; period: string; hasRecords: boolean; hrCompany: string | null; companyNameMatches: boolean; message: string }
  | { ok: false; period: string; message: string }; // e.g. "HR feed request failed (...): 401 ..."
```

- `ok && companyNameMatches`: show success.
- `ok && !companyNameMatches`: show a warning with `message`; every record would be skipped.
- `!ok`: show `message` as an error.

### Remove

`DELETE /payroll-settings/hr-connection` · permission `manage_payroll_settings`

**200** `{ message: "HR connection removed", data }`. This also sets `syncEnabled` to false.

---

## Suggested flow (HR_SYNC company)

```
Register company → log in as <code>.admin → change password
→ Settings: employeeSource = HR_SYNC
→ HR connection: save → Test → (ok) → syncEnabled = true
→ Phase 2: Sync now → watch the run
```

## Done when

- [ ] Registration shows `adminUsername`.
- [ ] Settings page reads and updates all fields above.
- [ ] HR connection form saves, tests and removes; the secret is never shown; 409 is handled.
- [ ] The sync toggle is disabled until `hrConnectionConfigured`.
