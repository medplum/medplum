---
sidebar_position: 7
tags:
  - subscription
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import CodeBlock from '@theme/CodeBlock';

# Resource $resend

The `$resend` operation manually triggers subscription notifications for a specific resource. This is invaluable for debugging subscription workflows, recovering from failed notifications, and replaying events during development or after system issues.

When a subscription notification fails or you need to reprocess a resource through your subscription pipeline, `$resend` lets you re-trigger the workflow without modifying the underlying resource—ensuring your integrations stay synchronized.

## Use Cases

- **Failed Notification Recovery**: Retry subscription notifications that failed due to temporary network issues or downstream service outages
- **Debugging Subscriptions**: Test subscription logic during development by manually triggering notifications
- **Data Synchronization**: Force re-sync of specific resources to external systems after fixing integration issues
- **Selective Replay**: Re-trigger a specific subscription for a resource instead of all subscriptions
- **Historical Replay**: Replay a notification against a specific historical `versionId` so subscription handlers that diff `%previous` against `%current` see the same state as the original event, even if the resource has since been updated
- **Integration Testing**: Verify that subscriptions fire correctly without creating new test data

:::note[Admin Required]
The User, Bot, or ClientApplication invoking this operation must have [project admin credentials](/docs/access/admin).
:::

## Parameters

The operation takes an optional `option` parameter, which is an object containing the following fields:

| Option         | Description                                                                                                                                                                                                                                                                                                                          | Data Type                                | Default Value |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ------------- |
| `verbose`      | Indicates if verbose logging should be enabled.                                                                                                                                                                                                                                                                                      | `boolean`                                | `false`       |
| `interaction`  | [`Subscriptions`](/docs/api/fhir/resources/subscription) can be configured to trigger only when a resource is created or deleted as opposed to any update. This option allows you to specify which interaction type will be sent.                                                                                                    | `update` &#124; `create` &#124; `delete` | `update`      |
| `subscription` | A specific [`Subscription`](/docs/api/fhir/resources/subscription) to trigger, formatted as `Subscription/<id>`. If left undefined, all [`Subscriptions`](/docs/api/fhir/resources/subscription) will be triggered.                                                                                                                  | `string`                                 | `undefined`   |
| `versionId`    | Resend subscriptions for a specific historical version of the resource rather than the current version. `%previous` is then the version immediately prior to it.                                                                                                                                                                      | `string`                                 | `undefined`   |

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

### Replay a specific historical version

To replay a notification for a past version of the resource rather than the current version, pass `versionId`. The server loads that exact version, and sets `%previous` to the version immediately preceding it in history, so [expression-based subscription criteria](/docs/subscriptions/subscription-extensions#expression-based-criteria) that diff `%previous` against `%current` see the same state as the original event.

```ts
await medplum.post(medplum.fhirUrl('Patient', patientId, '$resend'), {
  versionId: 'a1b2c3d4-...', // a versionId from the resource's history
  subscription: 'Subscription/123',
});
```

If the `versionId` does not exist in the resource's history, the operation returns `404 Not Found`.

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

## Related

- [Subscriptions Guide](/docs/subscriptions) - Complete guide to FHIR Subscriptions in Medplum
- [Bot $execute](/docs/api/fhir/operations/bot-execute) - Execute bots triggered by subscriptions
- [Subscription Resource](/docs/api/fhir/resources/subscription) - FHIR Subscription resource reference
- [Admin Access](/docs/access/admin) - Admin credentials required for this operation
- [FHIR Subscriptions](https://hl7.org/fhir/R4/subscription.html) - FHIR specification for Subscription
