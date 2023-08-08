import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Client Application Endpoint

## POST `/admin/projects/:projectId/client`

Creates a new [ClientApplication](/docs/api/fhir/medplum/clientapplication). Posting to this endpoint creates a [`ClientApplication`](/docs/api/fhir/medplum/clientapplication) resource and a corresponding [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resource.

### Parameters

```ts
{
  name: string;
  description?: string;
  redirectUri?: string;
  accessPolicy?: Reference<AccessPolicy>;
  identityProvider?: {
    authorizeUrl?: string;
    tokenUrl?: string;
    userInfoUrl?: string;
    clientId?: string;
    clientSecret?: string;
    useSubject?: boolean;
  }
}
```

### Example request

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.post('admin/projects/:projectId/client', {
  name: 'Hello World Client',
  description: 'Client App for Medplum Hello World',
  redirectUri: 'https://example.com/redirect',
  accessPolicy: {
    reference: 'AccessPolicy/access-policy-id',
  },
});
```

  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum post admin/projects/:projectId/client \
'{
  "name": "Hello World Client",
  "description": "Client App for Medplum Hello World",
  "redirectUri": "https://example.com/redirect"
  "accessPolicy": {
    "reference": "AccessPolicy/access-policy-id"
  }
}'
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl https://api.medplum.com/admin/projects/:projectId/client \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
  "name": "Hello World Client",
  "description": "Hello world",
  "redirectUri": "https://example.com/redirect"
  "accessPolicy": {
    "reference": "AccessPolicy/:access-policy-id"
  }'
```

  </TabItem>
</Tabs>

### Example Response

```ts
{
  meta: {
    project: ':projectId',
    //...
  },
  resourceType: 'ClientApplication',
  name: 'Hello World Client',
  id: ':clientId',
  secret: ':clientSecret',
  description: 'Client App for Medplum Hello World',
  redirectUri: 'https://example.com/redirect'
}
```
