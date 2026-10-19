---
sidebar_position: 1
tags: [auth]
---

# Authentication

:::tip[Choosing an authentication approach?]
The [Authentication Decision Guide](/docs/decision-guides/authentication) helps you compare identity providers, account matching, and token-flow architectures.
:::

Use this directory to find setup instructions, SDK examples, and authentication reference material. User authentication can run in a browser, a native application, or through your backend. Application authentication gives a service its own access to Medplum.

## Sign-in and Identity Providers {/* #browser-based-authentication */}

These pages explain login flows and provider configuration. Provider routing selects where the user authenticates; the login flow determines how your application obtains Medplum credentials.

| Implementation task | Documentation |
| --- | --- |
| Redirect users to a Medplum-hosted login page | [Medplum Redirect Login](/docs/auth/medplum-as-idp) |
| Render the Medplum email/password form inside your application | [Embedded Login](/docs/auth/embedded-login) |
| Authenticate through an external IDP and have Medplum handle its callback | [External IDP authorization-code flow](/docs/auth/external-identity-providers#authorization-code-flow) |
| Configure an external IDP for a particular application | [Application-based routing](/docs/auth/external-identity-providers#application-based-routing) |
| Route users to corporate SSO by email domain | [Domain-level Identity Providers](/docs/auth/domain-level-identity-providers) |
| Configure Medplum's Google sign-in integration | [Google Authentication](/docs/auth/google-auth) |

:::caution[Patient Login]
The Medplum App (https://app.medplum.com) is an administrative tool for clinical users and developers. Patients **cannot** log in to this application directly. To provide patient access, you must build a custom patient portal using the Medplum SDK.
:::

### Mobile activation before account creation

Some mobile apps need to verify an activation code before the patient or user account exists. For example, a clinic may create a `Patient`, send an activation code, and ask the patient to finish account setup in an iOS or Android app.

Do not embed a long-lived `client_secret` in a mobile binary. Treat native mobile apps as public clients. Use a short-lived, narrowly scoped activation credential that can only call the activation workflow. The activation workflow should validate the code, expiration, intended patient, and retry limits before creating or linking the Medplum user account. After activation, use the normal authentication flow for future sessions.

## User Tokens and Delegation

Use these pages when your application already authenticates the user or a trusted system establishes the user context. Token exchange can run in either the client or backend. On-Behalf-Of uses an application's credentials with a user context supplied on each request.

| Implementation task | Documentation |
| --- | --- |
| Exchange an external user access token, then call Medplum from the client | [Token Exchange: client-held Medplum tokens](/docs/auth/token-exchange#client-held-medplum-tokens) |
| Exchange an external user access token and keep Medplum calls in your backend | [Token Exchange: server-held Medplum tokens](/docs/auth/token-exchange#server-held-medplum-tokens) |
| Have a privileged application delegate individual requests to a user | [On-Behalf-Of](/docs/auth/on-behalf-of) |
| Create a one-time code after user authentication and consent have occurred | [Pre-Authorized Code](/docs/auth/pre-authorized-code) |
| Accept external JWTs directly on a self-hosted Medplum server | [Direct External Authentication](/docs/auth/direct-external-auth) |

## Application Authentication {/* #server-side-authentication */}

These pages explain how a trusted service authenticates as a `ClientApplication`. A backend using a user's exchanged token follows the [server-held token instructions](/docs/auth/token-exchange#server-held-medplum-tokens) instead.

| Implementation task | Documentation |
| --- | --- |
| Obtain an application token using a client ID and secret | [Client Credentials](/docs/auth/client-credentials) |
| Authenticate the application using a signed JWT | [Client Assertion](/docs/auth/client-assertion) |
| Authenticate the application using a client certificate | [Mutual TLS (mTLS)](/docs/auth/mtls), including infrastructure prerequisites |

For delegated user requests, first authenticate the application, then follow [On-Behalf-Of](/docs/auth/on-behalf-of#how-to-use). Application authentication alone does not select an end user.

## Sessions and MFA

- [Access Token Management](/docs/auth/session-management): token lifetimes and refresh behavior.
- [Logout](/docs/auth/logout): session revocation.
- [Multi-Factor Authentication](/docs/auth/mfa): enrollment, login challenges, and recovery administration for Medplum-managed authentication. Configure external-IDP MFA with that provider.

---

## User Management

See our [User Management](/docs/user-management/) section for more information:

- scoping users, and distinguishing [Project vs Server Scoped users](/docs/user-management/project-vs-server-scoped-users.mdx)
- enabling [Open Patient Registration](/docs/user-management/open-patient-registration)
- using [External ID's](/docs/user-management/external-ids)
- creating [Custom Emails](/docs/user-management/custom-emails.mdx) for user invites

---

## Security Best Practices

Regardless of the authentication method you choose, always follow these best practices:

- **Principle of Least Privilege**: Ensure your `ClientApplication` and user access policies are as restrictive as possible.
- **Secrets Management**: Never store credentials or tokens directly on disk. Use a secrets management service.
- **Network Isolation**: Restrict host access via a VPC or firewall to prevent access from the public internet.
