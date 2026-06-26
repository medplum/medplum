---
sidebar_position: 5.3
---

# User $rescope

The `$rescope` operation moves a [`User`](/docs/api/fhir/medplum/user) between **server scope** (not owned by any Project) and **project scope** (owned by a specific Project). This controls which Project the `User` resource itself belongs to — it is distinct from a [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership), which controls access.

See [Project vs Server Scoped Users](/docs/user-management/project-vs-server-scoped-users) for background on how scoping works.

```
POST [base]/User/[id]/$rescope
```

:::warning[Privileged Operation]

- **Rescoping to project scope** requires **Super Admin** privileges.
- **Rescoping to server scope** requires **Super Admin** or **Project Admin** privileges (project admins may only release users belonging to their own project).

:::

:::caution[Irreversibility for Project Admins]

A project admin who releases a user to server scope **cannot reverse the change** — only a super admin can re-assign a server-scoped user to a project. Confirm the action before proceeding.

:::

## App UI

Two widgets in the Medplum App invoke this operation:

- **Project Admin Config** — available to project admins and super admins at [`https://app.medplum.com/admin/config`](https://app.medplum.com/admin/config). Allows releasing a project-scoped user to server scope. Super admins can also assign server-scoped users to a project from this page.
- **Super Admin Panel** — available to super admins at [`https://app.medplum.com/admin/super`](https://app.medplum.com/admin/super). Provides the same Rescope User widget with full cross-project visibility.

## Parameters

The input is a [FHIR Parameters](/docs/api/fhir/resources/parameters) resource:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope` | `code` | Yes | Target scope: `"project"` or `"server"` |
| `project` | `Reference(Project)` | Conditional | Required when `scope` is `"project"`. The Project the user will be scoped to. |

## Output

Returns the updated [`User`](/docs/api/fhir/medplum/user) resource with `User.project` set (project scope) or cleared (server scope).

## Examples

### Release a user to server scope

**TypeScript**:

```typescript
await medplum.post(`fhir/R4/User/${userId}/$rescope`, {
  resourceType: 'Parameters',
  parameter: [
    { name: 'scope', valueCode: 'server' },
  ],
});
```

**cURL**:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/User/example-user-id/$rescope' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      { "name": "scope", "valueCode": "server" }
    ]
  }'
```

### Assign a user to a project (super admin only)

**TypeScript**:

```typescript
await medplum.post(`fhir/R4/User/${userId}/$rescope`, {
  resourceType: 'Parameters',
  parameter: [
    { name: 'scope', valueCode: 'project' },
    { name: 'project', valueReference: { reference: `Project/${projectId}` } },
  ],
});
```

**cURL**:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/User/example-user-id/$rescope' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      { "name": "scope", "valueCode": "project" },
      { "name": "project", "valueReference": { "reference": "Project/example-project-id" } }
    ]
  }'
```

**Response** (200 OK):

```json
{
  "resourceType": "User",
  "id": "example-user-id",
  "email": "alice@example.com",
  "firstName": "Alice",
  "lastName": "Smith",
  "project": {
    "reference": "Project/example-project-id",
    "display": "My Project"
  }
}
```

## Behavior

### Rescope to project

- Requires the target `Project` to exist.
- Rejects if the user is already scoped to the specified project.
- Rejects if the user holds a [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) in any **other** project — remove those memberships before rescoping.
- Sets `User.project` to the target project reference.
- Runs inside a serializable transaction to prevent race conditions with concurrent membership changes.

### Rescope to server

- Rejects if the user is already server-scoped.
- Clears `User.project` from the user resource.
- Existing `ProjectMembership` resources are left in place; clean them up separately if needed.

## Error Responses

| Status | Description |
|--------|-------------|
| `200 OK` | Rescope successful — returns the updated `User` |
| `400 Bad Request` | Invalid `scope` value; missing `project` when `scope` is `"project"`; user already in the target scope; or user holds memberships in another project |
| `403 Forbidden` | Caller lacks sufficient privileges, or project admin attempted to rescope a user from a different project |
| `404 Not Found` | User or target project not found |

## See Also

- [Project vs Server Scoped Users](/docs/user-management/project-vs-server-scoped-users)
- [User Management Guide](/docs/user-management)
- [User $update-email](/docs/api/fhir/operations/user-update-email) — update a user's email address
- [User Resource](/docs/api/fhir/medplum/user)
- [ProjectMembership Resource](/docs/api/fhir/medplum/projectmembership)
