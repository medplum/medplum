import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Invite User Endpoint

## POST `/admin/projects/:projectId/invite`

Invite a new user to the project. This will perform the following actions:

1. Search for an existing user with the provided `email`, if given
2. Search for an existing profile resource ([`Patient`](/docs/api/fhir/resources/patient), [`Practitioner`](/docs/api/fhir/resources/practitioner), or [`RelatedPerson`](/docs/api/fhir/resources/relatedperson))
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
  password?: string;
  sendEmail?: boolean;
  membership?: Partial<ProjectMembership>;
}
```

| parameter               | description                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resourceType`          | The [User's](/docs/api/fhir/medplum/user) [profile resourceType](/docs/auth/user-management-guide#profiles)                                                                                                                                                                                        |
| `firstName`, `lastName` | The first and last names that will be assigned to user's [profile resource](/docs/auth/user-management-guide#profiles). Ignored if a profile resource already exists                                                                                                                               |
| `email`                 | The email address assigned to the [User](/docs/api/fhir/medplum/user). Used to identify users within each project                                                                                                                                                                                  |
| `externalId`            | The unique id provided by external identity provider (if applicable). See [Using External Ids](/docs/auth/methods/external-ids)                                                                                                                                                                    |
| `password`              | The [User's](/docs/api/fhir/medplum/user) password                                                                                                                                                                                                                                                 |
| `sendEmail`             | If `true`, send an invite email to the user. If self-hosting, see our [guide on setting up SES](/docs/self-hosting/install-on-aws#setup-ses)                                                                                                                                                       |
| `membership`            | Used to override any fields of the resulting [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resource. Common use cases include: <ul><li>Setting [Access Policies](/docs/access/access-policies) upon invite </li><li>Overriding the default `ProjectMembership.profile`</li></ul> |

### Constraints

- Either `email` or `externalId` is required.

### Examples

#### Inviting a Practitioner

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'George',
  lastName: 'Washington',
  email: 'dr.gw@example.gov',
  password: 'lib3rty0rDe4th!',
});
```

  </TabItem>
  <TabItem value="cli" label="CLI">

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

  </TabItem>
  <TabItem value="curl" label="cURL">

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

  </TabItem>
</Tabs>

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

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Patient',
  firstName: 'George',
  lastName: 'Washington',
  email: 'patient.gw@example.gov',
  password: 'lib3rty0rDe4th!',
});
```

  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum post admin/projects/:projectId/invite \
'{
  "resourceType": "Patient",
  "firstName": "George",
  "lastName": "Washington",
  "email": "patient.gw@example.gov",
  "password: "lib3rty0rDe4th!"
}'
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl https://api.medplum.com/admin/projects/:projectId/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
  "resourceType": "Patient",
  "firstName": "George",
  "lastName": "Washington",
  "email": "patient.gw@example.gov",
  "password: "lib3rty0rDe4th!"
}'
```

  </TabItem>
</Tabs>

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

## See Also

- [User Admin Guide](/docs/auth/user-management-guide)
- [Invite a new user](https://www.medplum.com/docs/app/invite)
- [Custom Emails](https://www.medplum.com/docs/auth/custom-emails)
