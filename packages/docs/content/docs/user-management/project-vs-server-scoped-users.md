---
id: project-vs-server-scoped-users
title: Project vs Server Scoped Users
weight: 120
docs_tags: [auth]
---

### Server Scoped Users

Server scoped [`Users`](/docs/api/fhir/medplum/user) can be used across multiple projects across the Medplum Server. Server scoped Users should be used for **developers and administrators** that need to interact with multiple projects (e.g. staging and production). By default, Practitioners are scoped to `server`.

### Project Scoped Users

Project scoped [`Users`](/docs/api/fhir/medplum/user) exist inside a single [`Project`](/docs/api/fhir/medplum/project). Project scoped Users should be used for **real practicing clinicians and patients** that will primarily interact with a single production project. By default, Patients are scoped to `project`. Inviting the same email with project scope in another project creates or matches the identity in that project's scope; it does not establish a shared server-scoped identity.

You can specify the scope of a [User](/docs/api/fhir/medplum/user) by adding the `scope` parameter to the [Invite User](/docs/api/project-admin/invite) endpoint.

```ts
const response = await medplum.post('/admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  scope: 'project' // or 'server'
})
```

![A server-scoped User is referenced by memberships in two projects. Project-scoped Users are separately defined in each project.](/img/tenancy-design/identity-scopes.svg)

_Boxes are FHIR resources; solid arrows follow `ProjectMembership.user`. Containers show the project associated with each membership. A server-scoped identity can serve both projects; project-scoped invitations match identities separately._

Within one project, a User can have several memberships and profiles. An Organization or HealthcareService tenant does not create another authentication namespace. Choose shared or independent identities separately from the tenant resource type; see [Tenancy account choices](/docs/decision-guides/tenancy-design#staff-workflows-and-patient-accounts).


{{< info >}}
For **hosted customers**, you will only have control over the User resources for your project scoped users. Self-hosted customers can access **server scoped users** from their [super admin project](/docs/self-hosting/super-admin-guide).
{{< /info >}}

{{< note >}}
If you want to create a [custom email flow](/docs/user-management/custom-emails) for your Practitioners, they will need to be invited as a Project Scoped Users so that the UserSecurityRequest resources are also scoped to the project.
{{< /note >}}

## Changing the Name and Email of a Project-Scoped User

Project Admins have the ability to update the name and email address of project-scoped users directly from the Medplum Admin App or via the API. This is in contrast to server-scoped users, whose details can only be changed by Super Admins.

{{< info >}}
To change the email address that is displayed in the Medplum app (and in FHIR resources), you must update both the User resource and the user's Profile resource (such as Patient or Practitioner). The User resource controls login and authentication, while the Profile resource controls the display name and email shown in clinical and administrative contexts.

**Recommended approach:** Use [`$update-email`](/docs/api/fhir/operations/user-update-email) to change the login email. Its optional `updateProfileTelecom` setting also updates one associated profile. For multiple memberships, leave that setting false and update the intended profiles explicitly.
{{< /info >}}

**How to update a User's login email:**

- **Medplum Admin App (Project Scoped Users Only):**  
  Navigate to the Project Admin page, select the "Users" tab, and click on the user you wish to edit. You can update their email address directly from the user details page.

- **API (Recommended - FHIR `$update-email` operation):**  
  The [`$update-email`](/docs/api/fhir/operations/user-update-email) operation updates the login email and handles verification and session revocation. The following example also updates the associated profile and assumes a User with one membership:
  ```typescript
  await medplum.post(`fhir/R4/User/${userId}/$update-email`, {
    resourceType: 'Parameters',
    parameter: [
      { name: 'email', valueString: 'new-email@example.com' },
      { name: 'updateProfileTelecom', valueBoolean: true },
      { name: 'skipEmailVerification', valueBoolean: true }
    ]
  });
  ```

  {{< note >}}
  Changing a server-scoped User's email requires super-admin authority. The operation does not support `updateProfileTelecom: true` for server-scoped Users. Update any intended profile contact information separately through an authorized workflow.
  {{< /note >}}

- **API (SCIM):**  
  Project Admins can also update a user's email using the SCIM API:
  ```bash
  curl -X PATCH 'https://api.medplum.com/scim/v2/Users/{userId}' \
    -H 'Authorization: Bearer {accessToken}' \
    -H 'Content-Type: application/json' \
    -d '{
      "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      "Operations": [{
        "op": "replace",
        "path": "emails[type eq \"work\"].value",
        "value": "new-email@example.com"
      }]
    }'
  ```
