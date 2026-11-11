# Phase 0: Login, first-time password, session

**Goal:** a login page that works for every company and every kind of user: company admins, manually created employees and HR-synced employees.

The auth endpoints didn't change. What did change for multiple companies and HR sync:

- Usernames are unique across the whole system. Each company's admin is **`<companycode>.admin`**, e.g. `cbo.admin` or `zuqualla.admin`, not one shared admin. The company is worked out from the user, so the login page needs **no company selector**.
- **HR-synced employees can't log in until an admin issues them a password** (see 0.5). Until then, login returns 401.

## Screens

1. **Login**: username and password.
2. **Change password (forced)**: shown right after login when `isFirstTimeLoggedIn` is `true`.
3. **Forgot password** and **Reset password** (from the email or SMS link).
4. **Admin → Employee → "Issue login"**: generates a temporary password (see 0.5).

---

## 0.1 Login

`POST /auth/login` (public)

```json
{ "username": "cbo.admin", "password": "…" }
```

**200**

```ts
type LoginResponse = {
  isFirstTimeLoggedIn: boolean;
  tokens: {
    access:  { token: string; expires: string };  // JWT; send as Authorization: Bearer <token>
    refresh: { token: string; expires: string };
  };
  permissions: string[];   // e.g. ["view_employee", "manage_payroll_settings", ...]
};
```

**401** `{ code: 401, message: "Incorrect username or password" }`. The same message is used for unknown users, wrong passwords, and HR-synced employees who haven't been issued a password yet.

After login:
1. Store `tokens.access`, `tokens.refresh` and `permissions`.
2. If `isFirstTimeLoggedIn` is true, go to **Change password** (0.3) before anything else.
3. Use `permissions` to build the menu and hide buttons (the HR sync and payroll settings screens need `manage_payroll_settings`).

## 0.2 Current user

`GET /auth/me` (Bearer) → **200** `{ data: Employee (without password), message }`

After login, also load `GET /payroll-settings` (Phase 1) once and keep it in app state. If its `employeeSource` is `"HR_SYNC"`, hide the manual employee actions (Phase 2).

## 0.3 Change password (first login, or from the profile)

`POST /employees/change-password` (Bearer)

```json
{ "currentPassword": "…", "newPassword": "…" }
```

**200** `{ data: {}, message: "Password changed successfully" }`. This also sets `isFirstTimeLoggedIn` to false.

| Rule | Client-side check |
|---|---|
| 8–128 characters, at least 1 uppercase, 1 lowercase and 1 digit | yes |
| `newPassword` ≠ `currentPassword` | yes (400 `path: "newPassword"`) |
| 400 `"Current password is incorrect"` | show it on the current-password field |

## 0.4 Refresh, logout, forgot and reset

| Action | Endpoint | Body | Response |
|---|---|---|---|
| Refresh session | `POST /auth/refresh/accessToken` | `{ "refreshToken": "…" }` | **200**, same shape as login (`isFirstTimeLoggedIn`, `tokens`, `permissions`) |
| Logout | `POST /auth/logout` | `{ "refreshToken": "…" }` | **204** |
| Forgot password | `POST /auth/forgotPassword` | `{ "username": "…" }` | **200**, always the same message (doesn't reveal whether the user exists). A reset link goes to the user's email, or SMS if there's no email. |
| Reset password | `POST /auth/resetPassword?token=<token from link>` | `{ "password": "…" }` | **200** `{ message: "Password reset successful" }` |

Notes:
- **Refresh tokens are single-use.** Each refresh returns a new pair; replace both. On a 401 from any API call, try one refresh, then send the user to login.
- **Refresh updates permissions too.** Refresh the stored permissions from the response, since an admin may have changed roles.
- **The reset link** points to `FRONTEND_URL?token=…` (backend config). The frontend route at that URL must read `token` and show the reset form.

## 0.5 Issue a login to an employee (admin)

HR-synced employees are created with an unknown random password. Manual employees also get one when they're created. An admin issues a usable password with:

`POST /employees/generate-password` (Bearer · permission `update_employee`)

```json
{ "employeeId": "uuid", "email": "employee@company.com" }
```

**200** `{ data: { temporaryPassword: string }, message: "Password generated successfully" }`

- **Show `temporaryPassword` once**, with a copy button, so the admin can pass it on. It isn't sent automatically.
- **`email` is saved on the employee.** For HR-synced employees, use the email from HR (`Employee.email`).
- **The employee's first login** returns `isFirstTimeLoggedIn: true`, which forces 0.3.
- **Permissions:** an HR-synced employee has **no role** until an admin assigns one through the existing role screens. Without a role, login works but `permissions` is `[]`, and permission-protected endpoints return `400 "Access Denied: Employee has no roles"`. Show an empty-state message such as "Your account has no role yet — contact your payroll administrator."

## Default admin per company

When a company is registered (Phase 1), the backend creates `<companycode>.admin` with a default password configured in the backend. The first login has `isFirstTimeLoggedIn: true`, so the forced change-password screen secures it. The frontend needs nothing special beyond 0.3.

## Done when

- [ ] Login with username and password; tokens and permissions are stored; the menu is driven by `permissions`.
- [ ] `isFirstTimeLoggedIn` forces change-password; the password rules are checked on the client.
- [ ] Refresh on 401 with single-use refresh tokens, then logout.
- [ ] Forgot and reset password pages (the reset route reads `?token=`).
- [ ] "Issue login" action on the employee detail shows the temporary password once.
- [ ] Empty state for users without a role.
