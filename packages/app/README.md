# Medplum App

This is the code for [https://app.medplum.com](https://app.medplum.com)

## Deployment

Medplum publishes the app package with placeholders for configuration settings. You can use the Medplum CLI to deploy the app, which will automatically replace the placeholders with your settings.

For example:

```bash
# Deploy the latest version of the app to your Medplum AWS environment named "staging"
medplum aws deploy-app staging
```

## Config Settings

When deploying from the Medplum CLI, config settings are loaded from the corresponding JSON config file.

When building and running the app from source, config settings are loaded from environment variables or the `.env` file.

| Name                       | Description                                                                                | Required |
| -------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| `MEDPLUM_BASE_URL`         | The base URL of the API server for all API calls. For example, "https://api.medplum.com/". | yes      |
| `MEDPLUM_CLIENT_ID`        | Optional Medplum client application ID.                                                    | no       |
| `GOOGLE_CLIENT_ID`         | Optional Google client application ID for Google Auth.                                     | no       |
| `RECAPTCHA_SITE_KEY`       | Optional reCAPTCHA site key for reCAPTCHA user verification.                               | no       |
| `MEDPLUM_REGISTER_ENABLED` | Optional flag to enable or disable open registration for new projects.                     | no       |

## Developing

Dev server:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

For more information, refer to the [Developer Instructions](https://www.medplum.com/docs/contributing/run-the-stack).
