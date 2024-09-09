---
sidebar_position: 2
---

# Register an Account

This guide explains how to register for a new Medplum account and create your first Medplum project.

## Register for a Medplum account

- Open the Medplum register page in your browser: https://app.medplum.com/register
- Fill in your account details and click "Create account"
- Fill in the name of your new Medplum Project and click "Create Project"

Congrats, you now have a Medplum account!

## Medplum projects

When you signed up for an account, you created a new [Medplum Project](/docs/api/fhir/medplum/project).

A project is a collection of [FHIR resources](/docs/fhir-basics#storing-data-resources) that is logically separated from other resources on the server.

Each resource can only contain [references](/docs/fhir-basics#linking-data-references) to resources inside the same project, and can only be accessed from [Bots](/docs/bots/bot-basics) inside the same project.

Each project is administered separately, and can have its own set of users, permissions, client applications, and bots. A common usage pattern is to set up separate staging and production projects for an application. See the [Bots in Production](/docs/bots/bots-in-production#deploying-to-staging-vs-production) guide for more details.

You can create a new project for your account by visiting [https://app.medplum.com/register](https://app.medplum.com/register)

## Explore your new project

Let's explore your new project.

First, you can find your [Practitioner](/docs/api/fhir/resources/practitioner) resource by clicking on the top-right icon, and choosing "Account Settings". This takes you to the [Practitioner resource page](https://app.medplum.com/Practitioner), where you can fill in more details such as contact info, qualifications, communication preferences, and profile picture.

Second, you can find your project details by clicking on the top-left icon, and choosing "Project". This takes you to the project administration page, where you can manage users and invite new users to your project.

![Top left menu](/img/hello-world/top-left-menu.png)

## Invite a new user

You can invite additional team members to your project.

- In the left sidebar, click on the "Project"
- Click the "Users" tab
- Click "Invite new user" link in the bottom right
- Fill out the new user's name and email address, and then click the "Invite" button.

The user will then receive an email inviting them to sign up for this project.

If the user is new to Medplum, a new user account will be created. Otherwise, the user's existing account will be added as a member of the current project.

:::tip User Profiles

When inviting a user, the "Role" dropdown specifies what kind of resource is used to represent the user. This is known as your **profile resource.**

Depending on your use case, different profile resources will be appropriate for different users.

|                                                         | Description                                                                                                                                                          | Example                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Practitioner](/docs/api/fhir/resources/practitioner)   | Any person involved in the development or provision of healthcare                                                                                                    | Physicians, Lab Scientists, Software Engineers, Customer Service Reps, etc. |
| [Patient](/docs/api/fhir/resources/patient)             | A person receiving healthcare                                                                                                                                        | Healthcare patient                                                          |
| [RelatedPerson](/docs/api/fhir/resources/relatedperson) | A patient's family member. Most often used in pediatric or geriatric care scenarios (see our [family relationship guide](/docs/fhir-datastore/family-relationships)) | Patient's parent or adult child of patient                                  |

:::
