---
sidebar_position: 2
---

# Sync a Provider

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

Before a prescriber can use ScriptSure, they must have a ScriptSure user account linked to their Medplum `ProjectMembership`. There are two ways to accomplish this:

| Approach | Bot | Best for |
|---|---|---|
| **Invite flow** | `scriptsure-provider-invite-bot` | Provider self-enrolls via a pre-populated sign-up link |
| **Admin sync** | `scriptsure-provider-sync-bot` | Bulk onboarding or re-syncing existing providers |

Both bots will look up the `Practitioner` resource by id, and require the `Practitioner` to have at minimum: `name` (given + family), an `email` telecom, and an NPI identifier (`system: "http://hl7.org/fhir/sid/us-npi"`). DEA and state license are also read when present.

---

## Invite flow: `scriptsure-provider-invite-bot`

Generates a pre-populated ScriptSure sign-up URL. Send it to the provider–they complete registration in ScriptSure, and a webhook automatically stores their ScriptSure user ID on their `ProjectMembership` when done.

```typescript
const result = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'scriptsure-provider-invite-bot' },
  { practitionerId: 'abc123' }
);
// { status: 'invite_generated', inviteUrl: 'https://...', practitionerEmail: '...' }
// status may also be: 'invite_pending' | 'already_enrolled' | 'synced'

if (result.status === 'invite_generated') {
  await sendEmail(result.practitionerEmail, result.inviteUrl);
}
```

---

## Admin sync: `scriptsure-provider-sync-bot`

Creates or updates the provider in ScriptSure directly via the admin API–no invite link required. Use for bulk onboarding or re-syncing after profile changes.

```typescript
const result = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'scriptsure-provider-sync-bot' },
  { practitionerId: 'abc123', activate: true, register: true }
);
// { status: 'created' | 'updated' | 'synced', scriptSureUserId: 55555, spi: '...' }
```

`register: true` enrolls the provider on SureScripts for electronic prescribing.
