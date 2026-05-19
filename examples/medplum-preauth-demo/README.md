# Medplum Pre-Authorized Code Demo

This example app demonstrates the [OID4VCI pre-authorized code grant flow](https://www.medplum.com/docs/auth/pre-authorized-code) in Medplum. It shows how a practitioner can generate a one-time magic link that lets a patient fill out a PHQ-A questionnaire without needing to log in.

## How it works

1. A practitioner signs in and populates the project with a demo patient and the PHQ-A questionnaire.
2. The practitioner clicks **Generate Magic Link**. A Medplum Bot calls `/auth/preauthorize` server-side and returns a one-time pre-authorized code.
3. The magic link is displayed. The practitioner copies it and shares it with the patient (e.g., via email or SMS).
4. The patient opens the link — no login required. The app redeems the code at `/oauth2/token`, gets an access token, and renders the questionnaire.
5. The patient submits the questionnaire. A `QuestionnaireResponse` is saved to the project.

## Prerequisites

### 1. Create a Medplum project

Register at [app.medplum.com](https://app.medplum.com/register) if you haven't already.

### 2. Create a ClientApplication

1. Go to [app.medplum.com/ClientApplication](https://app.medplum.com/ClientApplication/new) and create a new ClientApplication (e.g., "PreAuth Demo").
2. Copy the **Client ID** and **Client Secret**.
3. In **Project Settings → Members**, grant this ClientApplication **Project Admin** access.

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Copy `.env.defaults` to `.env`:

```bash
cp .env.defaults .env
```

Fill in your values:

```
MEDPLUM_CLIENT_ID=<your ClientApplication ID>
MEDPLUM_CLIENT_SECRET=<your ClientApplication secret>
MEDPLUM_BOT_ID=        # fill in after step 5
```

> **Note:** `MEDPLUM_CLIENT_SECRET` is only used by the `build:bots` deploy script and is never exposed to the browser.

### 5. Deploy the bot

```bash
npm run build:bots
```

This compiles and deploys the `generate-magic-link` bot directly to your Medplum project. When it finishes, it prints the Bot ID. Copy it into `.env` as `MEDPLUM_BOT_ID`.

### 6. Set the bot secret

Secrets are stored at the project level. To add one:

1. Go to the [Project Admin page](https://app.medplum.com/admin/project) (or click **Project** in the left sidebar).
2. Click the **Secrets** tab.
3. Click **Add** and create a secret named `CLIENT_ID` (type: string) with the same ClientApplication ID from step 2.

> **Note:** The deploy script automatically grants the bot Project Admin access so it can call `/auth/preauthorize` on behalf of patients.

### 7. Run the app

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Usage

1. Open [http://localhost:3000](http://localhost:3000) and sign in as a project admin.
2. Click **Populate Project Resources** to create a demo patient and questionnaire.
3. Click **Generate Magic Link**.
4. Copy the link and paste it into an incognito window (simulates a patient flow).
5. Fill out the PHQ-A questionnaire and submit.
6. Verify the `QuestionnaireResponse` in [app.medplum.com](https://app.medplum.com/QuestionnaireResponse).

## About the pre-authorized code flow

The pre-authorized code flow (`urn:ietf:params:oauth:grant-type:pre-authorized_code`) is defined by [OpenID for Verifiable Credential Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html). It is useful for issuer-initiated flows — like magic links — where the user's identity has already been established before the client requests tokens.

In production, the bot would typically send the magic link to the patient's email or SMS rather than displaying it in the UI.

See the [Medplum documentation](https://www.medplum.com/docs/auth/pre-authorized-code) for more details.

## About Medplum

[Medplum](https://www.medplum.com) is an open-source, API-first electronic health record. It enables you to build healthcare apps quickly with a fully certified FHIR server, hosted in the cloud.
