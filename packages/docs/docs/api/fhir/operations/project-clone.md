---
sidebar_position: 32
---

# Project $clone

The `$clone` operation creates a complete copy of a Medplum project, including all its resources. This is useful for creating test environments, project templates, or migrating projects.

## Use Cases

- **Creating a Test Environment**: Clone production to create isolated testing environments
- **Creating a Project Template**: Clone configuration and bots without patient data for new client projects
- **Cloning Specific Resources**: Selectively clone bots, questionnaires, or other resources

:::caution Self-Hosted Deployments Only
This operation requires super admin privileges, which are only available on self-hosted Medplum deployments. If you are using Medplum's cloud-hosted service and need to clone a project, please contact [Medplum support](https://www.medplum.com/contact).
:::

## Invocation

```
POST [base]/Project/[id]/$clone
```

## Input Parameters

Parameters are passed in the request body as a JSON object (not as FHIR Parameters):

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | (Optional) Name for the new project. If provided, updates the project name and related resources. |
| `resourceTypes` | `string[]` | (Optional) Array of resource types to include. If empty, all resource types are cloned. |
| `includeIds` | `string[]` | (Optional) Array of specific resource IDs to include. If empty, all resources are included. |
| `excludeIds` | `string[]` | (Optional) Array of resource IDs to exclude from cloning. |

## Output

Returns the newly created `Project` resource.

## Behavior

1. **Resource Discovery**: Scans all resource types in the source project (up to 1000 resources per type)
2. **ID Mapping**: Generates new IDs for all resources while maintaining internal references
3. **Reference Rewriting**: Updates all internal references to point to new resource IDs
4. **Binary Copying**: Copies Binary resources and their associated storage files
5. **Project Creation**: Creates the new project first, then all dependent resources
6. **Name Updates**: If a name is provided, updates:
   - Project name
   - ProjectMembership display names
   - Default ClientApplication names

## Example

### Request

```http
POST /fhir/R4/Project/source-project-id/$clone
Content-Type: application/json

{
  "name": "My Cloned Project",
  "resourceTypes": ["Patient", "Practitioner", "Organization", "Bot"],
  "excludeIds": ["test-data-id-1", "test-data-id-2"]
}
```

### Response

```json
{
  "resourceType": "Project",
  "id": "new-project-id",
  "name": "My Cloned Project",
  "owner": {
    "reference": "User/user123"
  }
}
```

## What Gets Cloned

The following resources are cloned (if `resourceTypes` is not specified):

- All FHIR resources in the project
- ProjectMemberships
- ClientApplications
- Bots (including code)
- Binary resources (including stored files)
- Access policies
- User configurations

## What Does NOT Get Cloned

- Login history
- Audit logs
- AsyncJob resources
- External system connections (must be reconfigured)

## Example Configurations

### Creating a Test Environment

```json
{
  "name": "Production Copy - Testing",
  "excludeIds": ["sensitive-patient-1", "sensitive-patient-2"]
}
```

### Creating a Project Template

```json
{
  "name": "New Client Project",
  "resourceTypes": ["Bot", "StructureDefinition", "ValueSet", "Questionnaire"]
}
```

### Cloning Specific Resources

```json
{
  "includeIds": ["bot-1", "bot-2", "questionnaire-1"]
}
```

## Error Responses

| Status Code | Description |
|-------------|-------------|
| `403 Forbidden` | User is not a super admin (requires self-hosted deployment) |
| `404 Not Found` | Source project not found |

## Notes

- The operation may take some time for large projects
- Binary files are copied asynchronously
- The new project will have a new owner (the user performing the clone)
- Secrets and credentials in Bots are not copied and must be reconfigured

## Related Documentation

- [Projects](/docs/access/projects)
- [Project Resource](/docs/api/fhir/medplum/project)
