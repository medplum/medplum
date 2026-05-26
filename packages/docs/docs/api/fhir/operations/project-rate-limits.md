---
sidebar_position: 9
---

# Project $rate-limits

The `$rate-limits` operation returns a snapshot of FHIR interaction quota usage for a project: consumed points, remaining points, configured limits, and time until reset. Use it to monitor load across the project and per membership (users, bots, and client applications).

:::note[Admin required]
Requires [project admin](/docs/access/admin) or super admin access.
:::

## Medplum App

In the Medplum App, open **Project Admin** → **Rate Limits** ([`/admin/rate-limits`](https://app.medplum.com/admin/rate-limits)) and click **Refresh** to load the latest data.

## Invoke the `$rate-limits` operation

```
GET [base]/Project/{projectId}/$rate-limits
```

### Input parameters

| Parameter      | Description                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------- |
| `membershipId` | One or more `ProjectMembership` IDs. When omitted, active consumers are returned (see below). |

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="ts" label="TypeScript">

```typescript
const params = await medplum.get(medplum.fhirUrl('Project', projectId, '$rate-limits'));

// Optional: filter by membership
// const url = medplum.fhirUrl('Project', projectId, '$rate-limits');
// url.searchParams.append('membershipId', 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
// const params = await medplum.get(url);
```

</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl 'https://api.medplum.com/fhir/R4/Project/{projectId}/$rate-limits' \
  -H 'Authorization: Bearer MY_ACCESS_TOKEN'

# Optional: filter by membership
curl -G 'https://api.medplum.com/fhir/R4/Project/{projectId}/$rate-limits' \
  -H 'Authorization: Bearer MY_ACCESS_TOKEN' \
  --data-urlencode 'membershipId=f47ac10b-58cc-4372-a567-0e02b2c3d479'
```

</TabItem>
</Tabs>

### Example response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "project",
      "part": [
        { "name": "id", "valueString": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
        { "name": "limit", "valueInteger": 500000 },
        { "name": "consumedPoints", "valueInteger": 150000 },
        { "name": "remainingPoints", "valueInteger": 350000 },
        { "name": "msBeforeReset", "valueInteger": 45000 }
      ]
    },
    {
      "name": "membership",
      "part": [
        { "name": "membershipId", "valueString": "f47ac10b-58cc-4372-a567-0e02b2c3d479" },
        {
          "name": "profile",
          "valueReference": {
            "reference": "Practitioner/abc123",
            "display": "Dr. Alice Smith"
          }
        },
        { "name": "limit", "valueInteger": 50000 },
        { "name": "consumedPoints", "valueInteger": 45000 },
        { "name": "remainingPoints", "valueInteger": 5000 },
        { "name": "msBeforeReset", "valueInteger": 30000 }
      ]
    },
    {
      "name": "membership",
      "part": [
        { "name": "membershipId", "valueString": "6ba7b810-9dad-11d1-80b4-00c04fd430c8" },
        {
          "name": "profile",
          "valueReference": {
            "reference": "ClientApplication/bot-sync",
            "display": "Sync Bot"
          }
        },
        { "name": "limit", "valueInteger": 50000 },
        { "name": "consumedPoints", "valueInteger": 10000 },
        { "name": "remainingPoints", "valueInteger": 40000 },
        { "name": "msBeforeReset", "valueInteger": 55000 }
      ]
    }
  ]
}
```

## Behavior

When no `membershipId` is specified, the server returns memberships that have had recent FHIR activity (up to 1,000 active consumers). Members with no consumption in the current window may be omitted. When `membershipId` is specified, only those memberships are included (useful for bots or service accounts). Quota fields are omitted when a counter has not been used in the current window.

The `limit` values reflect project-level settings (`userFhirQuota`, `totalFhirQuota`, and server defaults). Per-membership limits may differ when a `UserConfiguration` overrides `fhirQuota`; see [user-specific FHIR quotas](/docs/access/user-configuration#user-specific-fhir-quota-rate-limits).

:::note[Independent reset windows]
FHIR quota counters are stored in Redis with a **separate 60-second window for each key**: one for the project total and one per membership. Each window starts on that key's **first** consumption in the period; later requests add points but do not extend the window.

Because the project key is shared across all memberships, its window may have started earlier than a given membership's window (for example, after another bot or user made a request). At a single point in time you may see a membership with a **high** `consumedPoints` value near the end of its window while the **project** total is **low** or has just reset, with different `msBeforeReset` values. That is expected when windows are out of phase, and not a sign that the project total failed to sum membership usage.

When comparing project and membership utilization, check `msBeforeReset` on each row. Aligned reset times are a better signal that the counters describe the same window.
:::

## Related

- [Rate Limits](/docs/rate-limits) — FHIR interaction quotas, point weights, and configuration
- [User Configuration](/docs/access/user-configuration#user-specific-fhir-quota-rate-limits) — Per-user FHIR quota overrides
- [Project settings](/docs/self-hosting/project-settings) — `userFhirQuota` and `totalFhirQuota` system settings for self-hosters 
