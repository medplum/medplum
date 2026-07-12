---
sidebar_position: 1
---

# Setup

## Step 1 — Install the integration

A project admin invokes the `$twilio-sms-install` operation once per customer project, passing the Twilio credentials. This stores the required secrets and creates the webhook `ClientApplication`.

```
POST /fhir/R4/Project/$twilio-sms-install
```

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "TWILIO_ACCOUNT_SID", "valueString": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    { "name": "TWILIO_AUTH_TOKEN",  "valueString": "<auth-token>" },
    { "name": "TWILIO_FROM_NUMBER", "valueString": "+15005550006" }
  ]
}
```

`TWILIO_FROM_NUMBER` is optional — omit it if callers will always supply the sending number via the `https://medplum.com/twilio-from-number` extension on the `Communication` resource. If provided, the install operation automatically registers the inbound webhook with Twilio for that number.

Re-running the install operation is safe — secrets already set in the project will not be overwritten.

## Project Secrets

All secrets are written automatically by `$twilio-sms-install` and read at runtime by the integration bots:

| Key | Description |
|-----|-------------|
| `TWILIO_ACCOUNT_SID` | **Required.** Twilio Account SID (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | **Required.** Twilio Auth Token |
| `TWILIO_FROM_NUMBER` | **Optional.** Default sending number in E.164 format |
| `TWILIO_CALLBACK_CLIENT_ID` | Set automatically at install time |
| `TWILIO_CALLBACK_CLIENT_SECRET` | Set automatically at install time |

## Step 2 — Register an inbound webhook (optional)

This step is only needed if you want to **receive inbound SMS messages**. Skip it if you only need to send outbound messages.

If `TWILIO_FROM_NUMBER` was omitted at install time, or to register additional numbers, use:

```
POST /fhir/R4/Project/$twilio-sms-register-inbound
```

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "TWILIO_FROM_NUMBER", "valueString": "+15005550006" }
  ]
}
```

The phone number is normalized to E.164 before lookup — see [Phone Number Formats](/docs/integration/twilio-sms/sending-sms#phone-number-formats) for accepted input formats. This operation can be called multiple times for customers with multiple Twilio numbers.

## Testing the Connection

Once installed, you can verify the credentials are valid:

```
POST /fhir/R4/Communication/$test-twilio-connection
```

Returns an `OperationOutcome` confirming the Twilio credentials are valid.
