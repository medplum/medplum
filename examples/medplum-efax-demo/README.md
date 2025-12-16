# Medplum eFax Demo

This example application demonstrates how to use Medplum's custom FHIR operations to send and receive faxes via eFax integration.

**NOTE**: This demo uses Medplum's hosted eFax integration. The Medplum team must enable eFax for your project before you can use it. [Contact Medplum](mailto:hello@medplum.com) to enable eFax for your project.

## Features

- **Fax Inbox**: View received faxes and refresh from eFax using the `$receive-efax` operation
- **Sent Faxes**: View outbound faxes
- **Send Fax**: Compose and send faxes using the `$send-efax` operation


## Prerequisites

1. A Medplum account with the eFax integration enabled (contact the Medplum team)
2. eFax API credentials configured in your Medplum project's secrets (see [eFax Integration Documentation](https://www.medplum.com/docs/integration/efax))

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables by creating a `.env` file (OPTIONAL)

   ```
   MEDPLUM_BASE_URL=https://api.medplum.com/
   MEDPLUM_CLIENT_ID=your-client-id
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000 in your browser

## Sending a Fax

The demo creates resources sequentially when sending a fax:

```typescript
// Step 1: Upload the file as an attachment (creates Binary resource)
const attachment = await medplum.createAttachment({
  data: file,
  contentType: file.type,
  filename: file.name,
});

// Step 2: Create the recipient Organization
const recipient = await medplum.createResource<Organization>({
  resourceType: 'Organization',
  name: 'Acme Medical Center',
  contact: [{ telecom: [{ system: 'fax', value: '+15551234567' }] }],
});

// Step 3: Create the Communication
const communication = await medplum.createResource<Communication>({
  resourceType: 'Communication',
  status: 'in-progress',
  category: [{ coding: [{ system: 'http://medplum.com/fhir/CodeSystem/fax-direction', code: 'outbound' }] }],
  medium: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode', code: 'FAXWRIT' }] }],
  sender: createReference(profile),
  recipient: [createReference(recipient)],
  payload: [{ contentAttachment: attachment }],
});

// Step 4: Call the $send-efax operation
await medplum.post(medplum.fhirUrl('Communication', '$send-efax'), communication);
```

## Custom FHIR Operations

### `$send-efax`

Send a fax via eFax from a Communication resource.

```
POST /fhir/R4/Communication/$send-efax
```

### `$receive-efax`

Poll for and receive faxes from eFax.

```
POST /fhir/R4/Communication/$receive-efax                    # Uses project-level eFaxUserId secret
POST /fhir/R4/Practitioner/{id}/$receive-efax  # Uses Practitioner's eFax identifier
POST /fhir/R4/Organization/{id}/$receive-efax  # Uses Organization's eFax identifier
```

## Learn More

- [eFax Integration Documentation](https://www.medplum.com/docs/integration/efax)
- [Custom FHIR Operations Documentation](https://www.medplum.com/docs/bots/custom-fhir-operations)
- [Medplum Bots](https://www.medplum.com/docs/bots/bot-basics)
