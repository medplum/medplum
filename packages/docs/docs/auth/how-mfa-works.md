---
sidebar_position: 6.5
sidebar_label: How MFA Works
tags: [auth, security]
---

# MFA Under the Hood: Routes & User Flows

This page is a deep dive into how Multi-Factor Authentication works in Medplum: the underlying HTTP routes and the user flows that combine them. It is intended for developers building their **own** MFA management UI — those who cannot use Medplum's [`SignInForm`](https://storybook.medplum.com/?path=/story/medplum-auth-signinform--basic) component or the [Medplum App Security page](/docs/auth/mfa) and need to drive enrollment and challenge completion directly.

If you can use `SignInForm` or the Security page, prefer those — they handle every flow below for you. See the [MFA overview](/docs/auth/mfa) for the high-level feature documentation.

Medplum supports two MFA methods:

- **`totp`** — A Time-based One-Time Password from an authenticator app (Google Authenticator, Authy, etc.). Enrolling means scanning a QR code; verifying means entering the 6-digit code the app generates.
- **`email`** — A 6-digit code emailed to the user's address on demand. Verifying means entering the code from the email. Email codes are single-use and expire after a short window.

A user may enroll in either method or both. The methods a project allows are controlled by the `allowedMfaMethods` project setting (a `Project.setting` entry) — a comma-delimited string (`"totp"`, `"email"`, or `"totp,email"`). When unset, only `totp` is offered.

## Route Overview

The routes fall into two groups depending on what they authenticate against.

**Login-time routes** operate on a pending `login` (the `login` id returned by the login endpoints) and do **not** require a bearer token. Use these while completing a sign-in:

| Method & Path | Body | Purpose |
|---|---|---|
| `POST /auth/login` | `{ email, password, ... }` | Start a login. The response carries the MFA signal (see [Login response signals](#login-response-signals)). |
| `GET /auth/login/:login` | — | Re-fetch the pending login's status (same MFA fields as the login response). |
| `POST /auth/mfa/login-enroll` | `{ login, method?, token? }` | Enroll a `mfaRequired` user who is logging in for the first time. `method` defaults to `totp`. |
| `POST /auth/mfa/send-email` | `{ login }` | Send (or resend) the email code during a login challenge. Requires the user to be enrolled in email MFA. |
| `POST /auth/mfa/verify` | `{ login, token }` | Complete the MFA challenge. `token` may be a TOTP code **or** an emailed code, whichever the user is enrolled in. |

**Settings routes** operate on the **currently authenticated user** and require a bearer token. Use these to build a security-settings page where a logged-in user manages their factors:

| Method & Path | Body | Purpose |
|---|---|---|
| `GET /auth/mfa/status` | — | Read the user's current enrollment status and the TOTP QR code. |
| `POST /auth/mfa/send-email-challenge` | `{}` | Email a 6-digit code to the current user (used to prove control of their email when enrolling email MFA, removing a factor, or disabling MFA). |
| `POST /auth/mfa/enroll` | `{ method?, token }` | Enroll the current user in a method. `method` defaults to `totp`. |
| `POST /auth/mfa/disable` | `{ token, method? }` | Remove a single factor (when `method` is given) or disable MFA entirely (when `method` is omitted). |

And the [admin reset route](/docs/auth/mfa#admin-mfa-reset), `POST /admin/projects/:projectId/members/:membershipId/mfa/reset`, for project admins.

## Login response signals

`POST /auth/login` (and `GET /auth/login/:login`) returns one of several shapes. Inspect these fields to decide which MFA step, if any, is required:

| Field | Type | Meaning |
|---|---|---|
| `login` | string | The pending login id. Pass this to all login-time MFA routes. |
| `mfaEnrollRequired` | boolean | The user must enroll in MFA before continuing (their account has `mfaRequired` but they are not yet enrolled). |
| `enrollQrCode` | string | A data-URL QR code image for TOTP enrollment (present when enrollment is required/available). |
| `enrollUri` | string | The raw `otpauth://` URI behind the QR code, for clients that render their own QR. |
| `allowedMfaMethods` | `('totp' \| 'email')[]` | Which methods the project allows the user to enroll in. |
| `mfaRequired` | boolean | The user is enrolled and must complete an MFA challenge before continuing. |
| `mfaMethods` | `('totp' \| 'email')[]` | The methods the user is enrolled in (drives which prompts to show). |
| `email` | string | The user's email, so the UI can show where an email code was sent. |
| `code` | string | The OAuth authorization code — present once login (and any MFA) is complete. Exchange it for tokens. |
| `memberships` | ProjectMembership[] | Present when the user must choose a profile before a `code` is issued. |

:::note[]
MFA is only enforced for **Username/Password** logins. Google and external-IdP logins are not challenged.

When `email` is the user's **only** enrolled method, the login endpoint sends the email code automatically — you do not need to call `/auth/mfa/send-email` before showing the code-entry field. When the user is enrolled in `totp` (alone or alongside email), no code is sent automatically.
:::

## Flow: Completing an MFA challenge at login

After `POST /auth/login` returns `mfaRequired: true`:

```
POST /auth/login  ──▶  { login, mfaRequired: true, mfaMethods, email }
        │
        ├─ totp enrolled:  prompt for the authenticator code
        │
        ├─ email only:     code already sent; prompt for it
        │                  (offer "Resend" → POST /auth/mfa/send-email { login })
        │
        └─ both enrolled:  let the user choose; if they pick email,
                           POST /auth/mfa/send-email { login } first
        │
        ▼
POST /auth/mfa/verify  { login, token }  ──▶  { login, code, ... }
        │
        ▼
Exchange `code` for tokens (or handle `memberships` if profile selection is required)
```

`token` in `/auth/mfa/verify` is accepted as either a TOTP code or an emailed code, so a single verify call works regardless of which factor the user chose.

## Flow: Forced enrollment at first login

When a user was invited with `mfaRequired: true` but has not enrolled yet, `POST /auth/login` returns `mfaEnrollRequired: true`:

```
POST /auth/login  ──▶  { login, mfaEnrollRequired: true, enrollQrCode, enrollUri, allowedMfaMethods }
        │
        ├─ TOTP:   show enrollQrCode; user scans and enters a code
        │          POST /auth/mfa/login-enroll { login, method: 'totp', token }
        │              ──▶ { login, code, ... }   (enrollment + challenge done in one call)
        │
        └─ Email:  POST /auth/mfa/login-enroll { login, method: 'email' }
                       ──▶ { login, mfaRequired: true, mfaMethods: ['email'], email }
                       (server emails a code; the user must now verify it)
                   POST /auth/mfa/verify { login, token }  ──▶  { login, code, ... }
```

For TOTP, `login-enroll` both enrolls the user and verifies the supplied code, completing the login in one step. For email, enrollment makes email the user's factor and forces a normal email challenge (so the emailed code reverifies their address) before the login is granted.

## Flow: Self-enrolling from a settings page

These flows assume the user is already authenticated (you have a bearer token). Start by reading status:

```ts
const status = await medplum.get('auth/mfa/status', { cache: 'no-cache' });
// {
//   enrolled: boolean,
//   enrolledMethods: ('totp' | 'email')[],
//   allowedMethods: ('totp' | 'email')[],
//   mfaRequired: boolean,   // if true, do not offer "Disable MFA"
//   email: string,
//   enrollUri: string,      // otpauth:// URI
//   enrollQrCode: string,   // data-URL QR image
// }
```

`/auth/mfa/status` always returns a TOTP `enrollQrCode`/`enrollUri` (generating a secret if the user does not have one yet), so you can offer authenticator enrollment at any time — including adding TOTP to an account that currently only has email.

**Enroll in TOTP (authenticator app):**

```
GET /auth/mfa/status  ──▶  show enrollQrCode
        │  user scans the QR and enters the generated code
        ▼
POST /auth/mfa/enroll  { method: 'totp', token }  ──▶  200 OK
```

**Enroll in email-based MFA:**

```
POST /auth/mfa/send-email-challenge  {}     ──▶  emails a 6-digit code
        │  user enters the code from the email
        ▼
POST /auth/mfa/enroll  { method: 'email', token }  ──▶  200 OK
```

Email enrollment requires the user to enter the emailed code, which reverifies that they currently control the address (and sets `emailVerified`). Both `/enroll` calls reject a method the user is already enrolled in, or a method the project does not allow.

**Adding a second method:** the same calls work when the user is already enrolled. `enrolledMethods` from `/auth/mfa/status` tells you which methods are already active so you can offer only the missing one.

## Flow: Removing a factor or disabling MFA

Both use `POST /auth/mfa/disable` and require a `token` proving control of one of the user's currently-connected factors. The accepted `token` is a TOTP code or an emailed code, depending on what the user is enrolled in — so if the user's only factor is email, email a code first with `POST /auth/mfa/send-email-challenge {}`.

**Remove a single factor** (when more than one is enrolled), leaving the others in place:

```
POST /auth/mfa/disable  { method: 'totp', token }  ──▶  200 OK
```

**Disable MFA entirely** (omit `method`):

```
POST /auth/mfa/disable  { token }  ──▶  200 OK
```

Notes:

- Removing `totp` (or disabling entirely) rotates the user's authenticator secret, so the old authenticator-app entry cannot be reused on a later re-enrollment.
- An account with `mfaRequired` cannot remove its **last** factor. To rotate factors on such an account, enroll the replacement first, then remove the old one.

## Error responses

The MFA routes return a FHIR `OperationOutcome` with `400 Bad Request` on failure. Common cases include `Invalid token` / `Invalid MFA token`, `MFA code expired`, `Already enrolled`, `MFA method not allowed`, `User not enrolled in MFA`, `Missing token`, and `Cannot remove the last MFA factor because MFA is required`. The login-time routes additionally reject a `login` that is already `revoked`, `granted`, or verified.
