---
sidebar_position: 1
tags: [auth]
---

# Authentication

This page helps you choose the correct authentication method for your application, whether it's a browser, a server, or a device. The primary goal is to guide you to the right documentation page based on your use case.

For **user-facing applications (web or mobile apps)**, user [_browser-based authentication_](#browser-based-authentication). 

For applications running in a **trusted, back-end environment**, use [_server-side authentication_](#server-side-authentication). 

## Browser-based Authentication

This category is for user-facing applications that connect directly to Medplum. These applications run in untrusted environments (browsers, native apps) and use **identity providers** to authenticate a user. 

| Method | **Choose to...** |
| :--- | :--- | 
| [Medplum as IDP](./medplum-as-idp.md) | (default) **Get going fast**, and don't have external compliance requirements. |
| [External IDP](./external-identity-providers.mdx) | Connect to an external IDP, like [Google Auth](./google-auth.md), Auth0, or AWS Cognito. | 
| [Domain-level IDP](./domain-level-identity-providers.md) | Use your enterprise, domain-level **corporate identity solution.** |

## Server-side Authentication

This category is for back-end services. These applications do not directly authenticate a user but operate on behalf of an application or device. They can be used to: 

- integrate with legacy systems 
- connect to a medical device 
- build a proxy API 
- connect to a CI/CD pipeline 

Use the [**Client Credentials Flow**](/docs/auth/client-credentials) to allow your application to use its own client key and secret to obtain a token. When working through proxy API layers, you can [enable on-behalf-of authentication](/docs/auth/on-behalf-of) with client credentials to act on behalf of other entities.

-----

## User Management

See our [User Management](/docs/user-management/) section for more information: 
  * scoping users, and distinguishing [Project vs Server Scoped users](/docs/user-management/project-vs-server-scoped-users.mdx)
  * enabling [Open Patient Registration](/docs/user-management/open-patient-registration.md)
  * using [External ID's](/docs/user-management/external-ids.md)
  * creating [Custom Emails](/docs/user-management/custom-emails.mdx) for user invites 
  
-----

## Security Best Practices

Regardless of the authentication method you choose, always follow these best practices:

  * **Principle of Least Privilege**: Ensure your `ClientApplication` and user access policies are as restrictive as possible.
  * **Secrets Management**: Never store credentials or tokens directly on disk. Use a secrets management service.
  * **Network Isolation**: Restrict host access via a VPC or firewall to prevent access from the public internet.