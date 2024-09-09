<h1 align="center">Medplum Charting Demo</h1>
<p align="center">A starter application for building a charting app on Medplum.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-hello-world/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

This example app demonstrates the following:

- Managing the lifecylce of an encounter and its corresponding notes.
- Creating and displaying Encounter Notes using the [`ClinicalImpression`](/docs/api/fhir/resources/clinicalimpression) resource.
- Converting notes into structured data ([`Observations`](/docs/api/fhir/resources/observation) and [`Conditions`](/docs/api/fhir/resources/condition)) for easy retrieval and longitudinal tracking.
- Using [Medplum React Components](https://storybook.medplum.com/?path=/docs/medplum-introduction--docs) to display a chart that provides visibility on a patient and their medical encounters.
  - More information on a [charting experience](https://www.medplum.com/docs/charting)

### Code Organization

This repo is organized into two main directories: `src` and `data`.

The `src` directory contains the React app that implements the charting UX. In addition, it contains a `bots` directory, which has [Medplum Bots](/packages/docs/docs/bots/bot-basics.md) to implement the parsing of notes into structured data.

The `data` directory contains data that can be uploaded for use in the demo. The `example` directory contains data that is meant to be used for testing and learning, while the `core` directory contains resources, terminologies, and more that are necessary to use the demo.

### Components of the Encounter Chart

The Encounter Chart has 3 distinct panels

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

2. Encounter Note
   The center panel allows users to create a note or view it if it already exists. The note allows users to:

- Enter objective data about the condition relevant to the encounter.
- Enter subjective data about symptoms that the patient is experiencing.
- Add their own free text notes about the encounter.
- Store contextualizing data such as the date of the encounter.

3. Encounter Actions
   The right-hand panel allows users to make changes to the encounter, including editing the type of encounter.

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum-hello-world/fork) and clone the repo.

Next, install the dependencies.

```bash
npm install
```

Then, build the bots

```bash
npm run build:bots
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
