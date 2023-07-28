import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Project Secrets Endpoint

## POST `/admin/projects/:projectId/secrets`

Overwrites project-level secrets stored in `Project.secret`.

### Parameters

```ts
{
  name?: string;
  valueString?: string;
  valueBoolean?: boolean;
  valueDecimal?: number;
  valueInteger?: number;
}[]
```

### Constraints

One of `valueString`, `valueBoolean`, `valueDecimal`, `valueInteger` should be set

### Example

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">

```ts
await medplum.post(`admin/projects/:projectId/secrets`, [
  {
    name: 'myLuckyNumber',
    valueInteger: 42,
  },
  {
    name: 'thirdPartyApiKey',
    valueString: '12345abcde',
  },
]);
```

  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum post admin/projects/:projectId/secrets \
'[
  {
    "name": "myLuckyNumber",
    "valueInteger": 42
  },
  {
    "name": "thirdPartyApiKey",
    "valueString": "12345abcde"
  }
]'
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl https://api.medplum.com/admin/projects/:projectId/secrets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
  {
    "name": "myLuckyNumber",
    "valueInteger": 42
  },
  {
    "name": "thirdPartyApiKey",
    "valueString": "12345abcde"
  }
]'
```

  </TabItem>
</Tabs>

Example Response:
Returns the updated [`Project`](/docs/api/fhir/medplum/project) resource

```ts
{
  resourceType: 'Project',
  name: "Project Name",
  // ...
  secret: [
    { name: 'myLuckyNumber', valueInteger: 42 },
    { name: 'thirdPartyApiKey', valueString: '12345abcde' }
  ]
}
```

## See Also

- [Bot Secrets](/docs/bots/bot-secrets)
