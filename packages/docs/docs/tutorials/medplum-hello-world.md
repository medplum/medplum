---
sidebar_position: 4
sidebar_label: Medplum Hello World
---

# Medplum Hello World

Digital health companies often build custom UIs on top of the Medplum platform to design streamlined patient and physician experiences. This tutorial will cover to run the **Medplum "Hello World"** example, a simple [React](https://reactjs.org/) app that visualizes patient information.

Hello World is built with Medplum's [React Component](https://storybook.medplum.com/?path=/docs/medplum-introduction--docs) library, which is a great resource for rapid prototyping and building internal tools.

## Clone and Run the App

This tutorial assumes you have already:

- Registered for a Medplum account. (If not [registration instructions](./register.md))
- Imported one or more sample patients. (If not [import sample data](/docs/tutorials/importing-sample-data.md))

First, make sure you have Node JS and npm installed. If not, follow instructions [here](https://nodejs.org/en/download/).

Next, clone the Medplum Hello World repo

```bash
git clone https://github.com/medplum/medplum-hello-world.git
cd medplum-hello-world
```

Next, install the dependencies

```bash
npm install
```

Then, run the app

```bash
npm run dev
```

You should be able to access the Hello World app at [http://localhost:3000/](http://localhost:3000/). You can stop the Node JS process using `Ctrl+C`.

## Explore Medplum Hello World

The Medplum Hello World demo is a simple application that presents a list of current patients, along with detailed patient information.

In this section, we'll familiarize ourselves with functionality of the Hello World demo. Follow-on tutorials will dive deeper into how the app was built.

### Sign-in

The first page of the demo asks you to sign in using the Medplum credentials you set up in the the [registration tutorial](./register.md).

After entering your credentials, you will prompted to select a Medplum project. Click on the name on the project that you registered in the Tutorial 1, and you'll be redirected to the Hello World home page.

### Home Page

Once you log in, you'll be presented with a greeting, along with a list of all the patients in your Medplum project. Assuming you [imported sample data](/docs/tutorials/importing-sample-data.md), there will be two patients.

### Practitioner Profile

Click on the link in the "Welcome" greeting to access the Practitioner profile page.

This page uses the Medplum's [`ResourceTable`](https://storybook.medplum.com/?path=/docs/medplum-resourcetable--patient) component to display basic data about the profile resource of the logged-user. You can read more about profile resources [here](/docs/tutorials/register#invite-a-new-user).

### Patient Profile

Click on the "Hello World" link in the top left corner to return to the homepage.

Click on any individual patient name to navigate to the patient details page. This page has three different views of the patient data:

- The **Overview** panel demonstrates how to use plain HTML to create a custom view of patient data, including linked [ServiceRequests](/docs/api/fhir/resources/servicerequest) and [DiagnosticReports](/docs/api/fhir/resources/diagnosticreport).
- The **Timeline** panel uses Medplum's built-in [`PatientTimeline`](https://storybook.medplum.com/?path=/docs/medplum-patienttimeline--patient) component to add comments, upload files, and display relevant events related to the Patient.
- The **History** A view uses the Medplum's built-in [`ResourceHistoryTable`](https://storybook.medplum.com/?path=/docs/medplum-resourcehistorytable--basic) component to display the history of changes to the Patient resource.

## Conclusion

You've now built and run a simple custom UI built on top of the Medplum platform!

Medplum Hello World is a very simple app intended to help developers learn the Medplum platform. The following tutorials will dive into details of how this application was built.

Medplum also maintains more feature-rich example applications that companies can use as a starting point for building their own experiences:

- [**Foo Medical**](https://github.com/medplum/foomedical): An example patient portal, complete with messaging, vital signs, and vaccination records.
- [**Charting Demo**](https://github.com/medplum/medplum-chart-demo) _(under construction)_: An example provider-facing application, with Patient records, clinical profile, task lists, questionnaires, and care plans.
