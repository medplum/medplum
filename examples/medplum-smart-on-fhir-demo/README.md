# Medplum SMART on FHIR Demo

This is a demo application showcasing SMART on FHIR integration with Medplum. It demonstrates how to:

- Launch a SMART on FHIR app from an EHR context
- Handle SMART on FHIR authentication flows
- Access patient context
- Make FHIR API calls
- Display patient data

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm 8 or later

### Installation

1. Clone the repository
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

### Development

To run the development server:

```bash
npm run dev
```

The application will be available at http://localhost:8001

### Building

To create a production build:

```bash
npm run build
```

## Features

- Standalone SMART on FHIR launch flow
- EHR-launched SMART on FHIR flow (coming soon)
- OAuth2 authentication with multiple providers:
  - Medplum
  - SMART Health IT Sandbox
- Patient context handling and display
- FHIR resource retrieval and visualization
- React-based modern UI

## Launch Flows

### SMART Health IT Sandbox

The SMART Health IT Sandbox simulates an EHR environment for testing SMART on FHIR apps without needing a real EHR system.

1. Navigate to http://localhost:8001
2. Click **Launch with SMART Health IT Sandbox**
3. Log in and select a patient from the sandbox patient picker
4. You will be redirected to the patient dashboard

### Medplum

To test the launch flow with Medplum, you will need a Medplum account and a registered `ClientApplication`.

#### Setup

1. Create an account at https://app.medplum.com
2. Create a new `ClientApplication` resource with these redirect URIs:
   - `http://localhost:8001/launch` (SMART on FHIR launch)
   - `http://localhost:8001/setup` (demo data setup)
3. Open [config.ts](./src/config.ts) and set `MEDPLUM_CLIENT_ID` to your `ClientApplication` ID

#### Create Demo Data (first time only)

1. Navigate to http://localhost:8001
2. Click **Setup Demo Data**
3. Sign in with your Medplum account credentials
4. 10 demo patients with blood pressure readings, vitals, and risk factors will be created automatically
5. Click **Back to Home**

#### Launching

1. Navigate to http://localhost:8001
2. Click **Launch with Medplum**
3. Log in with your Medplum account via SMART on FHIR
4. Select a patient from the patient picker at http://localhost:8001/select-patient
5. You will be redirected to the patient dashboard