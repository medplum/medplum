---
sidebar_position: 1
tags: [auth]
---

# Authentication and Identity

Medplum supports multiple authentication configurations, with the intent to **enable required compliance and integration scenarios**. Implementations commonly use multiple authentication and authorization methods.

This section covers Medplum's authentication tools (_are you who you say you are?_). Several authentication methods (e.g. Google Authentication) are supported.

Authorization (what can you do?) are distinct in Medplum, and covered in the [Authorization and Access Controls](/docs/access) section.

## Login Flowchart

The [User Management Guide](/docs/auth/user-management-guide) describes the Medplum user and project isolation model. Users can belong to multiple Medplum projects, and the service supports multiple types of authentication.

The following diagram shows an overview of the process. Endpoints are provided to illustrate and inform, but implementors should only use [OAuth](/docs/api/oauth) endpoints or React components.

![Auth flow](/img/auth/auth-flow.png)

[Click to Enlarge](/img/auth/auth-flow.png)

There are four major stages in the login flow: **Domain**, **Credentials**, **Profile**, **Scope**. The table below describes the authentication actions the Medplum server performs at each stage, along with the associated endpoints.

| Stage       | Description                                                                                                                                                             | Involved endpoints                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Domain      | In the Domain phase, the preferred authentication method is determined, either by the user selecting a method, by configuration or based on email domain.               | `auth/method` <br /> `auth/external` <br />                  |
| Credentials | In the Credentials phase of login the authentication credentials are collected and sent to service of choice and authentication performed.                              | `auth/login` <br /> `auth/external` <br /> `auth/mfa` <br /> |
| Profile     | In the Profile phase, if the user is a member of multiple projects, one must be selected to proceed                                                                     | `auth/profile`<br /> `auth/me` <br />                        |
| Scope       | If SMART-on-FHIR scopes were provided, they need to be selected and access to them determined. Access control is applied where configured and authorization determined. | `auth/scope`                                                 |

## Resources and Reference

- See [authentication functions](./sdk/core.medplumclient) in the TypeScript SDK
- [User profile](./sdk/core.medplumclient.getprofile) in the TypeScript SDK
- [OAuth endpoints](./api/oauth) reference
- [Medplum resources](./api/fhir/medplum) related to authentication and authorization
- [User registration](https://storybook.medplum.com/?path=/docs/medplum-registerform--basic) react component
- [Sign in form](https://storybook.medplum.com/?path=/docs/medplum-signinform--basic) react component
- [Auth Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aauth) on Github
