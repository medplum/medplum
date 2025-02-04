# Medplum SMART on FHIR Demo

This is a demo application showcasing SMART on FHIR integration with Medplum. It demonstrates how to:

- Launch a SMART on FHIR app from an EHR context
- Handle SMART on FHIR authentication flows
- Access patient context
- Make FHIR API calls
- Display patient data

> **Note:** The standalone launch flow from the home page is currently under development and may not work as expected. The app is primarily designed to be launched from an EHR context.

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

- EHR-launched SMART on FHIR flow
- OAuth2 authentication with multiple providers:
  - Medplum
  - SMART Health IT Sandbox
- Patient context handling and display
- FHIR resource retrieval and visualization
- React-based modern UI

## Testing EHR Launch Flow

### Using the Smart Health IT Sandbox

To test the EHR launch flow using the Smart Health IT Sandbox, you'll need to:

1. Navigate to the [SMART Launcher page](https://launch.smarthealthit.org)
2. Set the "App's Launch URL" to: `http://localhost:8001/launch`
3. (Optional) Select a specific patient id to load using the "Patient(s)" selector
4. (Option) Enable "Simulate launch within the EHR UI"
5. Click the "Launch Sample App" button

### Using the Medplum App

To test the EHR launch flow, you'll need to:

1. Register your app in the Medplum App
2. Configure your EHR launch URL as: `http://localhost:8001/launch`
3. Launch the app from your EHR system using the SMART on FHIR app launcher

For detailed instructions on setting up SMART on FHIR apps with Medplum, see the [SMART App Launch Guide](https://www.medplum.com/docs/integration/smart-app-launch) in the Medplum documentation. Set the launch URL to `http://localhost:8001/launch` and the redirect URL to `http://localhost:8001/launch`.

## Learn More

- [Medplum Documentation](https://www.medplum.com/docs)
- [SMART on FHIR Documentation](https://docs.smarthealthit.org/)
