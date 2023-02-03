---
sidebar_position: 4
---

# Custom Domain

:::caution Note

This section is under construction.

:::

Medplum supports using Medplum authentication, Google, and other forms of authentication on third party domains. For example, see [https://foomedical.com](https://foomedical.com) ([source code](https://github.com/medplum/foomedical)). The service supports connecting to the Medplum FHIR datastore directly, without the need of a proxy web server.

## Using Sign in and Register React Components

Medplum has pre-build React components that support authentication and registration.

- [Sign in](https://storybook.medplum.com/?path=/docs/medplum-signinform--basic)
- [Patient Registration](https://storybook.medplum.com/?path=/docs/medplum-registerform--basic)

Read more here on [enabling Google authentication](/docs/auth/google-auth.md) on these forms.

## Bring your own authentication

It is possible to bring your own authentication on a custom domain and use the same authentication method to connect to data in Medplum.

TODO: Instructions on how to configure BYO authentication for a project
