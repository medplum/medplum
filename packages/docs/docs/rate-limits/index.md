---
sidebar_position: 2
---

# Rate Limits

The Medplum API uses a number of safeguards against bursts of incoming traffic to help maximize its stability. Users who
send many requests in quick succession may receive HTTP error responses with status code `429 Too Many Requests`.

## Total Requests Rate Limit

| Category                      | Free tier                        | Paid tier                         |
| ----------------------------- | -------------------------------- | --------------------------------- |
| Auth (`/auth/*`, `/oauth2/*`) | 160 requests per IP per minute   | 160 requests per IP per minute    |
| Others (including `/auth/me`) | 6,000 requests per IP per minute | 60,000 requests per IP per minute |

All rate limits are calculated per IP address over a one minute window.

Rate limits can be increased for paid plans. Please [contact us](mailto:info+rate-limits@medplum.com?subject=Increase%20rate%20limits) for more information.

## FHIR Interaction Load Rate Limit

In addition to limits on the number of requests that can be made to the Medplum server, there is a limit on the total load of the interactions made to the Medplum server. Different interactions with the datastore are weighted by complexity and impact, and **the sum of a user's interactions in a given minute** must remain under the user's total load limit.

The quota is calculated as the sum of each user's interactions in a given minute, where each interaction is weighted by its impact on the data store. Here are the weights used to calculate the quota:

| FHIR Operation | Points Cost | Description                         |
| -------------- | ----------- | ----------------------------------- |
| Read           | 1 point     | Basic resource read operation       |
| Create         | 100 points  | Creating a new resource             |
| Update         | 100 points  | Full resource update                |
| Delete         | 100 points  | Deleting a resource                 |
| Patch          | 100 points  | Partial resource update             |
| Search         | 20 points   | Searching resources                 |
| History        | 10 points   | Retrieving resource version history |

FHIR uses [specific terminology](http://hl7.org/fhir/restful-interaction) to categorize different interactions with
the data store, e.g. `search` and `update`. These interactions are weighted by complexity and impact to the data store,
with the sum of each user's interactions in a given minute compared to the configured limit. There is also
a limit on the total interactions for all users within a Project as a whole, which defaults to ten times the per-user
limit.

### How to view and configure rate limits

You can configure rate limits at the **Server**, **Project**, and **User** levels.

- **Server Level Defaults (Self-Hosting)**: Defined in [Server Configuration](/docs/self-hosting/server-config) using `defaultRateLimit` and `defaultFhirQuota`.
- **Project Level Overrides**: Configured in the `Project.systemSettings` (see below).
- **User Level Overrides**: Configured in `UserConfiguration` resources (see [User Configuration](/docs/access/user-configuration#user-specific-fhir-quota-rate-limits)).

To view or update the Project-level limits:

1.  Navigate to the **Project Admin** page in the Medplum App.
2.  Edit the `Project` resource.
3.  Update the `systemSettings` field:

```json
{
  "resourceType": "Project",
  "systemSettings": {
    "userFhirQuota": 100000,
    "totalFhirQuota": 500000
  }
}
```

- `userFhirQuota`: Overrides the per-user FHIR interaction limit.
- `totalFhirQuota`: Sets a limit for the _sum_ of all users in the project.

If those values are not set, the server defaults will be used.

:::info
There are some scenarios where you may want to **set a custom quota for a User, Bot, or ClientApplication**. For example, say you expect higher traffic for a specific User, Bot, or ClientApplication than the default user quota in your project, you can set a custom quota for that User, Bot, or ClientApplication. See [how to set user-specific FHIR quotas](/docs/access/user-configuration#user-specific-fhir-quota-rate-limits) for more information about how to do this.

**Important:** The `totalFhirQuota` will still be enforced, but `userFhirQuota` will be overridden for the User, Bot, or ClientApplication.
:::

## Reporting Request and Load Rate Limits: HTTP Headers

All API calls affected by rate limits will include a `RateLimit` header with details about the applicable limits:

```
RateLimit: "requests";r=59999;t=60, "fhirInteractions";r=49894;t=60
```

Each logical limit reports the number of units remaining (`r`) and the time remaining, in seconds, until
the limit resets (`t`). Applications should use these reported values to proactively slow down activity when
few units are remaining, in order to prevent service disruption. Once a `429 Too Many Requests` error is produced,
applications should not retry until after at least the indicated number of seconds have passed and the limit has
been reset.
