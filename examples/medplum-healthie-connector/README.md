# Medplum Healthie Connector

The Medplum Healthie Connector is a integration tool that synchronizes patient data from the Healthie EMR to Medplum.

## Features

- Synchronize Patient data synchronization between Medplum and Healthie
- Automated bot deployment for data fetching
- Secure authentication handling

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

The connector uses a bot system that needs to be deployed to your Medplum project. To deploy the bots:

```bash
npm run deploy -- <CLIENT_ID> <CLIENT_SECRET> [<BASE_URL>]
```

Where:

- `CLIENT_ID`: Your Medplum client ID
- `CLIENT_SECRET`: Your Medplum client secret
- `BASE_URL`: (Optional) The Medplum API base URL. Defaults to https://api.medplum.com/ if not specified

Example:

```bash
npm run deploy -- my-client-id my-client-secret
```

## Support

For support, please contact Medplum at hello@medplum.com
