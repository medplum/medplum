// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

/**
 * External Identity Provider (IdP) configuration details.
 */
export interface IdentityProvider {

  /**
   * Remote URL for the external Identity Provider authorize endpoint.
   */
  authorizeUrl: string;

  /**
   * Remote URL for the external Identity Provider token endpoint.
   */
  tokenUrl: string;

  /**
   * Client Authentication method used by Clients to authenticate to the
   * Authorization Server when using the Token Endpoint. If no method is
   * registered, the default method is client_secret_basic.
   */
  tokenAuthMethod?: 'client_secret_basic' | 'client_secret_post';

  /**
   * Remote URL for the external Identity Provider userinfo endpoint.
   */
  userInfoUrl: string;

  /**
   * External Identity Provider client ID.
   */
  clientId: string;

  /**
   * External Identity Provider client secret.
   */
  clientSecret: string;

  /**
   * Optional flag to use PKCE in the token request.
   */
  usePkce?: boolean;

  /**
   * Optional flag to use the subject field instead of the email field.
   */
  useSubject?: boolean;

  /**
   * When set, the userinfo request will use POST with a JSON body instead of GET with a Bearer
   * header. The token will be placed in the body under this field name (e.g. 'idToken' for
   * Google Cloud Identity Platform / Firebase).
   */
  userInfoTokenField?: string;

  /**
   * When set, appended as a 'key' query parameter to the userinfo URL. Required by some identity
   * providers such as Google Cloud Identity Platform / Firebase.
   */
  userInfoApiKey?: string;

  /**
   * Dot-separated path used to extract the claims object from a nested userinfo response body
   * (e.g. 'users.0' for Google Cloud Identity Platform / Firebase, whose response shape is
   * { users: [{ email, localId, ... }] }).
   */
  userInfoResponsePath?: string;
}
