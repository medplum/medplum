---
sidebar_position: 3
tags: [integration]
---

# eFax Integration

Medplum provides a first-party integration with eFax Corporate to send and receive faxes directly from your healthcare application. Faxes are stored as FHIR `Communication` resources, enabling seamless integration with your clinical workflows.

:::caution Medplum Team Setup Required
This integration requires setup by the Medplum team. [Contact us](mailto:info+efax@medplum.com?subject=eFax%20Integration%20for%20Medplum) to enable eFax for your project.
:::

## Overview

The eFax integration allows you to:
- **Send faxes** from FHIR `Communication` resources via the `$send-efax` operation
- **Receive faxes** and store them as `Communication` resources via the `$receive-efax` operation  
- **Test connectivity** to verify your eFax API configuration

## Prerequisites

Before using the eFax integration, you must have:
- The eFax integration enabled on your Medplum project (contact the Medplum team)
- eFax API credentials configured as project secrets

## Configuration

### Project Secrets

The following secrets must be configured in your Medplum project:

| Secret Name | Description |
|-------------|-------------|
| `eFaxAppId` | Your eFax application ID |
| `eFaxApiKey` | Your eFax API key |
| `eFaxUserId` | Default eFax user ID for system-level operations |


## FHIR Operations

### `$receive-efax` - Receive Faxes

Poll for and receive faxes from eFax, creating `Communication` resources for each new fax. Depending on how you configure your eFax account, you can call this operation on the system level, on an Organization level, or on a Practitioner level.

For the simplest setup, if you only need one fax number, **we recommend calling `/fhir/R4/Communication/$receive-efax`** to start.

| Endpoint | Use Case | User ID Source |
|----------|----------|----------------|
| `POST /fhir/R4/Communication/$receive-efax` | Clinic-wide shared fax | Project secret `eFaxUserId` |
| `POST /fhir/R4/Organization/{id}/$receive-efax` | Department/location fax | Organization's eFax identifier |
| `POST /fhir/R4/Practitioner/{id}/$receive-efax` | Individual practitioner fax | Practitioner's eFax identifier |

### Resource Configuration

For practitioners or organizations to send/receive faxes, add their eFax user ID as an identifier:

```json
{
  "resourceType": "Practitioner",
  "identifier": [
    {
      "system": "https://efax.com",
      "value": "<EFAX_USER_ID>"
    }
  ],
  "telecom": [
    {
      "system": "fax",
      "value": "+15551234567"
    }
  ]
}
```


### `$send-efax` - Send a Fax

Send a fax from a `Communication` resource.

| Endpoint | Description |
|----------|-------------|
| `POST /fhir/R4/Communication/$send-efax` | Send a fax from a Communication resource |

**Request Body:** A `Communication` resource with:
- `medium` containing code `FAXWRIT` from system `http://terminology.hl7.org/CodeSystem/v3-ParticipationMode`
- `payload` with `contentAttachment` containing the document to fax (PDF, JPEG, or PNG)
- `sender` reference to a Practitioner with eFax identifier
- `recipient` reference(s) to resources with fax numbers in their `telecom`

When sending a fax, you need to create multiple FHIR resources:
1. **Binary**: The document to fax (PDF, image) - created via `medplum.createAttachment()`
2. **Organization**: The recipient with fax number
3. **Communication**: Links the document and recipient together

### Example: Sending a Fax

```typescript
import { createReference } from '@medplum/core';
import type { Communication, Organization, Practitioner } from '@medplum/fhirtypes';

// Assuming you have a MedplumClient instance and the sender's Practitioner profile
const profile = await medplum.getProfile() as Practitioner;

// Step 1: Upload the file as an attachment (creates Binary resource)
const attachment = await medplum.createAttachment({
  data: file,  // File object from input
  contentType: file.type,
  filename: file.name,
});

// Step 2: Create the recipient Organization
const recipient = await medplum.createResource<Organization>({
  resourceType: 'Organization',
  name: 'Acme Medical Center',
  contact: [{ telecom: [{ system: 'fax', value: '+15551234567' }] }],
});

// Step 3: Create the Communication with proper references
const communication = await medplum.createResource<Communication>({
  resourceType: 'Communication',
  status: 'in-progress',
  category: [{ coding: [{ system: 'http://medplum.com/fhir/CodeSystem/fax-direction', code: 'outbound' }] }],
  medium: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
          code: 'FAXWRIT',
        },
      ],
    },
  ],
  sender: createReference(profile),
  recipient: [createReference(recipient)],
  payload: [{ contentAttachment: attachment }],
});

// Step 4: Call the $send-efax operation
await medplum.post(medplum.fhirUrl('Communication', '$send-efax'), communication);

console.log('Fax sent successfully!');
```

## Communication Resource Structure

### Outbound Fax (Sent)

```json
{
  "resourceType": "Communication",
  "status": "in-progress",
  "identifier": [
    {
      "system": "https://efax.com",
      "value": "fax-12345"
    }
  ],
  "medium": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationMode",
          "code": "FAXWRIT",
          "display": "telefax"
        }
      ]
    }
  ],
  "sender": {
    "reference": "Practitioner/sender-id"
  },
  "recipient": [
    {
      "reference": "Practitioner/recipient-id"
    }
  ],
  "sent": "2025-01-15T10:30:00Z",
  "category": [
    {
      "coding": [
        {
          "system": "http://medplum.com/fhir/CodeSystem/fax-direction",
          "code": "outbound"
        }
      ]
    }
  ],
  "payload": [
    {
      "contentAttachment": {
        "url": "Binary/document-id",
        "contentType": "application/pdf"
      }
    }
  ]
}
```

### Inbound Fax (Received)

```json
{
  "resourceType": "Communication",
  "status": "completed",
  "identifier": [
    {
      "system": "https://efax.com",
      "value": "fax-67890"
    }
  ],
  "medium": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationMode",
          "code": "FAXWRIT",
          "display": "telefax"
        }
      ]
    }
  ],
  "recipient": [
    {
      "reference": "Practitioner/recipient-id"
    }
  ],
  "sent": "2025-01-15T09:15:00Z",
  "payload": [
    {
      "contentAttachment": {
        "url": "Binary/received-fax-id",
        "contentType": "application/pdf",
        "title": "fax-67890.pdf"
      }
    }
  ],
  "category": [
    {
      "coding": [
        {
          "system": "http://medplum.com/fhir/CodeSystem/fax-direction",
          "code": "inbound"
        }
      ]
    }
  ]
}
```

## Supported Document Types

The following content types are supported for sending faxes:

| Content Type | Extension |
|--------------|-----------|
| `application/pdf` | .pdf |
| `image/jpeg` | .jpg, .jpeg |
| `image/png` | .png |

## Example Application

See the [medplum-efax-demo](https://github.com/medplum/medplum/tree/main/examples/medplum-efax-demo) example for a complete React application demonstrating the eFax integration.

