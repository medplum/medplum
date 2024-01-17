---
sidebar_position: 2
toc_max_heading_level: 2
tags: [auth]
---

# OAuth2 Authorization Code

## Introduction

When building your own healthcare App, you can use Medplum as an **identity provider** using the OAuth2 Authorization Code flow. Medplum provides OAuth2 endpoints to authenticate Patients and Practitioners and share data with your application.

This guide will go over the basics of Medplum's OAuth2 authorization code flow, and you can find more detailed documentation in the [API Section](/docs/api/oauth/).

We also have a **[minimal demo on Github](https://github.com/medplum/medplum-oauth-demo)** that implements a simple authorization code login.

## Create a Client Application

The first step is to configure a [Medplum Client Application](https://app.medplum.com/ClientApplication) for your application on the Medplum Server.

1. Go to the [**Project Admin clients page**](https://app.medplum.com/admin/clients), either by clicking "Project" on the left sidebar, or navigating to https://app.medplum.com/admin/project
2. Click "Create New Client" to create your new ClientApplication resource
3. Set the `Redirect URI` to the URL to where you would like Medplum to redirect the user after login.
4. **(Optional but recommended)** Assign an [Access Policy](/docs/access/access-policies) to your client to restrict the data your application has access to

## Authorize your client

Next your application will need to make an `HTTPS GET` request to the Medplum Server's [`/oauth2/authorize`](/docs/api/oauth/authorize) endpoint with the following URL parameters:

| Parameter                                                          | Value                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`client_id`](/docs/api/oauth/authorize#client_id-required)         | The ID of your new Client Application                                                                                                                                                                     |
| [`redirect_uri`](/docs/api/oauth/authorize#redirect_uri-required)   | **Must match exactly** to the uri registered in the Medplum App (including trailing slashes, punctuation, etc.), as detailed in the [OAuth2 Spec](https://www.rfc-editor.org/rfc/rfc6749#section-3.1.2.3) |
| [`response_type`](/docs/api/oauth/authorize#response_type-required) | Fixed value: `code`                                                                                                                                                                                       |
| [`scope`](/docs/api/oauth/authorize#scope-required)                | Fixed value: `openid`                                                                                                                                                                                     |

See the [`oauth/authorize` API documentation](/docs/api/oauth/authorize) for more details about the possible request parameters.

## Fetch your token

After your user successfully authenticates, they will get an [HTTP redirect response](/docs/api/oauth/authorize#authorization-code-grant) that is similar to this:

```
HTTP/1.1 302 Found
Location: https://YOUR_APP/redirect_uri?code=AUTHORIZATION_CODE
```

The last step of this flow is for your application to trade in the `AUTHORIZATION_CODE` for an access token.

1. Read the `code` parameter from the query string to get the `AUTHORIZATION_CODE`
2. Call the [`oauth/token` endpoint](/docs/api/oauth/token) with the body parameters (details: [API Docs](/docs/api/oauth/token#request-parameters-in-body))
   - `grant_type=authorization_code`
   - `client_id=YOUR_CLIENT_ID`
   - `code=AUTHORIZATION_CODE`
3. Use the `access_token` received in the [response](/docs/api/oauth/token#sample-response) to make future API calls (See the [**Client Credentials tutorial**](./client-credentials) for more details)

:::note Using the Medplum Client
You can also use the Medplum SDK to initiate this process, using either the [`startLogin`](/docs/sdk/core.medplumclient.startlogin) or [`signInWithRedirect`](/docs/sdk/core.medplumclient.signinwithredirect) convenience method.
:::

## See Also

- [Authorize endpoint](/docs/api/oauth/authorize)
- [Token endpoint](/docs/api/oauth/token)
- [UserInfo endpoint](/docs/api/oauth/userinfo)
