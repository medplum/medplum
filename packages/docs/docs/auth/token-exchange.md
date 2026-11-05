import ExampleCode from '!!raw-loader!@site/../examples/src/auth/token-exchange.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Token Exchange

## Overview

Medplum supports [OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693). Your application supplies an external user token, and Medplum validates it with the configured IDP and issues a user-scoped Medplum token. The exchange is a direct API call.

Use the shared setup and request format below, then follow the [client-held](#client-held-medplum-tokens) or [server-held](#server-held-medplum-tokens) implementation steps. Both use the same exchange endpoint. If Medplum should handle the external IDP callback during login, follow the [external IDP authorization-code flow](/docs/auth/external-identity-providers#authorization-code-flow).

## Prerequisites

- Obtain an external user token through your application's login flow. Standard OIDC UserInfo endpoints require an **access token**; the [GCIP/Firebase adapter](#gcip-and-firebase) uses an **ID token**.
- Configure the IDP endpoint that Medplum will use to validate the token.
- Provision the Medplum user, profile, and project membership through a supported [User Management](/docs/user-management) workflow.
- Choose email matching or external ID matching consistently with your provisioning process. See [Using External IDs](/docs/user-management/external-ids).

## Set up your ClientApplication

Medplum calls the external identity provider's UserInfo endpoint to validate the access token and retrieve the user's identity. Configure that endpoint on the [`ClientApplication`](https://app.medplum.com/ClientApplication) in your Medplum project.

To set up an identity provider for your [`ClientApplication`](https://app.medplum.com/ClientApplication):

1. Log in to your Medplum project.
1. Navigate to the [ClientApplications page](https://app.medplum.com/ClientApplication).
1. Click on the [`ClientApplication`](https://app.medplum.com/ClientApplication) that you would like to set up with an identity provider.
1. Click the "Edit" tab.
1. Scroll down to the "Identity Provider" section.
1. Enter the `/userinfo` URL for your external identity provider in the "User Info URL" textbox.
1. Click "Save" to save your changes.

:::caution[Scopes]

By default, Medplum matches users by email. Request the external token with the `email` scope and configure the provider to return an `email` claim.

To match by the provider's `sub` (subject) identifier, check "Use Subject" in the identity provider settings. Provision the complete subject as the membership's external ID, including any provider prefix; see [Using External IDs](/docs/user-management/external-ids).

:::

### GCIP and Firebase

For Google Cloud Identity Platform (GCIP) or Firebase Authentication, configure these fields on the client's `identityProvider`:

```json
{
  "userInfoUrl": "https://identitytoolkit.googleapis.com/v1/accounts:lookup",
  "userInfoMode": "gcip",
  "userInfoApiKey": "YOUR_GCIP_API_KEY"
}
```

Supply the user's GCIP/Firebase ID token as `subject_token`. Medplum sends it to `accounts:lookup` as `idToken` and maps the returned `localId` to `sub`. When using subject matching, provision that `localId` as the external ID.

For this adapter, the exchange request still requires `subject_token_type=urn:ietf:params:oauth:token-type:access_token`, which is the only value the endpoint accepts. The SDK sets this value automatically.

<span id="server-scoped-users-and-the-membership_id-parameter-self-hosted-only" />

## Selecting a project membership

`membership_id` selects an existing membership of the authenticated user. Provision the user, profile, and membership before exchanging tokens. The provider configuration determines which memberships are eligible:

| Provider configuration                                     | Eligible memberships                                                                                      | When to supply `membership_id`                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ClientApplication`, on hosted or self-hosted Medplum      | The user's memberships in the client's project, for either project-scoped or server-scoped users          | Supply it to select a particular membership. If omitted, Medplum selects the first matching membership in that project.                          |
| Server-level provider with email matching                  | The user's memberships in the selected project; without a selection, the server-scoped user's memberships | Supply it to select the project and membership. If omitted, Medplum looks up the server-scoped user by email and selects their first membership. |
| Server-level provider with subject matching (`useSubject`) | The user's memberships in the selected project                                                            | Required. Medplum derives the project from the membership before looking up the external ID.                                                     |

An unreadable `membership_id` with a server-level provider returns `invalid_request` with the description `Invalid membership`. If the selected membership belongs to another user or falls outside the eligible project, login fails with `User not found`. Check the provider selection, identity mapping, and target project when troubleshooting these errors.

### Configure a server-level external auth provider

For cross-project token exchange on a self-hosted server, configure the identity provider through [`externalAuthProviders`](/docs/self-hosting/server-config). A supplied `membership_id` establishes the project for identity lookup and selects the authenticated user's membership in that project.

:::caution[Self-hosted only]

`externalAuthProviders` requires access to the self-hosted server configuration. On Medplum's hosted service, configure a `ClientApplication` in each target project. Contact [Medplum support](/contact) to discuss cross-project requirements.

:::

```json
{
  "externalAuthProviders": [
    {
      "issuer": "https://your-idp.example.com",
      "clientId": "your-token-exchange-selector",
      "userInfoUrl": "https://your-idp.example.com/oauth2/userinfo"
    }
  ]
}
```

This example uses email matching. For subject matching or adapter settings, supply an `identityProvider` object with `userInfoUrl` and the relevant fields, such as `useSubject: true`.

Use the configured `clientId` as `client_id` in the exchange request. If the top-level `clientId` is omitted, the server uses `identityProvider.clientId`. Restart the server after updating the configuration.

Choose a selector distinct from your `ClientApplication` IDs: a matching server-level provider takes precedence over a `ClientApplication` with the same ID.

<span id="why-you-must-pass-membership_id" />

### You own the identity-to-membership mapping

Store the mapping from the external identity and application context to the Medplum `ProjectMembership` ID during provisioning. You can also discover memberships by searching `ProjectMembership` by `profile` or `user` with a sufficiently privileged token.

Validate the requested application context before exchanging tokens. Medplum checks that the selected membership belongs to the resolved user and is eligible for the configured provider. Use the membership ID as `membership_id` in the HTTP request or as the SDK's third argument:

```ts
await medplum.exchangeExternalAccessToken(externalToken, clientId, membershipId);
```

## Exchanging tokens

Once you have configured the identity provider and selected the membership, use the `/oauth2/token` endpoint to exchange the external user token for a Medplum access token.

The client makes a token exchange request to the token endpoint with an extension grant type using the HTTP POST method. The following parameters are included in the HTTP request entity-body using the application/x-www-form-urlencoded format with a character encoding of UTF-8.

- **grant_type**: The constant value of "urn:ietf:params:oauth:grant-type:token-exchange".
- **client_id**: The ID of the [`ClientApplication`](https://app.medplum.com/ClientApplication) in your Medplum project, or the `clientId` of a [server-level provider](#configure-a-server-level-external-auth-provider).
- **subject_token**: The external access token, or the ID token for the GCIP/Firebase adapter.
- **subject_token_type**: The constant value "urn:ietf:params:oauth:token-type:access_token".
- **membership_id**: The ID of the [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) to select. See the [provider and matching rules](#selecting-a-project-membership) for when it is required and which memberships are eligible.
- **scope** (optional): The requested Medplum scopes. Defaults to `openid offline_access`, so the default exchange includes a refresh token. See [Access Token Management](/docs/auth/session-management#requesting-refresh-tokens).

:::tip[Example]

<Tabs groupId="language">
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="tokenExchange">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="tokenExchangeCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

:::

The response will include a Medplum access token, which you can use to access the Medplum API. The Medplum SDK also provides the [`exchangeExternalAccessToken()`](/docs/sdk/core.medplumclient.exchangeexternalaccesstoken) helper method.

## Client-held Medplum tokens

In this implementation, your browser or native application performs the exchange and calls Medplum directly.

1. Complete the external IDP login and obtain the user token required by your provider configuration.
2. Call `exchangeExternalAccessToken(externalToken, clientId, membershipId)` on the `MedplumClient` used by that user's application session. `clientId` selects the provider; supply `membershipId` according to the [membership-selection rules](#selecting-a-project-membership).
3. Await the exchange before making Medplum requests or rendering components that require an authenticated Medplum client. The SDK stores the resulting login state on that client and uses its Medplum token for subsequent requests.
4. Manage the external and Medplum sessions separately. Apply platform-appropriate credential storage and use the [token management](/docs/auth/session-management) and [logout](/docs/auth/logout) documentation for the Medplum session.

Use the SDK example in [Exchanging tokens](#exchanging-tokens). Keep the external token for APIs that accept it; use the resulting Medplum token for Medplum API calls. Do not include an application client secret in browser or native code.

## Server-held Medplum tokens

In this implementation, your backend performs the exchange and makes Medplum requests using the resulting **user-scoped token**. The client continues to authenticate to your backend through your application's existing session mechanism.

1. Authenticate the incoming application request and obtain the external user token required by your provider configuration. If your application uses a session cookie, use that session to retrieve the external token through your IDP integration.
2. Resolve the intended Medplum membership from your trusted identity-to-membership mapping. Check that the requested application context is authorized for that identity.
3. Exchange the external user token using the same endpoint or SDK method as the client-held implementation. Use a `MedplumClient` and credential storage isolated to that user and session context.
4. Make the user's Medplum requests with that authenticated client. Return the application's response to the caller while retaining the Medplum credentials on the backend. The resolved membership's access policy applies to these requests.

The [Node.js token exchange example](https://github.com/medplum/medplum/tree/main/examples/medplum-token-exchange-demo) demonstrates the exchange call, with hosted `ClientApplication` configuration and self-hosted provider configuration in its README. Use the session-handling guidance below when integrating the call into your backend.

### Backend session handling

When incorporating the exchange into a running application:

- **Token reuse:** If you cache credentials, bind entries to the authenticated identity, provider/client, membership, and application session. Reject inconsistent mappings and isolate any cached FHIR responses as well as tokens.
- **Expiry and renewal:** Handle expiration and failed renewal explicitly. If no usable Medplum credential remains, obtain a valid external user token and exchange again, or require login. Never substitute an application token when a user-token request fails.
- **Logout:** Revoke the relevant Medplum session using the [logout instructions](/docs/auth/logout), remove cached credentials, and end the application session according to your policy. External IDP logout is a separate integration concern.
- **Live updates:** Deliver updates through an authenticated backend-to-client connection, with access checked for each recipient.

Keeping tokens on your backend works with both project-scoped and server-scoped users. Provider configuration determines which memberships the exchange can select.

## Legacy `/auth/exchange` endpoint

Before supporting the OAuth 2.0 Token Exchange standard, Medplum provided the `/auth/exchange` endpoint. This endpoint is deprecated, and developers are encouraged to adopt the standard.
