<h1 align="center">Medplum Charting Demo</h1>
<p align="center">A starter application for building a charting app on Medplum.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-hello-world/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

This example app demonstrates the following:

- Using [Medplum React Components](https://storybook.medplum.com/?path=/docs/medplum-introduction--docs) to display a chart that provides visibility on a patient
- Using [Medplum GraphQL](https://graphiql.medplum.com/) queries to fetch linked resources

### What This Chart Shows 

The Patient Chart has 3 distinct panels

1. Clinical Chart
  The Clinical Chart Summarizes the patient history and their status. Notable information in the clinical chart includes the following Resources:
  - Upcoming Appointments
  - Documented Visits 
  - List of Allergies
  - List of Problems
  - Medication Requests
  - Smoking Status
  - Vitals 

2. Tasks
  The Center Panel is a Task list that has a 

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/app/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum-hello-world/fork) and clone the repo.

Next, install the dependencies

```bash
npm install
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3000/`

### About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting, and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://docs.medplum.com/storybook/index.html?)
- Join our [Discord](https://discord.gg/medplum)
