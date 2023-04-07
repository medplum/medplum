---
sidebar_position: 1
tags: [auth]
---

# Auth and Identity

Medplum supports multiple authentication and authorization configurations, with the intent to **enable required compliance and integration scenarios**. Implementations commonly use multiple authentication and authorization methods.

Authentication (_are you who you say you are?_) and authorization (_what can you do?_) are distinct in Medplum. Several authentication methods (e.g. Google Authentication) are supported. Authorization can be determined by [Access Policies](./access-control.md) or SMART-on-FHIR scopes.

## Patients, Practitioners and Bots

Users are the representation of identities in Medplum, and each user belongs to one or more Medplum Projects. For a specific project, a user can be either a [Practitioner](../api/fhir/resources/practitioner.mdx), [Patient](../api/fhir/resources/patient.mdx) or [Bot](../bots/index.md). At a high level, Practitioners are staff or administrators, Patients are those receiving care and Bots are designed for programmatic access or integrations.

## Login Flowchart

Users can belong to multiple Medplum projects, and the service supports multiple types of authentication. Below is a diagram that steps through the login logic and process. There are four major stages in the login flow.

| Stage       | Description                                                                                                                                                             | Involved endpoints                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Domain      | In the Domain phase, the preferred authentication method is determined, either by the user selecting a method, by configuration or based on email domain.               | `auth/method` <br /> `auth/external` <br />                  |
| Credentials | In the Credentials phase of login the authentication credentials are collected and sent to service of choice and authentication performed.                              | `auth/login` <br /> `auth/external` <br /> `auth/mfa` <br /> |
| Profile     | In the Profile phase, if the user is a member of multiple projects, one must be selected to proceed                                                                     | `auth/profile`<br /> `auth/me` <br />                        |
| Scope       | If SMART-on-FHIR scopes were provided, they need to be selected and access to them determined. Access control is applied where configured and authorization determined. | `auth/scope`                                                 |

The following diagram shows an overview of the process. Endpoints are provided to illustrate and inform, but implementors should only use [OAuth](/docs/api/oauth) endpoints or React components.

![Auth flow](/img/auth/auth-flow.png)

[Click to Enlarge](/img/auth/auth-flow.png)

## Resources and Reference

- See [authentication functions](./sdk/classes/MedplumClient#authentication) in the Typescript SDK
- [User profile](./sdk/classes/MedplumClient#user-profile) in the Typescript SDK
- [OAuth endpoints](./api/oauth) reference
- [Medplum resources](./api/fhir/medplum) related to authentication and authorization
- [User registration](https://storybook.medplum.com/?path=/docs/medplum-registerform--basic) react component
- [Sign in form](https://storybook.medplum.com/?path=/docs/medplum-signinform--basic) react component
- [Auth Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aauth) on Github
