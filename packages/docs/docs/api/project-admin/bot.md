# Bot Endpoint

## POST `/admin/projects/:projectId/bot`

Creates a new [Medplum Bot](/docs/). Posting to this endpoint creates a

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
