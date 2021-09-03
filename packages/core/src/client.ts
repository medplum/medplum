// PKCE auth ased on:
// https://aws.amazon.com/blogs/security/how-to-add-authentication-single-page-web-application-with-amazon-cognito-oauth2-implementation/

import { LRUCache } from './cache';
import { encryptSHA256, getRandomString } from './crypto';
import { EventTarget } from './eventtarget';
import { Binary, Bundle, Reference, Resource, SearchParameter, StructureDefinition, Subscription, ValueSet } from './fhir';
import { parseJWTPayload } from './jwt';
import { isOk, OperationOutcomeError } from './outcomes';
import { formatSearchQuery, Operator, SearchRequest } from './search';
import { LocalStorage, MemoryStorage, Storage } from './storage';
import { IndexedStructureDefinition, indexStructureDefinition } from './types';
import { arrayBufferToBase64, ProfileResource, stringify } from './utils';

const DEFAULT_BASE_URL = 'https://api.medplum.com/';
const DEFAULT_RESOURCE_CACHE_SIZE = 1000;
const DEFAULT_BLOB_CACHE_SIZE = 100;
const JSON_CONTENT_TYPE = 'application/json';
const FHIR_CONTENT_TYPE = 'application/fhir+json';
const PATCH_CONTENT_TYPE = 'application/json-patch+json';

export interface MedplumClientOptions {
  /**
   * The client ID.
   * Required.
   */
  clientId: string;

  /**
   * Base server URL.
   * Optional.  Default value is "https://api.medplum.com/".
   * Use this to point to a custom Medplum deployment.
   */
  baseUrl: string;

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
   * Number of blob URLs to store in the cache.
   * Optional.  Default value is 100.
   * Consider using this for performance of displaying Patient or Practitioner resources.
   */
  blobCacheSize?: number;

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

interface LoginResponse {
  profile: any;
  accessToken: string;
  refreshToken: string;
}

interface TokenResponse {
  token_type: string;
  id_token: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  projectName: string;
  email: string;
  password: string;
  remember?: boolean;
}

export interface GoogleCredentialResponse {
  readonly clientId: string;
  readonly credential: string;
}

export class MedplumClient extends EventTarget {
  private readonly fetch: FetchLike;
  private readonly storage: Storage;
  private readonly schema: Map<string, IndexedStructureDefinition>;
  private readonly resourceCache: LRUCache<Resource | Promise<Resource>>;
  private readonly blobUrlCache: LRUCache<string | Promise<string>>;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly authorizeUrl: string;
  private readonly tokenUrl: string;
  private readonly logoutUrl: string;
  private readonly onUnauthenticated?: () => void;
  private profile?: ProfileResource;

  constructor(options: MedplumClientOptions) {
    super();

    if (options.baseUrl) {
      if (!options.baseUrl.startsWith('http')) {
        throw new Error('Base URL must start with http or https');
      }
      if (!options.baseUrl.endsWith('/')) {
        throw new Error('Base URL must end with a trailing slash');
      }
    }

    if (!options.clientId) {
      throw new Error('Client ID cannot be empty');
    }

    this.fetch = options.fetch || window.fetch.bind(window);
    this.storage = typeof localStorage !== 'undefined' ? new LocalStorage() : new MemoryStorage();
    this.schema = new Map();
    this.resourceCache = new LRUCache(options.resourceCacheSize ?? DEFAULT_RESOURCE_CACHE_SIZE);
    this.blobUrlCache = new LRUCache(options.blobCacheSize ?? DEFAULT_BLOB_CACHE_SIZE);
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.clientId = options.clientId;
    this.authorizeUrl = options.authorizeUrl || this.baseUrl + 'oauth2/authorize';
    this.tokenUrl = options.tokenUrl || this.baseUrl + 'oauth2/token';
    this.logoutUrl = options.logoutUrl || this.baseUrl + 'oauth2/logout';
    this.onUnauthenticated = options.onUnauthenticated;
  }

  /**
   * Clears all auth state including local storage and session storage.
   */
  clear(): void {
    this.storage.clear();
    this.profile = undefined;
    this.dispatchEvent({ type: 'change' });
  }

  get(url: string, blob?: boolean): Promise<any> {
    return this.request('GET', url, undefined, undefined, blob);
  }

  post(url: string, body: any, contentType?: string): Promise<any> {
    return this.request('POST', url, contentType, body);
  }

  put(url: string, body: any, contentType?: string): Promise<any> {
    return this.request('PUT', url, contentType, body);
  }

  /**
   * Tries to register a new user.
   * @param request The registration request.
   * @returns Promise to the user profile resource.
   */
  register(request: RegisterRequest): Promise<ProfileResource> {
    return this.post('auth/register', request)
      .then((response: LoginResponse) => this.handleLoginResponse(response));
  }

  /**
   * Tries to sign in with email and password.
   * @param email The user email address.
   * @param password The user password.
   * @param role The login role.
   * @param scope The OAuth2 login scope.
   * @param remember Optional flag to "remember" to generate a refresh token and persist in local storage.
   * @returns Promise to the user profile resource.
   */
  signIn(
    email: string,
    password: string,
    role: string,
    scope: string,
    remember?: boolean): Promise<ProfileResource> {

    return this.post('auth/login', {
      clientId: this.clientId,
      email,
      password,
      role,
      scope,
      remember: !!remember
    }).then((response: LoginResponse) => this.handleLoginResponse(response));
  }

  /**
   * Tries to sign in with Google authentication.
   * The response parameter is the result of a Google authentication.
   * See: https://developers.google.com/identity/gsi/web/guides/handle-credential-responses-js-functions
   * @param googleResponse The Google credential response.
   * @returns Promise to the user profile resource.
   */
  signInWithGoogle(googleResponse: GoogleCredentialResponse): Promise<ProfileResource> {
    return this.post('auth/google', googleResponse)
      .then((loginResponse: LoginResponse) => this.handleLoginResponse(loginResponse));
  }

  /**
   * Handles a login response.
   * This can be used for both "register" and "signIn".
   * @param response The login response.
   * @returns The user profile.
   */
  private handleLoginResponse(response: LoginResponse): ProfileResource {
    this.setAccessToken(response.accessToken);
    this.setRefreshToken(response.refreshToken);
    this.setProfile(response.profile);
    this.dispatchEvent({ type: 'change' });
    return response.profile;
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
    if (!this.logoutUrl) {
      throw new Error('Missing logout URL');
    }
    window.location.assign(this.logoutUrl);
  }

  fhirUrl(...path: string[]): string {
    const builder = [this.baseUrl, 'fhir/R4'];
    path.forEach(p => builder.push('/', encodeURIComponent(p)))
    return builder.join('');
  }

  search<T extends Resource>(search: string | SearchRequest): Promise<Bundle<T>> {
    if (typeof search === 'string') {
      return this.get('fhir/R4/' + search);
    } else {
      return this.get(this.fhirUrl(search.resourceType) + formatSearchQuery(search));
    }
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
      `&filter=${encodeURIComponent(filter)}`);
  }

  read(resourceType: string, id: string): Promise<Resource> {
    const cacheKey = resourceType + '/' + id;
    const promise = this.get(this.fhirUrl(resourceType, id))
      .then((resource: Resource) => {
        this.resourceCache.set(cacheKey, resource);
        return resource;
      });
    this.resourceCache.set(cacheKey, promise);
    return promise;
  }

  readCached(resourceType: string, id: string): Promise<Resource> {
    const cached = this.resourceCache.get(resourceType + '/' + id);
    return cached ? Promise.resolve(cached) : this.read(resourceType, id);
  }

  readReference(reference: Reference): Promise<Resource> {
    const refString = reference?.reference;
    if (!refString) {
      return Promise.reject('Missing reference');
    }
    const [resourceType, id] = refString.split('/');
    return this.read(resourceType, id);
  }

  readCachedReference(reference: Reference): Promise<Resource> {
    const refString = reference?.reference;
    if (!refString) {
      return Promise.reject('Missing reference');
    }
    const [resourceType, id] = refString.split('/');
    return this.readCached(resourceType, id);
  }

  getTypeDefinition(resourceType: string): Promise<IndexedStructureDefinition> {
    if (!resourceType) {
      throw new Error('Missing resourceType');
    }
    const cached = this.schema.get(resourceType);
    if (cached) {
      return Promise.resolve(cached);
    }
    let typeDef: IndexedStructureDefinition;
    return this.search<StructureDefinition>('StructureDefinition?name:exact=' + encodeURIComponent(resourceType))
      .then((result: Bundle<StructureDefinition>) => {
        if (!result.entry?.length) {
          throw new Error('StructureDefinition not found');
        }
        const resource = result.entry[0].resource;
        if (!resource) {
          throw new Error('StructureDefinition not found');
        }
        typeDef = indexStructureDefinition(resource);
      })
      .then(() => this.search<SearchParameter>({
        resourceType: 'SearchParameter',
        count: 100,
        filters: [{
          code: 'base',
          operator: Operator.EQUALS,
          value: resourceType
        }]
      }))
      .then((result: Bundle<SearchParameter>) => {
        const entries = result.entry;
        if (entries) {
          typeDef.types[resourceType].searchParams = entries
            .map(e => e.resource as SearchParameter)
            .sort((a, b) => a.name?.localeCompare(b.name as string) ?? 0);
        }
        this.schema.set(resourceType, typeDef);
        return typeDef;
      });
  }

  readHistory(resourceType: string, id: string): Promise<Bundle> {
    return this.get(this.fhirUrl(resourceType, id, '_history'));
  }

  readPatientEverything(id: string): Promise<Bundle> {
    return this.get(this.fhirUrl('Patient', id, '$everything'));
  }

  readBlob(url: string): Promise<Blob> {
    return this.get(url, true);
  }

  readBlobAsObjectUrl(url: string): Promise<string> {
    const promise = this.readBlob(url)
      .then(imageBlob => {
        const imageUrl = URL.createObjectURL(imageBlob);
        this.blobUrlCache.set(url, imageUrl);
        return imageUrl;
      });
    this.blobUrlCache.set(url, promise);
    return promise;
  }

  readCachedBlobAsObjectUrl(url: string): Promise<string> {
    const cached = this.blobUrlCache.get(url);
    return cached ? Promise.resolve(cached) : this.readBlobAsObjectUrl(url);
  }

  readBinary(id: string): Promise<Blob> {
    return this.readBlob(this.fhirUrl('Binary', id));
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

  graphql(gql: any): Promise<any> {
    return this.post(this.fhirUrl('$graphql'), gql, JSON_CONTENT_TYPE);
  }

  subscribe(criteria: string, handler: (e: Resource) => void): Promise<EventSource> {
    return this.create({
      resourceType: 'Subscription',
      status: 'active',
      criteria: criteria,
      channel: {
        type: 'sse'
      }
    }).then((sub: Subscription) => {
      const eventSource = new EventSource(this.baseUrl + 'sse?subscription=' + encodeURIComponent(sub.id as string), {
        withCredentials: true
      });

      eventSource.onmessage = (e: MessageEvent) => {
        handler(JSON.parse(e.data) as Resource);
      };

      return eventSource;
    });
  }

  getProfile(): ProfileResource | undefined {
    if (!this.profile) {
      this.profile = this.storage.getObject<ProfileResource>('profile');
    }
    return this.profile;
  }

  private setProfile(profile: ProfileResource): void {
    this.storage.setObject('profile', profile);
    this.profile = profile;
  }

  private getAccessToken(): string | undefined {
    return this.storage.getString('accessToken');
  }

  private setAccessToken(accessToken: string | undefined): void {
    this.storage.setString('accessToken', accessToken);
  }

  private getRefreshToken(): string | undefined {
    return this.storage.getString('refreshToken');
  }

  private setRefreshToken(refreshToken: string | undefined): void {
    this.storage.setString('refreshToken', refreshToken);
  }

  /**
   * Makes an HTTP request.
   * @param {string} method
   * @param {string} url
   * @param {string=} contentType
   * @param {Object=} body
   * @param {boolean=} blob
   */
  private async request(
    method: string,
    url: string,
    contentType?: string,
    body?: any,
    blob?: boolean): Promise<any> {

    if (!url.startsWith('http')) {
      url = this.baseUrl + url;
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType || FHIR_CONTENT_TYPE
    };

    const accessToken = this.getAccessToken();
    if (accessToken) {
      headers['Authorization'] = 'Bearer ' + accessToken;
    }

    const options: RequestInit = {
      method: method,
      cache: 'no-cache',
      credentials: 'include',
      headers
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
      return this.handleUnauthenticated(method, url, contentType, body, blob);
    }

    const obj = blob ? await response.blob() : await response.json();
    if (obj.resourceType === 'OperationOutcome' && !isOk(obj)) {
      return Promise.reject(new OperationOutcomeError(obj));
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
   * @param blob Optional blob flag of the original request.
   */
  private async handleUnauthenticated(
    method: string,
    url: string,
    contentType?: string,
    body?: any,
    blob?: boolean): Promise<any> {
    return this.refresh()
      .then(() => this.request(method, url, contentType, body, blob))
      .catch(error => {
        this.clear();
        if (this.onUnauthenticated) {
          this.onUnauthenticated();
        }
        return Promise.reject(error);
      });
  }

  /**
   * Redirects the user to the login screen for authorization.
   * Clears all auth state including local storage and session storage.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
   */
  private async requestAuthorization() {
    if (!this.authorizeUrl) {
      throw new Error('Missing authorize URL');
    }

    this.clear();

    const pkceState = getRandomString();
    this.storage.setString('pkceState', pkceState);

    const codeVerifier = getRandomString();
    this.storage.setString('codeVerifier', codeVerifier);

    const arrayHash = await encryptSHA256(codeVerifier);
    const codeChallenge = arrayBufferToBase64(arrayHash);
    this.storage.setString('codeChallenge', codeChallenge);

    const scope = 'launch/patient openid fhirUser offline_access user/*.*';

    window.location.assign(this.authorizeUrl +
      '?response_type=code' +
      '&state=' + encodeURIComponent(pkceState) +
      '&client_id=' + encodeURIComponent(this.clientId) +
      '&redirect_uri=' + encodeURIComponent(getBaseUrl()) +
      '&scope=' + encodeURIComponent(scope) +
      '&code_challenge_method=S256' +
      '&code_challenge=' + encodeURIComponent(codeChallenge));
  }

  /**
   * Processes an OAuth authorization code.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenRequest
   * @param code The authorization code received by URL parameter.
   */
  private processCode(code: string): Promise<ProfileResource> {
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
      '&client_id=' + encodeURIComponent(this.clientId) +
      '&code_verifier=' + encodeURIComponent(codeVerifier) +
      '&redirect_uri=' + encodeURIComponent(getBaseUrl()) +
      '&code=' + encodeURIComponent(code));
  }

  /**
   * Tries to refresh the auth tokens.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#RefreshTokens
   */
  private async refresh(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clear();
      return Promise.reject('Invalid refresh token');
    }

    await this.fetchTokens(
      'grant_type=refresh_token' +
      '&client_id=' + encodeURIComponent(this.clientId) +
      '&refresh_token=' + encodeURIComponent(refreshToken));
  }

  /**
   * Makes a POST request to the tokens endpoint.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
   * @param formBody Token parameters in URL encoded format.
   */
  private async fetchTokens(formBody: string): Promise<ProfileResource> {
    if (!this.tokenUrl) {
      throw new Error('Missing token URL');
    }

    return this.fetch(
      this.tokenUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody
      })
      .then(response => {
        if (!response.ok) {
          return Promise.reject('Failed to fetch tokens');
        }
        return response.json();
      })
      .then(tokens => this.verifyTokens(tokens))
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
    if (Date.now() >= tokenPayload.exp * 1000) {
      this.clear();
      return Promise.reject('Token expired');
    }

    // Verify app_client_id
    if (tokenPayload.client_id !== this.clientId) {
      this.clear();
      return Promise.reject('Token was not issued for this audience');
    }

    this.setAccessToken(token);
    this.setRefreshToken(tokens.refresh_token);
  }
}

/**
 * Returns the base URL for the current page.
 */
function getBaseUrl() {
  return window.location.protocol + '//' + window.location.host + '/';
}
