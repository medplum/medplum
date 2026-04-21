# Medplum SMART on FHIR Demo

## Overview

This demo application showcases [SMART on FHIR](https://smarthealthit.org/), a framework that allows healthcare apps to be launched from within an EHR and receive authenticated, scoped access to FHIR data.

### What is SMART on FHIR?

SMART on FHIR is an open standard built on OAuth 2.0 that defines how clinical apps authenticate against a FHIR server and receive contextual information (e.g. which patient is in scope). It is designed to work across EHR vendors so a single app can be launched from any SMART-compliant system.

### Launch Flows

In this demo, there are three ways to launch a SMART on FHIR app:

- **EHR launch from Medplum** — Launch the app from Medplum's Apps tab; patient context is automatically provided.
- **Standalone launch from Medplum** — Open the app directly; after OAuth login the user picks a patient from a search list.
- **SMART Health IT Sandbox** — Test against a public sandbox with synthetic Synthea patients without a Medplum account.

## Prerequisites

- **Node.js** `^22.18.0` or `>=24.2.0`
- **npm** `10.9.4` or later (npm 11 is not supported by this project's lock file)
- A Medplum account (only required for the Medplum launch flows)

---

## Installation

```bash
# From the repo root
npm install

# Or from this directory
cd examples/medplum-smart-on-fhir-demo
npm install
```

## Development

```bash
npm run dev
```

The app runs on **http://localhost:8001** (avoids conflict with Medplum's dev server which uses 3000/3001).

## Building

```bash
npm run build
```

---

## Medplum Setup

### 1. Create a ClientApplication

1. Sign in at [app.medplum.com]
2. Create a new ClientApplication resource (https://app.medplum.com/ClientApplication)
3. Fill in the required fields:

| Field | Value | Purpose |
|---|---|---|
| **Name** | `SMART on FHIR Demo` (or any label) | Identifies the app in your project |
| **Redirect URI** | `http://localhost:8001/launch` | OAuth callback for all SMART launch flows (EHR and standalone) |
| **Redirect URI** | `http://localhost:8001/setup` | OAuth callback for the demo data setup page |
| **Launch URI** | `http://localhost:8001/launch` | The URL Medplum opens when you click **Launch** from the Apps tab (EHR launch) |

> **Note:** Medplum validates the redirect URI on every token request and will reject requests with unregistered URIs.

4. Save and copy the **Client ID** (a UUID shown on the resource page)

### 2. Configure the App

Open [src/config.ts](./src/config.ts) and set:

```typescript
export const MEDPLUM_CLIENT_ID = '<your-client-id>';
```
---

## Creating Demo Data (First Time Only)

The Medplum launch flows require patients in your project. The setup page creates 10 synthetic patients automatically.

1. Navigate to [http://localhost:8001]
2. Click **Setup Demo Data**
3. Sign in with your Medplum account
4. Wait for the confirmation message — 10 patients will be created
5. Click **Back to Home**

The setup page signs you out automatically after completion so the SMART launch flow starts with a clean session.

---

## Using the App

### Medplum EHR Launch

1. Go to [app.medplum.com]
2. Go to the Apps tab in a Patient resource (https://app.medplum.com/Patient) and click on your ClientApplication
3. Medplum redirects to `http://localhost:8001/launch?iss=https://api.medplum.com/fhir/R4/&launch=<token>`
4. The app exchanges the launch token for an access token. Patient context is provided automatically
5. You are taken directly to the **Patient Dashboard** for the patient in context

### Medplum Standalone Launch

1. Navigate to [http://localhost:8001]
2. Click **Launch with Medplum**
3. You are redirected to Medplum's OAuth login
4. After login, you arrive at the **Patient Picker** (`/select-patient`)
5. You are taken to the **Patient Dashboard**
6. Use the **← Back to patients** link at the top to return to the picker

### SMART Health IT Sandbox

1. Navigate to [http://localhost:8001]
2. Click **Launch with SMART Health IT Sandbox**
3. You are taken to the sandbox's simulated EHR — select a patient from the picker
4. After selection you are redirected back and taken to the **Patient Dashboard**

### Patient Dashboard

The demo app's patient dashboard displays:

- **Patient header** — Name, gender, date of birth, age, avatar
- **Vitals summary** — Latest blood pressure (systolic/diastolic in mmHg), weight (kg), and BMI (kg/m²) with measurement dates
- **Blood pressure trends** — Line chart of the last 10 readings plus a table with per-reading BP classification (Normal / Elevated / Stage 1 / Stage 2)
- **Active conditions** — Problem list items

---

## Demo Data Details

The **Setup Demo Data** flow creates the following resources in your Medplum project, all tagged with `https://medplum.com/smart-on-fhir-demo|demo` for easy identification and cleanup.

### Patients (10)

Synthetic adults with name, birth date, and gender. Conformant to the **US Core Patient** profile.

### Observations

Each patient receives:

| Type | LOINC Code | Profile | Count |
|---|---|---|---|
| Blood pressure panel (systolic + diastolic components) | `55284-4` / `8480-6` / `8462-4` | US Core Blood Pressure | 5 readings, ~1 month apart |
| Body weight | `29463-7` | US Core Body Weight | 1 (current) |
| BMI | `39156-5` | US Core BMI | 1 (current) |

All observations use UCUM units (`mm[Hg]`, `kg`, `kg/m2`) and are categorized as `vital-signs`.

### Conditions (5 per patient)

Cardiovascular and chronic disease risk factors drawn from a pool of 12 conditions, coded with **SNOMED CT**:

| SNOMED Code | Display |
|---|---|
| 38341003 | Hypertension |
| 44054006 | Type 2 diabetes mellitus |
| 13644009 | Hypercholesterolemia |
| 414916001 | Obesity |
| 77386006 | Smoking |
| 59621000 | Essential hypertension |
| 40930008 | Hypothyroidism |
| 73211009 | Diabetes mellitus |
| 230690007 | Stroke |
| 22298006 | Myocardial infarction |
| 195967001 | Asthma |
| 13645005 | Chronic obstructive lung disease |

Conditions are created as `problem-list-item` with `active` / `confirmed` status, conformant to the **US Core Condition Problems and Health Concerns** profile.

---

## Security Notes

This is a **demonstration app** and is not intended for production use.

- **No client secret** — The OAuth flow uses a public client (no `client_secret`). This is correct for browser-based SMART apps but means the client ID alone is not a secret.
- **sessionStorage** — Auth tokens (`smart_access_token`) and context identifiers (`smart_patient`, `smart_iss`) are stored in `sessionStorage`. This is cleared when the browser tab is closed but is accessible to JavaScript running on the same origin.
- **State parameter** — A CSRF state parameter is generated with `crypto.randomUUID()` and validated on callback.
- **No refresh tokens** — The demo does not request or store refresh tokens. Sessions expire when the access token expires.

---

## Troubleshooting

### "Missing iss parameter for EHR launch"

The `iss` query parameter was not present when the app loaded at `/launch`. This means the EHR did not initiate the launch correctly. Verify that:
- The **Launch URI** in Medplum is set to `http://localhost:8001/launch` (not the root `/`)
- You are clicking your **ClientApplication** from the Medplum Apps tab, not navigating directly to the launch URL

### "Failed to fetch SMART configuration"

The app could not retrieve `/.well-known/smart-configuration` from the FHIR server. Common causes:
- The FHIR server URL (`iss`) is incorrect or unreachable

### "State parameter mismatch — possible security issue"

The `state` value returned by the OAuth server does not match the value stored in `sessionStorage` before the redirect. Common causes:
- The browser session was cleared between the authorization request and the callback
- The callback URL was opened in a different tab or browser

### "Client ID not configured"

`MEDPLUM_CLIENT_ID` in [src/config.ts] is still set to the placeholder `'your-client-id'`. Update it with the Client ID from your Medplum `ClientApplication`.

### "Authorization error: …"

The OAuth server returned an error in the callback URL (e.g. `?error=access_denied`). Check the full error description displayed in the UI. Common causes:
- The redirect URI registered in the `ClientApplication` does not exactly match `http://localhost:8001/launch`
- The requested scopes were denied
- The client ID does not exist in the project

### Port conflict — app does not start on 8001

Another process is already using port 8001. Either stop that process or override the port:

```bash
VITE_PORT=8002 npm run dev
```

Note: if you change the port you must also update the redirect URIs in your `ClientApplication` and in [src/config.ts](./src/config.ts).

### "No authentication data found. Please launch the app again."

The app navigated to `/patient` but the expected `sessionStorage` keys (`smart_access_token`, `smart_patient`) are missing. This happens when:
- The page was refreshed after the session expired
- The URL was opened directly without going through the launch flow

Return to [http://localhost:8001] and launch again.

---

## Future Development

The following launch contexts may be added in a future update:

- **Encounter launch** — When the EHR provides an encounter context alongside the patient, the app would scope blood pressure readings and conditions to that specific encounter.
- **Practitioner launch** — When an EHR launches the app with a logged-in practitioner's identity (`fhirUser`), the app would show the practitioner's patient list using `user/*.read` scope rather than a single patient in context.
