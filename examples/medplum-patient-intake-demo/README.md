<h1 align="center">Medplum Patient Intake Demo</h1>
<p align="center">A starter application for building a patient intake app on Medplum.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-hello-world/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

This example app demonstrates the following:

- How to build a patient intake form on Medplum collecting demographics, coverage, Social Determinants of Health, languages and consent information.
- Converting the form data into structured data ([`Patient`](/docs/api/fhir/resources/patient), [`Coverage`](/docs/api/fhir/resources/coverage), [`Observation`](/docs/api/fhir/resources/observation)) for easy retrieval and longitudinal tracking.
- Implementing conditional flows in questionnaires.
- Using [Medplum React Components](https://storybook.medplum.com/?path=/docs/medplum-introduction--docs) to build a patient intake form.

### Code Organization

This repo is organized into two main directories: `src` and `data`.

The `src` directory contains the React app that implements the intake form UX. In addition, it contains a `bots` directory, which has [Medplum Bots](/packages/docs/docs/bots/bot-basics.md) to implement the parsing of the questionnaire response into structured data.

The `data` directory contains data that can be uploaded for use in the demo. The `example` directory contains data that is meant to be used for testing and learning, while the `core` directory contains resources, terminologies, and more that are necessary to use the demo.

### UI and components

- Patients page listing all the patients in the system
- Patients chart page page with 3 panels:
  - Clinical Chart
  - Details (including SDOH and Consents)
  - Actions (with a button to fill in the intake form)
- Patient intake form page to fill in the intake questionnaire
- Intake form customization page where it's possible to edit fields of the intake form.

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum/) and clone the repo to your local machine.

Navigate to the patient intake demo example directory.

```bash
cd examples/medplum-patient-intake-demo
```

Install the dependencies for the demo app.

```bash
npm install
```

Build the bots:

> [!WARNING]
> Bots are not on by default for Medplum projects, make sure they are enabled before proceeding.

```bash
npm run build:bots
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3000/`

### Uploading sample data

Click `Upload Core data` in the app navigation menu and then click the upload button.
Click `Upload Example Bots` in the app navigation menu and then click the upload button.
[Optional] Click `Upload Example data` in the app navigation menu and then click the upload button.

### About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://docs.medplum.com/storybook/index.html?)
- Join our [Discord](https://discord.gg/medplum)
