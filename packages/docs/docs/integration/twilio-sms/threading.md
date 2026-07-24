---
sidebar_position: 4
---

# Threading

Threading is not handled automatically by the integration — messages arrive and are sent as standalone `Communication` resources. This is intentional: the right threading strategy depends on your application (patient+practitioner scope, phone-pair scope, a shared inbox, etc.).

Some common approaches include a bot triggered by a `Subscription` on SMS Communications, logic inline in your send flow, or a background process that threads messages after the fact.

## Thread Structure

Medplum messaging uses a two-level hierarchy of `Communication` resources: a **thread header** with no `partOf` that represents the conversation, and **child messages** that set `partOf` to point at the header. For a full explanation of this pattern see the [Messaging Data Model](/docs/communications/messaging-data-model).

For SMS threads, it's common to key the thread header with a phone-pair identifier so inbound and outbound messages for the same number pair always converge on the same thread:

```json
{
  "resourceType": "Communication",
  "status": "in-progress",
  "medium": [{
    "coding": [{
      "system": "https://terminology.hl7.org/CodeSystem/v3-ParticipationMode",
      "code": "SMSWRIT"
    }]
  }],
  "identifier": [{
    "system": "https://medplum.com/twilio-phone-pair",
    "value": "+15005550006:+15005550001"
  }],
  "subject": { "reference": "Patient/patient-id" }
}
```

## Phone-Pair Threading Example

This snippet shows a simple **phone-pair keying** strategy: one thread per `from-number:to-number` pair. It can be run in a bot triggered by a Subscription on SMS `Communication` creates.

```typescript
const fromNumber = communication.extension?.find((e) => e.url === 'https://medplum.com/twilio-from-number')?.valueString;
const toNumber = communication.extension?.find((e) => e.url === 'https://medplum.com/twilio-to-number')?.valueString;
const phonePair = `${toNumber}:${fromNumber}`;

let threadHeader = await medplum.searchOne('Communication', {
  identifier: `https://medplum.com/twilio-phone-pair|${phonePair}`,
  'part-of:missing': 'true',
});

if (!threadHeader) {
  threadHeader = await medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'in-progress',
    medium: [{ coding: [{ system: 'https://terminology.hl7.org/CodeSystem/v3-ParticipationMode', code: 'SMSWRIT' }] }],
    identifier: [{ system: 'https://medplum.com/twilio-phone-pair', value: phonePair }],
  });
}

await medplum.updateResource({ ...communication, partOf: [createReference(threadHeader)] });
```

## Wiring Up via Subscription

To thread all SMS Communications automatically, create a `Subscription` that fires your threading bot on every new SMS Communication:

```json
{
  "resourceType": "Subscription",
  "status": "active",
  "criteria": "Communication?medium=https://terminology.hl7.org/CodeSystem/v3-ParticipationMode|SMSWRIT",
  "channel": {
    "type": "rest-hook",
    "endpoint": "Bot/<your-threading-bot-id>/$execute"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "create"
    }
  ]
}
```

The `subscription-supported-interaction` extension (Medplum-specific) restricts the subscription to fire only on resource **creation**, not updates—without it, every delivery status callback would re-trigger your threading bot. See [Subscriptions for create-only or update-only events](/docs/subscriptions/subscription-extensions#subscriptions-for-create-only-or-update-only-events) for details.
