# Medplum Healthie Importer

The Medplum Healthie Importer is a tool that synchronizes patient data from the Healthie EMR into Medplum.

Currently we support importing the following data:

- Patient Demographics (`Patient`)
- Medication History (`MedicationRequest`)

## Prerequisites

- Node.js (LTS version recommended)
- npm
- Medplum project with appropriate permissions (see our guide on setting up your [project](https://www.medplum.com/docs/tutorials/register))
- Medplum Client ID and Client Secret (see our guide on [Client Credentials](https://www.medplum.com/docs/auth/methods/client-credentials))

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

To import patients from Healthie, simply run the bot with identifier `medplum-healthie-importer/import-healthie-patients`.

```
POST <MedplumBaseUrl>/Bot/$execute?identifier=medplum-healthie-importer/import-healthie-patients
```

## Support

For support, please contact Medplum at hello@medplum.com
