---
sidebar_position: 7
tags:
  - subscription
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import CodeBlock from '@theme/CodeBlock';

# Resend Webhooks

Medplum implements a custom operation, `$resend`, that can be used to trigger all [Subscriptions](/docs/subscriptions) listening to a a particular resource.

## Invoke the `$resend` operation

<Tabs>
  <TabItem value="ts" label="TypeScript">
  <CodeBlock language='ts'>
  {`const medplum = new MedplumClient();
// auth...
await medplum.post(medplum.fhirUrl(<resourceType>, <id>, '$resend'), {});
`}
  </CodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum login
medplum post '<resourceType>/<id>/$resend' {}
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl 'https://api.medplum.com/fhir/R4/<resourceType>/<resourceId>/$resend' \
-X 'POST' \
-H 'authorization: Bearer MY_ACCESS_TOKEN' \
-H 'content-type: application/fhir+json' \
--data-raw '{}
```

  </TabItem>
</Tabs>

### Output

If successful, you will receive the following OperationOutcome

```js
{
  "resourceType": "OperationOutcome",
  "id": "ok",
  "issue": [
    {
      "severity": "information",
      "code": "informational",
      "details": {
        "text": "All OK"
      }
    }
  ]
}
```

## Related Documentation

- Refer to [Subscriptions](/docs/subscriptions) to learn more about Medplum's implementation of FHIR Subscriptions
