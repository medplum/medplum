/*
 * This is a generated file
 * Do not edit manually.
 */

import { PrimitiveExtension } from './PrimitiveExtension';

/**
 * External Identity Provider (IdP) configuration details.
 */
export interface IdentityProvider {

  /**
   * Remote URL for the external Identity Provider authorize endpoint.
   */
  authorizeUrl: string;

  /**
   * Remote URL for the external Identity Provider authorize endpoint.
   */
  _authorizeUrl?: PrimitiveExtension;

  /**
   * Remote URL for the external Identity Provider token endpoint.
   */
  tokenUrl: string;

  /**
   * Remote URL for the external Identity Provider token endpoint.
   */
  _tokenUrl?: PrimitiveExtension;

  /**
   * Client Authentication method used by Clients to authenticate to the
   * Authorization Server when using the Token Endpoint. If no method is
   * registered, the default method is client_secret_basic.
   */
  tokenAuthMethod?: 'client_secret_basic' | 'client_secret_post';

  /**
   * Client Authentication method used by Clients to authenticate to the
   * Authorization Server when using the Token Endpoint. If no method is
   * registered, the default method is client_secret_basic.
   */
  _tokenAuthMethod?: PrimitiveExtension;

  /**
   * Remote URL for the external Identity Provider userinfo endpoint.
   */
  userInfoUrl: string;

  /**
   * Remote URL for the external Identity Provider userinfo endpoint.
   */
  _userInfoUrl?: PrimitiveExtension;

  /**
   * External Identity Provider client ID.
   */
  clientId: string;

  /**
   * External Identity Provider client ID.
   */
  _clientId?: PrimitiveExtension;

  /**
   * External Identity Provider client secret.
   */
  clientSecret: string;

  /**
   * External Identity Provider client secret.
   */
  _clientSecret?: PrimitiveExtension;

  /**
   * Optional flag to use PKCE in the token request.
   */
  usePkce?: boolean;

  /**
   * Optional flag to use PKCE in the token request.
   */
  _usePkce?: PrimitiveExtension;

  /**
   * Optional flag to use the subject field instead of the email field.
   */
  useSubject?: boolean;

  /**
   * Optional flag to use the subject field instead of the email field.
   */
  _useSubject?: PrimitiveExtension;
}
