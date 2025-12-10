# Medplum eFax Demo

This example application demonstrates how to use Medplum's custom FHIR operations to send and receive faxes via eFax integration.

## Features

- **Fax Inbox**: View received faxes and refresh from eFax using the `$receive-efax` operation
- **Send Fax**: Compose and send faxes using the `$send-efax` operation

## Prerequisites

1. A Medplum account with the eFax integration enabled (contact the Medplum team)
2. eFax API credentials configured in your Medplum project's Bot secrets
3. Your Practitioner profile must have an eFax User ID in the identifier array

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables by creating a `.env` file:

   ```
   MEDPLUM_BASE_URL=https://api.medplum.com/
   MEDPLUM_CLIENT_ID=your-client-id
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000 in your browser

## Sending a Fax with Transaction Bundles

This demo uses a Transaction bundle to atomically create all the resources needed to send a fax. This approach ensures that either all resources are created successfully or none are, preventing partial failures.

### Why Use a Transaction Bundle?

When sending a fax, you need to create multiple FHIR resources:
1. **Binary**: The document to fax (PDF, image)
2. **Practitioner/Organization**: The recipient with fax number
3. **Communication**: Links the document and recipient together

Using a Transaction bundle provides:
- **Atomicity**: All resources succeed or fail together
- **Reduced latency**: Single network request instead of multiple
- **Clean references**: Use `urn:uuid` for cross-referencing resources within the bundle

### Example Transaction Bundle

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:binary-123",
      "request": { "method": "POST", "url": "Binary" },
      "resource": {
        "resourceType": "Binary",
        "contentType": "application/pdf",
        "data": "<base64-encoded-document>"
      }
    },
    {
      "fullUrl": "urn:uuid:recipient-456",
      "request": { "method": "POST", "url": "Practitioner" },
      "resource": {
        "resourceType": "Practitioner",
        "name": [{ "text": "Dr. Jane Smith" }],
        "telecom": [{ "system": "fax", "value": "+15551234567" }]
      }
    },
    {
      "fullUrl": "urn:uuid:communication-789",
      "request": { "method": "POST", "url": "Communication" },
      "resource": {
        "resourceType": "Communication",
        "status": "preparation",
        "medium": [{
          "coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationMode",
            "code": "FAXWRIT"
          }]
        }],
        "sender": { "reference": "Practitioner/your-practitioner-id" },
        "recipient": [{ "reference": "urn:uuid:recipient-456" }],
        "payload": [{
          "contentAttachment": {
            "url": "urn:uuid:binary-123",
            "contentType": "application/pdf"
          }
        }]
      }
    }
  ]
}
```

After the bundle succeeds, extract the Communication and call `$send-efax`:

```typescript
const result = await medplum.executeBatch(bundle);
const communication = result.entry?.find(e => e.resource?.resourceType === 'Communication')?.resource;
await medplum.post(medplum.fhirUrl('Communication', '$send-efax'), communication);
```

## Custom FHIR Operations

This demo uses two custom FHIR operations:

### `$send-efax`

Send a fax via eFax from a Communication resource.

```
POST /fhir/R4/Communication/$send-efax
Content-Type: application/fhir+json

{
  "resourceType": "Communication",
  "status": "preparation",
  "medium": [{
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationMode",
      "code": "FAXWRIT"
    }]
  }],
  "sender": { "reference": "Practitioner/..." },
  "recipient": [{ "reference": "Practitioner/..." }],
  "payload": [{ "contentAttachment": { "url": "Binary/..." } }]
}
```

### `$receive-efax`

Poll for and receive faxes from eFax. Can be called on Organization or Practitioner.

```
POST /fhir/R4/$receive-efax [uses project level eFaxUserId secret]
POST /fhir/R4/Practitioner/$receive-efax [uses Practitioner's eFax user ID identifier]
POST /fhir/R4/Organization/$receive-efax [uses Organization's eFax user ID identifier]
```

## Learn More

- [eFax Integration Documentation](https://www.medplum.com/docs/integration/efax)
- [Custom FHIR Operations Documentation](https://www.medplum.com/docs/bots/custom-fhir-operations)
- [Medplum Bots](https://www.medplum.com/docs/bots/bot-basics)
