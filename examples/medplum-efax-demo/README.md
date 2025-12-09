# Medplum eFax Demo

This example application demonstrates how to use Medplum's custom FHIR operations to send and receive faxes via eFax integration.

## Features

- **Fax Inbox**: View received faxes and refresh from eFax using the `$receive-efax` operation
- **Send Fax**: Compose and send faxes using the `$send-efax` operation

## Prerequisites

1. A Medplum account with the eFax bots installed
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
  "payload": [{ "contentAttachment": { "url": "..." } }]
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

- [Custom FHIR Operations Documentation](https://www.medplum.com/docs/bots/custom-fhir-operations)
- [Medplum Bots](https://www.medplum.com/docs/bots/bot-basics)

