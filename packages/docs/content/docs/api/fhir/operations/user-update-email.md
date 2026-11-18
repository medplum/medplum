---
id: user-update-email
title: User $update-email
weight: 62
---

This operation updates both the [`User`](/docs/api/fhir/medplum/user) resource (for authentication) and optionally the associated profile resource (Patient, Practitioner, or RelatedPerson) with the new email address.

## Use Cases

- **Patient Email Changes**: Update a patient's email address for both login credentials and contact information
- **Provider Contact Updates**: Keep practitioner email addresses synchronized between authentication and profile records
- **Credential Recovery Scenarios**: Update email addresses during account recovery workflows
- **User Migration**: Change email addresses as part of user account migration or consolidation

```
POST [base]/User/[id]/$update-email
```

{{< warning title="Privileged Operation" >}}

Project administrators can update Users scoped to their project. Updating a server-scoped User requires super-admin authority. The optional profile update is supported only for project-scoped Users.

{{< /warning >}}

{{< warning title="User vs Profile Email" >}}

In Medplum, `User.email` controls authentication and login, while the profile's `telecom` field holds contact information. Updating contact information alone leaves the login email unchanged. For a project-scoped User with one membership, this operation can update both atomically. For multiple memberships, update the intended profiles explicitly as described below.

Use this operation rather than editing `User.email` directly, so that the related account changes described under [Output](#output) are applied.

{{< /warning >}}

## Parameters

The input is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource containing:

| Parameter               | Type      | Required | Description                                                                                                                                                                                                                                                                                                |
| ----------------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email`                 | `string`  | Yes      | The new email address to set on the User                                                                                                                                                                                                                                                                   |
| `updateProfileTelecom`  | `boolean` | No       | If `true`, also updates one associated profile's `telecom` email. Supported only for project-scoped Users; use `false` when you need to select among multiple profiles. Default: `false` |
| `skipEmailVerification` | `boolean` | No       | If `true`, skips email verification entirely: no `UserSecurityRequest` is created and no email is sent. Default: `false`                                                                                                                                                                                   |
| `sendEmail`             | `boolean` | No       | If `false`, creates the `verify-email` `UserSecurityRequest` but does not send the built-in verification email. Use this to send your own branded email from a [Bot](/docs/bots) subscribed to `UserSecurityRequest`, the same pattern as `sendEmail: false` on invite and password reset. Default: `true` |

## Output

The operation returns the updated [`User`](/docs/api/fhir/medplum/user) resource with:

- `email` set to the new email address
- `emailVerified` set to `false` (unless verification was skipped)

Any outstanding invite, password reset, and email verification requests for the user are invalidated, and the user is signed out of all active sessions. A user who has not yet set a password can do so with "Forgot password" and the new email address.

If `updateProfileTelecom` is `true`:

- Adds the new email to the profile's `telecom` array with `use: 'work'`
- Marks the old email in `telecom` with `use: 'old'`

For a User with multiple memberships in the project, this option looks up one membership; it cannot target a specific profile or synchronize every profile. Set `updateProfileTelecom: false` and update the intended profile resources explicitly. See [Patient login and memberships](/docs/access/tenant-selector#patient-login-and-memberships) for tenant-specific Patient records sharing one login identity.

## Examples

These examples assume a project-scoped User with one membership whose profile contact email should also change.

**Request**:

**TypeScript**:

```typescript
await medplum.post(`fhir/R4/User/${userId}/$update-email`, {
  resourceType: 'Parameters',
  parameter: [
    { name: 'email', valueString: 'newemail@example.com' },
    { name: 'updateProfileTelecom', valueBoolean: true },
  ],
});
```

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/User/example-user-id/$update-email' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      { "name": "email", "valueString": "newemail@example.com" },
      { "name": "updateProfileTelecom", "valueBoolean": true }
    ]
  }'
```

**Response** (200 OK):

```json
{
  "resourceType": "User",
  "id": "example-user-id",
  "email": "newemail@example.com",
  "emailVerified": false,
  "firstName": "Alice",
  "lastName": "Smith",
  "project": {
    "reference": "Project/example-project-id"
  }
}
```

## Finding User ID from ProjectMembership

Use the intended membership ID saved during provisioning to identify the User. If you locate memberships by Patient profile instead, verify which User should be updated; do not assume the first match is the intended identity. Changing a shared User's email affects sign-in for all of its memberships.

```typescript
const membership = await medplum.readResource('ProjectMembership', membershipId);
const userReference = membership.user?.reference;
if (!userReference) {
  throw new Error('Membership has no User reference');
}

// Update the login email. Update any intended Patient contact fields separately.
await medplum.post(`fhir/R4/${userReference}/$update-email`, {
  resourceType: 'Parameters',
  parameter: [
    { name: 'email', valueString: 'newemail@example.com' },
    { name: 'updateProfileTelecom', valueBoolean: false },
  ],
});
```

## Error Responses

| Status Code       | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `200 OK`          | Email successfully updated                                                |
| `400 Bad Request` | Invalid parameters or attempting to update profile for server-scoped user |
| `403 Forbidden`   | Insufficient permissions or user from different project                   |
| `404 Not Found`   | User not found                                                            |

## See Also

- [User Management Guide](/docs/user-management)
- [Project vs Server Scoped Users](/docs/user-management/project-vs-server-scoped-users)
- [User Resource](/docs/api/fhir/medplum/user)
