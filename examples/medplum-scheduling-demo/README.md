<h1 align="center">Medplum Scheduling Demo</h1>
<p align="center">A starter application for building a scheduling app on Medplum.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-hello-world/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

This example app demonstrates the following:

- How to build a scheduling app on Medplum for providers that manages the lifecycle of appointments, integrates with patient and practitioner data.
- Creating [`Slots`](/docs/api/fhir/resources/slot) to manage the provider availability.
- Managing the [`Appointment`](/docs/api/fhir/resources/appointment) lifecycle: Creating, rescheduling, and canceling appointments.
- Creating an [`Encounter`](/docs/api/fhir/resources/encounter) after an appointment is completed.
- Using [Medplum React Components](https://storybook.medplum.com/?path=/docs/medplum-introduction--docs) to build a scheduling app.

### Code Organization

This repo is organized into two main directories: `src` and `data`.

The `src` directory contains the entire app, including `pages` and `components` directories. In addition, it contains a `bots` directory which has [Medplum Bots](/packages/docs/docs/bots/index.md) for use. The bots in the `example` directory are intended to be modified or extended by users, while those in `core` can be used to handle core workflows without modification.

The `data` directory contains data that can be uploaded for use in the demo. The `example` directory contains data that is meant to be used for testing and learning, while the `core` directory contains resources, terminologies, and more that are necessary to use the demo.

### UI and components

- Patients page listing all the patients in the system.
- Patients chart page with 3 panels:
  - Clinical Chart
  - Details (including Appointments and Encounters)
  - Actions (with a button to create a new appointment)
- Schedule page to manage the provider availability and create new appointments.
- Appointment page listing all appointments for the provider.
- Appointment details page to view and manage the appointment lifecycle.

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum-scheduling-demo/fork) and clone the repo to your local machine.

If you want to change any environment variables from the defaults, copy the `.env.defaults` file to `.env`

```bash
cp .env.defaults .env
```

And make the changes you need.

Next, install the dependencies.

```bash
npm install
```

Then, build the bots

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

Click `Upload Core ValueSets` in the app navigation menu and then click the upload button.
Click `Upload Example Bots` in the app navigation menu and then click the upload button.
[Optional] Click `Upload Example Data` in the app navigation menu and then click the upload button.

### About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://storybook.medplum.com/)
- Join our [Discord](https://discord.gg/medplum)
