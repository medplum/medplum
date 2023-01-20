# Authentication on a Custom domain

:::caution Note

This section is under construction.

:::

Medplum supports using Medplum authentication, Google and other forms of authentication on third party domains. You can see an example on [foomedical.com](https://www.foomedical.com), with [source code](https://github.com/medplum/foomedical). The service supports connecting to the Medplum FHIR datastore directly, without the needing to proxy requests through a server.

## Configuration Considerations

When setting up authentication on a custom domain you can "shortcut" some of the flows above because you can configure which Medplum project you want to connect to and which authentication types are required.

## Using Sign in and Register React Components

Medplum has pre-build React components that support authentication and registration.

- [Sign in](https://storybook.medplum.com/?path=/docs/medplum-signinform--basic)
- [Patient Registration](https://storybook.medplum.com/?path=/docs/medplum-registerform--basic)

Read more here on [enabling Google authentication](/docs/auth/google-auth.md) on these forms.

## Bring your own authentication

It is possible to bring your own authentication on a custom domain and use the same authentication method to connect to data in Medplum.

TODO: Instructions on how to configure BYO authentication for a project
