---
sidebar_position: 5.2
---

# User $update-email

This operation updates both the [`User`](/docs/api/fhir/medplum/user) resource (for authentication) and optionally the associated profile resource (Patient, Practitioner, or RelatedPerson) with the new email address.

## Use Cases

- **Patient Email Changes**: Update a patient's email address for both login credentials and contact information
- **Provider Contact Updates**: Keep practitioner email addresses synchronized between authentication and profile records
- **Credential Recovery Scenarios**: Update email addresses during account recovery workflows
- **User Migration**: Change email addresses as part of user account migration or consolidation

```
POST [base]/User/[id]/$update-email
```

:::warning Privileged Operation

This operation requires **Project Admin** privileges

:::

:::caution User vs Profile Email

In Medplum, the `User.email` field controls authentication and login, while the profile resource's `telecom` field displays contact information. If you update only the profile resource email, users will not be able to log in with the new email address. Use this operation to update both atomically.

:::

## Parameters

The input is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource containing:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | `string` | Yes | The new email address to set on the User |
| `updateProfileTelecom` | `boolean` | No | If `true`, also updates the email in the profile resource's `telecom` field (recommended). Default: `false` |
| `skipEmailVerification` | `boolean` | No | If `true`, skips sending the verification email. Default: `false` |

## Output

The operation returns the updated [`User`](/docs/api/fhir/medplum/user) resource with:
- `email` set to the new email address
- `emailVerified` set to `false` (unless verification was skipped)

If `updateProfileTelecom` is `true`:
- Adds the new email to the profile's `telecom` array with `use: 'work'`
- Marks the old email in `telecom` with `use: 'old'`

## Examples

**Request**:

**TypeScript**:

```typescript
await medplum.post(`fhir/R4/User/${userId}/$update-email`, {
  resourceType: 'Parameters',
  parameter: [
    { name: 'email', valueString: 'newemail@example.com' },
    { name: 'updateProfileTelecom', valueBoolean: true }
  ]
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

To update a patient's email when you only have their Patient ID:

```typescript
// Find the user via ProjectMembership
const memberships = await medplum.searchResources('ProjectMembership', {
  profile: profileReference
});
const userId = memberships[0].user?.reference?.split('/')[1];

// Update the email
await medplum.post(`fhir/R4/User/${userId}/$update-email`, {
  resourceType: 'Parameters',
  parameter: [
    { name: 'email', valueString: 'newemail@example.com' },
    { name: 'updateProfileTelecom', valueBoolean: true }
  ]
});
```

## Error Responses

| Status Code | Description |
|-------------|-------------|
| `200 OK` | Email successfully updated |
| `400 Bad Request` | Invalid parameters or attempting to update profile for server-scoped user |
| `403 Forbidden` | Insufficient permissions or user from different project |
| `404 Not Found` | User not found |

## See Also

- [User Management Guide](/docs/user-management)
- [Project vs Server Scoped Users](/docs/user-management/project-vs-server-scoped-users)
- [User Resource](/docs/api/fhir/medplum/user)
