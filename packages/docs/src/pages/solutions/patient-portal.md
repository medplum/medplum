# Patient Portal

Build a patient facing application that allows users to view their records, fill out questionnaires, schedule appointments, message their provider, view care plans, manage coverage and more. Medplum provides a starter kit that accelerates development, is easy to customize and will scale with your organization.

## Sample Application

The sample application is called [Foo Medical](https://www.foomedical.com). To see the experience you can [register here](https://www.foomedical.com/register). The source code for the application and how to set it up can be found [here](https://github.com/medplum/foomedical).

<iframe width="560" height="315" src="https://www.youtube.com/embed/aXKWDJ-GBKk?controls=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

## Features

[Foo Medical](https://www.foomedical.com) shows the basics that are very common to medical practices, both in person and virtual care. You will notice that the application is completely white-label and is operating under a single domain.

### Onboarding questionnaires and paperwork

Create questionnaires for users, and put them in the app for them to fill out as needed. You can see an example on [Foo Medical](https://www.foomedical.com) and read in depth on [questionnaires](../products/questionnaires). You can see some sample questionnaires on our [storybook](https://storybook.medplum.com/?path=/docs/medplum-questionnaireform--us-surgeon-general-family-health-portrait).

### Scheduling

Patients can schedule their appointments on the app, and you can control which appointments they have access to as an administrator. Read more about [scheduling](../products/scheduling). See scheduling on [Foo Medical Scheduling](https://foomedical.com/get-care).

### Care Plans

It's often useful for patients to be able to see and (if needed) take action on their Care Plan. You can read about [care plans](../products/careplans). See care plans on [Foo Medical Care Plans](https://foomedical.com/care-plan/action-items).

### Patient Records

Give patients access to their records and let them input data. You can see an example on [Foo Medical Patient Records](https://foomedical.com/health-record/lab-results).

### Messaging

Allow patients to message their provider or care team in a chat-like interface. Read more in [communications](../products/communications). See an example on [Foo Medical Messages](https://foomedical.com/messages).

## Access and Controls

Giving patients access to only their data can be enabled via [access controls](/docs/access/access-policies).

## Case Studies

- At home lab provider [Lumba Health](https://lumba.health/) used the `foomedical` template to build [my.lumba.health](https://my.lumba.health/) patient records portal.

## Demos and Reference Material

- Sample app [Foo Medical](https://www.foomedical.com) live for testing
- [Foo Medical Source Code](https://github.com/medplum/foomedical)
- [Sample data generation script](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts)
- [UI components on Storybook](https://storybook.medplum.com)
