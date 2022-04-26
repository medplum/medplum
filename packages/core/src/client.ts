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
  UserConfiguration,
  ValueSet,
} from '@medplum/fhirtypes';
import type { Operation } from 'fast-json-patch';
import { LRUCache } from './cache';
import { encryptSHA256, getRandomString } from './crypto';
import { EventTarget } from './eventtarget';
import { parseJWTPayload } from './jwt';
import { isOk } from './outcomes';
import { formatSearchQuery, parseSearchDefinition, SearchRequest } from './search';
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

/**
 * The MedplumClient class provides a client for the Medplum FHIR server.
 *
 * The client can be used in the browser, in a NodeJS application, or in a Medplum Bot.
 *
 * The client provides helpful methods for common operations such as:
 *   1) Authenticating
 *   2) Creating resources
 *   2) Reading resources
 *   3) Updating resources
 *   5) Deleting resources
 *   6) Searching
 *   7) Making GraphQL queries
 *
 * Here is a quick example of how to use the client:
 *
 * ```typescript
 * import { MedplumClient } from '@medplum/core';
 * const medplum = new MedplumClient();
 * ```
 *
 * Create a `Patient`:
 *
 * ```typescript
 * const patient = await medplum.createResource({
 *   resourceType: 'Patient',
 *   name: [{
 *     given: ['Alice'],
 *     family: 'Smith'
 *   }]
 * });
 * ```
 *
 * Read a `Patient` by ID:
 *
 * ```typescript
 * const patient = await medplum.readResource('Patient', '123');
 * console.log(patient.name[0].given[0]);
 * ```
 *
 * Search for a `Patient` by name:
 *
 * ```typescript
 * const bundle = await medplum.search('Patient?name=Alice');
 * console.log(bundle.total);
 * ```
 *
 */
export class MedplumClient extends EventTarget {
  readonly #fetch: FetchLike;
  readonly #storage: ClientStorage;
  readonly #schema: IndexedStructureDefinition;
  readonly #resourceCache: LRUCache<Resource | Promise<Resource>>;
  readonly #baseUrl: string;
  readonly #clientId: string;
  readonly #authorizeUrl: string;
  readonly #tokenUrl: string;
  readonly #logoutUrl: string;
  readonly #onUnauthenticated?: () => void;
  #accessToken?: string;
  #refreshToken?: string;
  #refreshPromise?: Promise<any>;
  #profilePromise?: Promise<any>;
  #profile?: ProfileResource;
  #config?: UserConfiguration;

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

    this.#fetch = options?.fetch || window.fetch.bind(window);
    this.#storage = new ClientStorage();
    this.#schema = createSchema();
    this.#resourceCache = new LRUCache(options?.resourceCacheSize ?? DEFAULT_RESOURCE_CACHE_SIZE);
    this.#baseUrl = options?.baseUrl || DEFAULT_BASE_URL;
    this.#clientId = options?.clientId || '';
    this.#authorizeUrl = options?.authorizeUrl || this.#baseUrl + 'oauth2/authorize';
    this.#tokenUrl = options?.tokenUrl || this.#baseUrl + 'oauth2/token';
    this.#logoutUrl = options?.logoutUrl || this.#baseUrl + 'oauth2/logout';
    this.#onUnauthenticated = options?.onUnauthenticated;

    const activeLogin = this.getActiveLogin();
    if (activeLogin) {
      this.#accessToken = activeLogin.accessToken;
      this.#refreshToken = activeLogin.refreshToken;
      this.#refreshProfile().catch(console.log);
    }

    this.#setupStorageListener();
  }

  /**
   * Clears all auth state including local storage and session storage.
   */
  clear(): void {
    this.#storage.clear();
    this.#resourceCache.clear();
    this.#accessToken = undefined;
    this.#refreshToken = undefined;
    this.#profile = undefined;
    this.#config = undefined;
    this.dispatchEvent({ type: 'change' });
  }

  /**
   * Makes an HTTP GET request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `readResource()`, `search()`, etc.
   *
   * @param url The target URL.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  get(url: string, options: RequestInit = {}): Promise<any> {
    return this.#request('GET', url, options);
  }

  /**
   * Makes an HTTP POST request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `createResource()`.
   *
   * @param url The target URL.
   * @param body The content body. Strings and `File` objects are passed directly. Other objects are converted to JSON.
   * @param contentType The content type to be included in the "Content-Type" header.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  post(url: string, body: any, contentType?: string, options: RequestInit = {}): Promise<any> {
    if (body) {
      this.#setRequestBody(options, body);
    }
    if (contentType) {
      this.#setRequestContentType(options, contentType);
    }
    return this.#request('POST', url, options);
  }

  /**
   * Makes an HTTP PUT request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `updateResource()`.
   *
   * @param url The target URL.
   * @param body The content body. Strings and `File` objects are passed directly. Other objects are converted to JSON.
   * @param contentType The content type to be included in the "Content-Type" header.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  put(url: string, body: any, contentType?: string, options: RequestInit = {}): Promise<any> {
    if (body) {
      this.#setRequestBody(options, body);
    }
    if (contentType) {
      this.#setRequestContentType(options, contentType);
    }
    return this.#request('PUT', url, options);
  }

  /**
   * Makes an HTTP PATCH request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `patchResource()`.
   *
   * @param url The target URL.
   * @param operations Array of JSONPatch operations.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  patch(url: string, operations: Operation[], options: RequestInit = {}): Promise<any> {
    this.#setRequestBody(options, operations);
    this.#setRequestContentType(options, PATCH_CONTENT_TYPE);
    return this.#request('PATCH', url, options);
  }

  /**
   * Makes an HTTP DELETE request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `deleteResource()`.
   *
   * @param url The target URL.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  delete(url: string, options: RequestInit = {}): Promise<any> {
    return this.#request('DELETE', url, options);
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
    await this.#startPkce();
    return this.post('auth/login', {
      clientId: this.#clientId,
      scope: DEFAULT_SCOPE,
      codeChallengeMethod: 'S256',
      codeChallenge: this.#storage.getString('codeChallenge') as string,
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
    await this.#startPkce();
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
      this.#requestAuthorization();
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
    window.location.assign(this.#logoutUrl);
  }

  /**
   * Builds a FHIR URL from a collection of URL path components.
   * For example, `buildUrl('/Patient', '123')` returns `fhir/R4/Patient/123`.
   * @param path The path component of the URL.
   * @returns The well-formed FHIR URL.
   */
  fhirUrl(...path: string[]): string {
    const builder = [this.#baseUrl, 'fhir/R4'];
    path.forEach((p) => builder.push('/', encodeURIComponent(p)));
    return builder.join('');
  }

  /**
   * Sends a FHIR search request.
   *
   * Example using a FHIR search string:
   *
   * ```typescript
   * const bundle = await client.search('Patient?name=Alice');
   * console.log(bundle);
   * ```
   *
   * Example using a structured search:
   *
   * ```typescript
   * const bundle = await client.search({
   *   resourceType: 'Patient',
   *   filters: [{
   *     code: 'name',
   *     operator: 'eq',
   *     value: 'Alice',
   *   }]
   * });
   * console.log(bundle);
   * ```
   *
   * The return value is a FHIR bundle:
   *
   * ```json
   * {
   *    "resourceType": "Bundle",
   *    "type": "searchest",
   *    "total": 1,
   *    "entry": [
   *       {
   *          "resource": {
   *             "resourceType": "Patient",
   *             "name": [
   *                {
   *                   "given": [
   *                      "George"
   *                   ],
   *                   "family": "Washington"
   *                }
   *             ],
   *          }
   *       }
   *    ]
   * }
   * ```
   *
   * See FHIR search for full details: https://www.hl7.org/fhir/search.html
   *
   * @param query The search query as either a string or a structured search object.
   * @returns Promise to the search result bundle.
   */
  search<T extends Resource>(query: string | SearchRequest, options: RequestInit = {}): Promise<Bundle<T>> {
    return this.get(
      typeof query === 'string' ? 'fhir/R4/' + query : this.fhirUrl(query.resourceType) + formatSearchQuery(query),
      options
    );
  }

  /**
   * Sends a FHIR search request for a single resource.
   *
   * This is a convenience method for `search()` that returns the first resource rather than a `Bundle`.
   *
   * Example using a FHIR search string:
   *
   * ```typescript
   * const patient = await client.searchOne('Patient?identifier=123');
   * console.log(patient);
   * ```
   *
   * The return value is the resource, if available; otherwise, undefined.
   *
   * See FHIR search for full details: https://www.hl7.org/fhir/search.html
   *
   * @param query The search query as either a string or a structured search object.
   * @returns Promise to the search result bundle.
   */
  async searchOne<T extends Resource>(
    query: string | SearchRequest,
    options: RequestInit = {}
  ): Promise<T | undefined> {
    const search: SearchRequest = typeof query === 'string' ? parseSearchDefinition(query) : query;
    (search as any).count = 1;
    const bundle = await this.search<T>(search, options);
    return bundle.entry?.[0]?.resource;
  }

  /**
   * Sends a FHIR search request for an array of resources.
   *
   * This is a convenience method for `search()` that returns the resources as an array rather than a `Bundle`.
   *
   * Example using a FHIR search string:
   *
   * ```typescript
   * const patients = await client.searchResources('Patient?name=Alice');
   * console.log(patients);
   * ```
   *
   * The return value is an array of resources.
   *
   * See FHIR search for full details: https://www.hl7.org/fhir/search.html
   *
   * @param query The search query as either a string or a structured search object.
   * @returns Promise to the search result bundle.
   */
  async searchResources<T extends Resource>(query: string | SearchRequest, options: RequestInit = {}): Promise<T[]> {
    const bundle = await this.search<T>(query, options);
    return bundle.entry?.map((entry) => entry.resource as T) ?? [];
  }

  /**
   * Searches a ValueSet resource using the "expand" operation.
   * See: https://www.hl7.org/fhir/operation-valueset-expand.html
   * @param system The ValueSet system url.
   * @param filter The search string.
   * @returns Promise to expanded ValueSet.
   */
  searchValueSet(system: string, filter: string, options: RequestInit = {}): Promise<ValueSet> {
    return this.get(
      this.fhirUrl('ValueSet', '$expand') +
        `?url=${encodeURIComponent(system)}` +
        `&filter=${encodeURIComponent(filter)}`,
      options
    );
  }

  /**
   * Returns a cached resource if it is available.
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns The resource if it is available in the cache; undefined otherwise.
   */
  getCached<T extends Resource>(resourceType: string, id: string): T | undefined {
    const cached = this.#resourceCache.get(resourceType + '/' + id) as T | undefined;
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
    const cached = this.#resourceCache.get(reference.reference as string) as T | undefined;
    if (cached && !('then' in cached)) {
      return cached;
    }
    return undefined;
  }

  /**
   * Reads a resource by resource type and ID.
   *
   * Example:
   *
   * ```typescript
   * const patient = await medplum.readResource('Patient', '123');
   * console.log(patient);
   * ```
   *
   * See the FHIR "read" operation for full details: https://www.hl7.org/fhir/http.html#read
   *
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @returns The resource if available; undefined otherwise.
   */
  readResource<T extends Resource>(resourceType: string, id: string): Promise<T> {
    const cacheKey = resourceType + '/' + id;
    const promise = this.get(this.fhirUrl(resourceType, id)).then((resource: T) => {
      this.#resourceCache.set(cacheKey, resource);
      return resource;
    });
    this.#resourceCache.set(cacheKey, promise);
    return promise;
  }

  /**
   * Reads a resource by resource type and ID using the in-memory resource cache.
   *
   * If the resource is not available in the cache, it will be read from the server.
   *
   * Example:
   *
   * ```typescript
   * const patient = await medplum.readCached('Patient', '123');
   * console.log(patient);
   * ```
   *
   * See the FHIR "read" operation for full details: https://www.hl7.org/fhir/http.html#read
   *
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @returns The resource if available; undefined otherwise.
   */
  readCached<T extends Resource>(resourceType: string, id: string): Promise<T> {
    const cached = this.#resourceCache.get(resourceType + '/' + id) as T | Promise<T> | undefined;
    return cached ? Promise.resolve(cached) : this.readResource(resourceType, id);
  }

  /**
   * Reads a resource by `Reference`.
   *
   * This is a convenience method for `readResource()` that accepts a `Reference` object.
   *
   * Example:
   *
   * ```typescript
   * const serviceRequest = await medplum.readResource('ServiceRequest', '123');
   * const patient = await medplum.readReference(serviceRequest.subject);
   * console.log(patient);
   * ```
   *
   * See the FHIR "read" operation for full details: https://www.hl7.org/fhir/http.html#read
   *
   * @param reference The FHIR reference object.
   * @returns The resource if available; undefined otherwise.
   */
  readReference<T extends Resource>(reference: Reference<T>): Promise<T> {
    const refString = reference?.reference;
    if (!refString) {
      return Promise.reject('Missing reference');
    }
    const [resourceType, id] = refString.split('/');
    return this.readResource(resourceType, id);
  }

  /**
   * Reads a resource by `Reference` using the in-memory resource cache.
   *
   * This is a convenience method for `readResource()` that accepts a `Reference` object.
   *
   * If the resource is not available in the cache, it will be read from the server.
   *
   * Example:
   *
   * ```typescript
   * const serviceRequest = await medplum.readResource('ServiceRequest', '123');
   * const patient = await medplum.readCachedReference(serviceRequest.subject);
   * console.log(patient);
   * ```
   *
   * See the FHIR "read" operation for full details: https://www.hl7.org/fhir/http.html#read
   *
   * @param reference The FHIR reference object.
   * @returns The resource if available; undefined otherwise.
   */
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
    return this.#schema;
  }

  /**
   * Requests the schema for a resource type.
   * If the schema is already cached, the promise is resolved immediately.
   * @param resourceType The FHIR resource type.
   * @returns Promise to a schema with the requested resource type.
   */
  async requestSchema(resourceType: string): Promise<IndexedStructureDefinition> {
    if (resourceType in this.#schema.types) {
      return Promise.resolve(this.#schema);
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
        type,
        expression,
        target
      }
    }`.replace(/\s+/g, ' ');

    const response = (await this.graphql(query)) as SchemaGraphQLResponse;

    for (const structureDefinition of response.data.StructureDefinitionList) {
      indexStructureDefinition(this.#schema, structureDefinition);
    }

    for (const searchParameter of response.data.SearchParameterList) {
      indexSearchParameter(this.#schema, searchParameter);
    }

    return this.#schema;
  }

  /**
   * Reads resource history by resource type and ID.
   *
   * The return value is a bundle of all versions of the resource.
   *
   * Example:
   *
   * ```typescript
   * const history = await medplum.readHistory('Patient', '123');
   * console.log(history);
   * ```
   *
   * See the FHIR "history" operation for full details: https://www.hl7.org/fhir/http.html#history
   *
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @returns The resource if available; undefined otherwise.
   */
  readHistory<T extends Resource>(resourceType: string, id: string): Promise<Bundle<T>> {
    return this.get(this.fhirUrl(resourceType, id, '_history'));
  }

  /**
   * Reads a specific version of a resource by resource type, ID, and version ID.
   *
   * Example:
   *
   * ```typescript
   * const version = await medplum.readVersion('Patient', '123', '456');
   * console.log(version);
   * ```
   *
   * See the FHIR "vread" operation for full details: https://www.hl7.org/fhir/http.html#vread
   *
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @returns The resource if available; undefined otherwise.
   */
  readVersion<T extends Resource>(resourceType: string, id: string, vid: string): Promise<T> {
    return this.get(this.fhirUrl(resourceType, id, '_history', vid));
  }

  readPatientEverything(id: string): Promise<Bundle> {
    return this.get(this.fhirUrl('Patient', id, '$everything'));
  }

  /**
   * Creates a new FHIR resource.
   *
   * The return value is the newly created resource, including the ID and meta.
   *
   * Example:
   *
   * ```typescript
   * const result = await medplum.createResource({
   *   resourceType: 'Patient',
   *   name: [{
   *    family: 'Smith',
   *    given: ['John']
   *   }]
   * });
   * console.log(result.id);
   * ```
   *
   * See the FHIR "create" operation for full details: https://www.hl7.org/fhir/http.html#create
   *
   * @param resource The FHIR resource to create.
   * @returns The result of the create operation.
   */
  createResource<T extends Resource>(resource: T): Promise<T> {
    if (!resource.resourceType) {
      return Promise.reject('Missing resourceType');
    }
    return this.post(this.fhirUrl(resource.resourceType), resource);
  }

  /**
   * Creates a FHIR `Binary` resource with the provided data content.
   *
   * The return value is the newly created resource, including the ID and meta.
   *
   * The `data` parameter can be a string or a `File` object.
   *
   * A `File` object often comes from a `<input type="file">` element.
   *
   * Example:
   *
   * ```typescript
   * const result = await medplum.createBinary(myFile, 'test.jpg', 'image/jpeg');
   * console.log(result.id);
   * ```
   *
   * See the FHIR "create" operation for full details: https://www.hl7.org/fhir/http.html#create
   *
   * @param resource The FHIR resource to create.
   * @returns The result of the create operation.
   */
  createBinary(data: any, filename: string, contentType: string): Promise<Binary> {
    return this.post(this.fhirUrl('Binary') + '?_filename=' + encodeURIComponent(filename), data, contentType);
  }

  /**
   * Updates a FHIR resource.
   *
   * The return value is the updated resource, including the ID and meta.
   *
   * Example:
   *
   * ```typescript
   * const result = await medplum.updateResource({
   *   resourceType: 'Patient',
   *   id: '123',
   *   name: [{
   *    family: 'Smith',
   *    given: ['John']
   *   }]
   * });
   * console.log(result.meta.versionId);
   * ```
   *
   * See the FHIR "update" operation for full details: https://www.hl7.org/fhir/http.html#update
   *
   * @param resource The FHIR resource to update.
   * @returns The result of the update operation.
   */
  updateResource<T extends Resource>(resource: T): Promise<T> {
    if (!resource.resourceType) {
      return Promise.reject('Missing resourceType');
    }
    if (!resource.id) {
      return Promise.reject('Missing id');
    }
    return this.put(this.fhirUrl(resource.resourceType, resource.id), resource);
  }

  /**
   * Updates a FHIR resource using JSONPatch operations.
   *
   * The return value is the updated resource, including the ID and meta.
   *
   * Example:
   *
   * ```typescript
   * const result = await medplum.patchResource('Patient', '123', [
   *   {op: 'replace', path: '/name/0/family', value: 'Smith'},
   * ]);
   * console.log(result.meta.versionId);
   * ```
   *
   * See the FHIR "update" operation for full details: https://www.hl7.org/fhir/http.html#patch
   *
   * See the JSONPatch specification for full details: https://tools.ietf.org/html/rfc6902
   *
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @param operations The JSONPatch operations.
   * @returns The result of the patch operations.
   */
  patchResource<T extends Resource>(resourceType: string, id: string, operations: Operation[]): Promise<T> {
    return this.patch(this.fhirUrl(resourceType, id), operations);
  }

  /**
   * Deletes a FHIR resource by resource type and ID.
   *
   * Example:
   *
   * ```typescript
   * await medplum.deleteResource('Patient', '123');
   * ```
   *
   * See the FHIR "delete" operation for full details: https://www.hl7.org/fhir/http.html#delete
   *
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @returns The result of the delete operation.
   */
  deleteResource(resourceType: string, id: string): Promise<any> {
    return this.delete(this.fhirUrl(resourceType, id));
  }

  graphql(query: string, options?: RequestInit): Promise<any> {
    return this.post(this.fhirUrl('$graphql'), { query }, JSON_CONTENT_TYPE, options);
  }

  getActiveLogin(): LoginState | undefined {
    return this.#storage.getObject('activeLogin');
  }

  async setActiveLogin(login: LoginState): Promise<void> {
    this.#accessToken = login.accessToken;
    this.#refreshToken = login.refreshToken;
    this.#profile = undefined;
    this.#config = undefined;
    this.#storage.setObject('activeLogin', login);
    this.#addLogin(login);
    this.#resourceCache.clear();
    this.#refreshPromise = undefined;
    await this.#refreshProfile();
  }

  setAccessToken(accessToken: string): void {
    this.#accessToken = accessToken;
    this.#refreshToken = undefined;
    this.#profile = undefined;
    this.#config = undefined;
  }

  getLogins(): LoginState[] {
    return this.#storage.getObject<LoginState[]>('logins') ?? [];
  }

  #addLogin(newLogin: LoginState): void {
    const logins = this.getLogins().filter((login) => login.profile?.reference !== newLogin.profile?.reference);
    logins.push(newLogin);
    this.#storage.setObject('logins', logins);
  }

  async #refreshProfile(): Promise<ProfileResource | undefined> {
    this.#profilePromise = new Promise((resolve, reject) => {
      this.get('auth/me')
        .then((result) => {
          this.#profilePromise = undefined;
          this.#profile = result.profile;
          this.#config = result.config;
          this.dispatchEvent({ type: 'change' });
          resolve(this.#profile);
        })
        .catch(reject);
    });

    return this.#profilePromise;
  }

  isLoading(): boolean {
    return !!this.#profilePromise;
  }

  getProfile(): ProfileResource | undefined {
    return this.#profile;
  }

  async getProfileAsync(): Promise<ProfileResource | undefined> {
    if (this.#profilePromise) {
      await this.#profilePromise;
    }
    return this.getProfile();
  }

  getUserConfiguration(): UserConfiguration | undefined {
    return this.#config;
  }

  /**
   * Downloads the URL as a blob.
   * @param url The URL to request.
   * @returns Promise to the response body as a blob.
   */
  async download(url: string, options: RequestInit = {}): Promise<Blob> {
    if (this.#refreshPromise) {
      await this.#refreshPromise;
    }
    this.#addFetchOptionsDefaults(options);
    const response = await this.#fetch(url, options);
    return response.blob();
  }

  /**
   * Makes an HTTP request.
   * @param {string} method
   * @param {string} url
   * @param {string=} contentType
   * @param {Object=} body
   */
  async #request(method: string, url: string, options: RequestInit = {}): Promise<any> {
    if (this.#refreshPromise) {
      await this.#refreshPromise;
    }

    if (!url.startsWith('http')) {
      url = this.#baseUrl + url;
    }

    options.method = method;
    this.#addFetchOptionsDefaults(options);

    const response = await this.#fetch(url, options);
    if (response.status === 401) {
      // Refresh and try again
      return this.#handleUnauthenticated(method, url, options);
    }

    if (response.status === 204 || response.status === 304) {
      // No content or change
      return undefined;
    }

    const obj = await response.json();
    if (obj?.resourceType === 'OperationOutcome' && !isOk(obj)) {
      return Promise.reject(obj);
    }
    return obj;
  }

  /**
   * Adds default options to the fetch options.
   * @param options The options to add defaults to.
   */
  #addFetchOptionsDefaults(options: RequestInit): void {
    if (!options.headers) {
      options.headers = {};
    }

    const headers = options.headers as Record<string, string>;
    if (!headers['Content-Type']) {
      headers['Content-Type'] = FHIR_CONTENT_TYPE;
    }

    if (this.#accessToken) {
      headers['Authorization'] = 'Bearer ' + this.#accessToken;
    }

    if (!options.cache) {
      options.cache = 'no-cache';
    }

    if (!options.credentials) {
      options.credentials = 'include';
    }
  }

  /**
   * Sets the "Content-Type" header on fetch options.
   * @param options The fetch options.
   * @param contentType The new content type to set.
   */
  #setRequestContentType(options: RequestInit, contentType: string): void {
    if (!options.headers) {
      options.headers = {};
    }
    const headers = options.headers as Record<string, string>;
    headers['Content-Type'] = contentType;
  }

  /**
   * Sets the body on fetch options.
   * @param options The fetch options.
   * @param data The new content body.
   */
  #setRequestBody(options: RequestInit, data: any): void {
    if (typeof data === 'string' || (typeof File !== 'undefined' && data instanceof File)) {
      options.body = data;
    } else if (data) {
      options.body = stringify(data);
    }
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
  async #handleUnauthenticated(method: string, url: string, options: RequestInit): Promise<any> {
    return this.#refresh()
      .then(() => this.#request(method, url, options))
      .catch((error) => {
        this.clear();
        if (this.#onUnauthenticated) {
          this.#onUnauthenticated();
        }
        return Promise.reject(error);
      });
  }

  /**
   * Starts a new PKCE flow.
   * These PKCE values are stateful, and must survive redirects and page refreshes.
   */
  async #startPkce(): Promise<void> {
    const pkceState = getRandomString();
    this.#storage.setString('pkceState', pkceState);

    const codeVerifier = getRandomString();
    this.#storage.setString('codeVerifier', codeVerifier);

    const arrayHash = await encryptSHA256(codeVerifier);
    const codeChallenge = arrayBufferToBase64(arrayHash).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    this.#storage.setString('codeChallenge', codeChallenge);
  }

  /**
   * Redirects the user to the login screen for authorization.
   * Clears all auth state including local storage and session storage.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
   */
  async #requestAuthorization(): Promise<void> {
    if (!this.#authorizeUrl) {
      return Promise.reject('Missing authorize URL');
    }

    this.#startPkce();

    window.location.assign(
      this.#authorizeUrl +
        '?response_type=code' +
        '&state=' +
        encodeURIComponent(this.#storage.getString('pkceState') as string) +
        '&client_id=' +
        encodeURIComponent(this.#clientId) +
        '&redirect_uri=' +
        encodeURIComponent(getBaseUrl()) +
        '&scope=' +
        encodeURIComponent(DEFAULT_SCOPE) +
        '&code_challenge_method=S256' +
        '&code_challenge=' +
        encodeURIComponent(this.#storage.getString('codeChallenge') as string)
    );
  }

  /**
   * Processes an OAuth authorization code.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenRequest
   * @param code The authorization code received by URL parameter.
   */
  processCode(code: string): Promise<ProfileResource> {
    const pkceState = this.#storage.getString('pkceState');
    if (!pkceState) {
      this.clear();
      return Promise.reject('Invalid PCKE state');
    }

    const codeVerifier = this.#storage.getString('codeVerifier');
    if (!codeVerifier) {
      this.clear();
      return Promise.reject('Invalid PCKE code verifier');
    }

    return this.#fetchTokens(
      'grant_type=authorization_code' +
        (this.#clientId ? '&client_id=' + encodeURIComponent(this.#clientId) : '') +
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
  async #refresh(): Promise<void> {
    if (this.#refreshPromise) {
      return this.#refreshPromise;
    }

    if (!this.#refreshToken) {
      this.clear();
      return Promise.reject('Invalid refresh token');
    }

    this.#refreshPromise = this.#fetchTokens(
      'grant_type=refresh_token' +
        '&client_id=' +
        encodeURIComponent(this.#clientId) +
        '&refresh_token=' +
        encodeURIComponent(this.#refreshToken)
    );

    await this.#refreshPromise;
  }

  async clientCredentials(clientId: string, clientSecret: string): Promise<ProfileResource> {
    return this.#fetchTokens(
      'grant_type=client_credentials' +
        '&client_id=' +
        encodeURIComponent(clientId) +
        '&client_secret=' +
        encodeURIComponent(clientSecret)
    );
  }

  /**
   * Makes a POST request to the tokens endpoint.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
   * @param formBody Token parameters in URL encoded format.
   */
  async #fetchTokens(formBody: string): Promise<ProfileResource> {
    if (!this.#tokenUrl) {
      return Promise.reject('Missing token URL');
    }

    return this.#fetch(this.#tokenUrl, {
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
      .then((tokens) => this.#verifyTokens(tokens))
      .then(() => this.getProfile() as ProfileResource);
  }

  /**
   * Verifies the tokens received from the auth server.
   * Validates the JWT against the JWKS.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
   * @param tokens
   */
  async #verifyTokens(tokens: TokenResponse): Promise<void> {
    const token = tokens.access_token;

    // Verify token has not expired
    const tokenPayload = parseJWTPayload(token);
    if (Date.now() >= (tokenPayload.exp as number) * 1000) {
      this.clear();
      return Promise.reject('Token expired');
    }

    // Verify app_client_id
    if (this.#clientId && tokenPayload.client_id !== this.#clientId) {
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

  /**
   * Sets up a listener for window storage events.
   * This synchronizes state across browser windows and browser tabs.
   */
  #setupStorageListener(): void {
    try {
      window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === null || e.key === 'activeLogin') {
          // Storage events fire when different tabs make changes.
          // On storage clear (key === null) or activeLogin change (key === 'activeLogin')
          // Refresh the page to ensure the active login is up to date.
          window.location.reload();
        }
      });
    } catch (err) {
      // Silently ignore if this environment does not support storage events
    }
  }
}

/**
 * Returns the base URL for the current page.
 */
function getBaseUrl(): string {
  return window.location.protocol + '//' + window.location.host + '/';
}
