---
sidebar_position: 1
tags: [auth]
---

# Authentication

This page helps you choose the correct authentication method for your application, whether it's a browser, a server, or a device. The primary goal is to guide you to the right documentation page based on your use case.

-----

## Authentication Categories

Medplum's authentication methods are organized into two core categories.

**Browser-based Authentication**: For user-facing applications like single-page apps (SPAs), mobile apps, and patient portals. This is the most common use case for most developers.

**Server-side Authentication**: For applications running in a trusted, back-end environment, such as proxies, API gateways, and automated data processing services.

-----

## Method Selection Table

Use this table to quickly find the recommended authentication method for your scenario.

| Scenario | Recommended Method | **Choose if...** |
| :--- | :--- | :--- |
| **User-facing application** (web, mobile, or SPA) | **Browser-based Authentication** (OAuth Authorization Code with PKCE) | You are building a **public client application** that runs in a web browser or on a mobile device and authenticates a user. You need to handle **user login** and manage user sessions securely. |
| **Back-end service acting on its own behalf** (e.g., cron job, data processor) | **Server-side Authentication** (Client Credentials) | You are building a **confidential client application** in a trusted environment (like a server) that needs to access Medplum resources without a user's direct involvement. The actions will be performed on behalf of the `ClientApplication`'s access policy, **not a user's policy**. |
| **Back-end service acting on behalf of a user** (e.g., a proxy API) | **Server-side Authentication** (On-Behalf-Of pattern) | You are creating a **proxy server or an API gateway** that receives an authentication token from a client and needs to exchange it for a new token to access Medplum on the user's behalf. This is the correct choice for the **"on behalf of" pattern**. |
| **Non-web device** (lab analyzer, on-premise host, CI/CD) | **Server-side Authentication** (Client Credentials with restricted scope) | You need to authenticate a **physical device or a machine** that doesn't have a user interface. This method is for true machine-to-machine connectivity and should use an **extremely limited access policy**. |

-----

## Browser-based Authentication

This category is for **user-facing applications** that connect directly to Medplum. These applications run in untrusted environments (browsers, native apps) and authenticate a user. The recommended method is **OAuth Authorization Code Flow with PKCE**, which is the industry standard for public clients.

### Key Concepts

  * **PKCE (Proof Key for Code Exchange)** is a security extension for OAuth that prevents interception attacks in public clients. It ensures that only your application can exchange the authorization code for an access token. Use the `PKCE optional` setting in Medplum to enforce this.
  * **External Identity Providers**: You can integrate with external IDPs like **Okta**, **Auth0**, and **Microsoft Entra ID** for **SSO** (Single Sign-On) and to enable alternative login flows (e.g., passwordless).

### Guides

  * [**OAuth Authorization Code**](/docs/auth/idp/medplum-as-idp): The default authentication method.
  * [**External Identity Providers**](/docs/auth/idp/external-identity-providers): Comprehensive guide for connecting with popular IDPs, like Auth0 and AWS Cognito
  * [**Domain-level Identity Providers**](/docs/auth/idp/domain-level-identity-providers): Enterprise domain-level IDPs. 

-----

## Server-side Authentication

This category is for **back-end services** or machines running in a trusted environment. These applications do not directly authenticate a user but operate on behalf of an application or device.

### Implementation Details

The recommended method is **Client Credentials Flow**, where the application uses its own credentials to obtain a token. This is ideal for scenarios like:

  * Integrating Medplum with a legacy system.
  * Building a proxy API that handles requests for multiple clients.
  * Connecting a medical device or a CI/CD pipeline.

### Guides

  * [**Client Credentials**](/docs/auth/client-credentials): The primary method for server-side and device authentication.
  * [**Token Exchange**](/docs/auth/token-exchange): An alternative for legacy or stateless environments where Client Credentials is not feasible.

-----

## User Management

User Management has been moved to its own top-level section in the documentation to consolidate all relevant topics.

This new section is the central place for documentation on:

  * **User invites** and provisioning.
  * **SCIM**: System for Cross-domain Identity Management.
  * **User scoping**: Defining which data a user can access.
  * **Linking users**: The difference between using **External IDs** and email addresses.

-----

## Security Best Practices

Regardless of the authentication method you choose, always follow these best practices:

  * **Principle of Least Privilege**: Ensure your `ClientApplication` and user access policies are as restrictive as possible.
  * **Secrets Management**: Never store credentials or tokens directly on disk. Use a secrets management service.
  * **Network Isolation**: Restrict host access via a VPC or firewall to prevent access from the public internet.