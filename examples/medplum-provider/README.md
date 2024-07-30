<h1 align="center">Medplum Charting Demo</h1>
<p align="center">A starter application for building a charting app on Medplum.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-hello-world/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

This example app demonstrates the following:

- Using [Medplum React Components](https://storybook.medplum.com/?path=/docs/medplum-introduction--docs) to display a chart that provides visibility on a patient
  - More information on a [charting experience](https://www.medplum.com/docs/charting)
- Using [Medplum GraphQL](https://graphiql.medplum.com/) queries to fetch linked resources

### Components of the Patient Chart

The Patient Chart has 3 distinct panels

1. Clinical Chart
   The left panel shows the patient history and their status. Notable information in the clinical chart includes the following Resources:

   - Patient Information
   - Upcoming Appointments
   - Documented Visits
   - List of Allergies
   - List of Problems
   - Medication Requests
   - Smoking Status
   - Vitals

2. Tasks
   The center panel shows list of the Task resource with a different focus resource. See our [Tasks Guide](https://www.medplum.com/docs/careplans/tasks) for more details.

   - Each focus is interactive to either review or fill out
   - This example project demonstrates interactions of the following resources:
     - Questionnaire
     - QuestionnaireResponse
     - DiagnosticReport
     - CarePlan

3. SOAP Note
   The right most panel documents an encounter with the patient through a questionnaire. Filling out and submitting the questionnaire automatically creates a task, with the response as the focus to be reviewed.

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum-hello-world/fork) and clone the repo.

Next, install the dependencies.

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

Medplum supports self-hosting and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://docs.medplum.com/storybook/index.html?)
- Join our [Discord](https://discord.gg/medplum)
