import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Invite User Endpoint

## POST `/admin/projects/:projectId/invite`

Invite a new user to the project. This will perform the following actions:

1. Search for an existing user with the provided `email`, if given
2. Search for an existing profile resource ([Patient](/docs/api/fhir/resources/patient), [Practitioner](/docs/api/fhir/resources/practitioner), or [RelatedPerson](/docs/api/fhir/resources/relatedperson))
3. Create a new User, if no existing User was found,
   1. Set the password if `password` is given
   2. Generate a password reset url
4. Create a new profile resource, if no existing profile was found
5. Create a corresponding [ProjectMembership](/docs/api/fhir/medplum/projectmembership) resource, for the (user, profile) pair
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

### Constraints

- Either `email` or `externalId` is required.

### Example

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

Returns the [ProjectMembership](/docs/api/fhir/medplum/projectmembership) associated with the new user

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

Returns the [ProjectMembership](/docs/api/fhir/medplum/projectmembership) associated with the new user

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

- [Invite a new user](https://www.medplum.com/docs/app/invite)
- [Custom Welcome Emails](https://www.medplum.com/docs/auth/custom-welcome-emails)
