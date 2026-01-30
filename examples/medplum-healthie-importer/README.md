# Medplum Healthie Importer

The Medplum Healthie Importer is a tool that synchronizes patient data from the Healthie EMR into Medplum.

## Features

- **Patient Demographics** (`Patient`)
- **Medication History** (`MedicationRequest`)
- **Allergy Information** (`AllergyIntolerance`)
- **Questionnaire Responses** (`QuestionnaireResponse`)

### Robustness Features

- **Cursor Pagination**: All data fetching (patients, medications, allergies, form responses) uses cursor-based pagination to handle large datasets reliably
- **Retry Logic**: Automatic retry with exponential backoff for transient errors (429 rate limits, 5xx server errors, network failures)
- **Clinical Activity Tracking**: Optional tracking of most recent clinical updates across all resource types

## Bots

This package includes two bots:

| Bot | Identifier | Purpose |
|-----|------------|---------|
| **Import Patients** | `medplum-healthie-importer/import-healthie-patients` | Imports patient data and clinical resources from Healthie |
| **List Patients** | `medplum-healthie-importer/list-healthie-patients` | Lists Healthie patient IDs with filtering and pagination |

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

## List Patients Bot

The list patients bot allows you to query Healthie for patient IDs with filtering and pagination support.

### Basic Usage

```
POST <MedplumBaseUrl>/Bot/$execute?identifier=medplum-healthie-importer/list-healthie-patients
```

### Advanced Usage with Parameters

```json
POST <MedplumBaseUrl>/Bot/$execute?identifier=medplum-healthie-importer/list-healthie-patients
Content-Type: application/json

{
  "filters": {
    "sinceLastUpdated": "2024-01-01T00:00:00Z",
    "name": "john",
    "dateOfBirth": "1990-01-15"
  },
  "pagination": {
    "page": 0,
    "pageSize": 100
  },
  "maxResults": 500,
  "includeDemographics": true,
  "includeClinicalUpdateDates": true
}
```

### Input Parameters

| Parameter | Type | Description | Optional |
|-----------|------|-------------|----------|
| `filters.sinceLastUpdated` | string | ISO 8601 date - filter patients updated since this date | Yes |
| `filters.name` | string | Partial match on first or last name | Yes |
| `filters.dateOfBirth` | string | Filter by date of birth (YYYY-MM-DD) | Yes |
| `pagination.page` | number | 0-indexed page number (default: 0) | Yes |
| `pagination.pageSize` | number | Results per page (default: 100) | Yes |
| `maxResults` | number | Cap on total results returned | Yes |
| `includeDemographics` | boolean | Include name, DOB in response | Yes |
| `includeClinicalUpdateDates` | boolean | Include latest clinical activity date (see below) | Yes |

### Clinical Activity Tracking

When `includeClinicalUpdateDates` is `true`, the bot fetches the most recent update date from each patient's clinical resources (medications, allergies, form responses) and returns the maximum as `latestClinicalUpdate`.

**Important**: When this flag is enabled and `sinceLastUpdated` is specified, filtering is based on clinical activity dates rather than patient record dates. This allows you to find patients with recent clinical activity.

**Note**: This is an expensive operation as it requires 3 additional API calls per patient (one for each clinical resource type).

### Output Format

```json
{
  "patients": [
    {
      "id": "123",
      "updatedAt": "2024-01-15T10:30:00Z",
      "demographics": {
        "firstName": "John",
        "lastName": "Doe",
        "dateOfBirth": "1990-01-15"
      },
      "latestClinicalUpdate": "2024-01-20T14:00:00Z"
    }
  ],
  "pagination": {
    "page": 0,
    "pageSize": 100,
    "totalPages": 5,
    "totalCount": 450,
    "hasNextPage": true
  }
}
```

### Example Workflows

#### Get all patients updated in the last 24 hours

```json
{
  "filters": {
    "sinceLastUpdated": "2024-01-14T00:00:00Z"
  }
}
```

#### Find patients with recent clinical activity

```json
{
  "filters": {
    "sinceLastUpdated": "2024-01-01T00:00:00Z"
  },
  "includeClinicalUpdateDates": true
}
```

#### Paginate through all patients

```json
{
  "pagination": {
    "page": 0,
    "pageSize": 100
  },
  "includeDemographics": true
}
```

## API Resilience

The Healthie client includes automatic retry logic for transient failures:

- **Rate Limits**: Healthie returns rate limits as GraphQL errors with code `TOO_MANY_REQUESTS` (not HTTP 429). These are automatically retried with exponential backoff.
- **HTTP Rate Limits (429)**: Also handled, respects `Retry-After` header if present
- **Server Errors (500, 502, 503, 504)**: Retries with exponential backoff
- **Network Errors**: Retries connection failures
- **Other GraphQL Errors**: Not retried (considered application-level errors)

Default retry configuration:
- Max retries: 3
- Base delay: 1000ms
- Max delay: 30000ms
- Jitter: ±25% randomization

## Support

For support, please contact Medplum at hello@medplum.com
