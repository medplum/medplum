// PKCE auth based on:
// https://aws.amazon.com/blogs/security/how-to-add-authentication-single-page-web-application-with-amazon-cognito-oauth2-implementation/

import {
  Binary,
  Bundle,
  Communication,
  Encounter,
  ExtractResource,
  OperationOutcome,
  Patient,
  Project,
  ProjectMembership,
  ProjectSecret,
  Reference,
  Resource,
  ResourceType,
  SearchParameter,
  StructureDefinition,
  UserConfiguration,
  ValueSet,
} from '@medplum/fhirtypes';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
/** @ts-ignore */
import type { CustomTableLayout, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import { LRUCache } from './cache';
import { encryptSHA256, getRandomString } from './crypto';
import { EventTarget } from './eventtarget';
import { Hl7Message } from './hl7';
import { parseJWTPayload } from './jwt';
import { ReadablePromise } from './readablepromise';
import { ClientStorage } from './storage';
import { globalSchema, IndexedStructureDefinition, indexSearchParameter, indexStructureDefinition } from './types';
import { arrayBufferToBase64, createReference, ProfileResource } from './utils';

export const MEDPLUM_VERSION = process.env.MEDPLUM_VERSION;

const DEFAULT_BASE_URL = 'https://api.medplum.com/';
const DEFAULT_RESOURCE_CACHE_SIZE = 1000;
const DEFAULT_CACHE_TIME = 60000; // 60 seconds
const JSON_CONTENT_TYPE = 'application/json';
const FHIR_CONTENT_TYPE = 'application/fhir+json';
const PATCH_CONTENT_TYPE = 'application/json-patch+json';

/**
 * The MedplumClientOptions interface defines configuration options for MedplumClient.
 *
 * All configuration settings are optional.
 */
export interface MedplumClientOptions {
  /**
   * Base server URL.
   *
   * Default value is https://api.medplum.com/
   *
   * Use this to point to a custom Medplum deployment.
   */
  baseUrl?: string;

  /**
   * OAuth2 authorize URL.
   *
   * Default value is baseUrl + "/oauth2/authorize".
   *
   * Use this if you want to use a separate OAuth server.
   */
  authorizeUrl?: string;

  /**
   * OAuth2 token URL.
   *
   * Default value is baseUrl + "/oauth2/token".
   *
   * Use this if you want to use a separate OAuth server.
   */
  tokenUrl?: string;

  /**
   * OAuth2 logout URL.
   *
   * Default value is baseUrl + "/oauth2/logout".
   *
   * Use this if you want to use a separate OAuth server.
   */
  logoutUrl?: string;

  /**
   * The client ID.
   *
   * Client ID can be used for SMART-on-FHIR customization.
   */
  clientId?: string;

  /**
   * Number of resources to store in the cache.
   *
   * Default value is 1000.
   *
   * Consider using this for performance of displaying Patient or Practitioner resources.
   */
  resourceCacheSize?: number;

  /**
   * The length of time in milliseconds to cache resources.
   *
   * Default value is 10000 (10 seconds).
   *
   * Cache time of zero disables all caching.
   *
   * For any individual request, the cache behavior can be overridden by setting the cache property on request options.
   *
   * See: https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
   */
  cacheTime?: number;

  /**
   * Fetch implementation.
   *
   * Default is window.fetch (if available).
   *
   * For nodejs applications, consider the 'node-fetch' package.
   */
  fetch?: FetchLike;

  /**
   * Create PDF implementation.
   *
   * Default is none, and PDF generation is disabled.
   *
   * In browser environments, import the client-side pdfmake library.
   *
   * ```html
   * <script src="pdfmake.min.js"></script>
   * <script>
   * async function createPdf(docDefinition, tableLayouts, fonts) {
   *   return new Promise((resolve) => {
   *     pdfMake.createPdf(docDefinition, tableLayouts, fonts).getBlob(resolve);
   *   });
   * }
   * </script>
   * ```
   *
   * In nodejs applications:
   *
   * ```ts
   * import type { CustomTableLayout, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
   * function createPdf(
   *   docDefinition: TDocumentDefinitions,
   *   tableLayouts?: { [name: string]: CustomTableLayout },
   *   fonts?: TFontDictionary
   * ): Promise<Buffer> {
   *   return new Promise((resolve, reject) => {
   *     const printer = new PdfPrinter(fonts || {});
   *     const pdfDoc = printer.createPdfKitDocument(docDefinition, { tableLayouts });
   *     const chunks: Uint8Array[] = [];
   *     pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
   *     pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
   *     pdfDoc.on('error', reject);
   *     pdfDoc.end();
   *   });
   * }
   * ```
   */
  createPdf?: CreatePdfFunction;

  /**
   * Callback for when the client is unauthenticated.
   *
   * Default is do nothing.
   *
   * For client side applications, consider redirecting to a sign in page.
   */
  onUnauthenticated?: () => void;
}

export interface FetchLike {
  (url: string, options?: any): Promise<any>;
}

export interface CreatePdfFunction {
  (
    docDefinition: TDocumentDefinitions,
    tableLayouts?:
      | {
          [name: string]: CustomTableLayout;
        }
      | undefined,
    fonts?: TFontDictionary | undefined
  ): Promise<any>;
}

export interface BaseLoginRequest {
  readonly projectId?: string;
  readonly clientId?: string;
  readonly resourceType?: string;
  readonly scope?: string;
  readonly nonce?: string;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: string;
  readonly googleClientId?: string;
  readonly launch?: string;
}

export interface EmailPasswordLoginRequest extends BaseLoginRequest {
  readonly email: string;
  readonly password: string;
  readonly remember?: boolean;
}

export interface NewUserRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly password: string;
  readonly recaptchaToken: string;
  readonly recaptchaSiteKey?: string;
  readonly remember?: boolean;
  readonly projectId?: string;
}

export interface NewProjectRequest {
  readonly login: string;
  readonly projectName: string;
}

export interface NewPatientRequest {
  readonly login: string;
  readonly projectId: string;
}

export interface GoogleCredentialResponse {
  readonly clientId: string;
  readonly credential: string;
}

export interface GoogleLoginRequest extends BaseLoginRequest {
  readonly googleClientId: string;
  readonly googleCredential: string;
  readonly createUser?: boolean;
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

export interface BotEvent<T = Resource | Hl7Message | string | Record<string, any>> {
  readonly contentType: string;
  readonly input: T;
  readonly secrets: Record<string, ProjectSecret>;
}

/**
 * JSONPatch patch operation.
 * Compatible with fast-json-patch Operation.
 */
export interface PatchOperation {
  readonly op: 'add' | 'remove' | 'replace' | 'copy' | 'move' | 'test';
  readonly path: string;
  readonly value?: any;
}

/**
 * Email address definition.
 * Compatible with nodemailer Mail.Address.
 */
export interface MailAddress {
  readonly name: string;
  readonly address: string;
}

/**
 * Email attachment definition.
 * Compatible with nodemailer Mail.Options.
 */
export interface MailAttachment {
  /** String, Buffer or a Stream contents for the attachmentent */
  readonly content?: string;
  /** path to a file or an URL (data uris are allowed as well) if you want to stream the file instead of including it (better for larger attachments) */
  readonly path?: string;
  /** filename to be reported as the name of the attached file, use of unicode is allowed. If you do not want to use a filename, set this value as false, otherwise a filename is generated automatically */
  readonly filename?: string | false;
  /** optional content type for the attachment, if not set will be derived from the filename property */
  readonly contentType?: string;
}

/**
 * Email message definition.
 * Compatible with nodemailer Mail.Options.
 */
export interface MailOptions {
  /** The e-mail address of the sender. All e-mail addresses can be plain 'sender@server.com' or formatted 'Sender Name <sender@server.com>' */
  readonly from?: string | MailAddress;
  /** An e-mail address that will appear on the Sender: field */
  readonly sender?: string | MailAddress;
  /** Comma separated list or an array of recipients e-mail addresses that will appear on the To: field */
  readonly to?: string | MailAddress | string[] | MailAddress[];
  /** Comma separated list or an array of recipients e-mail addresses that will appear on the Cc: field */
  readonly cc?: string | MailAddress | string[] | MailAddress[];
  /** Comma separated list or an array of recipients e-mail addresses that will appear on the Bcc: field */
  readonly bcc?: string | MailAddress | string[] | MailAddress[];
  /** An e-mail address that will appear on the Reply-To: field */
  readonly replyTo?: string | MailAddress;
  /** The subject of the e-mail */
  readonly subject?: string;
  /** The plaintext version of the message */
  readonly text?: string;
  /** The HTML version of the message */
  readonly html?: string;
  /** An array of attachment objects */
  readonly attachments?: MailAttachment[];
}

interface SchemaGraphQLResponse {
  readonly data: {
    readonly StructureDefinitionList: StructureDefinition[];
    readonly SearchParameterList: SearchParameter[];
  };
}

interface RequestCacheEntry {
  readonly requestTime: number;
  readonly value: ReadablePromise<any>;
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
 * const bundle = await medplum.search('Patient', 'name=Alice');
 * console.log(bundle.total);
 * ```
 *
 *  <head>
 *    <meta name="algolia:pageRank" content="100" />
 *  </head>

 */
export class MedplumClient extends EventTarget {
  readonly #fetch: FetchLike;
  readonly #createPdf?: CreatePdfFunction;
  readonly #storage: ClientStorage;
  readonly #requestCache: LRUCache<RequestCacheEntry>;
  readonly #cacheTime: number;
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
    }

    this.#fetch = options?.fetch || window.fetch.bind(window);
    this.#createPdf = options?.createPdf;
    this.#storage = new ClientStorage();
    this.#requestCache = new LRUCache(options?.resourceCacheSize ?? DEFAULT_RESOURCE_CACHE_SIZE);
    this.#cacheTime = options?.cacheTime ?? DEFAULT_CACHE_TIME;
    this.#baseUrl = ensureTrailingSlash(options?.baseUrl) || DEFAULT_BASE_URL;
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
   * Returns the current base URL for all API requests.
   * By default, this is set to `https://api.medplum.com/`.
   * This can be overridden by setting the `baseUrl` option when creating the client.
   * @category HTTP
   * @returns The current base URL for all API requests.
   */
  getBaseUrl(): string {
    return this.#baseUrl;
  }

  /**
   * Clears all auth state including local storage and session storage.
   * @category Authentication
   */
  clear(): void {
    this.#storage.clear();
    this.#requestCache.clear();
    this.#accessToken = undefined;
    this.#refreshToken = undefined;
    this.#profile = undefined;
    this.#config = undefined;
    this.dispatchEvent({ type: 'change' });
  }

  /**
   * Invalidates any cached values or cached requests for the given URL.
   * @category Caching
   * @param url The URL to invalidate.
   */
  invalidateUrl(url: URL | string): void {
    url = url.toString();
    this.#requestCache.delete(url);
  }

  /**
   * Invalidates all cached search results or cached requests for the given resourceType.
   * @category Caching
   * @param resourceType The resource type to invalidate.
   */
  invalidateSearches<K extends ResourceType>(resourceType: K): void {
    const url = 'fhir/R4/' + resourceType;
    for (const key of this.#requestCache.keys()) {
      if (key.endsWith(url) || key.includes(url + '?')) {
        this.#requestCache.delete(key);
      }
    }
  }

  /**
   * Makes an HTTP GET request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `readResource()`, `search()`, etc.
   *
   * @category HTTP
   * @param url The target URL.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  get<T = any>(url: URL | string, options: RequestInit = {}): ReadablePromise<T> {
    url = url.toString();
    const cached = this.#getCacheEntry(url, options);
    if (cached) {
      return cached.value;
    }
    const promise = new ReadablePromise(this.#request<T>('GET', url, options));
    this.#setCacheEntry(url, promise);
    return promise;
  }

  /**
   * Makes an HTTP POST request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `createResource()`.
   *
   * @category HTTP
   * @param url The target URL.
   * @param body The content body. Strings and `File` objects are passed directly. Other objects are converted to JSON.
   * @param contentType The content type to be included in the "Content-Type" header.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  post(url: URL | string, body: any, contentType?: string, options: RequestInit = {}): Promise<any> {
    url = url.toString();
    if (body) {
      this.#setRequestBody(options, body);
    }
    if (contentType) {
      this.#setRequestContentType(options, contentType);
    }
    this.invalidateUrl(url);
    return this.#request('POST', url, options);
  }

  /**
   * Makes an HTTP PUT request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `updateResource()`.
   *
   * @category HTTP
   * @param url The target URL.
   * @param body The content body. Strings and `File` objects are passed directly. Other objects are converted to JSON.
   * @param contentType The content type to be included in the "Content-Type" header.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  put(url: URL | string, body: any, contentType?: string, options: RequestInit = {}): Promise<any> {
    url = url.toString();
    if (body) {
      this.#setRequestBody(options, body);
    }
    if (contentType) {
      this.#setRequestContentType(options, contentType);
    }
    this.invalidateUrl(url);
    return this.#request('PUT', url, options);
  }

  /**
   * Makes an HTTP PATCH request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `patchResource()`.
   *
   * @category HTTP
   * @param url The target URL.
   * @param operations Array of JSONPatch operations.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  patch(url: URL | string, operations: PatchOperation[], options: RequestInit = {}): Promise<any> {
    url = url.toString();
    this.#setRequestBody(options, operations);
    this.#setRequestContentType(options, PATCH_CONTENT_TYPE);
    this.invalidateUrl(url);
    return this.#request('PATCH', url, options);
  }

  /**
   * Makes an HTTP DELETE request to the specified URL.
   *
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `deleteResource()`.
   *
   * @category HTTP
   * @param url The target URL.
   * @param options Optional fetch options.
   * @returns Promise to the response content.
   */
  delete(url: URL | string, options: RequestInit = {}): Promise<any> {
    url = url.toString();
    this.invalidateUrl(url);
    return this.#request('DELETE', url, options);
  }

  /**
   * Initiates a new user flow.
   *
   * This method is part of the two different user registration flows:
   * 1) New Practitioner and new Project
   * 2) New Patient registration
   *
   * @category Authentication
   * @param newUserRequest Register request including email and password.
   * @returns Promise to the authentication response.
   */
  async startNewUser(newUserRequest: NewUserRequest): Promise<LoginAuthenticationResponse> {
    await this.startPkce();
    return this.post('auth/newuser', {
      ...newUserRequest,
      codeChallengeMethod: 'S256',
      codeChallenge: sessionStorage.getItem('codeChallenge') as string,
    }) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Initiates a new project flow.
   *
   * This requires a partial login from `startNewUser` or `startNewGoogleUser`.
   *
   * @param newProjectRequest Register request including email and password.
   * @returns Promise to the authentication response.
   */
  async startNewProject(newProjectRequest: NewProjectRequest): Promise<LoginAuthenticationResponse> {
    return this.post('auth/newproject', newProjectRequest) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Initiates a new patient flow.
   *
   * This requires a partial login from `startNewUser` or `startNewGoogleUser`.
   *
   * @param newPatientRequest Register request including email and password.
   * @returns Promise to the authentication response.
   */
  async startNewPatient(newPatientRequest: NewPatientRequest): Promise<LoginAuthenticationResponse> {
    return this.post('auth/newpatient', newPatientRequest) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Initiates a user login flow.
   * @category Authentication
   * @param loginRequest Login request including email and password.
   * @returns Promise to the authentication response.
   */
  async startLogin(loginRequest: EmailPasswordLoginRequest): Promise<LoginAuthenticationResponse> {
    const { codeChallenge, codeChallengeMethod } = this.getCodeChallenge(loginRequest);
    return this.post('auth/login', {
      ...loginRequest,
      clientId: loginRequest.clientId ?? this.#clientId,
      scope: loginRequest.scope,
      codeChallengeMethod,
      codeChallenge,
    }) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Tries to sign in with Google authentication.
   * The response parameter is the result of a Google authentication.
   * See: https://developers.google.com/identity/gsi/web/guides/handle-credential-responses-js-functions
   * @category Authentication
   * @param loginRequest Login request including Google credential response.
   * @returns Promise to the authentication response.
   */
  async startGoogleLogin(loginRequest: GoogleLoginRequest): Promise<LoginAuthenticationResponse> {
    const { codeChallenge, codeChallengeMethod } = this.getCodeChallenge(loginRequest);
    return this.post('auth/google', {
      ...loginRequest,
      clientId: loginRequest.clientId ?? this.#clientId,
      scope: loginRequest.scope,
      codeChallengeMethod,
      codeChallenge,
    }) as Promise<LoginAuthenticationResponse>;
  }

  getCodeChallenge(loginRequest: BaseLoginRequest): {
    codeChallenge?: string;
    codeChallengeMethod?: string;
  } {
    if (loginRequest.codeChallenge) {
      return {
        codeChallenge: loginRequest.codeChallenge,
        codeChallengeMethod: loginRequest.codeChallengeMethod,
      };
    }

    const codeChallenge = sessionStorage.getItem('codeChallenge');
    if (codeChallenge) {
      return {
        codeChallenge,
        codeChallengeMethod: 'S256',
      };
    }

    return {};
  }

  /**
   * Signs out locally.
   * Does not invalidate tokens with the server.
   * @category Authentication
   */
  signOut(): void {
    this.clear();
  }

  /**
   * Tries to sign in the user.
   * Returns true if the user is signed in.
   * This may result in navigating away to the sign in page.
   * @category Authentication
   */
  async signInWithRedirect(): Promise<ProfileResource | void> {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (!code) {
      await this.#requestAuthorization();
      return undefined;
    } else {
      return this.processCode(code);
    }
  }

  /**
   * Tries to sign out the user.
   * See: https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
   * @category Authentication
   */
  signOutWithRedirect(): void {
    window.location.assign(this.#logoutUrl);
  }

  /**
   * Builds a FHIR URL from a collection of URL path components.
   * For example, `buildUrl('/Patient', '123')` returns `fhir/R4/Patient/123`.
   * @category HTTP
   * @param path The path component of the URL.
   * @returns The well-formed FHIR URL.
   */
  fhirUrl(...path: string[]): URL {
    return new URL(this.#baseUrl + 'fhir/R4/' + path.join('/'));
  }

  /**
   * Builds a FHIR search URL from a search query or structured query object.
   * @category HTTP
   * @category Search
   * @param query The FHIR search query or structured query object.
   * @returns The well-formed FHIR URL.
   */
  fhirSearchUrl(resourceType: ResourceType, query: URLSearchParams | string | undefined): URL {
    const url = this.fhirUrl(resourceType);
    if (query) {
      url.search = query.toString();
    }
    return url;
  }

  /**
   * Sends a FHIR search request.
   *
   * Example using a FHIR search string:
   *
   * ```typescript
   * const bundle = await client.search('Patient', 'name=Alice');
   * console.log(bundle);
   * ```
   *
   * The return value is a FHIR bundle:
   *
   * ```json
   * {
   *    "resourceType": "Bundle",
   *    "type": "searchset",
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
   * To query the count of a search, use the summary feature like so:
   *
   * ```typescript
   * const patients = medplum.search('Patient', '_summary=count');
   * ```
   *
   * See FHIR search for full details: https://www.hl7.org/fhir/search.html
   *
   * @category Search
   * @param resourceType The FHIR resource type.
   * @param query The search query as either a string or a structured search object.
   * @param options Optional fetch options.
   * @returns Promise to the search result bundle.
   */
  search<K extends ResourceType>(
    resourceType: K,
    query?: URLSearchParams | string,
    options: RequestInit = {}
  ): ReadablePromise<Bundle<ExtractResource<K>>> {
    return this.get(this.fhirSearchUrl(resourceType, query), options);
  }

  /**
   * Sends a FHIR search request for a single resource.
   *
   * This is a convenience method for `search()` that returns the first resource rather than a `Bundle`.
   *
   * Example using a FHIR search string:
   *
   * ```typescript
   * const patient = await client.searchOne('Patient', 'identifier=123');
   * console.log(patient);
   * ```
   *
   * The return value is the resource, if available; otherwise, undefined.
   *
   * See FHIR search for full details: https://www.hl7.org/fhir/search.html
   *
   * @category Search
   * @param resourceType The FHIR resource type.
   * @param query The search query as either a string or a structured search object.
   * @param options Optional fetch options.
   * @returns Promise to the search result bundle.
   */
  searchOne<K extends ResourceType>(
    resourceType: K,
    query?: URLSearchParams | string,
    options: RequestInit = {}
  ): ReadablePromise<ExtractResource<K> | undefined> {
    const url = this.fhirSearchUrl(resourceType, query);
    url.searchParams.set('_count', '1');
    url.searchParams.sort();
    const cacheKey = url.toString() + '-searchOne';
    const cached = this.#getCacheEntry(cacheKey, options);
    if (cached) {
      return cached.value;
    }
    const promise = new ReadablePromise(
      this.search<K>(resourceType, url.searchParams, options).then((b) => b.entry?.[0]?.resource)
    );
    this.#setCacheEntry(cacheKey, promise);
    return promise;
  }

  /**
   * Sends a FHIR search request for an array of resources.
   *
   * This is a convenience method for `search()` that returns the resources as an array rather than a `Bundle`.
   *
   * Example using a FHIR search string:
   *
   * ```typescript
   * const patients = await client.searchResources('Patient', 'name=Alice');
   * console.log(patients);
   * ```
   *
   * The return value is an array of resources.
   *
   * See FHIR search for full details: https://www.hl7.org/fhir/search.html
   *
   * @category Search
   * @param resourceType The FHIR resource type.
   * @param query The search query as either a string or a structured search object.
   * @param options Optional fetch options.
   * @returns Promise to the search result bundle.
   */
  searchResources<K extends ResourceType>(
    resourceType: K,
    query?: URLSearchParams | string,
    options: RequestInit = {}
  ): ReadablePromise<ExtractResource<K>[]> {
    const url = this.fhirSearchUrl(resourceType, query);
    const cacheKey = url.toString() + '-searchResources';
    const cached = this.#getCacheEntry(cacheKey, options);
    if (cached) {
      return cached.value;
    }
    const promise = new ReadablePromise(
      this.search<K>(resourceType, query, options).then(
        (b) => b.entry?.map((e) => e.resource as ExtractResource<K>) ?? []
      )
    );
    this.#setCacheEntry(cacheKey, promise);
    return promise;
  }

  /**
   * Searches a ValueSet resource using the "expand" operation.
   * See: https://www.hl7.org/fhir/operation-valueset-expand.html
   *
   * @category Search
   * @param system The ValueSet system url.
   * @param filter The search string.
   * @param options Optional fetch options.
   * @returns Promise to expanded ValueSet.
   */
  searchValueSet(system: string, filter: string, options: RequestInit = {}): ReadablePromise<ValueSet> {
    const url = this.fhirUrl('ValueSet', '$expand');
    url.searchParams.set('url', system);
    url.searchParams.set('filter', filter);
    return this.get(url.toString(), options);
  }

  /**
   * Returns a cached resource if it is available.
   * @category Caching
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns The resource if it is available in the cache; undefined otherwise.
   */
  getCached<K extends ResourceType>(resourceType: K, id: string): ExtractResource<K> | undefined {
    const cached = this.#requestCache.get(this.fhirUrl(resourceType, id).toString())?.value;
    return cached && cached.isOk() ? (cached.read() as ExtractResource<K>) : undefined;
  }

  /**
   * Returns a cached resource if it is available.
   * @category Caching
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns The resource if it is available in the cache; undefined otherwise.
   */
  getCachedReference<T extends Resource>(reference: Reference<T>): T | undefined {
    const refString = reference.reference as string;
    if (!refString) {
      return undefined;
    }
    const [resourceType, id] = refString.split('/');
    if (!resourceType || !id) {
      return undefined;
    }
    return this.getCached(resourceType as ResourceType, id) as T | undefined;
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
   * @category Read
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @param options Optional fetch options.
   * @returns The resource if available; undefined otherwise.
   */
  readResource<K extends ResourceType>(
    resourceType: K,
    id: string,
    options: RequestInit = {}
  ): ReadablePromise<ExtractResource<K>> {
    return this.get<ExtractResource<K>>(this.fhirUrl(resourceType, id), options);
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
   * @category Read
   * @param reference The FHIR reference object.
   * @param options Optional fetch options.
   * @returns The resource if available; undefined otherwise.
   */
  readReference<T extends Resource>(reference: Reference<T>, options: RequestInit = {}): ReadablePromise<T> {
    const refString = reference?.reference;
    if (!refString) {
      return new ReadablePromise(Promise.reject(new Error('Missing reference')));
    }
    const [resourceType, id] = refString.split('/');
    if (!resourceType || !id) {
      return new ReadablePromise(Promise.reject(new Error('Invalid reference')));
    }
    return this.readResource(resourceType as ResourceType, id, options) as ReadablePromise<T>;
  }

  /**
   * Returns a cached schema for a resource type.
   * If the schema is not cached, returns undefined.
   * It is assumed that a client will call requestSchema before using this method.
   * @category Schema
   * @returns The schema if immediately available, undefined otherwise.
   * @deprecated Use globalSchema instead.
   */
  getSchema(): IndexedStructureDefinition {
    return globalSchema;
  }

  /**
   * Requests the schema for a resource type.
   * If the schema is already cached, the promise is resolved immediately.
   * @category Schema
   * @param resourceType The FHIR resource type.
   * @returns Promise to a schema with the requested resource type.
   */
  async requestSchema(resourceType: string): Promise<IndexedStructureDefinition> {
    if (resourceType in globalSchema.types) {
      return globalSchema;
    }

    const query = `{
      StructureDefinitionList(name: "${resourceType}") {
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
      SearchParameterList(base: "${resourceType}", _count: 100) {
        base,
        code,
        type,
        expression,
        target
      }
    }`.replace(/\s+/g, ' ');

    const response = (await this.graphql(query)) as SchemaGraphQLResponse;

    for (const structureDefinition of response.data.StructureDefinitionList) {
      indexStructureDefinition(structureDefinition);
    }

    for (const searchParameter of response.data.SearchParameterList) {
      indexSearchParameter(searchParameter);
    }

    return globalSchema;
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
   * @category Read
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @param options Optional fetch options.
   * @returns Promise to the resource history.
   */
  readHistory<K extends ResourceType>(
    resourceType: K,
    id: string,
    options: RequestInit = {}
  ): ReadablePromise<Bundle<ExtractResource<K>>> {
    return this.get(this.fhirUrl(resourceType, id, '_history'), options);
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
   * @category Read
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @param vid The version ID.
   * @param options Optional fetch options.
   * @returns The resource if available; undefined otherwise.
   */
  readVersion<K extends ResourceType>(
    resourceType: K,
    id: string,
    vid: string,
    options: RequestInit = {}
  ): ReadablePromise<ExtractResource<K>> {
    return this.get(this.fhirUrl(resourceType, id, '_history', vid), options);
  }

  /**
   * Executes the Patient "everything" operation for a patient.
   *
   * Example:
   *
   * ```typescript
   * const bundle = await medplum.readPatientEverything('123');
   * console.log(bundle);
   * ```
   *
   * See the FHIR "patient-everything" operation for full details: https://hl7.org/fhir/operation-patient-everything.html
   *
   * @category Read
   * @param id The Patient Id
   * @param options Optional fetch options.
   * @returns A Bundle of all Resources related to the Patient
   */
  readPatientEverything(id: string, options: RequestInit = {}): ReadablePromise<Bundle> {
    return this.get(this.fhirUrl('Patient', id, '$everything'), options);
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
   * @category Create
   * @param resource The FHIR resource to create.
   * @returns The result of the create operation.
   */
  createResource<T extends Resource>(resource: T): Promise<T> {
    if (!resource.resourceType) {
      throw new Error('Missing resourceType');
    }
    this.invalidateSearches(resource.resourceType);
    return this.post(this.fhirUrl(resource.resourceType), resource);
  }

  /**
   * Conditionally create a new FHIR resource only if some equivalent resource does not already exist on the server.
   *
   * The return value is the existing resource or the newly created resource, including the ID and meta.
   *
   * Example:
   *
   * ```typescript
   * const result = await medplum.createResourceIfNoneExist(
   *   {
   *     resourceType: 'Patient',
   *     identifier: [{
   *      system: 'http://example.com/mrn',
   *      value: '123'
   *     }]
   *     name: [{
   *      family: 'Smith',
   *      given: ['John']
   *     }]
   *   },
   *   'identifier=123'
   * );
   * console.log(result.id);
   * ```
   *
   * This method is syntactic sugar for:
   *
   * ```typescript
   * return searchOne(resourceType, query) ?? createResource(resource);
   * ```
   *
   * The query parameter only contains the search parameters (what would be in the URL following the "?").
   *
   * See the FHIR "conditional create" operation for full details: https://www.hl7.org/fhir/http.html#ccreate
   *
   * @category Create
   * @param resource The FHIR resource to create.
   * @param query The search query for an equivalent resource (should not include resource type or "?").
   * @returns The result of the create operation.
   */
  async createResourceIfNoneExist<T extends Resource>(resource: T, query: string): Promise<T> {
    return ((await this.searchOne(resource.resourceType, query)) ?? this.createResource(resource)) as Promise<T>;
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
   * @category Create
   * @param data The binary data to upload.
   * @param filename Optional filename for the binary.
   * @param contentType Content type for the binary.
   * @returns The result of the create operation.
   */
  createBinary(
    data: string | File | Blob | Uint8Array,
    filename: string | undefined,
    contentType: string,
    onProgress?: (e: ProgressEvent) => void
  ): Promise<Binary> {
    const url = this.fhirUrl('Binary');
    if (filename) {
      url.searchParams.set('_filename', filename);
    }

    if (onProgress) {
      return this.uploadwithProgress(url, data, contentType, onProgress);
    } else {
      return this.post(url, data, contentType);
    }
  }

  uploadwithProgress(
    url: URL,
    data: string | File | Blob | Uint8Array,
    contentType: string,
    onProgress: (e: ProgressEvent) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.responseType = 'json';
      xhr.onabort = () => reject(new Error('Request aborted'));
      xhr.onerror = () => reject(new Error('Request error'));

      if (onProgress) {
        xhr.upload.onprogress = (e) => onProgress(e);
        xhr.upload.onload = (e) => onProgress(e);
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error(xhr.statusText));
        }
      };

      xhr.open('POST', url);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Authorization', 'Bearer ' + this.#accessToken);
      xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, max-age=0');
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('X-Medplum', 'extended');
      xhr.send(data);
    });
  }

  /**
   * Creates a PDF as a FHIR `Binary` resource based on pdfmake document definition.
   *
   * The return value is the newly created resource, including the ID and meta.
   *
   * The `docDefinition` parameter is a pdfmake document definition.
   *
   * Example:
   *
   * ```typescript
   * const result = await medplum.createPdf({
   *   content: ['Hello world']
   * });
   * console.log(result.id);
   * ```
   *
   * See the pdfmake document definition for full details: https://pdfmake.github.io/docs/0.1/document-definition-object/
   *
   * @category Media
   * @param docDefinition The PDF document definition.
   * @returns The result of the create operation.
   */
  async createPdf(
    docDefinition: TDocumentDefinitions,
    filename?: string,
    tableLayouts?: { [name: string]: CustomTableLayout },
    fonts?: TFontDictionary
  ): Promise<Binary> {
    if (!this.#createPdf) {
      throw new Error('PDF creation not enabled');
    }
    const blob = await this.#createPdf(docDefinition, tableLayouts, fonts);
    return this.createBinary(blob, filename, 'application/pdf');
  }

  /**
   * Creates a FHIR `Communication` resource with the provided data content.
   *
   * This is a convenience method to handle commmon cases where a `Communication` resource is created with a `payload`.
   *
   * @category Create
   * @param resource The FHIR resource to comment on.
   * @param text The text of the comment.
   * @returns The result of the create operation.
   */
  createComment(resource: Resource, text: string): Promise<Communication> {
    const profile = this.getProfile();
    let encounter: Reference<Encounter> | undefined = undefined;
    let subject: Reference<Patient> | undefined = undefined;

    if (resource.resourceType === 'Encounter') {
      encounter = createReference(resource);
      subject = resource.subject as Reference<Patient> | undefined;
    }

    if (resource.resourceType === 'ServiceRequest') {
      encounter = resource.encounter;
      subject = resource.subject as Reference<Patient> | undefined;
    }

    if (resource.resourceType === 'Patient') {
      subject = createReference(resource);
    }

    return this.createResource<Communication>({
      resourceType: 'Communication',
      basedOn: [createReference(resource)],
      encounter,
      subject,
      sender: profile ? createReference(profile) : undefined,
      sent: new Date().toISOString(),
      payload: [{ contentString: text }],
    });
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
   * @category Write
   * @param resource The FHIR resource to update.
   * @returns The result of the update operation.
   */
  async updateResource<T extends Resource>(resource: T): Promise<T> {
    if (!resource.resourceType) {
      throw new Error('Missing resourceType');
    }
    if (!resource.id) {
      throw new Error('Missing id');
    }
    this.invalidateSearches(resource.resourceType);
    const result = await this.put(this.fhirUrl(resource.resourceType, resource.id), resource);
    // On 304 not modified, result will be undefined
    // Return the user input instead
    return result ?? resource;
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
   * @category Write
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @param operations The JSONPatch operations.
   * @returns The result of the patch operations.
   */
  patchResource<K extends ResourceType>(
    resourceType: K,
    id: string,
    operations: PatchOperation[]
  ): Promise<ExtractResource<K>> {
    this.invalidateSearches(resourceType);
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
   * @category Delete
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @returns The result of the delete operation.
   */
  deleteResource(resourceType: ResourceType, id: string): Promise<any> {
    this.invalidateSearches(resourceType);
    return this.delete(this.fhirUrl(resourceType, id));
  }

  /**
   * Executes the validate operation with the provided resource.
   *
   * Example:
   *
   * ```typescript
   * const result = await medplum.validateResource({
   *   resourceType: 'Patient',
   *   name: [{ given: ['Alice'], family: 'Smith' }],
   * });
   * ```
   *
   * See the FHIR "$validate" operation for full details: https://www.hl7.org/fhir/resource-operation-validate.html
   *
   * @param resource The FHIR resource.
   * @returns The validate operation outcome.
   */
  validateResource<T extends Resource>(resource: T): Promise<OperationOutcome> {
    return this.post(this.fhirUrl(resource.resourceType, '$validate'), resource);
  }

  /**
   * Executes a batch or transaction of FHIR operations.
   *
   * Example:
   *
   * ```typescript
   * await medplum.executeBatch({
   *   "resourceType": "Bundle",
   *   "type": "transaction",
   *   "entry": [
   *     {
   *       "fullUrl": "urn:uuid:61ebe359-bfdc-4613-8bf2-c5e300945f0a",
   *       "resource": {
   *         "resourceType": "Patient",
   *         "name": [{ "use": "official", "given": ["Alice"], "family": "Smith" }],
   *         "gender": "female",
   *         "birthDate": "1974-12-25"
   *       },
   *       "request": {
   *         "method": "POST",
   *         "url": "Patient"
   *       }
   *     },
   *     {
   *       "fullUrl": "urn:uuid:88f151c0-a954-468a-88bd-5ae15c08e059",
   *       "resource": {
   *         "resourceType": "Patient",
   *         "identifier": [{ "system": "http:/example.org/fhir/ids", "value": "234234" }],
   *         "name": [{ "use": "official", "given": ["Bob"], "family": "Jones" }],
   *         "gender": "male",
   *         "birthDate": "1974-12-25"
   *       },
   *       "request": {
   *         "method": "POST",
   *         "url": "Patient",
   *         "ifNoneExist": "identifier=http:/example.org/fhir/ids|234234"
   *       }
   *     }
   *   ]
   * });
   * ```
   *
   * See The FHIR "batch/transaction" section for full details: https://hl7.org/fhir/http.html#transaction
   * @category Batch
   * @param bundle The FHIR batch/transaction bundle.
   * @returns The FHIR batch/transaction response bundle.
   */
  executeBatch(bundle: Bundle): Promise<Bundle> {
    return this.post('fhir/R4', bundle);
  }

  /**
   * Sends an email using the Medplum Email API.
   *
   * Builds the email using nodemailer MailComposer.
   *
   * Examples:
   *
   * Send a simple text email:
   *
   * ```typescript
   * await medplum.sendEmail({
   *   to: 'alice@example.com',
   *   cc: 'bob@example.com',
   *   subject: 'Hello',
   *   text: 'Hello Alice',
   * });
   * ```
   *
   * Send an email with a `Binary` attachment:
   *
   * ```typescript
   * await medplum.sendEmail({
   *   to: 'alice@example.com',
   *   subject: 'Email with attachment',
   *   text: 'See the attached report',
   *   attachments: [{
   *     filename: 'report.pdf',
   *     path: "Binary/" + binary.id
   *   }]
   * });
   * ```
   *
   * See options here: https://nodemailer.com/extras/mailcomposer/
   * @category Media
   * @param options The MailComposer options.
   * @returns Promise to the operation outcome.
   */
  sendEmail(email: MailOptions): Promise<OperationOutcome> {
    return this.post('email/v1/send', email, 'application/json');
  }

  /**
   * Executes a GraphQL query.
   *
   * Example:
   *
   * ```typescript
   * const result = await medplum.graphql(`{
   *   Patient(id: "123") {
   *     resourceType
   *     id
   *     name {
   *       given
   *       family
   *     }
   *   }
   * }`);
   * ```
   *
   * Advanced queries such as named operations and variable substitution are supported:
   *
   * ```typescript
   * const result = await medplum.graphql(
   *   `query GetPatientById($patientId: ID!) {
   *     Patient(id: $patientId) {
   *       resourceType
   *       id
   *       name {
   *         given
   *         family
   *       }
   *     }
   *   }`,
   *   'GetPatientById',
   *   { patientId: '123' }
   * );
   * ```
   *
   * See the GraphQL documentation for more details: https://graphql.org/learn/
   *
   * See the FHIR GraphQL documentation for FHIR specific details: https://www.hl7.org/fhir/graphql.html
   *
   * @category Read
   * @param query The GraphQL query.
   * @param operationName Optional GraphQL operation name.
   * @param variables Optional GraphQL variables.
   * @param options Optional fetch options.
   * @returns The GraphQL result.
   */
  graphql(query: string, operationName?: string | null, variables?: any, options?: RequestInit): Promise<any> {
    return this.post(this.fhirUrl('$graphql'), { query, operationName, variables }, JSON_CONTENT_TYPE, options);
  }

  /**
   *
   * Executes the $graph operation on this resource to fetch a Bundle of resources linked to the target resource
   * according to a graph definition

   * @category Read
   * @param resourceType The FHIR resource type.
   * @param id The resource ID.
   * @param graphName `name` parameter of the GraphDefinition
   * @returns A Bundle
   */
  readResourceGraph<K extends ResourceType>(
    resourceType: K,
    id: string,
    graphName: string
  ): ReadablePromise<Bundle<Resource>> {
    return this.get<Bundle<Resource>>(`${this.fhirUrl(resourceType, id)}/$graph?graph=${graphName}`);
  }

  /**
   * @category Authentication
   * @returns The Login State
   */
  getActiveLogin(): LoginState | undefined {
    return this.#storage.getObject('activeLogin');
  }

  /**
   * @category Authentication
   */
  async setActiveLogin(login: LoginState): Promise<void> {
    this.#accessToken = login.accessToken;
    this.#refreshToken = login.refreshToken;
    this.#profile = undefined;
    this.#config = undefined;
    this.#storage.setObject('activeLogin', login);
    this.#addLogin(login);
    this.#requestCache.clear();
    this.#refreshPromise = undefined;
    await this.#refreshProfile();
  }

  /**
   * @category Authentication
   */
  getAccessToken(): string | undefined {
    return this.#accessToken;
  }

  /**
   * @category Authentication
   */
  setAccessToken(accessToken: string): void {
    this.#accessToken = accessToken;
    this.#refreshToken = undefined;
    this.#profile = undefined;
    this.#config = undefined;
  }

  /**
   * @category Authentication
   */
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

  /**
   * @category Authentication
   */
  isLoading(): boolean {
    return !!this.#profilePromise;
  }

  /**
   * @category User Profile
   */
  getProfile(): ProfileResource | undefined {
    return this.#profile;
  }

  /**
   * @category User Profile
   */
  async getProfileAsync(): Promise<ProfileResource | undefined> {
    if (this.#profilePromise) {
      await this.#profilePromise;
    }
    return this.getProfile();
  }

  /**
   * @category User Profile
   */
  getUserConfiguration(): UserConfiguration | undefined {
    return this.#config;
  }

  /**
   * Downloads the URL as a blob.
   *
   * @category Read
   * @param url The URL to request.
   * @returns Promise to the response body as a blob.
   */
  async download(url: URL | string, options: RequestInit = {}): Promise<Blob> {
    if (this.#refreshPromise) {
      await this.#refreshPromise;
    }
    this.#addFetchOptionsDefaults(options);
    const response = await this.#fetch(url.toString(), options);
    return response.blob();
  }

  //
  // Private helpers
  //

  /**
   * Returns the cache entry if available and not expired.
   * @param key The cache key to retrieve.
   * @param options Optional fetch options for cache settings.
   * @returns The cached entry if found.
   */
  #getCacheEntry(key: string, options: RequestInit | undefined): RequestCacheEntry | undefined {
    if (this.#cacheTime <= 0 || options?.cache === 'no-cache' || options?.cache === 'reload') {
      return undefined;
    }
    const entry = this.#requestCache.get(key);
    if (!entry || entry.requestTime + this.#cacheTime < Date.now()) {
      return undefined;
    }
    return entry;
  }

  /**
   * Adds a readable promise to the cache.
   * @param key The cache key to store.
   * @param value The readable promise to store.
   */
  #setCacheEntry(key: string, value: ReadablePromise<any>): void {
    if (this.#cacheTime > 0) {
      this.#requestCache.set(key, { requestTime: Date.now(), value });
    }
  }

  /**
   * Makes an HTTP request.
   * @param {string} method
   * @param {string} url
   * @param {string=} contentType
   * @param {Object=} body
   */
  async #request<T>(method: string, url: string, options: RequestInit = {}): Promise<T> {
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
      return undefined as unknown as T;
    }

    const obj = await response.json();
    if (response.status >= 400) {
      throw obj;
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
    headers['X-Medplum'] = 'extended';

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
    if (
      typeof data === 'string' ||
      (typeof Blob !== 'undefined' && data instanceof Blob) ||
      (typeof File !== 'undefined' && data instanceof File) ||
      (typeof Uint8Array !== 'undefined' && data instanceof Uint8Array)
    ) {
      options.body = data;
    } else if (data) {
      options.body = JSON.stringify(data);
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
  async startPkce(): Promise<void> {
    const pkceState = getRandomString();
    sessionStorage.setItem('pkceState', pkceState);

    const codeVerifier = getRandomString();
    sessionStorage.setItem('codeVerifier', codeVerifier);

    const arrayHash = await encryptSHA256(codeVerifier);
    const codeChallenge = arrayBufferToBase64(arrayHash).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    sessionStorage.setItem('codeChallenge', codeChallenge);
  }

  /**
   * Redirects the user to the login screen for authorization.
   * Clears all auth state including local storage and session storage.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
   */
  async #requestAuthorization(): Promise<void> {
    await this.startPkce();

    const url = new URL(this.#authorizeUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', sessionStorage.getItem('pkceState') as string);
    url.searchParams.set('client_id', this.#clientId);
    url.searchParams.set('redirect_uri', getBaseUrl());
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', sessionStorage.getItem('codeChallenge') as string);
    window.location.assign(url.toString());
  }

  /**
   * Processes an OAuth authorization code.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenRequest
   * @param code The authorization code received by URL parameter.
   */
  processCode(code: string): Promise<ProfileResource> {
    const formBody = new URLSearchParams();
    formBody.set('grant_type', 'authorization_code');
    formBody.set('client_id', this.#clientId);
    formBody.set('code', code);
    formBody.set('redirect_uri', getBaseUrl());

    const codeVerifier = sessionStorage.getItem('codeVerifier');
    if (codeVerifier) {
      formBody.set('code_verifier', codeVerifier);
    }

    return this.#fetchTokens(formBody);
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
      throw new Error('Invalid refresh token');
    }

    const formBody = new URLSearchParams();
    formBody.set('grant_type', 'refresh_token');
    formBody.set('client_id', this.#clientId);
    formBody.set('refresh_token', this.#refreshToken);
    this.#refreshPromise = this.#fetchTokens(formBody);
    await this.#refreshPromise;
  }

  /**
   * Starts a new OAuth2 client credentials flow.
   * See: https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
   * @category Authentication
   * @param clientId The client ID.
   * @param clientSecret The client secret.
   * @returns Promise that resolves to the client profile.
   */
  async startClientLogin(clientId: string, clientSecret: string): Promise<ProfileResource> {
    const formBody = new URLSearchParams();
    formBody.set('grant_type', 'client_credentials');
    formBody.set('client_id', clientId);
    formBody.set('client_secret', clientSecret);
    return this.#fetchTokens(formBody);
  }

  /**
   * Makes a POST request to the tokens endpoint.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
   * @param formBody Token parameters in URL encoded format.
   */
  async #fetchTokens(formBody: URLSearchParams): Promise<ProfileResource> {
    return this.#fetch(this.#tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch tokens');
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
      throw new Error('Token expired');
    }

    // Verify app_client_id
    if (this.#clientId && tokenPayload.client_id !== this.#clientId) {
      this.clear();
      throw new Error('Token was not issued for this audience');
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
 * @category HTTP
 */
function getBaseUrl(): string {
  return window.location.protocol + '//' + window.location.host + '/';
}

function ensureTrailingSlash(url: string | undefined): string | undefined {
  if (!url) {
    return url;
  }
  return url.endsWith('/') ? url : url + '/';
}
