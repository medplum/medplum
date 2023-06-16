---
sidebar_position: 3
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

:::caution Note
By default, FHIR Subscriptions will execute on "create", "update", "delete" operations.
:::

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

### Handling Delete Interaction

:::caution Note
The delete interaction will contain a different response where configuration will be needed on the incoming data.
Unless the subscription intended is only to be executed upon 'create' or 'update', it will by default be triggered up on it.
:::

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

**_Executing only on delete_**

Use the `https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction` extension with `valueCode` of `delete`.

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

## Custom Status Codes

HTTP status codes can be customized to determine the success of the subscription operation.

To add custom codes, use the `https://medplum.com/fhir/StructureDefinition/subscription-success-codes` extension with the valueString having a comma separated list of HTTP status codes for success (i.e., "200,201"). We also allow ranges (i.e., "200-399,404")

:::caution Note
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
