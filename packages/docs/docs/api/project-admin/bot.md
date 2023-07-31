import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Bot Endpoint

## POST `/admin/projects/:projectId/bot`

Creates a new [Medplum Bot](/docs/). Posting to this endpoint creates a [`Bot`](/docs/api/fhir/medplum/bot) resource and a corresponding [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resource.

### Parameters

```ts
{
  name: string;
  description?: string;
  accessPolicy?: Reference<AccessPolicy>;
}
```

### Example request

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.post('admin/projects/:projectId/bot', {
  name: 'Hello World Bot',
  description: 'Hello world',
  accessPolicy: {
    reference: 'AccessPolicy/access-policy-id',
  },
});
```

  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum post admin/projects/:projectId/bot \
'{
  "name": "Hello World Bot",
  "description": "Hello world",
  "accessPolicy": {
    "reference": "AccessPolicy/access-policy-id"
  }
}'
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl https://api.medplum.com/admin/projects/:projectId/bot \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
  "name": "Hello World Bot",
  "description": "Hello world",
  "accessPolicy": {
    "reference": "AccessPolicy/:access-policy-id"
  }'
```

  </TabItem>
</Tabs>

### Example Response

```ts
{
  resourceType: 'Bot',
  name: 'Hello World Bot',
  description: 'Hello world',
  runtimeVersion: 'awslambda',
  sourceCode: {
    contentType: 'text/typescript',
    title: 'index.ts',
    url: 'Binary/:uuid'
  },
  id: ':bot-uuid',
  meta: {
    project: ':projectId',
    //...
  },
}
```
