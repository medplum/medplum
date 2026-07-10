<h1 align="center">Medplum Provider</h1>
<p align="center">A starter application for building a health record system on Medplum.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-hello-world/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

This example app demonstrates the following:

- Using [Medplum React Components](https://storybook.medplum.com/?path=/docs/medplum-introduction--docs) to display a chart that provides visibility on a patient
  - More information on a [charting experience](https://www.medplum.com/docs/charting)
- Using [Medplum GraphQL](https://graphiql.medplum.com/) queries to fetch linked resources

### Workflows

The application will feature the following core workflows:

- Visit documentation
- Task creation and assignment
- Appointment scheduling
- Patient registration/onboarding
- Lab orders
- Ordering medications
- Claim creation and billing
- Patient/Provider Messaging

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum-provider/fork) and clone the repo. Alternatively, this app lives in the [Medplum monorepo](https://github.com/medplum/medplum) at `examples/medplum-provider` — if you are working from the monorepo, run `npm ci` and `npm run build` at the repo root first so the workspace packages are built.

Next, install the dependencies.

```bash
npm install
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3001/`

By default, the app connects to the hosted Medplum service at `https://api.medplum.com/`.

### Running against a local Medplum server

To run against a Medplum server on your own machine, follow the [Run the stack](https://www.medplum.com/docs/contributing/run-the-stack) guide to start the API server on port 8103, then edit `.env` in this directory:

```
MEDPLUM_BASE_URL=http://localhost:8103/
```

Restart `npm run dev` after changing `.env`.

### A note on value sets

Some fields in this app (diagnoses, medications, race/ethnicity, and others) autocomplete against clinical terminologies such as ICD-10, RxNorm, and US Core / VSAC value sets. On hosted Medplum, these are provided by shared projects [linked](https://www.medplum.com/docs/access/projects#project-linking) into your project. A fresh self-hosted or local server includes only the base FHIR R4 terminology, so these fields will show a "ValueSet not found" message inline and you will need to enter codes manually. To enable them, upload the value sets and import their code systems into a shared project (see [`CodeSystem/$import`](https://www.medplum.com/docs/api/fhir/operations/codesystem-import)) and link that project, or contact Medplum for access to the hosted terminology.

### About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://storybook.medplum.com/)
- Join our [Discord](https://discord.gg/medplum)
