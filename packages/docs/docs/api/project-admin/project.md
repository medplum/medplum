import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Project Endpoint

## GET `/admin/projects/:projectId`

Returns a partial [`Project`](/docs/api/fhir/medplum/project) resource based on its `projectId`

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.get('admin/projects/:projectId');
```

  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum get admin/projects/:projectId
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl https://api.medplum.com/admin/projects/:projectId \
-H "Authorization: Bearer $TOKEN"
```

  </TabItem>
</Tabs>

Example Response:

```ts
{
  project: {
    id: ":projectid",
    name: "PROJECT NAME",
    secret: [
      // Project Secrets
    ],
    site: [
      // Project Sites
    ]
  }
}
```
