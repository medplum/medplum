# Medplum Healthie Importer

The Medplum Healthie Importer is a tool that synchronizes patient data from the Healthie EMR into Medplum.

Currently we support importing the following data:

- Patient Demographics (`Patient`)
- Medication History (`MedicationRequest`)
- Allergy Information (`AllergyIntolerance`)
- Questionnaire Responses (`QuestionnaireResponse`)

## Prerequisites

- Node.js (LTS version recommended)
- npm
- Medplum project with appropriate permissions (see our guide on setting up your [project](https://www.medplum.com/docs/tutorials/register))
- Medplum Client ID and Client Secret (see our guide on [Client Credentials](https://www.medplum.com/docs/auth/client-credentials))

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Build

To build the project:

```bash
npm run build
```

## Deployment

### Deploy the Bots

The connector uses a bot system that needs to be deployed to your Medplum project. To deploy the bots:

```bash
npm run deploy -- <CLIENT_ID> <CLIENT_SECRET> [--base-url <BASE_URL>]
```

Where:

- `CLIENT_ID`: Your Medplum client ID (required)
- `CLIENT_SECRET`: Your Medplum client secret (required)
- `--base-url` or `-u`: (Optional) The Medplum API base URL. Defaults to https://api.medplum.com/ if not specified

Example:

```bash
npm run deploy -- my-client-id my-client-secret
```

Or with custom base URL:

```bash
npm run deploy -- my-client-id my-client-secret --base-url https://api.medplum.com/
```

### Setup Project Secrets

Setup the following secrets with the details of your Healthie API Access. You can find more information about setting secrets [here](https://www.medplum.com/docs/bots/bot-secrets)

| Secret Name              | Description                                       | Required |
| ------------------------ | ------------------------------------------------- | -------- |
| `HEALTHIE_API_URL`       | The base URL for the Healthie API                 | Yes      |
| `HEALTHIE_CLIENT_SECRET` | The client secret for Healthie API authentication | Yes      |

## Running the importer

To import patients from Healthie, run the bot with identifier `medplum-healthie-importer/import-healthie-patients`.

### Basic Usage

```
POST <MedplumBaseUrl>/Bot/$execute?identifier=medplum-healthie-importer/import-healthie-patients
```

### Advanced Usage with Parameters

You can customize the import process by providing optional input parameters:

```json
POST <MedplumBaseUrl>/Bot/$execute?identifier=medplum-healthie-importer/import-healthie-patients
Content-Type: application/json

{
  "count": 10,
  "offset": 0,
  "patientIds": ["patient123", "patient456"]
}
```

#### Input Parameters

| Parameter    | Type     | Description                                                              | Optional |
| ------------ | -------- | ------------------------------------------------------------------------ | -------- |
| `count`      | number   | Maximum number of patients to process (for pagination)                   | Yes      |
| `offset`     | number   | Number of patients to skip (for pagination)                              | Yes      |
| `patientIds` | string[] | Specific list of Healthie patient IDs to import (overrides count/offset) | Yes      |

### What Gets Imported

For each patient, the importer will fetch and convert:

- **Patient Demographics**: Basic patient information including name, contact details, demographics
- **Medications**: Current and historical medications as `MedicationRequest` resources
- **Allergies**: Known allergies and sensitivities as `AllergyIntolerance` resources
- **Questionnaire Responses**: Completed forms and questionnaires as `QuestionnaireResponse` resources

### Questionnaire Response Features

The importer supports comprehensive conversion of Healthie form submissions including:

- **All question types**: Text, textarea, radio buttons, checkboxes, dropdowns, dates, times, numbers
- **Advanced features**: Matrix questions, signatures, file attachments, boolean agreements
- **Data type mapping**: Automatic conversion to appropriate FHIR value types:
  - Text fields → `valueString`
  - Numbers → `valueQuantity` with numeric value
  - Dates/DOB → `valueDate`
  - Times → `valueTime`
  - Checkboxes/agreements → `valueBoolean`
  - Signatures → `valueAttachment` with base64 image data
- **Multi-answer support**: Handles checkbox selections and other multi-value questions
- **Matrix questions**: Converts complex tabular data into hierarchical FHIR item structures
- **Form metadata**: Preserves form names, completion status, and timestamps
- **Filtering**: Automatically excludes display-only fields (labels, instructions) and empty responses

### Error Handling & Logging

The importer includes comprehensive error handling and logging:

- **Individual patient processing**: If one patient fails, the import continues with remaining patients
- **Detailed batch results**: Logs any failed resource updates with specific error details
- **Progress tracking**: Console logs show import progress for each patient and resource type
- **Graceful failures**: Missing or invalid data is handled without stopping the entire import

## Support

For support, please contact Medplum at hello@medplum.com
