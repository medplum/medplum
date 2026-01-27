---
sidebar_position: 8
---

# Project $init

The `$init` operation creates a new Medplum Project with an admin user in a single API call. Projects provide isolated environments for different applications, organizations, or tenants-each with their own users, access policies, and FHIR resources.

This operation streamlines the onboarding process for multi-tenant platforms, allowing you to programmatically provision new customer environments without manual setup steps.

## Use Cases

- **Customer Onboarding**: Automatically create isolated project environments when new customers sign up
- **Development Environments**: Spin up separate projects for development, staging, and production
- **Multi-Tenant SaaS**: Provision tenant-specific projects with dedicated resources and access controls
- **Testing and QA**: Create temporary projects for automated testing scenarios
- **Partner Integrations**: Set up isolated environments for third-party integrations

## Invoke the `$init` operation

```
[base]/Project/$init
```

For example:

```bash
curl 'https://api.medplum.com/fhir/R4/Project/$init' \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{"resourceType":"Parameters", "parameter":[ {"name":"name", "valueString":"Test Project"} ]}'
```

### Success Response

Example outcome:

```json
{
  "resourceType": "Project",
  "id": "59aa86af-9673-4862-a441-5200e6163bfb",
  "name": "Test Project",
  "strictMode": true,
  "owner": {
    "reference": "User/eb0f26b9-1e42-4886-85fc-31919aeebc55"
  }
}
```

### Error Response

Example outcome when Project name not provided:

```json
{
  "resourceType": "OperationOutcome",
  "id": "3820fda7-c6d4-4207-b597-90631f0881f9",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Expected required input parameter 'name'" },
      "expression": ["Parameters.parameter"]
    }
  ]
}
```

## Assigning Project Ownership

By default, the API will attempt to use the `User` associated with the current access token as the Project `owner`.
In cases where a different user should be the owner, or when the access token is not associated with a `User`, one
can be manually assigned using a parameter: either `owner` for existing users, or `ownerEmail` to create the user.

```bash
curl 'https://api.medplum.com/fhir/R4/Project/$init' \
  -X POST \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{"resourceType":"Parameters", "parameter":[ {"name":"name", "valueString":"Test Project"}, \
    {"name":"owner", "valueReference": {"reference": "User/cb5bb36b-fcfa-4c07-8da1-5f3afd8d261d" } } ]}'
```

## Related

- [Projects Guide](/docs/access/projects) - Understanding Medplum projects and multi-tenancy
- [Access Control](/docs/access/access-policies) - Configuring access policies for projects
- [Admin Access](/docs/access/admin) - Administrative access and operations
- [User Configuration](/docs/access/user-configuration) - Managing users and invitations
- [Medplum Project Resource](/docs/api/fhir/medplum/project) - Project resource reference
