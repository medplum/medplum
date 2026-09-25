---
sidebar_position: 4
---

# Lab Ordering iFrame

:::info[Choose one ordering interface]
The iframe is an **optional alternative** to Medplum's [React order form components and `useHealthGorillaLabOrder` hook](./sending-orders.md#creating-an-order-form-in-react). Use either the hosted iframe or the Medplum form components and hook for your ordering workflow. You do not need both, and the iframe is not required for the Health Gorilla integration.
:::

Use the shared `health-gorilla-iframe` bot or `Patient/$health-gorilla-iframe` operation to open Health Gorilla's lab ordering interface from a patient chart. The returned URL opens an ordering session with the patient's demographics and the signed-in practitioner as the default Ordering Provider.

This guide assumes the Health Gorilla integration is already shared with your project. You can call its bots and operations directly from your application.

Health Gorilla's [Lab Network iFrame](https://developer.healthgorilla.com/docs/iframe) supports lab order placement for a single patient. Results are handled separately through the [results integration](./receiving-results.md).

## Prerequisites

- An existing Medplum `Patient` with `name[0].given`, `name[0].family`, `gender`, and a full `birthDate` in `YYYY-MM-DD` format. Partial birth dates are rejected.
- A signed-in Medplum `Practitioner` who has completed [practitioner sync](./user-management.md) for your Health Gorilla integration.
- An HTTPS callback page in your application to receive the user after ordering finishes or is cancelled.

## Prepare the ordering practitioner

Before the practitioner's first order, run the shared `sync-practitioner` bot or `Practitioner/{id}/$health-gorilla-sync-practitioner` operation for that practitioner's Medplum record. See [User Management](./user-management.md) for the required practitioner data and sync examples.

Call the iframe operation from the ordering practitioner's signed-in Medplum session. That practitioner becomes the default Ordering Provider. You do not need to supply Health Gorilla credentials or generate a Health Gorilla token in your application.

Client-credentials sessions and ordering on behalf of another practitioner are not supported in this flow.

The following helper syncs the currently signed-in practitioner using the shared bot. Pass the authenticated `MedplumClient` your application already uses. The practitioner must have the required name and NPI data described in [User Management](./user-management.md).

```typescript
import type { MedplumClient } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';

export async function syncOrderingPractitioner(medplum: MedplumClient): Promise<OperationOutcome> {
  const practitioner = medplum.getProfile();
  if (practitioner?.resourceType !== 'Practitioner' || !practitioner.id) {
    throw new Error('Sign in as the ordering practitioner before syncing.');
  }

  return medplum.executeBot(
    {
      system: 'https://www.medplum.com/integrations/bot-identifier',
      value: 'health-gorilla-labs/sync-practitioner',
    },
    { reference: `Practitioner/${practitioner.id}` },
    'application/json'
  );
}
```

Await this helper during practitioner setup and resolve any sync errors before enabling lab ordering.

## Patient context

Keep the patient's demographics current in Medplum before opening the iframe. The ordering session uses the first name entry's given and family names, gender, full birth date, and available address and phone numbers.

### Address and phones

For address prefill, populate `Patient.address` with a current home address (`use: home`). If there is no current home address, an address without a `use` can be used. The first qualifying address is selected; addresses marked old, work, temporary, or billing, and those outside their validity period, are excluded.

The selected address needs:

- `line[0]`: street address. Additional lines can contain an apartment or suite.
- `city` and a two-letter `state` code.
- `postalCode`: a five-digit ZIP or ZIP+4. The iframe receives the first five digits.
- `country`: `US`, `USA`, `United States`, or `United States of America` (case-insensitive).

A patient without a qualifying address can still launch the iframe. If a selected address is incomplete or has an unsupported country, correct the fields identified in the error before trying again.

For phone prefill, use `Patient.telecom` entries with `system: phone` and `use: home`, `mobile`, or `work`. If several current numbers share a use, the lowest `rank` takes priority, with unranked entries last and source order breaking ties. Numbers without a use, expired or future entries, fax, and email are not included. Work-phone extensions can use `;ext=005`, `x005`, or `ext. 005` suffixes.

### Example patient data

This synthetic FHIR R4 `Patient` illustrates the fields used for prefill. Populate these fields through your application's patient demographics form and save the patient before calling `launchLabOrder`. Use the saved resource's ID as `patientId`; do not pass this resource as the iframe request body.

```json
{
  "resourceType": "Patient",
  "name": [{ "given": ["Alex"], "family": "Example" }],
  "gender": "female",
  "birthDate": "1990-01-15",
  "address": [
    {
      "use": "home",
      "line": ["123 Example Street", "Apt 4"],
      "city": "Boston",
      "state": "MA",
      "postalCode": "02101",
      "country": "US"
    }
  ],
  "telecom": [
    { "system": "phone", "use": "mobile", "value": "202-555-0142", "rank": 1 },
    { "system": "phone", "use": "work", "value": "202-555-0185 ext. 005" }
  ]
}
```

### Patient matching

Health Gorilla matches the supplied demographics to its patient records and may create a new record when no match is found. An existing Health Gorilla patient identifier on the Medplum patient does not change this launch behavior.

Launching the iframe does not save a Health Gorilla patient identifier back to Medplum. Verify that orders and results resolve to the expected patient; see [Resolving Orders with Results](./receiving-results.md#resolving-orders-with-results).

## Request and response

The bot accepts a JSON object with two required string fields:

- `patientId`: The Medplum patient ID, without the `Patient/` prefix. This is not a Health Gorilla patient ID.
- `callbackUrl`: The URL of your application's return page. Health Gorilla requires this value to create the ordering session.

```json
{
  "patientId": "example-patient",
  "callbackUrl": "https://app.example.com/labs/callback"
}
```

Do not include a `practitionerId` or Health Gorilla login in the request. The ordering practitioner comes from the authenticated caller; provider overrides are not supported.

The response is a JSON object containing `url`, the authenticated ordering URL. Use it as returned.

### Invoke the operation

Call the type-level `Patient/$health-gorilla-iframe` operation with the patient ID in the JSON body. Use an access token for the signed-in practitioner and replace the example patient ID and callback URL:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Patient/$health-gorilla-iframe' \
  -H 'Authorization: Bearer {medplum-access-token}' \
  -H 'Content-Type: application/json' \
  -d '{
    "patientId": "example-patient",
    "callbackUrl": "https://app.example.com/labs/callback"
  }'
```

The request body is a plain JSON object, not a FHIR `Parameters` resource. The operation is registered on the `Patient` resource type; do not put the patient ID in the operation URL.

### Execute the bot with the Medplum SDK

You can also call the bot by its integration identifier using an authenticated `MedplumClient`:

```typescript
import type { MedplumClient } from '@medplum/core';

export async function launchLabOrder(
  medplum: MedplumClient,
  patientId: string,
  callbackUrl: string
): Promise<string> {
  if (medplum.getProfile()?.resourceType !== 'Practitioner') {
    throw new Error('Sign in as the ordering practitioner before opening a lab order.');
  }
  if (!patientId || new URL(callbackUrl).protocol !== 'https:') {
    throw new Error('Provide a patient ID and an absolute HTTPS callback URL.');
  }

  const { url }: { url: string } = await medplum.executeBot(
    {
      system: 'https://www.medplum.com/integrations/bot-identifier',
      value: 'health-gorilla-labs/health-gorilla-iframe',
    },
    { patientId, callbackUrl },
    'application/json'
  );
  return url;
}
```

Call `launchLabOrder` from your order button with the saved Medplum patient ID and your HTTPS callback page. While awaiting the result, disable the button and show a loading indicator. Catch failures and show the error instead of opening the iframe.

After the request succeeds, pass the returned URL to a React component such as this one:

```tsx
export function LabOrderFrame({ url }: { url: string }) {
  return <iframe title="Health Gorilla lab ordering" src={url} width="100%" height="800" />;
}
```

Request a new ordering session when the user starts a new order, switches patients, or signs in as another practitioner. Show a loading state while the bot runs and handle failures before rendering the iframe.

:::caution[Authenticated URL]
The returned URL contains a Health Gorilla OAuth access token. Keep it in memory for the ordering flow; do not log it, persist it in FHIR resources, or include it in analytics events.
:::

## Returning to your application and receiving results

The `callbackUrl` is a browser return destination after the user completes or cancels ordering. It is separate from the webhook endpoint used by `receive-from-health-gorilla`. Reaching this page alone is not confirmation that an order was submitted.

The iframe bot creates the ordering session and returns its URL. It does not create a Medplum `ServiceRequest`, download requisitions, or retrieve results. Keep the Health Gorilla webhook subscriptions configured through `setup-subscriptions`, and use [Receiving Results](./receiving-results.md) for structured results and PDFs. Use [Sync Resources from Health Gorilla](./sync-resources-from-health-gorilla.md) to recover missed results.

## Troubleshooting

- **`Missing patientId` or `Missing callbackUrl`**: Include both fields in the JSON request body.
- **Patient is missing required fields**: Populate the first name entry's given and family names, gender, and full birth date before launching the session.
- **Signed-in Practitioner required**: Call using a practitioner session rather than client credentials or a patient account. Staff delegation is not supported.
- **Practitioner must have one Health Gorilla login ID**: Run the shared practitioner sync for the signed-in practitioner, then retry. If the error persists, contact the Medplum team with the Practitioner ID.
- **Patient address is incomplete or unsupported**: Correct the selected address fields named in the error, including an explicit US country. Address fields are required only when an address is supplied.
- **Session creation fails**: Confirm that practitioner sync succeeded and the patient has the required demographics. If the error persists, contact the Medplum team with the error message. Do not include the authenticated iframe URL.
- **Results do not match the expected patient or order**: Check the [result matching rules](./receiving-results.md#resolving-orders-with-results) and review `DetectedIssue` resources. The iframe launch does not sync patient identifiers or create a corresponding Medplum order.
