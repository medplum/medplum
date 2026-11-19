---
id: index
title: Authentication
weight: 20
docs_tags: [auth]
---

{{< tip title="Choosing an authentication approach?" >}}
The [Authentication Decision Guide](/docs/decision-guides/authentication) helps you compare identity providers, account matching, and token-flow architectures.
{{< /tip >}}

Use this directory to find setup instructions, SDK examples, and authentication reference material. User authentication can run in a browser, a native application, or through your backend. Application authentication gives a service its own access to Medplum.

## Sign-in Flows {#browser-based-authentication}

These pages cover the decision guide's identity provider choices: Medplum-managed authentication and external IDPs. Sign-in can use a Medplum-hosted page, an embedded form, or an external IDP redirect. Provider routing selects where the user authenticates.

| Implementation task                                                       | Documentation                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Redirect users to a Medplum-hosted login page                             | [Medplum Redirect Login](/docs/auth/medplum-as-idp)                                                    |
| Render the Medplum email/password form inside your application            | [Embedded Login](/docs/auth/embedded-login)                                                            |
| Authenticate through an external IDP and have Medplum handle its callback | [External IDP authorization-code flow](/docs/auth/external-identity-providers#authorization-code-flow) |
| Configure an external IDP for a particular application                    | [Application-based routing](/docs/auth/external-identity-providers#application-based-routing)          |
| Route users to corporate SSO by email domain                              | [Domain-level Identity Providers](/docs/auth/domain-level-identity-providers)                          |
| Configure Medplum's Google sign-in integration                            | [Google Authentication](/docs/auth/google-auth)                                                        |

{{< warning title="Patient Login" >}}
The Medplum App (https://app.medplum.com) is an administrative tool for clinical users and developers. Patients **cannot** log in to this application directly. To provide patient access, you must build a custom patient portal using the Medplum SDK.
{{< /warning >}}

## User Tokens and Delegation

These pages implement the decision guide's token exchange and On-Behalf-Of options, along with specialized token flows. With token exchange, choose whether to keep the Medplum token in the client or on the server. On-Behalf-Of uses one application's credentials with a user context supplied on each request.

| Implementation task                                                           | Documentation                                                                                      |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Exchange an external user token, then call Medplum from the client           | [Token Exchange: in the client](/docs/auth/token-exchange#client-held-medplum-tokens) |
| Exchange an external user token and keep Medplum calls in your backend       | [Token Exchange: on the server](/docs/auth/token-exchange#server-held-medplum-tokens) |
| Have a privileged application delegate individual requests to a user          | [On-Behalf-Of Delegation](/docs/auth/on-behalf-of)                                                 |
| Create a one-time code after user authentication and consent have occurred    | [Pre-Authorized Code](/docs/auth/pre-authorized-code)                                              |
| Accept external JWTs directly on a self-hosted Medplum server                 | [Direct External Authentication](/docs/auth/direct-external-auth)                                  |

## Application Authentication {#server-side-authentication}

These pages explain how a trusted service authenticates as a `ClientApplication`. A backend using a user's exchanged token follows the [server-held token instructions](/docs/auth/token-exchange#server-held-medplum-tokens) instead.

| Implementation task                                      | Documentation                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Obtain an application token using a client ID and secret | [Client Credentials](/docs/auth/client-credentials)                          |
| Authenticate the application using a signed JWT          | [Client Assertion](/docs/auth/client-assertion)                              |
| Authenticate the application using a client certificate  | [Mutual TLS (mTLS)](/docs/auth/mtls), including infrastructure prerequisites |

For delegated user requests, first authenticate the application, then follow [On-Behalf-Of](/docs/auth/on-behalf-of#how-to-use). Include the resolved user context on each delegated request.

## Sessions and MFA

- [Access and Refresh Tokens](/docs/auth/session-management): token lifetimes and refresh behavior.
- [Logout](/docs/auth/logout): session revocation.
- [Multi-Factor Authentication](/docs/auth/mfa): enrollment, login challenges, and recovery administration for Medplum-managed authentication. Configure external-IDP MFA with that provider.
- [How MFA Works](/docs/auth/how-mfa-works): HTTP routes and flows for building your own MFA interface.

---

## User Management

For the decision guide's matching-key choice, email matching uses the Medplum login email and external ID matching uses the IDP's complete subject identifier. See [User Management](/docs/user-management/) for matching and provisioning:

- scoping users, and distinguishing [Project vs Server Scoped users](/docs/user-management/project-vs-server-scoped-users)
- enabling [Open Patient Registration](/docs/user-management/open-patient-registration)
- configuring subject matching and provisioning [External IDs](/docs/user-management/external-ids)
- creating [Custom Emails](/docs/user-management/custom-emails) for user invites

### Mobile activation before account creation

Some mobile apps need to verify an activation code before the patient or user account exists. For example, a clinic may create a `Patient`, send an activation code, and ask the patient to finish account setup in an iOS or Android app.

Do not embed a long-lived `client_secret` in a mobile binary. Treat native mobile apps as public clients. Use a short-lived, narrowly scoped activation credential that can only call the activation workflow. The activation workflow should validate the code, expiration, intended patient, and retry limits before creating or linking the Medplum user account. After activation, use the normal authentication flow for future sessions.

---

## Security Best Practices

Regardless of the authentication method you choose, always follow these best practices:

- **Principle of Least Privilege**: Ensure your `ClientApplication` and user access policies are as restrictive as possible.
- **Secrets Management**: Use a secrets manager for backend credentials and platform-appropriate secure storage for user tokens.
- **Network Isolation**: Restrict host access via a VPC or firewall to prevent access from the public internet.
