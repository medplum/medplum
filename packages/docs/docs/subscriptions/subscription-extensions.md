---
sidebar_position: 3
tags:
  - subscription
---

# Subscription Extensions

Use the following FHIR extensions to customize the Subscription behavior. The behavior is non-standard, and will not necessarily work in other FHIR systems.

## Adding Extensions

Here is an example FHIR Subscription Object:

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  }
}
```

An subscription extension contains an array of objects that have `url` and `value*` in them. To add an extension, use one of medplum's url below that contains the value to be passed.

The extension will look like this:

```json
{
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-max-attempts",
      "valueInteger": 3
    }
  ]
}
```

And your final Subscription object will be:

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-max-attempts",
      "valueInteger": 3
    }
  ]
}
```

Below are explanations of the different extensions Medplum Provides

## Interactions

:::caution[Note]
By default, FHIR Subscriptions will execute on all "create", "update", and "delete" operations. To restrict a Subscription to a subset of these interactions, use one or more `subscription-supported-interaction` extensions as described below.
:::

You can use extensions as follows for more fine-grained control over when Subscriptions execute. To confirm if your Subscriptions are executing, navigate to `https://app.medplum.com/Subscription/<id>/event` to view related [AuditEvents](/docs/api/fhir/resources/auditevent). Note that if you configure the subscription to use `log`-only destination for AuditEvents (see [AuditEvent Destination](#auditevent-destination) below), these events will not appear in the UI.

:::note
A Subscription may declare **multiple** `subscription-supported-interaction` extensions. When one or more are present, the Subscription will only execute for the listed interactions. For example, adding one extension with `valueCode` of `create` and another with `valueCode` of `update` will fire on "create" and "update" but **not** "delete". When no `subscription-supported-interaction` extension is present, the Subscription fires on all interactions ("create", "update", and "delete").
:::

### Subscriptions for "create"-only or "update"-only events

To restrict the FHIR Subscription to only execute on "create", use the `https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction` extension with `valueCode` of `create`:

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "create"
    }
  ]
}
```

You can also restrict the FHIR Subscription to only execute on "update", using the `https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction` extension with `valueCode` of `update`:

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "update"
    }
  ]
}
```

To listen for more than one interaction while excluding the others (for example, "create" and "update" but not "delete"), include a separate `subscription-supported-interaction` extension for each interaction you want:

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "create"
    },
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "update"
    }
  ]
}
```

### Subscriptions for "delete" events

:::caution[Note]
The delete interaction will contain a different response where configuration will be needed on the incoming data.
:::

Use the `https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction` extension with `valueCode` of `delete`. For example:

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "delete"
    }
  ]
}
```

The response for a deleted resource will contain:

```json
{
  "method": "POST",
  "body": "{}",
  "headers": {
    "Content-Type": "application/fhir+json",
    "X-Medplum-Deleted-Resource": "${resource.resourceType}/${resource.id}"
  }
}
```

**_Few things to note:_**

`X-Medplum-Deleted-Resource`: Will contain the resource type and resource id that was deleted.

`body`: Will be an empty object in the response `{}`

## Signatures

When a consumer receives a webhook request, you may want to verify that the request came from the expected sender.

Webhooks can optionally use a FHIR extension to enable an HMAC signature. To enable HMAC signatures, use the extension `https://www.medplum.com/fhir/StructureDefinition/subscription-secret` and `valueString` of a cryptographically secure secret.

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "DiagnosticReport?status=completed",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://www.medplum.com/fhir/StructureDefinition/subscription-secret",
      "valueString": "abc"
    }
  ]
}
```

The `valueString` will be used to generate a signature. The signature is the payload encoded using SHA-256 (otherwise known as an HMAC). The key for the hash will be the `valueString` from the FHIR extension. API consumers are encouraged to encode the payload with the secret key and compare the signatures.

Example: TypeScript / Express

```ts
app.post('/webhook', (req, res) => {
  const secret = '...'; // Created separately
  const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
  console.log('Signature:', req.headers['x-signature']);
  console.log('Expected:', signature);
  console.log('Received:', req.body);
  res.sendStatus(200);
});
```

Example: Python / Flask

```python
@app.route("/webhook", methods=["POST"])
def handle_webhook():
    secret = b'...' # Created separately
    message = flask.request.get_data()
    signature = hmac.new(secret, message, hashlib.sha256).hexdigest()
    log('Expected: ' + signature)
    log('Received: ' + flask.request.headers.get('x-signature'))
    return {"ok":True}
```

## Retry Policy

If your subscription failed or threw an error, you can configure it to attempt to execute the operation multiple times.

To add an attempt number, use the `https://medplum.com/fhir/StructureDefinition/subscription-max-attempts` extension with the valueInteger set to a number between 1-18.

The default number of attempts is 4.

:::caution[Note]
Subscriptions with Bot endpoints will only execute once and will not retry on failure. The `subscription-max-attempts` extension only applies to rest-hook subscriptions with external HTTP endpoints.
:::

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "DiagnosticReport?status=completed",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-max-attempts",
      "valueInteger": 3
    }
  ]
}
```

### Retry timing and backoff

Retries are not immediate. Medplum spaces them out using **exponential backoff with jitter**, which is important to understand when planning for downtime in the destination service that receives the webhook.

- **Base delay:** the first retry is delayed ~20 seconds after the initial failure.
- **Exponential growth:** each subsequent delay doubles (20s → 40s → 80s → 160s → …).
- **Maximum delay:** the delay between attempts is capped at **8 hours**.
- **Jitter:** a random factor of ±10% is applied to each delay to avoid thundering-herd retries, so actual times may vary slightly from the values below.

Because retries back off exponentially, increasing `subscription-max-attempts` extends the total retry window super-linearly. The following table shows approximately how long Medplum will keep retrying (from the first failure until the last attempt) for a given `subscription-max-attempts` value:

| `subscription-max-attempts` | Approx. total retry window |
| --------------------------- | -------------------------- |
| 4 (default)                 | ~2 minutes                 |
| 6                           | ~10 minutes                |
| 8                           | ~40 minutes                |
| 10                          | ~3 hours                   |
| 12                          | ~11 hours                  |
| 15                          | ~1.5 days                  |
| 18 (max)                    | ~2.5 days                  |

### Planning for downtime in the destination service

If the system receiving your webhook (for example, an external API, integration engine, or your own backend) experiences downtime, the retry policy is what determines whether the event is eventually delivered or lost:

- With the **default of 4 attempts**, retries are exhausted in roughly **2 minutes**. This is only enough to survive brief, transient blips (e.g. a momentary network error or a quick restart).
- To survive longer outages (maintenance windows, multi-hour incidents), raise `subscription-max-attempts`. For example, `12` covers roughly an 11-hour outage, and the maximum of `18` covers roughly 2.5 days.
- Once the maximum number of attempts is exhausted, the event is **not** retried again and the notification is effectively dropped. Medplum does not queue events indefinitely.

For each attempt, an [`AuditEvent`](/docs/api/fhir/resources/auditevent) records the outcome (unless configured for [log-only destination](#auditevent-destination)), so you can inspect delivery history and failures at `https://app.medplum.com/Subscription/<id>/event`.

:::caution[Note]
A higher `subscription-max-attempts` value increases resilience to downstream downtime, but it also means failing subscriptions stay active in the queue longer. For high-volume subscriptions, consider pairing longer retry windows with the [log-only AuditEvent destination](#auditevent-destination) to limit database growth.
:::

## Custom Status Codes

HTTP status codes can be customized to determine the success of the subscription operation.

To add custom codes, use the `https://medplum.com/fhir/StructureDefinition/subscription-success-codes` extension with the valueString having a comma separated list of HTTP status codes for success (i.e., "200,201"). We also allow ranges (i.e., "200-399,404")

:::caution[Note]
If you use custom success codes, you will need to implement ALL of the HTTP status codes that are determined to be successful
:::

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "DiagnosticReport?status=completed",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-success-codes",
      "valueString": "200-399,404"
    }
  ]
}
```

## AuditEvent Destination

:::info[Rest-hook subscriptions only]
The `subscription-audit-event-destination` extension applies to **rest-hook** (`channel.type = "rest-hook"`) subscriptions. For **bot-channel** subscriptions, audit event behavior is controlled by `Bot.auditEventDestination` on the Bot resource — see [Bot Logging Destination](/docs/bots/bots-in-production#logging-destination).
:::

You can control where `AuditEvent` resources generated by rest-hook subscription attempts are sent using the `https://medplum.com/fhir/StructureDefinition/subscription-audit-event-destination` extension. This extension accepts `valueCode` values of `resource` or `log`, and you can specify multiple extensions to send to both destinations.

By default, `AuditEvent` resources are saved to the database (`resource` destination). This allows you to view them in the Medplum UI and query them via the API. However, for high-volume subscriptions, saving every `AuditEvent` to the database can impact performance and storage.

Setting the destination to `log` will only emit `AuditEvent` details to your server logs (e.g., AWS CloudWatch, Datadog, etc.) without creating a FHIR resource in the database. This is useful for high-volume scenarios where you want to monitor subscription activity without impacting database performance.

:::caution[Note]
If you set the destination to `log` only, `AuditEvent` resources will not appear in the Medplum UI or be queryable via the API. They will only be available in your server logs.
:::

### Log-only destination

To send `AuditEvent` resources only to logs (not the database):

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-audit-event-destination",
      "valueCode": "log"
    }
  ]
}
```

### Both resource and log destinations

To send `AuditEvent` resources to both the database and logs:

```json
{
  "resourceType": "Subscription",
  "reason": "test",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-audit-event-destination",
      "valueCode": "resource"
    },
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-audit-event-destination",
      "valueCode": "log"
    }
  ]
}
```

## Expression based criteria

Medplum offers an extension (`fhir-path-criteria-expression`) for triggering subscriptions based on more complex conditional logic using a [FHIRPath expression](http://hl7.org/fhirpath/N1/). This expression takes in two variables:

- `%previous`: The state of the resource _before_ the triggering event
- `%current`: The state of the resource _after_ the triggering event.

The expression should return either `true` or `false`.

Here is an example `Subscription` resource with a `fhir-path-criteria-expression` expression that fires when a [`Task`](/docs/api/fhir/resources/task) changes its status:

```json
{
  "resourceType": "Subscription",
  "reason": "Task Status Change",
  "status": "active",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "criteria": "Task",
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression",
      "valueString": "%previous.status != %current.status"
    }
  ]
}
```

:::caution[Note]
Upon the creation of a resource, there won't be a previous version of the resource: `%previous` will be empty.

FHIRPath generally [treats empty values as "null"](https://www.hl7.org/fhirpath/#null-and-empty) and most operators
and functions — including `!=` — evaluate to be empty if any of their operands are empty. This means that when a
resource is created, the above expression will always be falsy, and the subscription will not fire.
:::

If resource creations should also be included, the FHIRPath expression must account for that case
specifically: `%previous.exists() implies %previous.status != %current.status`. With this expression,
if `%previous` is empty, the overall expression will still evaluate to `true` and trigger the subscription.

### Handling array fields

Some resource fields, e.g. `Patient.name`, can contain multiple values: these are formatted in FHIR as JSON arrays.
The normal FHIRPath operators like `=` and `!=` handle equality of these values recursively: they must have exactly
the same members or fields to be considered equal. Consider the following subscription:

```json
{
  "resourceType": "Subscription",
  "reason": "Patient Name Change",
  "status": "active",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/webhook"
  },
  "criteria": "Patient",
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression",
      "valueString": "%previous.name != %current.name"
    }
  ]
}
```

Adding a new `name` to the Patient and leaving the old one(s) unchanged would trigger this subscription, because the two
`name` arrays are not exactly the same. If the subscription should only fire when an existing value is altered or
removed, the individual values in the field must be compared instead of the field as a whole:

```
%previous.name.where( ($this in %current.name).not() ).exists()
```
