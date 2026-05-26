---
sidebar_position: 2
---

# Sync a Provider

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

Before a prescriber can use the ScriptSure iframe, they must have a ScriptSure user account linked to their Medplum `ProjectMembership`. There are two ways to accomplish this.

| Approach | Bot | Best for |
|---|---|---|
| **Invite flow** | `scriptsure-provider-invite-bot` | Provider self-enrolls via a pre-populated sign-up link |
| **Admin sync** | `scriptsure-provider-sync-bot` | Bulk onboarding or re-syncing existing providers |

Both bots require a `Practitioner` resource with at minimum:
- `name` (given + family)
- `telecom` with an `email` entry
- `identifier` with NPI (`system: "http://hl7.org/fhir/sid/us-npi"`)

---

## Invite Flow: `scriptsure-provider-invite-bot`

Generates a ScriptSure sign-up URL pre-populated with the provider's name, email, NPI, DEA, and state license. Send the URL to the provider — they complete the remaining steps (Eligibility, User, Password, Identification) in ScriptSure. When they finish, a webhook stores their ScriptSure user ID on their `ProjectMembership` automatically.

### Input

```typescript
{
  practitionerId: string;  // Medplum Practitioner resource ID
  prescriber?: boolean;    // Default: true. Set false for non-prescribing staff.
  linkType?: number;       // Default: 11 (practice-level). Use 7 for business-unit-level.
}
```

### Output

| Status | Meaning |
|---|---|
| `invite_generated` | New invite URL created. Send `inviteUrl` to the provider. |
| `invite_pending` | Invite already sent; provider hasn't finished sign-up yet. |
| `already_enrolled` | Provider already has a ScriptSure user ID — nothing to do. |
| `synced` | Webhook was missed; ID recovered via email lookup. |

### Example

```typescript
const result = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'scriptsure-provider-invite-bot' },
  { practitionerId: 'abc123' }
);

if (result.status === 'invite_generated') {
  await sendEmail(result.practitionerEmail, result.inviteUrl);
}
```

```bash
medplum post \
  'Bot/$execute?identifier=https://www.medplum.com/bots|scriptsure-provider-invite-bot' \
  '{"practitionerId":"abc123"}'
```

---

## Admin Sync: `scriptsure-provider-sync-bot`

Creates or updates the provider in ScriptSure via the admin API — no invite link required. Optionally activates the account and registers the provider on SureScripts for electronic prescribing.

Use this for bulk onboarding or to re-sync a provider after name, NPI, or phone changes.

### Input

```typescript
{
  practitionerId: string;  // Medplum Practitioner resource ID
  prescriber?: boolean;    // Default: true
  activate?: boolean;      // Default: true — activates the account
  register?: boolean;      // Default: false — registers on SureScripts
  serviceLevel?: number;   // SureScripts service level: 1 = newRx only, 2 = newRx + refills
  timeZone?: string;       // IANA timezone, e.g. "America/Chicago"
}
```

### Output

```typescript
{
  status: 'created' | 'updated' | 'synced';
  scriptSureUserId: number;
  practitionerEmail: string;
  activated?: boolean;
  registered?: boolean;
  spi?: string;  // SureScripts Prescriber Identifier, present when registered
}
```

### Example

```typescript
// Create, activate, and register on SureScripts
const result = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'scriptsure-provider-sync-bot' },
  { practitionerId: 'abc123', activate: true, register: true, serviceLevel: 2 }
);

console.log(result.scriptSureUserId, result.spi);
```

```bash
medplum post \
  'Bot/$execute?identifier=https://www.medplum.com/bots|scriptsure-provider-sync-bot' \
  '{"practitionerId":"abc123","activate":true,"register":true,"serviceLevel":2}'
```

---

## Practitioner resource requirements

The following fields are read by both bots:

| Field | Source |
|---|---|
| `firstName`, `lastName` | `Practitioner.name[0]` |
| `email` | `Practitioner.telecom` where `system = 'email'` |
| `npi` | `Practitioner.identifier` where `system = 'http://hl7.org/fhir/sid/us-npi'` |
| `dea` | `Practitioner.qualification[].identifier[]` where `system = 'http://terminology.hl7.org/NamingSystem/usDEA'` |
| `stateLicense` | `Practitioner.qualification[].identifier[]` where type code is `'MD'` or `'SL'` |
| `timeZone` | `Practitioner.extension` with `url = 'http://hl7.org/fhir/StructureDefinition/timezone'` |
