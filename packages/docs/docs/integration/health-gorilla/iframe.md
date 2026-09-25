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
const { url }: { url: string } = await medplum.executeBot(
  {
    system: 'https://www.medplum.com/integrations/bot-identifier',
    value: 'health-gorilla-labs/health-gorilla-iframe',
  },
  {
    patientId: patient.id,
    callbackUrl: new URL('/labs/callback', window.location.origin).toString(),
  },
  'application/json'
);
```

After the request succeeds, render the returned URL in your application. For example, in React:

```tsx
<iframe title="Health Gorilla lab ordering" src={url} width="100%" height="800" />
```

Request a new ordering session when the user starts a new order, switches patients, or signs in as another practitioner. Show a loading state while the bot runs and handle failures before rendering the iframe.

:::caution[Authenticated URL]
The returned URL contains a Health Gorilla OAuth access token. Keep it in memory for the ordering flow; do not log it, persist it in FHIR resources, or include it in analytics events.
:::

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

### Patient matching

Health Gorilla matches the supplied demographics to its patient records and may create a new record when no match is found. An existing Health Gorilla patient identifier on the Medplum patient does not change this launch behavior.

Launching the iframe does not save a Health Gorilla patient identifier back to Medplum. Verify that orders and results resolve to the expected patient; see [Resolving Orders with Results](./receiving-results.md#resolving-orders-with-results).

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
