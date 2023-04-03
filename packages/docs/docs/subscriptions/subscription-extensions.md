---
sidebar_position: 3
---

# Subscription Extensions

Use the following FHIR extensions to customize the Subscription behavior. The behavior is non-standard, and will not necessarily work in other FHIR systems.

## Interactions

By default, FHIR Subscriptions will execute on both "create" and "update" operations.

To restrict the FHIR Subscription to only execute on "create", use the `http://medplum.com/fhir/StructureDefinition/subscription-supported-interaction` extension with `valueCode` of `create`:

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
