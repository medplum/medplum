// PKCE auth ased on:
// https://aws.amazon.com/blogs/security/how-to-add-authentication-single-page-web-application-with-amazon-cognito-oauth2-implementation/

import {
  Binary,
  Bundle,
  Project,
  ProjectMembership,
  Reference,
  Resource,
  SearchParameter,
  StructureDefinition,
  ValueSet,
} from '@medplum/fhirtypes';
import { LRUCache } from './cache';
import { encryptSHA256, getRandomString } from './crypto';
import { EventTarget } from './eventtarget';
import { parseJWTPayload } from './jwt';
import { isOk } from './outcomes';
import { formatSearchQuery, SearchRequest } from './search';
import { ClientStorage } from './storage';
import { createSchema, IndexedStructureDefinition, indexSearchParameter, indexStructureDefinition } from './types';
import { arrayBufferToBase64, ProfileResource, stringify } from './utils';

const DEFAULT_BASE_URL = 'https://api.medplum.com/';
const DEFAULT_SCOPE = 'launch/patient openid fhirUser offline_access user/*.*';
const DEFAULT_RESOURCE_CACHE_SIZE = 1000;
const JSON_CONTENT_TYPE = 'application/json';
const FHIR_CONTENT_TYPE = 'application/fhir+json';
const PATCH_CONTENT_TYPE = 'application/json-patch+json';

export interface MedplumClientOptions {
  /**
   * The client ID.
   * Optional.  Default is to defer to the server to use the default client.
   * Use this to use a specific client for SMART-on-FHIR.
   */
  clientId?: string;

  /**
   * Base server URL.
   * Optional.  Default value is "https://api.medplum.com/".
   * Use this to point to a custom Medplum deployment.
   */
  baseUrl?: string;

  /**
   * OAuth2 authorize URL.
   * Optional.  Default value is baseUrl + "/oauth2/authorize".
   * Use this if you want to use a separate OAuth server.
   */
  authorizeUrl?: string;

  /**
   * OAuth2 token URL.
   * Optional.  Default value is baseUrl + "/oauth2/token".
   * Use this if you want to use a separate OAuth server.
   */
  tokenUrl?: string;

  /**
   * OAuth2 logout URL.
   * Optional.  Default value is baseUrl + "/oauth2/logout".
   * Use this if you want to use a separate OAuth server.
   */
  logoutUrl?: string;

  /**
   * Number of resources to store in the cache.
   * Optional.  Default value is 1000.
   * Consider using this for performance of displaying Patient or Practitioner resources.
   */
  resourceCacheSize?: number;

  /**
   * Optional fetch implementation.
   * Optional.  Default is window.fetch.
   * For nodejs applications, consider the 'node-fetch' package.
   */
  fetch?: FetchLike;

  /**
   * Optional callback for when the client is unauthenticated.
   * Default is do nothing.
   * For client side applications, consider redirecting to a sign in page.
   */
  onUnauthenticated?: () => void;
}

export interface FetchLike {
  (url: string, options?: any): Promise<any>;
}

export interface RegisterRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly projectName: string;
  readonly email: string;
  readonly password: string;
  readonly remember?: boolean;
  readonly recaptchaToken: string;
}

export interface GoogleCredentialResponse {
  readonly clientId: string;
  readonly credential: string;
}

export interface LoginAuthenticationResponse {
  readonly login: string;
  readonly code?: string;
  readonly memberships?: ProjectMembership[];
}

export interface LoginProfileResponse {
  readonly login: string;
  readonly scope: string;
}

export interface LoginScopeResponse {
  readonly login: string;
  readonly code: string;
}

export interface LoginState {
  readonly project: Reference<Project>;
  readonly profile: Reference<ProfileResource>;
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface TokenResponse {
  readonly token_type: string;
  readonly id_token: string;
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly project: Reference<Project>;
  readonly profile: Reference<ProfileResource>;
}

interface SchemaGraphQLResponse {
  readonly data: {
    readonly StructureDefinitionList: StructureDefinition[];
    readonly SearchParameterList: SearchParameter[];
  };
}

export class MedplumClient extends EventTarget {
  private readonly fetch: FetchLike;
  private readonly storage: ClientStorage;
  private readonly schema: IndexedStructureDefinition;
  private readonly resourceCache: LRUCache<Resource | Promise<Resource>>;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly authorizeUrl: string;
  private readonly tokenUrl: string;
  private readonly logoutUrl: string;
  private readonly onUnauthenticated?: () => void;
  private refreshPromise?: Promise<any>;
  private loading: boolean;

  constructor(options?: MedplumClientOptions) {
    super();

    if (options?.baseUrl) {
      if (!options.baseUrl.startsWith('http')) {
        throw new Error('Base URL must start with http or https');
      }
      if (!options.baseUrl.endsWith('/')) {
        throw new Error('Base URL must end with a trailing slash');
      }
    }

    this.fetch = options?.fetch || window.fetch.bind(window);
    this.storage = new ClientStorage();
    this.schema = createSchema();
    this.resourceCache = new LRUCache(options?.resourceCacheSize ?? DEFAULT_RESOURCE_CACHE_SIZE);
    this.baseUrl = options?.baseUrl || DEFAULT_BASE_URL;
    this.clientId = options?.clientId || '';
    this.authorizeUrl = options?.authorizeUrl || this.baseUrl + 'oauth2/authorize';
    this.tokenUrl = options?.tokenUrl || this.baseUrl + 'oauth2/token';
    this.logoutUrl = options?.logoutUrl || this.baseUrl + 'oauth2/logout';
    this.onUnauthenticated = options?.onUnauthenticated;
    if (!this.getActiveLogin()?.profile?.reference) {
      this.clear();
    }
    this.loading = false;
    this.refreshProfile().catch(console.log);
  }

  /**
   * Clears all auth state including local storage and session storage.
   */
  clear(): void {
    this.storage.clear();
    this.resourceCache.clear();
    this.dispatchEvent({ type: 'change' });
  }

  get(url: string): Promise<any> {
    return this.request('GET', url);
  }

  post(url: string, body: any, contentType?: string): Promise<any> {
    return this.request('POST', url, contentType, body);
  }

  put(url: string, body: any, contentType?: string): Promise<any> {
    return this.request('PUT', url, contentType, body);
  }

  delete(url: string): Promise<any> {
    return this.request('DELETE', url);
  }

  /**
   * Tries to register a new user.
   * @param request The registration request.
   * @returns Promise to the authentication response.
   */
  async register(request: RegisterRequest): Promise<void> {
    const response = await this.post('auth/register', request);
    await this.setActiveLogin(response as LoginState);
  }

  /**
   * Initiates a user login flow.
   * @param email The email address of the user.
   * @param password The password of the user.
   * @param remember Optional flag to remember the user.
   * @returns Promise to the authentication response.
   */
  async startLogin(email: string, password: string, remember?: boolean): Promise<LoginAuthenticationResponse> {
    await this.startPkce();
    return this.post('auth/login', {
      clientId: this.clientId,
      scope: DEFAULT_SCOPE,
      codeChallengeMethod: 'S256',
      codeChallenge: this.storage.getString('codeChallenge') as string,
      email,
      password,
      remember: !!remember,
    }) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Tries to sign in with Google authentication.
   * The response parameter is the result of a Google authentication.
   * See: https://developers.google.com/identity/gsi/web/guides/handle-credential-responses-js-functions
   * @param googleResponse The Google credential response.
   * @returns Promise to the authentication response.
   */
  async startGoogleLogin(googleResponse: GoogleCredentialResponse): Promise<LoginAuthenticationResponse> {
    await this.startPkce();
    return this.post('auth/google', googleResponse) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Signs out locally.
   * Does not invalidate tokens with the server.
   */
  signOut(): Promise<void> {
    this.clear();
    return Promise.resolve();
  }

  /**
   * Tries to sign in the user.
   * Returns true if the user is signed in.
   * This may result in navigating away to the sign in page.
   */
  signInWithRedirect(): Promise<ProfileResource | void> | undefined {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (!code) {
      this.requestAuthorization();
      return undefined;
    } else {
      return this.processCode(code);
    }
  }

  /**
   * Tries to sign out the user.
   * See: https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
   */
  signOutWithRedirect(): void {
    window.location.assign(this.logoutUrl);
  }

  /**
   * Builds a FHIR URL from a collection of URL path components.
   * For example, `buildUrl('/Patient', '123')` returns `fhir/R4/Patient/123`.
   * @param path The path component of the URL.
   * @returns The well-formed FHIR URL.
   */
  fhirUrl(...path: string[]): string {
    const builder = [this.baseUrl, 'fhir/R4'];
    path.forEach((p) => builder.push('/', encodeURIComponent(p)));
    return builder.join('');
  }

  /**
   * Sends a FHIR search request.
   * @param search The search query.
   * @returns Promise to the search result bundle.
   */
  search<T extends Resource>(search: SearchRequest): Promise<Bundle<T>> {
    return this.get(this.fhirUrl(search.resourceType) + formatSearchQuery(search));
  }

  /**
   * Searches a ValueSet resource using the "expand" operation.
   * See: https://www.hl7.org/fhir/operation-valueset-expand.html
   * @param system The ValueSet system url.
   * @param filter The search string.
   * @returns Promise to expanded ValueSet.
   */
  searchValueSet(system: string, filter: string): Promise<ValueSet> {
    return this.get(
      this.fhirUrl('ValueSet', '$expand') +
        `?url=${encodeURIComponent(system)}` +
        `&filter=${encodeURIComponent(filter)}`
    );
  }

  /**
   * Returns a cached resource if it is available.
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns The resource if it is available in the cache; undefined otherwise.
   */
  getCached<T extends Resource>(resourceType: string, id: string): T | undefined {
    const cached = this.resourceCache.get(resourceType + '/' + id) as T | undefined;
    if (cached && !('then' in cached)) {
      return cached;
    }
    return undefined;
  }

  /**
   * Returns a cached resource if it is available.
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns The resource if it is available in the cache; undefined otherwise.
   */
  getCachedReference<T extends Resource>(reference: Reference<T>): T | undefined {
    const cached = this.resourceCache.get(reference.reference as string) as T | undefined;
    if (cached && !('then' in cached)) {
      return cached;
    }
    return undefined;
  }

  read<T extends Resource>(resourceType: string, id: string): Promise<T> {
    const cacheKey = resourceType + '/' + id;
    const promise = this.get(this.fhirUrl(resourceType, id)).then((resource: T) => {
      this.resourceCache.set(cacheKey, resource);
      return resource;
    });
    this.resourceCache.set(cacheKey, promise);
    return promise;
  }

  readCached<T extends Resource>(resourceType: string, id: string): Promise<T> {
    const cached = this.resourceCache.get(resourceType + '/' + id) as T | Promise<T> | undefined;
    return cached ? Promise.resolve(cached) : this.read(resourceType, id);
  }

  readReference<T extends Resource>(reference: Reference<T>): Promise<T> {
    const refString = reference?.reference;
    if (!refString) {
      return Promise.reject('Missing reference');
    }
    const [resourceType, id] = refString.split('/');
    return this.read(resourceType, id);
  }

  readCachedReference<T extends Resource>(reference: Reference<T>): Promise<T> {
    const refString = reference?.reference;
    if (!refString) {
      return Promise.reject('Missing reference');
    }
    const [resourceType, id] = refString.split('/');
    return this.readCached(resourceType, id);
  }

  /**
   * Returns a cached schema for a resource type.
   * If the schema is not cached, returns undefined.
   * It is assumed that a client will call requestSchema before using this method.
   * @param resourceType The FHIR resource type.
   * @returns The schema if immediately available, undefined otherwise.
   */
  getSchema(): IndexedStructureDefinition {
    return this.schema;
  }

  /**
   * Requests the schema for a resource type.
   * If the schema is already cached, the promise is resolved immediately.
   * @param resourceType The FHIR resource type.
   * @returns Promise to a schema with the requested resource type.
   */
  async requestSchema(resourceType: string): Promise<IndexedStructureDefinition> {
    if (resourceType in this.schema.types) {
      return Promise.resolve(this.schema);
    }

    const query = `{
      StructureDefinitionList(name: "${encodeURIComponent(resourceType)}") {
        name,
        description,
        snapshot {
          element {
            id,
            path,
            min,
            max,
            type {
              code,
              targetProfile
            },
            binding {
              valueSet
            },
            definition
          }
        }
      }
      SearchParameterList(base: "${encodeURIComponent(resourceType)}") {
        base,
        code,
        type
      }
    }`.replace(/\s+/g, ' ');

    const response = (await this.graphql(query)) as SchemaGraphQLResponse;

    for (const structureDefinition of response.data.StructureDefinitionList) {
      indexStructureDefinition(this.schema, structureDefinition);
    }

    for (const searchParameter of response.data.SearchParameterList) {
      indexSearchParameter(this.schema, searchParameter);
    }

    return this.schema;
  }

  readHistory<T extends Resource>(resourceType: string, id: string): Promise<Bundle<T>> {
    return this.get(this.fhirUrl(resourceType, id, '_history'));
  }

  readPatientEverything(id: string): Promise<Bundle> {
    return this.get(this.fhirUrl('Patient', id, '$everything'));
  }

  create<T extends Resource>(resource: T): Promise<T> {
    if (!resource.resourceType) {
      throw new Error('Missing resourceType');
    }
    return this.post(this.fhirUrl(resource.resourceType), resource);
  }

  createBinary(data: any, contentType: string): Promise<Binary> {
    return this.post(this.fhirUrl('Binary'), data, contentType);
  }

  update<T extends Resource>(resource: T): Promise<T> {
    if (!resource.resourceType) {
      throw new Error('Missing resourceType');
    }
    if (!resource.id) {
      throw new Error('Missing id');
    }
    return this.put(this.fhirUrl(resource.resourceType, resource.id), resource);
  }

  patch(resourceType: string, id: string, operations: any): Promise<any> {
    return this.request('PATCH', this.fhirUrl(resourceType, id), PATCH_CONTENT_TYPE, operations);
  }

  deleteResource(resourceType: string, id: string): Promise<any> {
    return this.delete(this.fhirUrl(resourceType, id));
  }

  graphql(query: string): Promise<any> {
    return this.post(this.fhirUrl('$graphql'), { query }, JSON_CONTENT_TYPE);
  }

  getActiveLogin(): LoginState | undefined {
    return this.storage.getObject('activeLogin');
  }

  async setActiveLogin(login: LoginState): Promise<void> {
    this.storage.setObject('activeLogin', login);
    this.addLogin(login);
    this.resourceCache.clear();
    this.refreshPromise = undefined;
    await this.refreshProfile();
  }

  getLogins(): LoginState[] {
    return this.storage.getObject<LoginState[]>('logins') ?? [];
  }

  private addLogin(newLogin: LoginState): void {
    const logins = this.getLogins().filter((login) => login.profile?.reference !== newLogin.profile?.reference);
    logins.push(newLogin);
    this.storage.setObject('logins', logins);
  }

  private async refreshProfile(): Promise<ProfileResource | undefined> {
    const reference = this.getActiveLogin()?.profile;
    if (reference?.reference) {
      this.loading = true;
      this.storage.setObject('profile', await this.readCachedReference(reference));
      this.loading = false;
      this.dispatchEvent({ type: 'change' });
    }
    return this.getProfile();
  }

  getProfile(): ProfileResource | undefined {
    return this.storage.getObject('profile');
  }

  isLoading(): boolean {
    return this.loading;
  }

  /**
   * Makes an HTTP request.
   * @param {string} method
   * @param {string} url
   * @param {string=} contentType
   * @param {Object=} body
   */
  private async request(method: string, url: string, contentType?: string, body?: any): Promise<any> {
    if (this.refreshPromise) {
      await this.refreshPromise;
    }

    if (!url.startsWith('http')) {
      url = this.baseUrl + url;
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType || FHIR_CONTENT_TYPE,
    };

    const accessToken = this.getActiveLogin()?.accessToken;
    if (accessToken) {
      headers['Authorization'] = 'Bearer ' + accessToken;
    }

    const options: RequestInit = {
      method: method,
      cache: 'no-cache',
      credentials: 'include',
      headers,
    };

    if (body) {
      if (typeof body === 'string' || (typeof File !== 'undefined' && body instanceof File)) {
        options.body = body;
      } else {
        options.body = stringify(body);
      }
    }

    const response = await this.fetch(url, options);
    if (response.status === 401) {
      // Refresh and try again
      return this.handleUnauthenticated(method, url, contentType, body);
    }

    if (response.status === 204 || response.status === 304) {
      // No content or change
      return undefined;
    }

    const obj = await response.json();
    if (obj.resourceType === 'OperationOutcome' && !isOk(obj)) {
      return Promise.reject(obj);
    }
    return obj;
  }

  /**
   * Handles an unauthenticated response from the server.
   * First, tries to refresh the access token and retry the request.
   * Otherwise, calls unauthenticated callbacks and rejects.
   * @param method The HTTP method of the original request.
   * @param url The URL of the original request.
   * @param contentType The content type of the original request.
   * @param body The body of the original request.
   */
  private async handleUnauthenticated(method: string, url: string, contentType?: string, body?: any): Promise<any> {
    return this.refresh()
      .then(() => this.request(method, url, contentType, body))
      .catch((error) => {
        this.clear();
        if (this.onUnauthenticated) {
          this.onUnauthenticated();
        }
        return Promise.reject(error);
      });
  }

  /**
   * Starts a new PKCE flow.
   * These PKCE values are stateful, and must survive redirects and page refreshes.
   */
  private async startPkce(): Promise<void> {
    const pkceState = getRandomString();
    this.storage.setString('pkceState', pkceState);

    const codeVerifier = getRandomString();
    this.storage.setString('codeVerifier', codeVerifier);

    const arrayHash = await encryptSHA256(codeVerifier);
    const codeChallenge = arrayBufferToBase64(arrayHash).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    this.storage.setString('codeChallenge', codeChallenge);
  }

  /**
   * Redirects the user to the login screen for authorization.
   * Clears all auth state including local storage and session storage.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
   */
  private async requestAuthorization(): Promise<void> {
    if (!this.authorizeUrl) {
      throw new Error('Missing authorize URL');
    }

    this.startPkce();

    window.location.assign(
      this.authorizeUrl +
        '?response_type=code' +
        '&state=' +
        encodeURIComponent(this.storage.getString('pkceState') as string) +
        '&client_id=' +
        encodeURIComponent(this.clientId) +
        '&redirect_uri=' +
        encodeURIComponent(getBaseUrl()) +
        '&scope=' +
        encodeURIComponent(DEFAULT_SCOPE) +
        '&code_challenge_method=S256' +
        '&code_challenge=' +
        encodeURIComponent(this.storage.getString('codeChallenge') as string)
    );
  }

  /**
   * Processes an OAuth authorization code.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenRequest
   * @param code The authorization code received by URL parameter.
   */
  processCode(code: string): Promise<ProfileResource> {
    const pkceState = this.storage.getString('pkceState');
    if (!pkceState) {
      this.clear();
      throw new Error('Invalid PCKE state');
    }

    const codeVerifier = this.storage.getString('codeVerifier');
    if (!codeVerifier) {
      this.clear();
      throw new Error('Invalid PCKE code verifier');
    }

    return this.fetchTokens(
      'grant_type=authorization_code' +
        (this.clientId ? '&client_id=' + encodeURIComponent(this.clientId) : '') +
        '&code_verifier=' +
        encodeURIComponent(codeVerifier) +
        '&redirect_uri=' +
        encodeURIComponent(getBaseUrl()) +
        '&code=' +
        encodeURIComponent(code)
    );
  }

  /**
   * Tries to refresh the auth tokens.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#RefreshTokens
   */
  private async refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = this.getActiveLogin()?.refreshToken;
    if (!refreshToken) {
      this.clear();
      return Promise.reject('Invalid refresh token');
    }

    this.refreshPromise = this.fetchTokens(
      'grant_type=refresh_token' +
        '&client_id=' +
        encodeURIComponent(this.clientId) +
        '&refresh_token=' +
        encodeURIComponent(refreshToken)
    );

    await this.refreshPromise;
  }

  /**
   * Makes a POST request to the tokens endpoint.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
   * @param formBody Token parameters in URL encoded format.
   */
  private async fetchTokens(formBody: string): Promise<ProfileResource> {
    if (!this.tokenUrl) {
      return Promise.reject('Missing token URL');
    }

    return this.fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    })
      .then((response) => {
        if (!response.ok) {
          return Promise.reject('Failed to fetch tokens');
        }
        return response.json();
      })
      .then((tokens) => this.verifyTokens(tokens))
      .then(() => this.getProfile() as ProfileResource);
  }

  /**
   * Verifies the tokens received from the auth server.
   * Validates the JWT against the JWKS.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
   * @param tokens
   */
  private async verifyTokens(tokens: TokenResponse): Promise<void> {
    const token = tokens.access_token;

    // Verify token has not expired
    const tokenPayload = parseJWTPayload(token);
    if (Date.now() >= (tokenPayload.exp as number) * 1000) {
      this.clear();
      return Promise.reject('Token expired');
    }

    // Verify app_client_id
    if (this.clientId && tokenPayload.client_id !== this.clientId) {
      this.clear();
      return Promise.reject('Token was not issued for this audience');
    }

    await this.setActiveLogin({
      accessToken: token,
      refreshToken: tokens.refresh_token,
      project: tokens.project,
      profile: tokens.profile,
    });
  }
}

/**
 * Returns the base URL for the current page.
 */
function getBaseUrl(): string {
  return window.location.protocol + '//' + window.location.host + '/';
}
