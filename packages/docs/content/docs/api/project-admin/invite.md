---
id: invite
title: Invite User Endpoint
---

## POST `/admin/projects/:projectId/invite`

Invite a new user to the project. This will perform the following actions:

1. Search for an existing user with the provided `email`, if given
2. Select the provided `membership.profile` or search for an existing profile resource ([`Patient`](/docs/api/fhir/resources/patient), [`Practitioner`](/docs/api/fhir/resources/practitioner), or [`RelatedPerson`](/docs/api/fhir/resources/relatedperson)) using the [profile-selection rules](#profile-selection)
3. Create a new [`User`](/docs/api/fhir/medplum/user), if no existing [`User`](/docs/api/fhir/medplum/user) was found,
   1. Set the password if `password` is given
   2. Generate a password reset url
4. Create a new profile resource, if no existing profile was found
5. Create a corresponding [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resource, for the (user, profile) pair
6. Send an invite email, if `sendEmail` is `true`

### Parameters

```ts
{
  resourceType: 'Patient' | 'Practitioner' | 'RelatedPerson';
  firstName: string;
  lastName: string;
  email?: string;
  externalId?: string;
  patient?: Reference<Patient>;
  scope?: 'project' | 'server';
  password?: string;
  sendEmail?: boolean;
  membership?: Partial<ProjectMembership>;
  upsert?: boolean;
  forceNewMembership?: boolean;
  mfaRequired?: boolean;
}
```

| parameter               | description                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resourceType`          | The [User's](/docs/api/fhir/medplum/user) [profile resourceType](/docs/user-management#profiles)                                                                                                                                                                                        |
| `firstName`, `lastName` | The first and last names that will be assigned to user's [profile resource](/docs/user-management#profiles). Ignored if a profile resource already exists                                                                                                                               |
| `email`                 | The email address assigned to the [User](/docs/api/fhir/medplum/user). User matching uses the email and the selected project or server scope. |
| `externalId`            | The unique id provided by external identity provider (if applicable). See [Using External Ids](/docs/auth/external-identity-providers)                                                                                                                                                                    |
| `patient`               | The [`Patient`](/docs/api/fhir/resources/patient) a new [`RelatedPerson`](/docs/api/fhir/resources/relatedperson) is related to. Required when the invite creates a RelatedPerson. When the invite does not set an access policy, Medplum copies this reference onto [`ProjectMembership.access.parameter`](/docs/api/fhir/medplum/projectmembership) as `patient`, which fills `%patient` in the default RelatedPerson policy. See [Caregiver access](/docs/access/access-policies#caregiver-access). |
| `password`              | The [User's](/docs/api/fhir/medplum/user) password                                                                                                                                                                                                                                                 |
| `scope`                 | The scope of the user. If `project`, the user will be scoped to the project. If `server`, the user will be a server scoped user. Defaults to `server` for Practitioners and `project` for Patients. See [server vs project scoped user guide](/docs/user-management/project-vs-server-scoped-users)                                                                                                                               |
| `sendEmail`             | If `true`, send an invite email to the user. If self-hosting, see our [guide on setting up SES](/docs/self-hosting/install-on-aws#setup-ses)                                                                                                                                                       |
| `membership`            | Used to override any fields of the resulting [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resource. Common use cases include: <ul><li>Setting [Access Policies](/docs/access/access-policies) upon invite </li><li>Overriding the default `ProjectMembership.profile`</li></ul> |
| `upsert`                | If `true`, allows updating existing users and profiles instead of creating new ones. When enabled, the invite will search for existing users and profiles and update them if found, rather than throwing an error message.                                                                                                                                              |
| `forceNewMembership`    | If `true`, creates an additional [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) instead of checking for an existing membership by User and project. For email-based invites, User matching still uses email and identity scope; [profile selection](#profile-selection) is unchanged. |
| `mfaRequired`           | If `true`, requires the user to set up Multi-Factor Authentication (MFA) during their first login. See [MFA documentation](/docs/auth/mfa) for more details.                                                                                                                                                                                                                         |

### Profile selection

Here, a **profile** is the Patient, Practitioner, or RelatedPerson resource referenced by `ProjectMembership.profile`. The invite selects this resource separately from the User's sign-in identity:

- If you supply `membership.profile`, the invite uses that existing resource after checking its project and resource type.
- Otherwise, an email-based invite searches the requested resource type within the project for a matching email. It reuses a single match, creates a profile when none matches, and returns an error when several match. Profile creation must satisfy the resource's requirements.
- Without an email or an explicit `membership.profile`, the invite creates a profile, subject to the resource's creation requirements.

`forceNewMembership: true` preserves these selection rules. For example, repeating a Patient invite with the same email can create another membership pointing to the same Patient. To select a different existing Patient, supply its reference in `membership.profile`.

### Tenant-specific Patient profiles

For an application with separate Patient records for the same person in different tenants, provision each Patient first and supply its reference in `membership.profile`. Keep the same email and identity scope to reuse the User, and use `forceNewMembership: true` for each additional membership. Persist the returned membership ID because repeating the forced invite creates another membership. See [Patient login and memberships](/docs/access/tenant-selector#patient-login-and-memberships) for the provisioning example and combined-portal alternative.

### Constraints

- Either `email` or `externalId` is required.

### Examples

#### Inviting a Practitioner

{{< tabs groupId="language" >}}
  {{< tab value="ts" label="Typescript" >}}

```ts
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'George',
  lastName: 'Washington',
  email: 'dr.gw@example.gov',
  password: 'lib3rty0rDe4th!',
});
```

  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum post admin/projects/:projectId/invite \
'{
  "resourceType": "Practitioner",
  "firstName": "George",
  "lastName": "Washington",
  "email": "dr.gw@example.gov",
  "membership": {
    "admin": true
  }
}'
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl https://api.medplum.com/admin/projects/:projectId/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
  "resourceType": "Practitioner",
  "firstName": "George",
  "lastName": "Washington",
  "email": "dr.gw@example.gov",
  "membership": {
    "admin": true
  }
}'
```

  {{< /tab >}}
{{< /tabs >}}

Example Response:

Returns the [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) associated with the new user

```ts
{
  resourceType: 'ProjectMembership',
  id: ':id',
  admin: true,
  project: {
    reference: 'Project/:projectId',
  },
  user: {
    reference: 'User/:userId',
    display: 'dr.gw@example.gov'
  },
  profile: {
    reference: 'Practitioner/:practitionerId',
    display: 'George Washington'
  },
}
```

#### Inviting a Patient

{{< tabs groupId="language" >}}
  {{< tab value="ts" label="Typescript" >}}

```ts
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Patient',
  firstName: 'George',
  lastName: 'Washington',
  email: 'patient.gw@example.gov',
  password: 'lib3rty0rDe4th!',
});
```

  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum post admin/projects/:projectId/invite \
'{
  "resourceType": "Patient",
  "firstName": "George",
  "lastName": "Washington",
  "email": "patient.gw@example.gov",
  "password": "lib3rty0rDe4th!"
}'
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl https://api.medplum.com/admin/projects/:projectId/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
  "resourceType": "Patient",
  "firstName": "George",
  "lastName": "Washington",
  "email": "patient.gw@example.gov",
  "password": "lib3rty0rDe4th!"
}'
```

  {{< /tab >}}
{{< /tabs >}}

Example Response:

Returns the [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) associated with the new user

```ts
{
  resourceType: 'ProjectMembership',
  id: ':id',
  admin: true,
  project: {
    reference: 'Project/:projectId'
  },
  user: {
    reference: 'User/:userId',
    display: 'patient.gw@example.gov'
  },
  profile: {
    reference: 'Patient/:patientId',
    display: 'George Washington'
  }
}
```

#### Inviting a RelatedPerson

Pass `patient`, and leave the access policy unset so the project's default RelatedPerson policy is applied with that Patient as the `patient` parameter. See [Caregiver access](/docs/access/access-policies#caregiver-access).

{{< tabs groupId="language" >}}
  {{< tab value="ts" label="Typescript" >}}

```ts
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'RelatedPerson',
  firstName: 'Marge',
  lastName: 'Simpson',
  email: 'marge@example.com',
  patient: { reference: 'Patient/bart-simpson' },
});
```

  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum post admin/projects/:projectId/invite \
'{
  "resourceType": "RelatedPerson",
  "firstName": "Marge",
  "lastName": "Simpson",
  "email": "marge@example.com",
  "patient": { "reference": "Patient/bart-simpson" }
}'
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl https://api.medplum.com/admin/projects/:projectId/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
  "resourceType": "RelatedPerson",
  "firstName": "Marge",
  "lastName": "Simpson",
  "email": "marge@example.com",
  "patient": { "reference": "Patient/bart-simpson" }
}'
```

  {{< /tab >}}
{{< /tabs >}}

#### Inviting a User with MFA Required

{{< tabs groupId="language" >}}
  {{< tab value="ts" label="Typescript" >}}

```ts
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  mfaRequired: true,
});
```

  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum post admin/projects/:projectId/invite \
'{
  "resourceType": "Practitioner",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.com",
  "mfaRequired": true
}'
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl https://api.medplum.com/admin/projects/:projectId/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
  "resourceType": "Practitioner",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.com",
  "mfaRequired": true
}'
```

  {{< /tab >}}
{{< /tabs >}}

When `mfaRequired: true` is set, the user will be required to enroll in Multi-Factor Authentication during their first login. See [MFA documentation](/docs/auth/mfa) for more details.

## See Also

- [User Admin Guide](/docs/user-management)
- [Invite a new user](/docs/app/invite)
- [Custom Emails](/docs/user-management/custom-emails)
- [Multi-Factor Authentication (MFA)](/docs/auth/mfa) - For details on MFA enrollment and usage
