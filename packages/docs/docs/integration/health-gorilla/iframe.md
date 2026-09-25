---
sidebar_position: 4
---

# Lab Ordering iFrame

:::info[Choose one ordering interface]
The iframe is an **optional alternative** to Medplum's [React order form components and `useHealthGorillaLabOrder` hook](./sending-orders.md#creating-an-order-form-in-react). Use either the hosted iframe or the Medplum form components and hook for your ordering workflow. You do not need both, and the iframe is not required for the Health Gorilla integration.
:::

The `health-gorilla-iframe` bot lets your application launch Health Gorilla's hosted lab ordering interface for a Medplum patient. It returns an authenticated URL that you embed in an `<iframe>`; the bot itself does not render a user interface.

Health Gorilla's [Lab Network iFrame](https://developer.healthgorilla.com/docs/iframe) supports lab order placement for a single patient. Results are handled separately through the [results integration](./receiving-results.md).

## Prerequisites

- A configured Health Gorilla labs integration, including an enabled Lab Network tenant, laboratory connections, and OAuth credentials with ordering scopes. [Contact the Medplum team](mailto:info+healthgorilla@medplum.com?subject=Health%20Gorilla%20Integration%20for%20Medplum) to enable the iframe bot and its operation for your project.
- An existing Medplum `Patient` with `name[0].given`, `name[0].family`, `gender`, and a full `birthDate` in `YYYY-MM-DD` format. Partial birth dates are rejected.
- A signed-in Medplum `Practitioner` whose Health Gorilla login has been saved by [practitioner sync](./user-management.md). The login must belong to the configured Health Gorilla tenant. Client-credentials sessions and ordering on behalf of another practitioner are not supported.
- A callback page in your application that Health Gorilla can return the user to after the order is completed or cancelled.

The bot uses the existing Health Gorilla OAuth credentials to obtain a token for the signed-in practitioner. No additional iframe-specific SSO secrets are required. The bot must run with [`runAsUser: true`](/docs/bots/bot-run-as-user) so the caller's access policy applies to patient and practitioner reads; the integration deployment scripts configure this.

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

The response is a JSON object containing `url`, the authenticated ordering URL. Use it as returned; the bot has already appended the Health Gorilla access token.

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

## Ordering practitioner

Health Gorilla defaults the Ordering Provider from the access token's identity. The bot reads the signed-in practitioner's `hg-practitioner-login` extension (`https://www.healthgorilla.com/fhir/R4/StructureDefinition/hg-practitioner-login`) and uses its `valueString` as the subject of the OAuth JWT assertion. This login can differ from the practitioner's Medplum ID and Health Gorilla resource ID.

The bot requires exactly one nonempty login extension. Run practitioner sync before ordering if it is missing. Keep this mapping managed by trusted provisioning; a single login extension does not represent multiple Health Gorilla tenant identities. The bot uses the same resulting access token for session creation and the returned iframe URL. Tokens are cached separately by practitioner and connection configuration.

When upgrading an existing integration, sync provider logins and use practitioner sessions before deploying the updated bot. Existing two-field request bodies remain valid, but the bot no longer falls back to the integration account. Re-deploy bot metadata as well as code so project-level deployments receive `runAsUser: true`.

## Patient context

The bot reads the patient from Medplum and sends the first name entry's given names and family name, gender, birth date, and available address and phone fields to Health Gorilla. It uses demographics for matching even when the Medplum patient already has a Health Gorilla identifier. Health Gorilla may create a new patient if those demographics do not match an existing record.

The bot does not require a Health Gorilla patient identifier and does not write one back to Medplum. Launching an iframe therefore does not establish the identifier mapping needed for downstream result matching. Validate patient and order matching as part of your integration setup; see [Resolving Orders with Results](./receiving-results.md#resolving-orders-with-results).

The bot passes `Patient.gender` through unchanged. Health Gorilla's current reference lists `male`, `female`, `other`, and `unknown`.

### Address and phones

The bot sends a `patient` object so Medplum demographics can prefill the iframe. It does not switch to HG's `patientId` lookup when an HG identifier is present.

For the address, it selects the first current home address, then falls back to the first current address without a `use`. Old, work, temporary, billing, expired, and future addresses are excluded. The first address line becomes `address1`; remaining lines are joined into `address2`.

A selected address must include street, city, a two-letter state code, a five-digit ZIP or ZIP+4, and an explicit US country. The bot accepts `US`, `USA`, `United States`, and `United States of America` case-insensitively, sends `USA`, uppercases the state, and reduces ZIP+4 to five digits. It preserves leading ZIP zeroes. Missing or foreign country values produce an error rather than being assumed to mean the US. A patient without a selected address can still launch; a selected incomplete address must be corrected first.

Current `Patient.telecom` entries with `system: phone` and `use: home`, `mobile`, or `work` populate `homePhone`, `mobilePhone`, and `workPhone`. Lower rank wins, unranked values come last, and source order breaks ties. Unclassified numbers, old or expired numbers, fax, and email are omitted. Supported work-phone extension suffixes (`;ext=005`, `x005`, or `ext. 005`) populate `workPhoneExt` separately.

## Returning to your application and receiving results

The `callbackUrl` is a browser return destination after the user completes or cancels ordering. It is separate from the webhook endpoint used by `receive-from-health-gorilla`. Reaching this page alone is not confirmation that an order was submitted.

The iframe bot creates the ordering session and returns its URL. It does not create a Medplum `ServiceRequest`, download requisitions, or retrieve results. Keep the Health Gorilla webhook subscriptions configured through `setup-subscriptions`, and use [Receiving Results](./receiving-results.md) for structured results and PDFs. Use [Sync Resources from Health Gorilla](./sync-resources-from-health-gorilla.md) to recover missed results.

## Troubleshooting

- **`Missing patientId` or `Missing callbackUrl`**: Include both fields in the JSON request body.
- **Patient is missing required fields**: Populate the first name entry's given and family names, gender, and full birth date before launching the session.
- **Signed-in Practitioner required**: Call using a practitioner session rather than client credentials or a patient account. Staff delegation is not supported.
- **Practitioner must have one Health Gorilla login ID**: Run practitioner sync for the configured tenant and verify the login extension. An HG resource identifier alone is insufficient.
- **Patient address is incomplete or unsupported**: Correct the selected address fields named in the error, including an explicit US country. Address fields are required only when an address is supplied.
- **Session creation fails**: Verify the existing Health Gorilla OAuth configuration, ordering scopes, and Lab Network setup. The bot surfaces HTTP and Health Gorilla session errors to the caller.
- **Results do not match the expected patient or order**: Check the [result matching rules](./receiving-results.md#resolving-orders-with-results) and review `DetectedIssue` resources. The iframe launch does not sync patient identifiers or create a corresponding Medplum order.
