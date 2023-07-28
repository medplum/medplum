import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Members Endpoint

## GET `/admin/projects/:projectId/:membershipId`

Returns the [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resource whose `id` matches `:membershipId`

### Example request

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.get('admin/projects/:projectId/members/:membershipId');
```

  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum get admin/projects/:projectId/members/:membershipId
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl https://api.medplum.com/admin/projects/:projectId/members/:membershipId \
  -H "Authorization: Bearer $TOKEN"
```

  </TabItem>
</Tabs>

### Example response

```ts
{
  resourceType: 'ProjectMembership',
  id: ':membershipId',
  admin: true,
  project: {
    reference: 'Project/:projectId',
  },
  user: {
    reference: 'User/:userId',
  },
  profile: {
    reference: 'Practitioner/:profileId',
    display: 'George Washington'
  },
}
```

## POST `/admin/projects/:projectId/:membershipId`

Overwrites the [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resource whose `id` matches `:membershipId` with the resource in the request body

### Parameters

The POST body is a [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resource rendered as a JSON string.

### Constraints

- `resourceType` must be `"ProjectMembership"`
- `id` must be the same as `:membershipId`

### Example request

Adding an [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy)

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.post('admin/projects/:projectId/members/:membershipId', {
  resourceType: 'ProjectMembership',
  id: ':membershipId',
  admin: false,
  accessPolicy: {
    reference: 'AccessPolicy/:accessPolicyId',
  },
  project: {
    reference: 'Project/:projectId',
  },
  user: {
    reference: 'User/:userId',
  },
  profile: {
    reference: 'Practitioner/:profileId',
    display: 'George Washington',
  },
});
```

  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum get admin/projects/:projectId/members/:membershipId \
{
  "resourceType": "ProjectMembership",
  "id": ":membershipId",
  "admin": false,
  "accessPolicy": {
    "reference": "AccessPolicy/:accessPolicyId"
  },
  "project": {
    "reference": "Project/:projectId"
  },
  "user": {
    "reference": "User/:userId"
  },
  "profile": {
    "reference": "Practitioner/:profileId",
    "display": "George Washington"
  }
}
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl https://api.medplum.com/admin/projects/:projectId/members/:membershipId \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '
  {
    "resourceType": "ProjectMembership",
    "id": ":membershipId",
    "admin": false,
    "accessPolicy": {
      "reference": "AccessPolicy/:accessPolicyId"
    },
    "project": {
      "reference": "Project/:projectId"
    },
    "user": {
      "reference": "User/:userId"
    },
    "profile": {
      "reference": "Practitioner/:profileId",
      "display": "George Washington"
    }
  }'
```

  </TabItem>
</Tabs>

### Example response

```ts
{
  resourceType: 'ProjectMembership',
  id: ':membershipId',
  accessPolicy: { reference: 'AccessPolicy/:accessPolicyId' },
  admin: false,
  project: {
    reference: 'Project/:projectId'
  },
  user: {
    reference: 'User/:userId',
  },
  profile: {
    reference: 'Practitioner/:profileId',
    display: 'George Washington'
  }
}
```

## DELETE `/admin/projects/:projectId/:membershipId`

Deletes the [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resource whose `id` matches `:membershipId`

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.delete('admin/projects/:projectId/members/:membershipId');
```

  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum delete admin/projects/:projectId/members/:membershipId
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl  -X "DELETE" https://api.medplum.com/admin/projects/:projectId/members/:membershipId \
  -H "Authorization: Bearer $TOKEN"
```

  </TabItem>
</Tabs>

### Example response

```ts
{
  resourceType: 'OperationOutcome',
  id: 'ok',
  issue: [
    {
      severity: 'information',
      code: 'informational',
      details: { text: 'All OK' }
    }
  ]
}
```
