# Medplum Developer Reference

Medplum is an open-source, FHIR-native healthcare developer platform providing a clinical data repository, FHIR R4 API, auth, server-side logic (Bots), and a React UI component library.

- **License:** Apache 2.0 — **Repository:** https://github.com/medplum/medplum
- **Docs:** https://www.medplum.com/docs — **Blog:** https://www.medplum.com/blog
- **Storybook:** https://storybook.medplum.com/ — **Discord:** https://discord.gg/medplum
- **App (admin):** https://app.medplum.com
- **Version:** v5.x (Mantine v8, React 19, react-router v7)

---

## Core Components

| Component | Description |
|---|---|
| `@medplum/core` | MedplumClient SDK, FHIR utilities, auth helpers |
| `@medplum/fhirtypes` | TypeScript type definitions for FHIR R4 |
| `@medplum/react` | Pre-built React components (built on Mantine v8) |
| `@medplum/react-hooks` | React hooks (useMedplum, useMedplumContext, useSearch, etc.) |
| Medplum Bots | Server-side TypeScript functions triggered by subscriptions or HTTP |
| `@medplum/cli` | CLI for managing projects, deploying Bots, bulk import/export |
| Medplum App | Admin UI at https://app.medplum.com for managing projects and resources |
| Medplum Provider | Out-of-the-box EHR at https://provider.medplum.com |

---

## NPM Packages

```bash
npm install @medplum/core @medplum/fhirtypes
npm install @medplum/react @medplum/react-hooks
npm install @mantine/core @mantine/hooks @mantine/notifications
# Optional peer deps required at runtime:
npm install @mantine/spotlight rfc6902 signature_pad
```

> `@medplum/react` 5.x requires Mantine **v8** (not v7).

---

## Minimal React App Setup

```tsx
// src/main.tsx
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';

const medplum = new MedplumClient({
  clientId: import.meta.env.VITE_MEDPLUM_CLIENT_ID, // required for Medplum Cloud
  onUnauthenticated: () => (window.location.href = '/'),
});

const theme = createTheme({});

createRoot(document.getElementById('root') as HTMLDivElement).render(
  <StrictMode>
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider theme={theme}>
          <App />
        </MantineProvider>
      </MedplumProvider>
    </BrowserRouter>
  </StrictMode>
);
```

**Auth gate pattern:**
```tsx
// src/App.tsx
if (medplum.isLoading()) return null;
if (!medplum.getProfile()) return <PublicRoutes />;
return <AuthenticatedShell />;
```

---

## Common SDK Operations

```ts
// Authenticate
await medplum.startLogin({ email: 'admin@example.com', password: '...' });

// CRUD
const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', ... });
const fetched  = await medplum.readResource('Patient', patient.id!);
await medplum.updateResource({ ...patient, birthDate: '1990-01-15' });
await medplum.deleteResource('Patient', patient.id!);

// Search
const results = await medplum.searchResources('Patient', { name: 'Jane' });

// GraphQL
const result = await medplum.graphql(`{ PatientList(name: "Jane") { id name { given family } } }`);

// Custom operation / bot
await medplum.post(medplum.fhirUrl('Bot', BOT_ID, '$execute'), parametersBody);
```

---

## Writing a Bot

```ts
import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  // Bots run as service account — full project access
  await medplum.createResource({ resourceType: 'Task', status: 'requested', intent: 'order', ... });
  return true;
}
```

Deploy:
```bash
export MEDPLUM_CLIENT_ID=<id>
export MEDPLUM_CLIENT_SECRET=<secret>
npm run build
npx medplum bot deploy <bot-name>
```

**If `$deploy` fails due to shell quoting issues**, use Python's `http.client` to POST the payload directly with `json.dumps`.

---

## FHIR Essentials

### Common Resource Types

| Resource | Purpose |
|---|---|
| `Patient` | Core patient demographics |
| `Practitioner` | Healthcare provider/clinician |
| `Encounter` | A clinical visit or interaction |
| `Observation` | Lab results, vital signs, assessments |
| `Condition` | Diagnoses and problems |
| `MedicationRequest` | Medication orders/prescriptions |
| `ServiceRequest` | Lab orders, referrals, procedure requests |
| `DiagnosticReport` | Lab/imaging reports |
| `Appointment` | Scheduled visits |
| `Slot` | Bookable time windows on a Schedule |
| `Schedule` | A provider's availability container |
| `Task` | Workflow tasks |
| `Communication` | Messages between participants |
| `Questionnaire` / `QuestionnaireResponse` | Forms and responses |
| `PlanDefinition` / `CarePlan` | Care templates and patient-specific plans |
| `Bot` | Server-side automation |
| `Subscription` | Webhooks — trigger Bots on resource changes |
| `ClientApplication` | OAuth client for API access |
| `ProjectMembership` | User membership in a project |

### Search Parameter Naming

FHIR search params use **kebab-case**, not camelCase — a common source of 400 errors:

| Wrong | Correct | Resource |
|---|---|---|
| `basedOn` | `based-on` | `DiagnosticReport` |
| `partOf` | `part-of` | `Observation`, `Procedure` |
| `derivedFrom` | `derived-from` | `Observation` |

### Verified Working Queries

```
ServiceRequest?_count=100&_sort=-_lastUpdated
ServiceRequest?subject=Patient/{id}&_sort=-_lastUpdated
Patient?_count=200&_sort=name
DiagnosticReport?based-on=ServiceRequest/{id}
DiagnosticReport?subject=Patient/{id}
Observation?patient=Patient/{id}
Observation?code={code}&patient=Patient/{id}
Immunization?patient=Patient/{id}
MedicationRequest?patient=Patient/{id}
CarePlan?subject=Patient/{id}
Coverage?beneficiary=Patient/{id}
QuestionnaireResponse?source=Patient/{id}&_sort=-authored
```

---

## FHIR Operations — Notes

### `PlanDefinition/$apply`

Must be called as an **instance operation** (type-level returns 404). Pass `subject` as `valueString`:

```
POST /fhir/R4/PlanDefinition/{id}/$apply
{ "resourceType": "Parameters", "parameter": [{ "name": "subject", "valueString": "Patient/<id>" }] }
```

Returns a `CarePlan`. Navigate `CarePlan → activity[0].reference → RequestGroup → action[0].resource → Task` to get the created Task.

### `QuestionnaireResponse/$extract`

Use this for structured data extraction — do not manually iterate items.

```ts
const bundle = await medplum.get(medplum.fhirUrl('QuestionnaireResponse', id, '$extract'));
if (bundle.entry?.length) await medplum.executeBatch(bundle);
```

Requires extraction templates in `Questionnaire.contained`. Without them, returns an empty Bundle.

**Recommended pattern** for questionnaire → DiagnosticReport:
1. Provider submits questionnaire → `QuestionnaireResponse` saved
2. Call `$extract` → creates `Observation` resources
3. Create `DiagnosticReport` with `result` = Observation refs, `basedOn` = ServiceRequest
4. On sign/lock → set DiagnosticReport status to `final`

---

## Bots as Custom Operations

### Patient-scoped vs. admin users

**For patient-scoped users**, call Bots directly via `Bot/{id}/$execute`. OperationDefinition routing (e.g. `Schedule/$proxy-find`) returns `403 Forbidden` for patient tokens — the routing adds a permission check on the resource type that patients cannot pass.

**For practitioner/admin users**, the OperationDefinition pattern (`POST /fhir/R4/{ResourceType}/$operation`) works fine.

```ts
// Patient portal — call Bot directly
medplum.post(medplum.fhirUrl('Bot', BOT_ID, '$execute'), parametersBody); // ✅

// ❌ Forbidden for patients
medplum.post('fhir/R4/Schedule/$proxy-find', parametersBody);
```

### AccessPolicy for Bot execution

Patients need `['read', 'create']` on the Bot resource — `readonly: true` is **not sufficient**:

```json
{ "resourceType": "Bot", "criteria": "Bot?_id=<bot-id>", "interaction": ["read", "create"] }
```

### AccessPolicy `interaction` and `$` operations

Standard `interaction` values: `read`, `search`, `create`, `update`, `delete`, `history`, `vread`.

Custom `$` operations **cannot** be granted via `interaction` — **except `$expand` on `ValueSet`**:
```json
{ "resourceType": "ValueSet", "interaction": ["read", "search", "history", "vread", "$expand"] }
```

### `$find` and SchedulingParameters

- `$find` requires `service-type=system|code` if the Schedule's `SchedulingParameters` includes a `serviceType` sub-extension — without it, returns empty (not an error)
- `duration` must be `valueDuration: { value: N, unit: "h" }` — UCUM-annotated form is not accepted
- Practitioner actor must have `http://hl7.org/fhir/StructureDefinition/timezone` extension (IANA code, e.g. `America/Los_Angeles`) — missing timezone returns 400
- `$find` generates virtual slots dynamically — **do not pre-create free Slot resources** (they expire)
- `availability` must be `valueTiming` with `repeat.dayOfWeek`, `repeat.timeOfDay`, `repeat.duration`, `repeat.durationUnit`
- `timeOfDay` is **local time** relative to the Practitioner's IANA timezone

### Timezone handling — bots must be UTC-transparent

Bots must never perform timezone conversion. Accept ISO 8601 UTC strings and pass them through unchanged:

```js
// ✅ Correct
const searchParams = new URLSearchParams({ start, end });
return medplum.get('fhir/R4/' + scheduleRef + '/$find?' + searchParams);
```

Client-side: send UTC datetimes (`.toISOString()`) and guard against past slots:
```ts
const effectiveStart = start < now.current ? now.current : start;
```

---

## Debugging Bots

Each bot execution emits an `AuditEvent`:

```bash
npx medplum get 'fhir/R4/AuditEvent?entity=Bot/<bot-id>&_sort=-_lastUpdated&_count=20'
```

Or in the app: search `AuditEvent` → filter by `entity = Bot/<bot-id>`.

| Field | Meaning |
|---|---|
| `outcome` | `0` = success, `8` = error |
| `outcomeDesc` | error message or console output |
| `recorded` | execution timestamp |

---

## Inviting Users

### Via CLI (requires interactive user login — NOT ClientApplication auth)

```bash
npx medplum login   # authenticate as a project admin user first
npx medplum project invite --role Patient --send-email <firstName> <lastName> <email>
```

`npx medplum project invite` with ClientApplication (service account) auth returns `403 Forbidden`.

### Via API

```ts
await medplum.post(`admin/projects/${projectId}/invite`, {
  resourceType: 'Patient',
  firstName,
  lastName,
  email,
  scope: 'project',           // 'project' = scoped to this project; 'server' = global user
  accessPolicy: { reference: 'AccessPolicy/<id>' },
  sendEmail: true,
});
```

Always check for an existing Patient with that email first to avoid duplicates:
```ts
const existing = await medplum.searchResources('Patient', { email });
if (existing.length > 0) { /* skip invite */ }
```

---

## Project Setup (Sample Hospital Demo)

Both portals connect to **Medplum Cloud** at `https://api.medplum.com/`.

- **Project ID:** `<your-project-id>`
- **Client ID:** `<your-client-id>` (stored in `.env` as `VITE_MEDPLUM_CLIENT_ID`)
- **Client Secret:** server-side only — never in frontend code

### WebSockets (required for messaging)

`ThreadInbox` and `BaseChat` require WebSockets. Enable at:
`app.medplum.com` → Admin → Project → Settings → **Enable WebSockets** → Save.

### Environment Variables

```bash
cp .env.example .env   # fill in VITE_MEDPLUM_CLIENT_ID
```

`.env` is gitignored — never commit it.

---

## Portals

| Portal | Port | Directory |
|---|---|---|
| Provider Portal | 3000 | `provider-portal/` |
| Patient Portal | 3001 | `patient-portal/` |
| Employer Portal | 3002 | `employer-portal/` |

```bash
cd provider-portal && npm run dev   # → http://localhost:3000
cd patient-portal  && npm run dev   # → http://localhost:3001
cd employer-portal && npm run dev   # → http://localhost:3002
```

---

## Routing Convention

Route paths must mirror the FHIR resource name exactly (PascalCase). Example:

| Route | FHIR Resource | Display Label |
|---|---|---|
| `/Patient` | `Patient` | Patients (or Employees, Members, etc.) |
| `/Patient/:id` | `Patient` | Patient detail |
| `/ServiceRequest` | `ServiceRequest` | Orders / Authorizations |
| `/ServiceRequest/:id` | `ServiceRequest` | Order detail |
| `/ServiceRequest/new` | `ServiceRequest` | New Order |

Non-resource routes (e.g. `/` Dashboard) are exempt.

---

## Patient Access Policy

- **Name:** Sample Hospital Patient Access Policy
- **ID:** `<your-access-policy-id>`

| Resource | Access | Filter |
|---|---|---|
| `Patient` | Read/Write | Own record only (`%patient.id`) |
| `ServiceRequest` | Read/Write | subject = patient |
| `Communication` | Read/Write | subject = patient |
| `DiagnosticReport` | Read/Write | subject = patient |
| `Observation` | Read/Write | subject = patient |
| `Immunization` | Read/Write | patient = patient |
| `MedicationRequest` | Read/Write | subject = patient |
| `QuestionnaireResponse` | Read/Write | subject = patient |
| `Appointment` | Read/Write | patient = patient |
| `Questionnaire` | Read-only | All |
| `Schedule` | read, search, vread | All |
| `Slot` | Read-only | All |
| `Practitioner` | Read-only | All |
| `ValueSet` | Read-only + `$expand` | All |
| `CodeSystem` | Read-only | All |

Assign when inviting patients:
```json
{ "resourceType": "ProjectMembership", "accessPolicy": { "reference": "AccessPolicy/<your-access-policy-id>" } }
```

---

## Project Bots

| Bot | ID | How to Call | Purpose |
|---|---|---|---|
| `proxy-find-bot` | `<proxy-find-bot-id>` | `POST /fhir/R4/Bot/{id}/$execute` | Proxies `Schedule/$find` for patient-scoped users |
| `book-bot` | `<book-bot-id>` | `POST /fhir/R4/Bot/{id}/$execute` | Books slot + patches Appointment to add patient participant |

**Why `book-bot` is needed:** `Appointment/$book` does not add the patient as a participant. Without the patient participant, the patient's AccessPolicy filter blocks them from reading/updating the Appointment.

Source files: `bots/proxy-find-bot.js`, `bots/book-bot.js`

---

## Custom Theme Pattern

Example of a custom brand color palette with Mantine:

```ts
const brandColor = ['#FFF0EB','#FFD5C8','#FFB8A3','#FF997E','#FF7A59','#F55C37','#E8411E','#C8371A','#A82D15','#882210'];
createTheme({ primaryColor: 'brandColor', primaryShade: 6, colors: { brandColor } })
```

Shade 6 is the primary action color. Apply consistently across all portals.

---

## Known Installation Gotchas

- **Provider portal** — requires `npm install --legacy-peer-deps` (`@medplum/dosespot-core` is not on the public npm registry)
- **`@medplum/react-hooks` may not auto-install** with `--legacy-peer-deps` — install explicitly: `npm install @medplum/react-hooks@5.1.0 --legacy-peer-deps`
- **`clientId` required** — without it, Medplum Cloud login returns 400 Bad Request
- **Vite does not hot-reload new packages** — fully restart the dev server after installing
- **SVG/PNG imports** need module declarations in `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
declare module '*.svg' { const src: string; export default src; }
declare module '*.png' { const src: string; export default src; }
```

---

## Self-Hosting Options

| Method | Best For | Docs |
|---|---|---|
| Docker Compose | Quick local dev, demos | https://www.medplum.com/docs/self-hosting/running-full-medplum-stack-in-docker |
| Ubuntu APT | Single-server production | https://www.medplum.com/docs/self-hosting/install-on-ubuntu |
| AWS CDK | Scalable cloud production | https://www.medplum.com/docs/self-hosting/install-on-aws |

Full server config reference: https://www.medplum.com/docs/self-hosting/server-config

---

## Key Documentation Links

| Topic | URL |
|---|---|
| Getting Started | https://www.medplum.com/docs |
| FHIR Basics | https://www.medplum.com/docs/fhir-basics |
| Search | https://www.medplum.com/docs/search |
| Auth | https://www.medplum.com/docs/auth |
| Access Control | https://www.medplum.com/docs/access |
| React Components | https://www.medplum.com/docs/react |
| Storybook | https://storybook.medplum.com/ |
| Bots | https://www.medplum.com/docs/bots |
| Subscriptions | https://www.medplum.com/docs/subscriptions |
| CLI | https://www.medplum.com/docs/cli |
| SDK Reference | https://www.medplum.com/docs/sdk/core.medplumclient |
| GraphQL | https://www.medplum.com/docs/graphql |
| Scheduling | https://www.medplum.com/docs/scheduling |
| Questionnaires | https://www.medplum.com/docs/questionnaires |
| Care Planning | https://www.medplum.com/docs/careplans |
| Messaging | https://www.medplum.com/docs/communications |
| Billing | https://www.medplum.com/docs/billing |
| Self-Hosting | https://www.medplum.com/docs/self-hosting |
| API Reference | https://www.medplum.com/docs/api |
