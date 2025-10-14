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
- Using **Structured Data Capture (SDC)** with the `$extract` operation to automatically generate FHIR resources from questionnaire responses.

### Code Organization

This repo is organized into two main directories: `src` and `data`.

The `src` directory contains the React app that implements the intake form UX. The questionnaire uses **Structured Data Capture (SDC)** extensions to define how form responses should be automatically converted into FHIR resources using the `$extract` operation.

The `data` directory contains data that can be uploaded for use in the demo. The `example` directory contains data that is meant to be used for testing and learning, while the `core` directory contains resources, terminologies, and more that are necessary to use the demo.

### UI and components

- **Patients page**: Listing all the patients in the system
- **Patient chart page**: With 3 panels:
  - Clinical Chart (allergies, medications, conditions, immunizations)
  - Details (demographics, SDOH observations, and consents)
  - Actions (with a button to fill in the intake form)
- **Patient intake form page**: Interactive questionnaire form using Medplum React components
- **Search page**: Find and view specific patients and resources
- **Upload data page**: Upload core data, questionnaires, and example data

The intake form automatically generates FHIR resources using SDC when submitted, creating Patient, Coverage, Observation, Consent, and other related resources without requiring custom processing code.

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum-patient-intake-demo/fork) and clone the repo to your local machine.

If you want to change any environment variables from the defaults, copy the `.env.defaults` file to `.env`

```bash
cp .env.defaults .env
```

And make the changes you need.

Next, install the dependencies.

```bash
npm install
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3000/`

### Uploading sample data

1. Click `Upload Core data` in the app navigation menu and then click the upload button.
2. Click `Upload Questionnaire data` in the app navigation menu and then click the upload button.
3. [Optional] Click `Upload Example data` in the app navigation menu and then click the upload button.

### How SDC and $extract Work

This demo uses **Structured Data Capture (SDC)** to automatically convert questionnaire responses into FHIR resources:

- **SDC Extensions**: The questionnaire contains SDC extensions that define how each form field should map to FHIR resource properties
- **$extract Operation**: When a questionnaire response is submitted, the `$extract` operation processes the response and automatically creates the appropriate FHIR resources (Patient, Coverage, Observations, etc.)
- **No Manual Processing**: Unlike traditional approaches that require custom code to parse form data, SDC handles the conversion automatically based on the questionnaire definition

The questionnaire in `data/core/patient-intake-questionnaire-full-sdc.json` contains extensive SDC extensions that define the complete mapping from form fields to FHIR resources.

### About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://storybook.medplum.com/)
- Join our [Discord](https://discord.gg/medplum)
