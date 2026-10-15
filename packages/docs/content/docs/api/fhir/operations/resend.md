---
id: resend
title: Resource $resend
weight: 80
tags:
  - subscription
---

The `$resend` operation manually triggers subscription notifications for a specific resource. This is invaluable for debugging subscription workflows, recovering from failed notifications, and replaying events during development or after system issues.

When a subscription notification fails or you need to reprocess a resource through your subscription pipeline, `$resend` lets you re-trigger the workflow without modifying the underlying resource—ensuring your integrations stay synchronized.

## Use Cases

- **Failed Notification Recovery**: Retry subscription notifications that failed due to temporary network issues or downstream service outages
- **Debugging Subscriptions**: Test subscription logic during development by manually triggering notifications
- **Data Synchronization**: Force re-sync of specific resources to external systems after fixing integration issues
- **Selective Replay**: Re-trigger a specific subscription for a resource instead of all subscriptions
- **Integration Testing**: Verify that subscriptions fire correctly without creating new test data

{{< note title="Admin Required" >}}
The User, Bot, or ClientApplication invoking this operation must have [project admin credentials](/docs/access/admin).
{{< /note >}}

## Parameters

The operation takes an optional `option` parameter, which is an object containing three fields:

| Option         | Description                                                                                                                                                                                                                       | Data Type                                | Default Value |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------- |
| `verbose`      | Indicates if verbose logging should be enabled.                                                                                                                                                                                   | `boolean`                                | `false`       |
| `interaction`  | [`Subscriptions`](/docs/api/fhir/resources/subscription) can be configured to trigger only when a resource is created or deleted as opposed to any update. This option allows you to specify which interaction type will be sent. | `update` &#124; `create` &#124; `delete` | `update`      |
| `subscription` | A specific [`Subscription`](/docs/api/fhir/resources/subscription) to trigger, formatted as `Subscription/<id>`. If left undefined, all [`Subscriptions`](/docs/api/fhir/resources/subscription) will be triggered.               | `string`                                 | `undefined`   |

## Invoke the `$resend` operation

{{< tabs >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< highlight ts >}}
const medplum = new MedplumClient();
// auth...
await medplum.post(medplum.fhirUrl(<resourceType>, <id>, '$resend'), {
  verbose: true,
  interaction: 'update',
  subscription: 'Subscription/123'
});
{{< /highlight >}}
  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum login
medplum post '<resourceType>/<id>/$resend' {"verbose":"true","interaction":"update","subscription":"Subscription/123"}
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl 'https://api.medplum.com/fhir/R4/<resourceType>/<resourceId>/$resend' \
-X 'POST' \
-H 'authorization: Bearer MY_ACCESS_TOKEN' \
-H 'content-type: application/fhir+json' \
--data-raw '{"verbose":"true","interaction":"update","subscription":"Subscription/123"}'
```

  {{< /tab >}}
{{< /tabs >}}

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
