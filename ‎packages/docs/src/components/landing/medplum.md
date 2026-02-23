# Medplum Developer Reference

> **Purpose:** This file is designed to be given to an AI coding agent (e.g., Claude Code, Cursor, Copilot) to help it understand the Medplum platform and spin up a Medplum project. It contains architecture details, setup instructions, key APIs, and links to documentation.

---

## What is Medplum?

Medplum is an open-source, FHIR-native healthcare developer platform. It provides a complete backend for building healthcare applications — including a clinical data repository, FHIR API, authentication, authorization, server-side logic (Bots), and a React UI component library.

- **License:** Apache 2.0
- **Language:** Full-stack TypeScript (Node.js + React)
- **Repository:** https://github.com/medplum/medplum
- **Latest Version:** v5.x (as of early 2026)
- **Documentation:** https://www.medplum.com/docs
- **Blog (release notes):** https://www.medplum.com/blog *(authoritative source — if docs and blog conflict, trust the blog)*
- **Storybook (React Components):** https://storybook.medplum.com/
- **Discord:** https://discord.gg/medplum

### Core Components

| Component | Description |
|---|---|
| **Medplum CDR (Server)** | FHIR R4 compliant clinical data repository. Hosts healthcare data in a secure, compliant backend. |
| **Medplum API** | RESTful FHIR API + GraphQL for reading, writing, and searching clinical data. |
| **Medplum Auth** | OAuth 2.0 / OpenID Connect / SMART-on-FHIR identity and access management. |
| **Medplum SDK (`@medplum/core`)** | TypeScript client library for interacting with the API from browser, Node.js, or Bots. |
| **Medplum React (`@medplum/react`)** | Pre-built React components for clinical UIs (patient timelines, resource forms, search, etc). |
| **Medplum Bots** | Server-side TypeScript functions triggered by FHIR Subscriptions or manual invocation. |
| **Medplum CLI (`@medplum/cli`)** | Command-line tool for managing projects, deploying Bots, bulk import/export. |
| **Medplum App** | Admin web app at https://app.medplum.com for managing projects and resources. |
| **Medplum Provider** | Out-of-the-box EHR web app at https://provider.medplum.com for clinical users. |

---

## Quick Start Options

There are two primary ways to get started:

### Option A: Use Medplum Cloud (Fastest)

Connect your app to Medplum's hosted service — no backend setup needed.

1. Register at https://app.medplum.com
2. Create a new Project
3. Build your app using the SDK packages (see [NPM Packages](#npm-packages) below)

## NPM Packages

These are the packages you'll use when building apps on top of Medplum:

### Core Packages

```bash
npm install @medplum/core @medplum/fhirtypes
```

| Package | NPM | Description |
|---|---|---|
| `@medplum/core` | https://www.npmjs.com/package/@medplum/core | MedplumClient SDK, FHIR utilities, auth helpers |
| `@medplum/fhirtypes` | https://www.npmjs.com/package/@medplum/fhirtypes | TypeScript type definitions for FHIR R4 resources |

### React Packages

```bash
npm install @medplum/react @medplum/react-hooks
npm install -D @mantine/core @mantine/hooks @mantine/notifications
```

| Package | NPM | Description |
|---|---|---|
| `@medplum/react` | https://www.npmjs.com/package/@medplum/react | Pre-built React components (ResourceTable, PatientTimeline, SearchControl, etc.) |
| `@medplum/react-hooks` | https://www.npmjs.com/package/@medplum/react-hooks | React hooks (useMedplum, useMedplumContext, useSearch, etc.) |

Medplum React components are built on [Mantine v8](https://mantine.dev/) (upgraded from v7 in Medplum v5) and use PostCSS. You will also need React 19+ and React Router v6+.

### CLI

```bash
npm install -g @medplum/cli
# or use npx
npx medplum <command>
```

### Mock (for testing)

```bash
npm install -D @medplum/mock
```

---

## Building a New App on Medplum

### Minimal React App Setup

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
  // For Medplum Cloud:
  // baseUrl: 'https://api.medplum.com/',
  // For local development:
  // baseUrl: 'http://localhost:8103/',
  onUnauthenticated: () => (window.location.href = '/'),
});

const theme = createTheme({
  /** Customize Mantine theme here */
});

const root = createRoot(document.getElementById('root') as HTMLDivElement);
root.render(
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

### Common SDK Operations

```typescript
import { MedplumClient } from '@medplum/core';
import { Patient, Encounter } from '@medplum/fhirtypes';

const medplum = new MedplumClient({ baseUrl: 'http://localhost:8103/' });

// Authenticate
await medplum.startLogin({ email: 'admin@example.com', password: 'medplum_admin' });

// Create a Patient
const patient = await medplum.createResource<Patient>({
  resourceType: 'Patient',
  name: [{ given: ['Jane'], family: 'Doe' }],
});

// Read a resource
const fetched = await medplum.readResource('Patient', patient.id!);

// Search for resources
const bundle = await medplum.searchResources('Patient', { name: 'Jane' });

// Update a resource
await medplum.updateResource({ ...patient, birthDate: '1990-01-15' });

// Delete a resource
await medplum.deleteResource('Patient', patient.id!);

// GraphQL query
const result = await medplum.graphql(`{
  PatientList(name: "Jane") {
    id
    name { given family }
  }
}`);
```

### Writing a Bot

Bots are server-side TypeScript functions. They receive a `MedplumClient` and a `BotEvent`:

```typescript
// src/my-bot.ts
import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const name = patient.name?.[0];
  console.log(`New patient: ${name?.given?.[0]} ${name?.family}`);

  // Bots can create/read/update/delete resources
  await medplum.createResource({
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    description: `Welcome task for ${name?.given?.[0]}`,
    for: { reference: `Patient/${patient.id}` },
  });

  return true;
}
```

Deploy with the CLI:

```bash
export MEDPLUM_CLIENT_ID=<your-client-id>
export MEDPLUM_CLIENT_SECRET=<your-client-secret>
npm run build
npx medplum bot deploy my-bot
```

---

## Example Applications

Medplum maintains several example applications that demonstrate real-world patterns:

### Medplum Provider (EHR)

A full-featured, open-source provider-facing EHR application.

- **Repository:** https://github.com/medplum/medplum-provider
- **Live Demo:** https://provider.medplum.com
- **Docs:** https://www.medplum.com/docs/provider

**Features:** Patient charting, visit documentation, scheduling, task management, lab orders, messaging, billing/claims (CMS 1500), care templates (PlanDefinition-based workflows).

**Setup:**

```bash
git clone https://github.com/medplum/medplum-provider.git
cd medplum-provider
npm install
npm run dev
# Opens at http://localhost:3000
# Sign in with your Medplum Cloud or local server credentials
```

### Medplum Hello World

Minimal starter app demonstrating patient list and details.

- **Repository:** https://github.com/medplum/medplum-hello-world

```bash
git clone https://github.com/medplum/medplum-hello-world.git
cd medplum-hello-world
cp .env.defaults .env   # edit if needed
npm install
npm run dev
```

### Scheduling Demo

Appointment booking, slot management, and encounter creation.

- **Repository:** https://github.com/medplum/medplum-scheduling-demo

### Other Examples

The `examples/` directory in the main monorepo contains additional code samples used in documentation. Browse at: https://github.com/medplum/medplum/tree/main/examples

---

## FHIR Essentials for Agents

FHIR (Fast Healthcare Interoperability Resources) is the data standard Medplum is built on. Key concepts:

### Resource Types You'll Use Most

| Resource | Purpose |
|---|---|
| `Patient` | Core patient demographics |
| `Practitioner` | Healthcare provider/clinician |
| `Encounter` | A clinical visit or interaction |
| `Observation` | Lab results, vital signs, assessments |
| `Condition` | Diagnoses and problems |
| `MedicationRequest` | Medication orders/prescriptions |
| `ServiceRequest` | Lab orders, referrals, procedure requests |
| `DiagnosticReport` | Lab reports, imaging reports |
| `Appointment` | Scheduled visits |
| `Task` | Workflow tasks and to-dos |
| `Communication` | Messages between participants |
| `Questionnaire` / `QuestionnaireResponse` | Forms and their responses |
| `PlanDefinition` | Care plan templates (Care Templates in Provider app) |
| `CarePlan` | Patient-specific care plans |
| `Subscription` | Webhooks — trigger Bots on resource changes |
| `Bot` | Server-side automation logic |
| `ClientApplication` | OAuth client for API access |
| `ProjectMembership` | User membership in a project |

### FHIR Search

Medplum supports the full FHIR search specification:

```
GET /fhir/R4/Patient?name=Jane&birthdate=1990-01-15
GET /fhir/R4/Observation?patient=Patient/123&code=http://loinc.org|55284-4
GET /fhir/R4/Encounter?_sort=-date&_count=10
```

SDK equivalent:

```typescript
const patients = await medplum.searchResources('Patient', {
  name: 'Jane',
  birthdate: '1990-01-15',
});
```

### FHIR Documentation

- Medplum FHIR Basics: https://www.medplum.com/docs/fhir-basics
- Medplum Search Docs: https://www.medplum.com/docs/search
- Medplum FHIR API Reference: https://www.medplum.com/docs/api/fhir
- Official FHIR R4 Spec: https://hl7.org/fhir/R4/

---

## Server Configuration

The Medplum server can be configured via JSON file or environment variables.

### JSON Config (`medplum.config.json`)

```json
{
  "baseUrl": "http://localhost:8103/",
  "port": 8103,
  "database": {
    "host": "localhost",
    "port": 5432,
    "dbname": "medplum",
    "username": "medplum",
    "password": "medplum"
  },
  "redis": {
    "host": "localhost",
    "port": 6379
  }
}
```

### Environment Variables

All config keys can be set as environment variables prefixed with `MEDPLUM_`, using `ALL_CAPS_SNAKE_CASE`:

```bash
export MEDPLUM_BASE_URL="http://localhost:8103/"
export MEDPLUM_PORT=8103
export MEDPLUM_DATABASE_HOST="localhost"
export MEDPLUM_DATABASE_PORT=5432
export MEDPLUM_DATABASE_DBNAME="medplum"
export MEDPLUM_DATABASE_USERNAME="medplum"
export MEDPLUM_DATABASE_PASSWORD="medplum"
export MEDPLUM_REDIS_HOST="localhost"
export MEDPLUM_REDIS_PORT=6379
```

Full config reference: https://www.medplum.com/docs/self-hosting/server-config

---

## Self-Hosting Options

| Method | Best For | Docs |
|---|---|---|
| **Docker Compose Full Stack** | Quick local dev, demos | https://www.medplum.com/docs/self-hosting/running-full-medplum-stack-in-docker |
| **Install on Ubuntu** | Single-server production (uses APT repo) | https://www.medplum.com/docs/self-hosting/install-on-ubuntu |
| **AWS CDK** | Scalable cloud production | https://www.medplum.com/docs/self-hosting/install-on-aws |
| **GCP / Azure** | Cloud alternatives | https://www.medplum.com/docs/self-hosting/install-on-gcp |
| **Install from Scratch** | Learning / custom setups | https://www.medplum.com/docs/self-hosting/install-from-scratch |

---

## Key Documentation Links

| Topic | URL |
|---|---|
| **Getting Started** | https://www.medplum.com/docs |
| **Tutorials** | https://www.medplum.com/docs/tutorials |
| **FHIR Basics** | https://www.medplum.com/docs/fhir-basics |
| **FHIR Datastore (CRUD)** | https://www.medplum.com/docs/fhir-datastore |
| **Search** | https://www.medplum.com/docs/search |
| **Authentication** | https://www.medplum.com/docs/auth |
| **Authorization & Access Control** | https://www.medplum.com/docs/access |
| **React Components** | https://www.medplum.com/docs/react |
| **React Component Storybook** | https://storybook.medplum.com/ |
| **Bots (Server-side logic)** | https://www.medplum.com/docs/bots |
| **Bots in Production** | https://www.medplum.com/docs/bots/bots-in-production |
| **Subscriptions (Webhooks)** | https://www.medplum.com/docs/subscriptions |
| **CLI Reference** | https://www.medplum.com/docs/cli |
| **SDK / MedplumClient** | https://www.medplum.com/docs/sdk/core.medplumclient |
| **GraphQL** | https://www.medplum.com/docs/graphql |
| **GraphiQL IDE** | https://graphiql.medplum.com/ |
| **Charting** | https://www.medplum.com/docs/charting |
| **Scheduling** | https://www.medplum.com/docs/scheduling |
| **Medications** | https://www.medplum.com/docs/medications |
| **Labs & Imaging** | https://www.medplum.com/docs/labs-imaging |
| **Messaging** | https://www.medplum.com/docs/communications |
| **Billing** | https://www.medplum.com/docs/billing |
| **Care Planning** | https://www.medplum.com/docs/careplans |
| **Questionnaires** | https://www.medplum.com/docs/questionnaires |
| **Provider App Docs** | https://www.medplum.com/docs/provider |
| **Integrations** | https://www.medplum.com/docs/integration |
| **SMART on FHIR** | https://www.medplum.com/docs/integration/smart-app-launch |
| **Self-Hosting** | https://www.medplum.com/docs/self-hosting |
| **Server Config** | https://www.medplum.com/docs/self-hosting/server-config |
| **Contributing** | https://www.medplum.com/docs/contributing |
| **Run the Stack** | https://www.medplum.com/docs/contributing/run-the-stack |
| **API Reference** | https://www.medplum.com/docs/api |
| **Compliance** | https://www.medplum.com/docs/compliance |

---

## Agent Instructions: Common Tasks

Below are step-by-step playbooks for common tasks an AI agent might perform.

### Task: Set Up a New App Against Medplum Cloud

```bash
# 1. Create project
mkdir my-medplum-app && cd my-medplum-app
npm init -y

# 2. Install dependencies
npm install @medplum/core @medplum/fhirtypes @medplum/react @medplum/react-hooks
npm install @mantine/core @mantine/hooks @mantine/notifications
npm install react react-dom react-router
npm install -D typescript vite @vitejs/plugin-react postcss postcss-preset-mantine

# 3. Configure TypeScript
npx tsc --init --target es2022 --module esnext --jsx react-jsx --moduleResolution bundler --strict

# 4. User registers at https://app.medplum.com and creates a Project
# 5. Use MedplumClient with baseUrl: 'https://api.medplum.com/' (default)
```

### Task: Run the Provider App (Standalone)
git clone https://github.com/medplum/medplum-provider.git

```bash
# 1. Find directory
cd medplum-provider

#2. Build and deploy 
npm install
npm run dev

#3. Open at http://localhost:3000
#   Connects to Medplum Cloud by default
#   Sign in with your Medplum account credentials
```

### Task: Use the Medplum CLI

```bash
#1. Install the CLI
npm install -g @medplum/cli

#2. Login to Medplum
medplum login

#3. This opens an OAuth flow in your browser — follow the prompts to authenticate

#4. Verify login
medplum whoami
```

### Task: Create and Deploy a Bot

```bash
# 1. Set up credentials
export MEDPLUM_CLIENT_ID=<your-client-id>
export MEDPLUM_CLIENT_SECRET=<your-client-secret>

# 2. Write your bot (see Writing a Bot section above)

# 3. Build and deploy
npm run build
npx medplum bot deploy <bot-name>

# 4. Create a Subscription in the Medplum App to trigger the bot
#    (e.g., trigger on Patient create/update)
```

---

## Version Notes (v5.x)

Medplum v5 (released October 2025) includes important changes:

- **Node.js 22+** required (Node 20 deprecated; tested on 22 and 24)
- **PostgreSQL 14+** required (Postgres 13 dropped; tested on 14 and 18)
- **Redis 7+** required (Redis 6 dropped)
- **React 19** required (React 18 dropped)
- **ES Modules (ESM)** by default — SDK packages are dual-published as CJS+ESM, but ESM is recommended
- **Mantine v8** — UI component library upgraded from v7
- **Express v5** — Backend server framework upgrade
- **Storybook v9** — Component documentation upgrade

If starting a new project, use ESM (`"type": "module"` in package.json).

> **Note:** If there are discrepancies between the Medplum docs and the [Medplum blog](https://www.medplum.com/blog), **always trust the blog release notes** — they contain the latest authoritative information about the platform. Documentation pages can become outdated between releases. For example, the "Run the Stack" contributing guide may still reference Node.js 20+, but the [v5 release blog](https://www.medplum.com/blog/v5-release) confirms Node 20 is deprecated.

---

## Getting Help

- **Documentation:** https://www.medplum.com/docs
- **Discord Community:** https://discord.gg/medplum
- **GitHub Issues:** https://github.com/medplum/medplum/issues
- **GitHub Discussions:** https://github.com/medplum/medplum/discussions
- **Email:** support@medplum.com
