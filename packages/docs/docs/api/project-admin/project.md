import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Project Endpoint

## GET `/admin/projects/:projectId`

Returns a partial [`Project`](/docs/api/fhir/medplum/project) resource based on its `projectId`

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="">
      {"medplum.get('admin/projects/:projectId')"}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="">
      {'medplum get admin/projects/:projectId'}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="">
      {
`curl https://api.medplum.com/admin/projects/:projectId \\
  -H "Authorization: Bearer $TOKEN"`}
    </MedplumCodeBlock>
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
