# The Admin Page

The [Admin Page](https://app.medplum.com/admin/project) of the Medplum App allows admin users to view and edit details of their project that normal users do not have access to.

At the top of the page, there is an array of tabs as shown below. In this guide, we will briefly go over the content of each tab as well as any functionality they provide.

![App Admin Page](./admin-page.png)

## Details

The Details tab displays all of the populated elements of the current [`Project`](/docs/api/fhir/medplum/project) resource. For more details on the [`Project`](/docs/api/fhir/medplum/project) resource, see the [User Management Guide](/docs/auth/user-management-guide).

## Users

The Users tab displays all of the [`Practitioner`](/docs/api/fhir/resources/practitioner) resources that are also a [`User`](/docs/api/fhir/medplum/user) in your project. It also allows you to invite new users. For more details on the [`User`](/docs/api/fhir/medplum/user) resource, see the [User Management Guide](/docs/auth/user-management-guide).

## Patients

The Patients tab displays all of the [`Patient`](/docs/api/fhir/resources/patient) resources that are also a [`User`](/docs/api/fhir/medplum/user) in your project. It also allows you to invite new patients. For more details on the [`User`](/docs/api/fhir/medplum/user) and [`Patient`](/docs/api/fhir/resources/patient) resources see the [User Management Guide](/docs/auth/user-management-guide#project-scoped-users).

## Clients

The Clients tab displays all of the [`ClientApplication`](/docs/api/fhir/medplum/clientapplication) resources that are associated with your project. It also allows you to create new [`ClientApplication`](/docs/api/fhir/medplum/clientapplication). For more details, see the [Authentication Method docs](/docs/auth/methods/token-exchange#set-up-your-clientapplication).

## Bots

The Bots tab dispalys all of the [`Bots`](/docs/api/fhir/medplum/bot) that are a part of your project and allows you to create new ones. For more details on [`Bots`](/docs/api/fhir/medplum/bot) see the [Bot Basics docs](/docs/bots/bot-basics).

## Secrets

The Secrets tab displays all of your project secrets as well as allowing you to create new ones. Secrets are used to store sensitive information and as access controls. For example, API keys, [`Bot`](/docs/api/fhir/medplum/bot) secrets, and reCAPTCHA secrets would all appear here. For more details see the [Project Secrets docs](/docs/access/projects#project-secrets).

## Sites

The Sites tab allows you to view and edit any custom domains that your project is configured for.
