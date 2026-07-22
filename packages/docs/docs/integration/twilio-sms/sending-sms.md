---
sidebar_position: 2
---

# Sending SMS

```
POST /fhir/R4/Communication/$send-sms-twilio
```

Pass the `Communication` resource inline in the request body. The operation creates a new `Communication` in Medplum after sending.

You can also invoke instance-level on an existing resource:

```
POST /fhir/R4/Communication/<id>/$send-sms-twilio
```

## Request Body

```json
{
  "resourceType": "Communication",
  "status": "preparation",
  "medium": [{
    "coding": [{
      "system": "https://terminology.hl7.org/CodeSystem/v3-ParticipationMode",
      "code": "SMSWRIT"
    }]
  }],
  "extension": [
    { "url": "https://medplum.com/twilio-to-number",   "valueString": "+15005550001" },
    { "url": "https://medplum.com/twilio-from-number", "valueString": "+15005550006" } // only needed if TWILIO_FROM_NUMBER project secret not set
  ],
  "payload": [{ "contentString": "Your appointment is tomorrow at 10am." }]
}
```

## Communication Fields

| Field | Requirement | Notes |
|-------|-------------|-------|
| `medium` | **Required** | Must include SMSWRIT code (`https://terminology.hl7.org/CodeSystem/v3-ParticipationMode`, code `SMSWRIT`) |
| `payload` | **Required** | Must contain at least one entry with `contentString` |
| `extension` (`twilio-to-number`) | **Required** | Recipient phone number in E.164 format |
| `extension` (`twilio-from-number`) | Optional | Sending phone number; falls back to `TWILIO_FROM_NUMBER` project secret |
| `sender` | Optional | Passed through unchanged — the integration does not validate or auto-populate this field |
| `recipient` | Optional | Recommended for FHIR completeness but not required to send |

See [Phone Number Formats](#phone-number-formats) below for accepted input formats.

## What the Operation Does

1. Validates the `Communication` (SMSWRIT medium, non-empty payload)
2. Reads the to-number from the `twilio-to-number` extension
3. Resolves the from-number from the `twilio-from-number` extension, falling back to the `TWILIO_FROM_NUMBER` project secret
4. Calls the Twilio Messages API
5. Saves the `Communication` with the Twilio `MessageSid` as an identifier, `status = in-progress`, the outbound direction category, and both phone number extensions

## Phone Number Formats

All phone numbers (to-number, from-number, and `TWILIO_FROM_NUMBER`) are normalized to E.164 before use. The following input formats are all accepted:

| Input | Normalized |
|---|---|
| `+15005550006` | `+15005550006` (already E.164, returned as-is) |
| `15005550006` | `+15005550006` (11-digit with country code) |
| `5005550006` | `+15005550006` (10-digit US number) |
| `500-555-0006` | `+15005550006` (dashes stripped) |
| `(500) 555-0006` | `+15005550006` (parentheses and spaces stripped) |

Normalization strips all non-digit, non-plus characters first, then applies the rules above.

## Delivery Status

Once Twilio confirms delivery, the integration updates `Communication.status` on the outbound resource automatically:

| Twilio Status | FHIR `Communication.status` |
|---|---|
| `queued`, `sending`, `sent`, `accepted` | `in-progress` |
| `delivered`, `read` | `completed` |
| `failed`, `undelivered`, `canceled` | `stopped` |

Terminal states (`completed`, `stopped`) are never overwritten by intermediate ones, protecting against out-of-order Twilio callbacks.

## Stored Communication Resource

After sending, the stored outbound `Communication` looks like:

```json
{
  "resourceType": "Communication",
  "status": "in-progress",
  "identifier": [{ "system": "https://www.twilio.com/", "value": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }],
  "category": [{
    "coding": [{ "system": "https://medplum.com/twilio-sms-direction", "code": "outbound" }]
  }],
  "medium": [{
    "coding": [{ "system": "https://terminology.hl7.org/CodeSystem/v3-ParticipationMode", "code": "SMSWRIT" }]
  }],
  "extension": [
    { "url": "https://medplum.com/twilio-from-number", "valueString": "+15005550006" },
    { "url": "https://medplum.com/twilio-to-number",   "valueString": "+15005550001" }
  ],
  "sent": "2025-01-15T10:30:00Z",
  "payload": [{ "contentString": "Your appointment is tomorrow at 10am." }]
}
```
