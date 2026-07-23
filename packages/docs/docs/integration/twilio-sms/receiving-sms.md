---
sidebar_position: 3
---

# Receiving SMS

When a patient sends a message to a registered Twilio number, the integration creates a `Communication` resource automatically. No application code is required.

:::note
You must first [register an inbound webhook](/docs/integration/twilio-sms/setup#step-2--register-an-inbound-webhook-optional) for each Twilio number that should receive messages.
:::

## Inbound Communication Resource

The created resource has:

- `status: completed`
- `category`: inbound direction coding (`https://medplum.com/twilio-sms-direction | inbound`)
- `medium`: SMSWRIT
- `identifier`: the Twilio `MessageSid` (used for deduplication on retried deliveries)
- `extension`: `twilio-from-number` (patient's number) and `twilio-to-number` (your Twilio number)
- `payload`: the SMS body text

No `partOf`, `sender`, or `recipient` is set on inbound messages — see [Threading](/docs/integration/twilio-sms/threading) for how to organize messages into conversations.

```json
{
  "resourceType": "Communication",
  "status": "completed",
  "identifier": [{ "system": "https://www.twilio.com/", "value": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }],
  "category": [{
    "coding": [{ "system": "https://medplum.com/twilio-sms-direction", "code": "inbound" }]
  }],
  "medium": [{
    "coding": [{ "system": "https://terminology.hl7.org/CodeSystem/v3-ParticipationMode", "code": "SMSWRIT" }]
  }],
  "extension": [
    { "url": "https://medplum.com/twilio-from-number", "valueString": "+15005550001" },
    { "url": "https://medplum.com/twilio-to-number",   "valueString": "+15005550006" }
  ],
  "sent": "2025-01-15T09:15:00Z",
  "payload": [{ "contentString": "Sounds good, see you then!" }]
}
```

## Webhook Security

The registered webhook URL embeds `clientId:clientSecret` credentials for Medplum authentication. The integration also independently validates Twilio's HMAC-SHA1 `x-twilio-signature` header. Both layers must pass for a request to be processed.

