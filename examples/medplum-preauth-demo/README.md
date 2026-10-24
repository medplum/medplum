# Medplum Pre-Authorized Code Demo

This example app demonstrates the [OID4VCI pre-authorized code grant flow](https://www.medplum.com/docs/auth/pre-authorized-code) in Medplum. It shows how a practitioner can send a patient a DocuSign-style consent document as a one-time magic link. The patient reviews the forms, signs with the [`SignatureInput`](https://storybook.medplum.com/?path=/story/medplum-signatureinput--basic) component, and submits, all without logging in.

## How it works

1. A practitioner signs in and populates the project with a demo patient and the consent forms questionnaire (Consent for Treatment, Agreement to Pay, Notice of Privacy Practices, Advance Directives), copied from the provider app's `/onboarding` form.
2. The practitioner clicks **Generate Magic Link**. A Medplum Bot calls `/auth/preauthorize` server-side and returns a one-time pre-authorized code. The bot also gives the patient a login scoped by the **Preauth Demo Signer** AccessPolicy, so the patient's token can only read the questionnaire and their own `Patient`, and submit their own `QuestionnaireResponse` to that questionnaire.
3. The magic link is displayed with its status (Sent, Signed, Expired). The practitioner copies it and shares it with the patient (e.g., via email or SMS).
4. The patient opens the link, with no login required. The app redeems the code at `/oauth2/token`, gets an access token, and renders the forms.
5. The patient checks each agreement, prints their name, draws a signature and submits. A `QuestionnaireResponse` is saved with the signature.
6. A Subscription triggers the `create-consent` bot, which creates a signed PDF (a `DocumentReference` linked to the response) and one [`Consent`](https://www.medplum.com/docs/consent) per agreement, each pointing to the PDF through `sourceAttachment`. The practitioner sees the Consents and PDF appear in the app.

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
MEDPLUM_BASE_URL=      # optional, defaults to https://api.medplum.com/ (set it for a self-hosted server)
```

> **Note:** `MEDPLUM_CLIENT_SECRET` is only read by the `build:bots` deploy script. `vite.config.ts` exposes only the variables the app needs to the browser, so the secret stays out of it.

### 5. Deploy the bot

```bash
npm run build:bots
```

This compiles and deploys two bots to your Medplum project:

- `generate-magic-link`: creates the patient login and the pre-authorized code. Because it runs as Project Admin, it only issues links for the demo patient (tagged `preauth-demo`).
- `create-consent`: creates the `Consent` resources and signed PDF when a form is submitted

It also creates the **Preauth Demo Signer** AccessPolicy and the `Subscription` that triggers `create-consent`. When it finishes, it prints the `generate-magic-link` Bot ID. Copy it into `.env` as `MEDPLUM_BOT_ID`.

### 6. Set the bot secret

Secrets are stored at the project level. To add one:

1. Go to the [Project Admin page](https://app.medplum.com/admin/project) (or click **Project** in the left sidebar).
2. Click the **Secrets** tab.
3. Click **Add** and create a secret named `CLIENT_ID` (type: string) with the same ClientApplication ID from step 2.

> **Note:** The deploy script automatically grants the `generate-magic-link` bot Project Admin access so it can call `/auth/preauthorize` on behalf of patients.

### 7. Run the app

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Usage

1. Open [http://localhost:3000](http://localhost:3000) and sign in as a project admin.
2. Click **Populate Project Resources** to create a demo patient and the consent forms.
3. Click **Generate Magic Link**.
4. Click **Open in new tab** to experience the patient flow (or copy the link to another browser or device).
5. Check each agreement, print your name, sign and submit.
6. Back in the first window, watch the status change to **Signed** and review the four `Consent` resources and the signed PDF. You can also find them in [app.medplum.com](https://app.medplum.com/Consent).

## About the pre-authorized code flow

The pre-authorized code flow (`urn:ietf:params:oauth:grant-type:pre-authorized_code`) is defined by [OpenID for Verifiable Credential Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html). It is useful for issuer-initiated flows — like magic links — where the user's identity has already been established before the client requests tokens.

In production, the bot would typically send the magic link to the patient's email or SMS rather than displaying it in the UI.

The code is single-use. Redeeming it a second time also revokes the session from the first redemption. This demo redeems the code when the page loads, so reloading the page mid-form invalidates the link. A production app might redeem only when the patient clicks to start, because some email security scanners open links before the patient does.

See the [Medplum documentation](https://www.medplum.com/docs/auth/pre-authorized-code) for more details.

## About Medplum

[Medplum](https://www.medplum.com) is an open-source, API-first electronic health record. It enables you to build healthcare apps quickly with a fully certified FHIR server, hosted in the cloud.
