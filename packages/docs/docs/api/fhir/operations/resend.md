---
sidebar_position: 7
tags:
  - subscription
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import CodeBlock from '@theme/CodeBlock';

# Resend Webhooks

Medplum implements a custom operation, `$resend`, that can be used to trigger [Subscriptions](/docs/subscriptions) listening to a a particular resource. The operation takes an optional `option` parameter, which is an object containing three fields:

| Option         | Description                                                                                                                                                                                                                       | Data Type                                | Default Value |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------- |
| `verbose`      | Indicates if verbose logging should be enabled.                                                                                                                                                                                   | `boolean`                                | `false`       |
| `interaction`  | [`Subscriptions`](/docs/api/fhir/resources/subscription) can be configured to trigger only when a resource is created or deleted as opposed to any update. This option allows you to specify which interaction type will be sent. | `update` &#124; `create` &#124; `delete` | `update`      |
| `subscription` | A specific [`Subscription`](/docs/api/fhir/resources/subscription) to trigger, formatted as `Subscription/<id>`. If left undefined, all [`Subscriptions`](/docs/api/fhir/resources/subscription) will be triggered.               | `string`                                 | `undefined`   |

## Invoke the `$resend` operation

<Tabs>
  <TabItem value="ts" label="TypeScript">
  <CodeBlock language='ts'>
  {`const medplum = new MedplumClient();
// auth...
await medplum.post(medplum.fhirUrl(<resourceType>, <id>, '$resend'), {
  verbose: true,
  interaction: 'update',
  subscription: 'Subscription/123'
});
`}
  </CodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">

```bash
medplum login
medplum post '<resourceType>/<id>/$resend' {"verbose":"true","interaction":"update","subscription":"Subscription/123"}
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl 'https://api.medplum.com/fhir/R4/<resourceType>/<resourceId>/$resend' \
-X 'POST' \
-H 'authorization: Bearer MY_ACCESS_TOKEN' \
-H 'content-type: application/fhir+json' \
--data-raw '{"verbose":"true","interaction":"update","subscription":"Subscription/123"}'
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
