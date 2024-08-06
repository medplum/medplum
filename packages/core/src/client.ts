// PKCE auth based on:
// https://aws.amazon.com/blogs/security/how-to-add-authentication-single-page-web-application-with-amazon-cognito-oauth2-implementation/

import {
  AccessPolicy,
  Agent,
  Attachment,
  Binary,
  Bot,
  BulkDataExport,
  Bundle,
  BundleEntry,
  BundleLink,
  Communication,
  Device,
  Encounter,
  ExtractResource,
  Identifier,
  Media,
  OperationOutcome,
  Patient,
  Project,
  ProjectMembership,
  ProjectMembershipAccess,
  ProjectSetting,
  Reference,
  Resource,
  ResourceType,
  SearchParameter,
  StructureDefinition,
  Subscription,
  UserConfiguration,
  ValueSet,
} from '@medplum/fhirtypes';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
/** @ts-ignore */
import type { CustomTableLayout, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import { encodeBase64 } from './base64';
import { LRUCache } from './cache';
import { ContentType } from './contenttype';
import { encryptSHA256, getRandomString } from './crypto';
import { TypedEventTarget } from './eventtarget';
import {
  CurrentContext,
  FhircastConnection,
  FhircastEventContext,
  FhircastEventName,
  FhircastEventVersionOptional,
  FhircastEventVersionRequired,
  PendingSubscriptionRequest,
  SubscriptionRequest,
  assertContextVersionOptional,
  createFhircastMessagePayload,
  isContextVersionRequired,
  serializeFhircastSubscriptionRequest,
  validateFhircastSubscriptionRequest,
} from './fhircast';
import { Hl7Message } from './hl7';
import { isJwt, isMedplumAccessToken, parseJWTPayload, tryGetJwtExpiration } from './jwt';
import { MedplumKeyValueClient } from './keyvalue';
import {
  OperationOutcomeError,
  badRequest,
  isOk,
  isOperationOutcome,
  normalizeOperationOutcome,
  notFound,
  validationError,
} from './outcomes';
import { ReadablePromise } from './readablepromise';
import { ClientStorage, IClientStorage } from './storage';
import { SubscriptionEmitter, SubscriptionManager } from './subscriptions';
import { indexSearchParameter } from './types';
import { indexStructureDefinitionBundle, isDataTypeLoaded, isProfileLoaded, loadDataType } from './typeschema/types';
import {
  CodeChallengeMethod,
  ProfileResource,
  QueryTypes,
  arrayBufferToBase64,
  concatUrls,
  createReference,
  ensureTrailingSlash,
  getQueryString,
  getReferenceString,
  getWebSocketUrl,
  isObject,
  resolveId,
  sleep,
  sortStringArray,
} from './utils';

export const MEDPLUM_VERSION: string = import.meta.env.MEDPLUM_VERSION ?? '';
export const MEDPLUM_CLI_CLIENT_ID = 'medplum-cli';
export const DEFAULT_ACCEPT = ContentType.FHIR_JSON + ', */*; q=0.1';

const DEFAULT_BASE_URL = 'https://api.medplum.com/';
const DEFAULT_RESOURCE_CACHE_SIZE = 1000;
const DEFAULT_BROWSER_CACHE_TIME = 60000; // 60 seconds
const DEFAULT_NODE_CACHE_TIME = 0;
const BINARY_URL_PREFIX = 'Binary/';

const system: Device = {
  resourceType: 'Device',
  id: 'system',
  deviceName: [{ type: 'model-name', name: 'System' }],
};

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
   * Can be specified as absolute URL or relative to baseUrl.
   *
   * Use this if you want to use a separate OAuth server.
   */
  authorizeUrl?: string;

  /**
   * FHIR URL path.
   *
   * Default value is "fhir/R4/".
   *
   * Can be specified as absolute URL or relative to baseUrl.
   *
   * Use this if you want to use a different path when connecting to a FHIR server.
   */
  fhirUrlPath?: string;

  /**
   * OAuth2 token URL.
   *
   * Default value is baseUrl + "/oauth2/token".
   *
   * Can be specified as absolute URL or relative to baseUrl.
   *
   * Use this if you want to use a separate OAuth server.
   */
  tokenUrl?: string;

  /**
   * OAuth2 logout URL.
   *
   * Default value is baseUrl + "/oauth2/logout".
   *
   * Can be specified as absolute URL or relative to baseUrl.
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
   * The client secret.
   *
   * Client secret can be used for FHIR Oauth Client Credential flows
   */
  clientSecret?: string;

  /**
   * The OAuth Access Token.
   *
   * Access Token used to connect to make request to FHIR servers
   */
  accessToken?: string;

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
   * Default value is 60000 (60 seconds).
   *
   * Cache time of zero disables all caching.
   *
   * For any individual request, the cache behavior can be overridden by setting the cache property on request options.
   *
   * See: https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
   */
  cacheTime?: number;

  /**
   * The length of time in milliseconds to delay requests for auto batching.
   *
   * Auto batching attempts to group multiple requests together into a single batch request.
   *
   * Default value is 0, which disables auto batching.
   */
  autoBatchTime?: number;

  /**
   * Fetch implementation.
   *
   * Default is window.fetch (if available).
   *
   * For Node.js applications, consider the 'node-fetch' package.
   */
  fetch?: FetchLike;

  /**
   * Storage implementation.
   *
   * Default is window.localStorage (if available), this is the common implementation for use in the browser, or an in-memory storage implementation.  If using Medplum on a server it may be useful to provide a custom storage implementation, for example using redis, a database or a file based storage.  Medplum CLI is an an example of `FileSystemStorage`, for reference.
   */
  storage?: IClientStorage;

  /**
   * Create PDF implementation.
   *
   * Default is none, and PDF generation is disabled.
   *
   * @example
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
   * @example
   * In Node.js applications:
   *
   * ```ts
   * import type { CustomTableLayout, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
   * function createPdf(
   *   docDefinition: TDocumentDefinitions,
   *   tableLayouts?: { [name: string]: CustomTableLayout },
   *   fonts?: TFontDictionary
   * ): Promise<Buffer> {
   *   return new Promise((resolve, reject) => {
   *     const printer = new PdfPrinter(fonts ?? {});
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

  /**
   * The default redirect behavior.
   *
   * The default behavior is to not follow redirects.
   *
   * Use "follow" to automatically follow redirects.
   */
  redirect?: RequestRedirect;

  /**
   * When the verbose flag is set, the client will log all requests and responses to the console.
   */
  verbose?: boolean;
}

export interface MedplumRequestOptions extends RequestInit {
  /**
   * Optional flag to follow "Location" or "Content-Location" URL on successful HTTP 200 "OK" responses.
   */
  followRedirectOnOk?: boolean;

  /**
   * Optional flag to follow "Location" or "Content-Location" URL on successful HTTP 201 "Created" responses.
   */
  followRedirectOnCreated?: boolean;

  /**
   * Optional flag to poll the status URL on successful HTTP 202 "Accepted" responses.
   */
  pollStatusOnAccepted?: boolean;

  /**
   * Optional polling time interval in milliseconds.
   * Default value is 1000 (1 second).
   */
  pollStatusPeriod?: number;
  /**
   * Optional max number of retries that should be made in the case of a failed request. Default is `2`.
   */
  maxRetries?: number;
}

export type FetchLike = (url: string, options?: any) => Promise<any>;

/**
 * ResourceArray is an array of resources with a bundle property.
 * The bundle property is a FHIR Bundle containing the search results.
 * This is useful for retrieving bundle metadata such as total, offset, and next link.
 */
export type ResourceArray<T extends Resource = Resource> = T[] & { bundle: Bundle<T> };

export interface CreatePdfFunction {
  (
    docDefinition: TDocumentDefinitions,
    tableLayouts?: Record<string, CustomTableLayout> | undefined,
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
  readonly codeChallengeMethod?: CodeChallengeMethod;
  readonly googleClientId?: string;
  readonly launch?: string;
  readonly redirectUri?: string;
}

export interface EmailPasswordLoginRequest extends BaseLoginRequest {
  readonly email: string;
  readonly password: string;
  /** @deprecated Use scope of "offline" or "offline_access" instead. */
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
  readonly clientId?: string;
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
  readonly mfaRequired?: boolean;
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
  readonly bot: Reference<Bot>;
  readonly contentType: string;
  readonly input: T;
  readonly secrets: Record<string, ProjectSetting>;
  readonly traceId?: string;
}

export interface InviteRequest {
  resourceType: 'Patient' | 'Practitioner' | 'RelatedPerson';
  firstName: string;
  lastName: string;
  email?: string;
  externalId?: string;
  password?: string;
  sendEmail?: boolean;
  membership?: Partial<ProjectMembership>;
  upsert?: boolean;
  /** @deprecated Use membership.accessPolicy instead. */
  accessPolicy?: Reference<AccessPolicy>;
  /** @deprecated Use membership.access instead. */
  access?: ProjectMembershipAccess[];
  /** @deprecated Use membership.admin instead. */
  admin?: boolean;
}

/**
 * JSONPatch patch operation.
 * Compatible with fast-json-patch and rfc6902 Operation.
 */
export interface PatchOperation {
  readonly op: 'add' | 'remove' | 'replace' | 'copy' | 'move' | 'test';
  readonly path: string;
  readonly value?: any;
}

/**
 * Source for a FHIR Binary.
 */
export type BinarySource = string | File | Blob | Uint8Array;

/**
 * Binary upload options.
 */
export interface CreateBinaryOptions {
  /**
   * The binary data to upload.
   */
  readonly data: BinarySource;

  /**
   * Content type for the binary.
   */
  readonly contentType: string;

  /**
   * Optional filename for the binary.
   */
  readonly filename?: string;

  /**
   * Optional security context for the binary.
   */
  readonly securityContext?: Reference;

  /**
   * Optional fetch options. **NOTE:** only `requestOptions.signal` is respected when `onProgress` is also provided.
   */
  readonly onProgress?: (e: ProgressEvent) => void;
}

export interface CreateMediaOptions extends CreateBinaryOptions {
  /**
   * Optional additional fields for the Media resource.
   */
  readonly additionalFields?: Partial<Media>;
}

/**
 * PDF upload options.
 */
export interface CreatePdfOptions extends Omit<CreateBinaryOptions, 'data' | 'contentType'> {
  /**
   * The PDF document definition. See https://pdfmake.github.io/docs/0.1/document-definition-object/
   */
  readonly docDefinition: TDocumentDefinitions;

  /**
   * Optional pdfmake custom table layout.
   */
  readonly tableLayouts?: Record<string, CustomTableLayout>;

  /**
   * Optional pdfmake custom font dictionary.
   */
  readonly fonts?: TFontDictionary;
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
 * Email destination definition.
 */
export type MailDestination = string | MailAddress | string[] | MailAddress[];

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
  /** The e-mail address of the sender. All e-mail addresses can be plain `sender@server.com` or formatted `Sender Name <sender@server.com>` */
  readonly from?: string | MailAddress;
  /** An e-mail address that will appear on the Sender: field */
  readonly sender?: string | MailAddress;
  /** Comma separated list or an array of recipients e-mail addresses that will appear on the To: field */
  readonly to?: MailDestination;
  /** Comma separated list or an array of recipients e-mail addresses that will appear on the Cc: field */
  readonly cc?: MailDestination;
  /** Comma separated list or an array of recipients e-mail addresses that will appear on the Bcc: field */
  readonly bcc?: MailDestination;
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

interface AutoBatchEntry<T = any> {
  readonly method: string;
  readonly url: string;
  readonly options: MedplumRequestOptions;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: any) => void;
}

interface RequestState {
  statusUrl?: string;
  pollCount?: number;
}

/**
 * OAuth 2.0 Grant Type Identifiers
 * Standard identifiers: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07#name-grant-types
 * JWT bearer extension: https://datatracker.ietf.org/doc/html/rfc7523
 * Token exchange extension: https://datatracker.ietf.org/doc/html/rfc8693
 */
export enum OAuthGrantType {
  ClientCredentials = 'client_credentials',
  AuthorizationCode = 'authorization_code',
  RefreshToken = 'refresh_token',
  JwtBearer = 'urn:ietf:params:oauth:grant-type:jwt-bearer',
  TokenExchange = 'urn:ietf:params:oauth:grant-type:token-exchange',
}

/**
 * OAuth 2.0 Token Type Identifiers
 * See: https://datatracker.ietf.org/doc/html/rfc8693#name-token-type-identifiers
 */
export enum OAuthTokenType {
  /** Indicates that the token is an OAuth 2.0 access token issued by the given authorization server. */
  AccessToken = 'urn:ietf:params:oauth:token-type:access_token',
  /** Indicates that the token is an OAuth 2.0 refresh token issued by the given authorization server. */
  RefreshToken = 'urn:ietf:params:oauth:token-type:refresh_token',
  /** Indicates that the token is an ID Token as defined in Section 2 of [OpenID.Core]. */
  IdToken = 'urn:ietf:params:oauth:token-type:id_token',
  /** Indicates that the token is a base64url-encoded SAML 1.1 [OASIS.saml-core-1.1] assertion. */
  Saml1Token = 'urn:ietf:params:oauth:token-type:saml1',
  /** Indicates that the token is a base64url-encoded SAML 2.0 [OASIS.saml-core-2.0-os] assertion. */
  Saml2Token = 'urn:ietf:params:oauth:token-type:saml2',
}

/**
 * OAuth 2.0 Client Authentication Methods
 * See: https://openid.net/specs/openid-connect-core-1_0.html#ClientAuthentication
 */
export enum OAuthTokenAuthMethod {
  ClientSecretBasic = 'client_secret_basic',
  ClientSecretPost = 'client_secret_post',
  ClientSecretJwt = 'client_secret_jwt',
  PrivateKeyJwt = 'private_key_jwt',
  None = 'none',
}

/**
 * OAuth 2.0 Client Authentication Methods
 * See: https://datatracker.ietf.org/doc/html/rfc7523#section-2.2
 */
export enum OAuthClientAssertionType {
  /** Using JWTs for Client Authentication */
  JwtBearer = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
}

interface SessionDetails {
  project: Project;
  membership: ProjectMembership;
  profile: ProfileResource;
  config: UserConfiguration;
  accessPolicy: AccessPolicy;
}

/**
 * ValueSet $expand operation parameters.
 * See: https://hl7.org/fhir/r4/valueset-operation-expand.html
 */
export interface ValueSetExpandParams {
  url?: string;
  filter?: string;
  date?: string;
  offset?: number;
  count?: number;
}

export interface RequestProfileSchemaOptions {
  /** (optional) Whether to include nested profiles, e.g. from extensions. Defaults to false. */
  expandProfile?: boolean;
}

/**
 * This map enumerates all the lifecycle events that `MedplumClient` emits and what the shape of the `Event` is.
 */
export type MedplumClientEventMap = {
  change: { type: 'change' };
  offline: { type: 'offline' };
  profileRefreshing: { type: 'profileRefreshing' };
  profileRefreshed: { type: 'profileRefreshed' };
  storageInitialized: { type: 'storageInitialized' };
  storageInitFailed: { type: 'storageInitFailed'; payload: { error: Error } };
};

/**
 * The MedplumClient class provides a client for the Medplum FHIR server.
 *
 * The client can be used in the browser, in a Node.js application, or in a Medplum Bot.
 *
 * The client provides helpful methods for common operations such as:
 *   1. Authenticating
 *   2. Creating resources
 *   3. Reading resources
 *   4. Updating resources
 *   5. Deleting resources
 *   6. Searching
 *   7. Making GraphQL queries
 *
 * The client can also be used to integrate with other FHIR servers. For an example, see the Epic Connection Demo Bot [here](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/epic).
 *
 * @example
 * Here is a quick example of how to use the client:
 *
 * ```typescript
 * import { MedplumClient } from '@medplum/core';
 * const medplum = new MedplumClient();
 * ```
 *
 * @example
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
 * @example
 * Read a `Patient` by ID:
 *
 * ```typescript
 * const patient = await medplum.readResource('Patient', '123');
 * console.log(patient.name[0].given[0]);
 * ```
 *
 * @example
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
export class MedplumClient extends TypedEventTarget<MedplumClientEventMap> {
  private readonly options: MedplumClientOptions;
  private readonly fetch: FetchLike;
  private readonly createPdfImpl?: CreatePdfFunction;
  private readonly storage: IClientStorage;
  private readonly requestCache: LRUCache<RequestCacheEntry> | undefined;
  private readonly cacheTime: number;
  private readonly baseUrl: string;
  private readonly fhirBaseUrl: string;
  private readonly authorizeUrl: string;
  private readonly tokenUrl: string;
  private readonly logoutUrl: string;
  private readonly onUnauthenticated?: () => void;
  private readonly autoBatchTime: number;
  private readonly autoBatchQueue: AutoBatchEntry[] | undefined;
  private subscriptionManager?: SubscriptionManager;
  private medplumServer?: boolean;
  private clientId?: string;
  private clientSecret?: string;
  private autoBatchTimerId?: any;
  private accessToken?: string;
  private accessTokenExpires?: number;
  private refreshToken?: string;
  private refreshPromise?: Promise<any>;
  private profilePromise?: Promise<any>;
  private sessionDetails?: SessionDetails;
  private basicAuth?: string;
  private initPromise: Promise<void>;
  private initComplete = true;
  private keyValueClient?: MedplumKeyValueClient;

  constructor(options?: MedplumClientOptions) {
    super();

    if (options?.baseUrl) {
      if (!options.baseUrl.startsWith('http')) {
        throw new Error('Base URL must start with http or https');
      }
    }

    this.options = options ?? {};
    this.fetch = options?.fetch ?? getDefaultFetch();
    this.storage = options?.storage ?? new ClientStorage();
    this.createPdfImpl = options?.createPdf;
    this.baseUrl = ensureTrailingSlash(options?.baseUrl ?? DEFAULT_BASE_URL);
    this.fhirBaseUrl = concatUrls(this.baseUrl, options?.fhirUrlPath ?? 'fhir/R4');
    this.authorizeUrl = concatUrls(this.baseUrl, options?.authorizeUrl ?? 'oauth2/authorize');
    this.tokenUrl = concatUrls(this.baseUrl, options?.tokenUrl ?? 'oauth2/token');
    this.logoutUrl = concatUrls(this.baseUrl, options?.logoutUrl ?? 'oauth2/logout');
    this.clientId = options?.clientId ?? '';
    this.clientSecret = options?.clientSecret ?? '';
    this.onUnauthenticated = options?.onUnauthenticated;

    this.cacheTime =
      options?.cacheTime ?? (typeof window === 'undefined' ? DEFAULT_NODE_CACHE_TIME : DEFAULT_BROWSER_CACHE_TIME);
    if (this.cacheTime > 0) {
      this.requestCache = new LRUCache(options?.resourceCacheSize ?? DEFAULT_RESOURCE_CACHE_SIZE);
    } else {
      this.requestCache = undefined;
    }

    if (options?.autoBatchTime) {
      this.autoBatchTime = options.autoBatchTime;
      this.autoBatchQueue = [];
    } else {
      this.autoBatchTime = 0;
      this.autoBatchQueue = undefined;
    }

    if (options?.accessToken) {
      this.setAccessToken(options.accessToken);
    }

    if (this.storage.getInitPromise === undefined) {
      if (!options?.accessToken) {
        this.attemptResumeActiveLogin().catch(console.error);
      }
      this.initPromise = Promise.resolve();
      this.dispatchEvent({ type: 'storageInitialized' });
    } else {
      this.initComplete = false;
      this.initPromise = this.storage.getInitPromise();
      this.initPromise
        .then(() => {
          if (!options?.accessToken) {
            this.attemptResumeActiveLogin().catch(console.error);
          }
          this.initComplete = true;
          this.dispatchEvent({ type: 'storageInitialized' });
        })
        .catch((err: Error) => {
          console.error(err);
          this.initComplete = true;
          this.dispatchEvent({ type: 'storageInitFailed', payload: { error: err } });
        });
    }

    this.setupStorageListener();
  }

  /**
   * @returns Whether the client has been fully initialized or not. Should always be true unless a custom asynchronous `ClientStorage` was passed into the constructor.
   */
  get isInitialized(): boolean {
    return this.initComplete;
  }

  /**
   * Gets a Promise that resolves when async initialization is complete. This is particularly useful for waiting for an async `ClientStorage` and/or authentication to finish.
   * @returns A Promise that resolves when any async initialization of the client is finished.
   */
  getInitPromise(): Promise<void> {
    return this.initPromise;
  }

  private async attemptResumeActiveLogin(): Promise<void> {
    const activeLogin = this.getActiveLogin();
    if (!activeLogin) {
      return;
    }
    this.setAccessToken(activeLogin.accessToken, activeLogin.refreshToken);
    await this.refreshProfile();
  }

  /**
   * Returns the current base URL for all API requests.
   * By default, this is set to `https://api.medplum.com/`.
   * This can be overridden by setting the `baseUrl` option when creating the client.
   * @category HTTP
   * @returns The current base URL for all API requests.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Returns the current authorize URL.
   * By default, this is set to `https://api.medplum.com/oauth2/authorize`.
   * This can be overridden by setting the `authorizeUrl` option when creating the client.
   * @category HTTP
   * @returns The current authorize URL.
   */
  getAuthorizeUrl(): string {
    return this.authorizeUrl;
  }

  /**
   * Returns the current token URL.
   * By default, this is set to `https://api.medplum.com/oauth2/token`.
   * This can be overridden by setting the `tokenUrl` option when creating the client.
   * @category HTTP
   * @returns The current token URL.
   */
  getTokenUrl(): string {
    return this.tokenUrl;
  }

  /**
   * Returns the current logout URL.
   * By default, this is set to `https://api.medplum.com/oauth2/logout`.
   * This can be overridden by setting the `logoutUrl` option when creating the client.
   * @category HTTP
   * @returns The current logout URL.
   */
  getLogoutUrl(): string {
    return this.logoutUrl;
  }

  /**
   * Clears all auth state including local storage and session storage.
   * @category Authentication
   */
  clear(): void {
    this.storage.clear();
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
    }
    this.clearActiveLogin();
  }

  /**
   * Clears the active login from local storage.
   * Does not clear all local storage (such as other logins).
   * @category Authentication
   */
  clearActiveLogin(): void {
    this.storage.setString('activeLogin', undefined);
    this.requestCache?.clear();
    this.accessToken = undefined;
    this.refreshToken = undefined;
    this.refreshPromise = undefined;
    this.accessTokenExpires = undefined;
    this.sessionDetails = undefined;
    this.medplumServer = undefined;
    this.dispatchEvent({ type: 'change' });
  }

  /**
   * Invalidates any cached values or cached requests for the given URL.
   * @category Caching
   * @param url - The URL to invalidate.
   */
  invalidateUrl(url: URL | string): void {
    url = url.toString();
    this.requestCache?.delete(url);
  }

  /**
   * Invalidates all cached values and flushes the cache.
   * @category Caching
   */
  invalidateAll(): void {
    this.requestCache?.clear();
  }

  /**
   * Invalidates all cached search results or cached requests for the given resourceType.
   * @category Caching
   * @param resourceType - The resource type to invalidate.
   */
  invalidateSearches<K extends ResourceType>(resourceType: K): void {
    const url = concatUrls(this.fhirBaseUrl, resourceType);
    if (this.requestCache) {
      for (const key of this.requestCache.keys()) {
        if (key.endsWith(url) || key.includes(url + '?')) {
          this.requestCache.delete(key);
        }
      }
    }
  }

  /**
   * Makes an HTTP GET request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `readResource()`, `search()`, etc.
   * @category HTTP
   * @param url - The target URL.
   * @param options - Optional fetch options.
   * @returns Promise to the response content.
   */
  get<T = any>(url: URL | string, options: MedplumRequestOptions = {}): ReadablePromise<T> {
    url = url.toString();
    const cached = this.getCacheEntry(url, options);
    if (cached) {
      return cached.value;
    }

    let promise: Promise<T>;

    if (url.startsWith(this.fhirBaseUrl) && this.autoBatchQueue) {
      promise = new Promise<T>((resolve, reject) => {
        (this.autoBatchQueue as AutoBatchEntry[]).push({
          method: 'GET',
          url: (url as string).replace(this.fhirBaseUrl, ''),
          options,
          resolve,
          reject,
        });
        if (!this.autoBatchTimerId) {
          this.autoBatchTimerId = setTimeout(() => this.executeAutoBatch(), this.autoBatchTime);
        }
      });
    } else {
      promise = this.request<T>('GET', url, options);
    }

    const readablePromise = new ReadablePromise(promise);
    this.setCacheEntry(url, readablePromise);
    return readablePromise;
  }

  /**
   * Makes an HTTP POST request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `createResource()`.
   * @category HTTP
   * @param url - The target URL.
   * @param body - The content body. Strings and `File` objects are passed directly. Other objects are converted to JSON.
   * @param contentType - The content type to be included in the "Content-Type" header.
   * @param options - Optional fetch options.
   * @returns Promise to the response content.
   */
  post(url: URL | string, body: any, contentType?: string, options: MedplumRequestOptions = {}): Promise<any> {
    url = url.toString();
    this.setRequestBody(options, body);
    if (contentType) {
      this.setRequestContentType(options, contentType);
    }
    this.invalidateUrl(url);
    return this.request('POST', url, options);
  }

  /**
   * Makes an HTTP PUT request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `updateResource()`.
   * @category HTTP
   * @param url - The target URL.
   * @param body - The content body. Strings and `File` objects are passed directly. Other objects are converted to JSON.
   * @param contentType - The content type to be included in the "Content-Type" header.
   * @param options - Optional fetch options.
   * @returns Promise to the response content.
   */
  put(url: URL | string, body: any, contentType?: string, options: MedplumRequestOptions = {}): Promise<any> {
    url = url.toString();
    this.setRequestBody(options, body);
    if (contentType) {
      this.setRequestContentType(options, contentType);
    }
    this.invalidateUrl(url);
    return this.request('PUT', url, options);
  }

  /**
   * Makes an HTTP PATCH request to the specified URL.
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `patchResource()`.
   * @category HTTP
   * @param url - The target URL.
   * @param operations - Array of JSONPatch operations.
   * @param options - Optional fetch options.
   * @returns Promise to the response content.
   */
  patch(url: URL | string, operations: PatchOperation[], options: MedplumRequestOptions = {}): Promise<any> {
    url = url.toString();
    this.setRequestBody(options, operations);
    this.setRequestContentType(options, ContentType.JSON_PATCH);
    this.invalidateUrl(url);
    return this.request('PATCH', url, options);
  }

  /**
   * Makes an HTTP DELETE request to the specified URL.
   *
   *
   * This is a lower level method for custom requests.
   * For common operations, we recommend using higher level methods
   * such as `deleteResource()`.
   * @category HTTP
   * @param url - The target URL.
   * @param options - Optional fetch options.
   * @returns Promise to the response content.
   */
  delete(url: URL | string, options?: MedplumRequestOptions): Promise<any> {
    url = url.toString();
    this.invalidateUrl(url);
    return this.request('DELETE', url, options);
  }

  /**
   * Initiates a new user flow.
   *
   * This method is part of the two different user registration flows:
   * 1) New Practitioner and new Project
   * 2) New Patient registration
   * @category Authentication
   * @param newUserRequest - Register request including email and password.
   * @param options - Optional fetch options.
   * @returns Promise to the authentication response.
   */
  async startNewUser(
    newUserRequest: NewUserRequest,
    options?: MedplumRequestOptions
  ): Promise<LoginAuthenticationResponse> {
    const { codeChallengeMethod, codeChallenge } = await this.startPkce();
    return this.post(
      'auth/newuser',
      {
        ...newUserRequest,
        clientId: newUserRequest.clientId ?? this.clientId,
        codeChallengeMethod,
        codeChallenge,
      },
      undefined,
      options
    ) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Initiates a new project flow.
   *
   * This requires a partial login from `startNewUser` or `startNewGoogleUser`.
   * @param newProjectRequest - Register request including email and password.
   * @param options - Optional fetch options.
   * @returns Promise to the authentication response.
   */
  async startNewProject(
    newProjectRequest: NewProjectRequest,
    options?: MedplumRequestOptions
  ): Promise<LoginAuthenticationResponse> {
    return this.post('auth/newproject', newProjectRequest, undefined, options) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Initiates a new patient flow.
   *
   * This requires a partial login from `startNewUser` or `startNewGoogleUser`.
   * @param newPatientRequest - Register request including email and password.
   * @param options - Optional fetch options.
   * @returns Promise to the authentication response.
   */
  async startNewPatient(
    newPatientRequest: NewPatientRequest,
    options?: MedplumRequestOptions
  ): Promise<LoginAuthenticationResponse> {
    return this.post('auth/newpatient', newPatientRequest, undefined, options) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Initiates a user login flow.
   * @category Authentication
   * @param loginRequest - Login request including email and password.
   * @param options - Optional fetch options.
   * @returns Promise to the authentication response.
   */
  async startLogin(
    loginRequest: EmailPasswordLoginRequest,
    options?: MedplumRequestOptions
  ): Promise<LoginAuthenticationResponse> {
    return this.post(
      'auth/login',
      {
        ...(await this.ensureCodeChallenge(loginRequest)),
        clientId: loginRequest.clientId ?? this.clientId,
        scope: loginRequest.scope,
      },
      undefined,
      options
    ) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Tries to sign in with Google authentication.
   * The response parameter is the result of a Google authentication.
   * See: https://developers.google.com/identity/gsi/web/guides/handle-credential-responses-js-functions
   * @category Authentication
   * @param loginRequest - Login request including Google credential response.
   * @param options - Optional fetch options.
   * @returns Promise to the authentication response.
   */
  async startGoogleLogin(
    loginRequest: GoogleLoginRequest,
    options?: MedplumRequestOptions
  ): Promise<LoginAuthenticationResponse> {
    return this.post(
      'auth/google',
      {
        ...(await this.ensureCodeChallenge(loginRequest)),
        clientId: loginRequest.clientId ?? this.clientId,
        scope: loginRequest.scope,
      },
      undefined,
      options
    ) as Promise<LoginAuthenticationResponse>;
  }

  /**
   * Returns the PKCE code challenge and method.
   * If the login request already includes a code challenge, it is returned.
   * Otherwise, a new PKCE code challenge is generated.
   * @category Authentication
   * @param loginRequest - The original login request.
   * @returns The PKCE code challenge and method.
   */
  async ensureCodeChallenge<T extends BaseLoginRequest>(loginRequest: T): Promise<T> {
    if (loginRequest.codeChallenge) {
      return loginRequest;
    }
    return { ...loginRequest, ...(await this.startPkce()) };
  }

  /**
   * Signs out locally.
   * Does not invalidate tokens with the server.
   * @category Authentication
   */
  async signOut(): Promise<void> {
    await this.post(this.logoutUrl, {});
    this.clear();
  }

  /**
   * Tries to sign in the user.
   * Returns true if the user is signed in.
   * This may result in navigating away to the sign in page.
   * @category Authentication
   * @param loginParams - Optional login parameters.
   * @returns The user profile resource if available.
   */
  async signInWithRedirect(loginParams?: Partial<BaseLoginRequest>): Promise<ProfileResource | undefined> {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (!code) {
      await this.requestAuthorization(loginParams);
      return undefined;
    }
    return this.processCode(code);
  }

  /**
   * Tries to sign out the user.
   * See: https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
   * @category Authentication
   */
  signOutWithRedirect(): void {
    window.location.assign(this.logoutUrl);
  }

  /**
   * Initiates sign in with an external identity provider.
   * @param authorizeUrl - The external authorization URL.
   * @param clientId - The external client ID.
   * @param redirectUri - The external identity provider redirect URI.
   * @param baseLogin - The Medplum login request.
   * @param pkceEnabled - Whether `PKCE` should be enabled for this external auth request. Defaults to `true`.
   * @category Authentication
   */
  async signInWithExternalAuth(
    authorizeUrl: string,
    clientId: string,
    redirectUri: string,
    baseLogin: BaseLoginRequest,
    pkceEnabled = true
  ): Promise<void> {
    let loginRequest = baseLogin;
    if (pkceEnabled) {
      loginRequest = await this.ensureCodeChallenge(baseLogin);
    }
    window.location.assign(
      this.getExternalAuthRedirectUri(authorizeUrl, clientId, redirectUri, loginRequest, pkceEnabled)
    );
  }

  /**
   * Exchange an external access token for a Medplum access token.
   * @param token - The access token that was generated by the external identity provider.
   * @param clientId - The ID of the `ClientApplication` in your Medplum project that will be making the exchange request.
   * @returns The user profile resource.
   * @category Authentication
   */
  async exchangeExternalAccessToken(token: string, clientId?: string): Promise<ProfileResource> {
    clientId = clientId ?? this.clientId;
    if (!clientId) {
      throw new Error('MedplumClient is missing clientId');
    }

    const formBody = new URLSearchParams();
    formBody.set('grant_type', OAuthGrantType.TokenExchange);
    formBody.set('subject_token_type', OAuthTokenType.AccessToken);
    formBody.set('client_id', clientId);
    formBody.set('subject_token', token);
    return this.fetchTokens(formBody);
  }

  /**
   * Builds the external identity provider redirect URI.
   * @param authorizeUrl - The external authorization URL.
   * @param clientId - The external client ID.
   * @param redirectUri - The external identity provider redirect URI.
   * @param loginRequest - The Medplum login request.
   * @param pkceEnabled - Whether `PKCE` should be enabled for this external auth request. Defaults to `true`.
   * @returns The external identity provider redirect URI.
   * @category Authentication
   */
  getExternalAuthRedirectUri(
    authorizeUrl: string,
    clientId: string,
    redirectUri: string,
    loginRequest: BaseLoginRequest,
    pkceEnabled = true
  ): string {
    const url = new URL(authorizeUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', loginRequest.scope ?? 'openid profile email');
    url.searchParams.set('state', JSON.stringify(loginRequest));

    if (pkceEnabled) {
      const { codeChallenge, codeChallengeMethod } = loginRequest;
      if (!codeChallengeMethod) {
        throw new Error('`LoginRequest` for external auth must include a `codeChallengeMethod`.');
      }
      if (!codeChallenge) {
        throw new Error('`LoginRequest` for external auth must include a `codeChallenge`.');
      }
      url.searchParams.set('code_challenge_method', codeChallengeMethod);
      url.searchParams.set('code_challenge', codeChallenge);
    }

    return url.toString();
  }

  /**
   * Builds a FHIR URL from a collection of URL path components.
   * For example, `fhirUrl('Patient', '123')` returns `fhir/R4/Patient/123`.
   * @category HTTP
   * @param path - The path component of the URL.
   * @returns The well-formed FHIR URL.
   */
  fhirUrl(...path: string[]): URL {
    return new URL(concatUrls(this.fhirBaseUrl, path.join('/')));
  }

  /**
   * Builds a FHIR search URL from a search query or structured query object.
   * @category HTTP
   * @category Search
   * @param resourceType - The FHIR resource type.
   * @param query - The FHIR search query or structured query object. Can be any valid input to the URLSearchParams() constructor.
   * @returns The well-formed FHIR URL.
   */
  fhirSearchUrl(resourceType: ResourceType, query: QueryTypes): URL {
    const url = this.fhirUrl(resourceType);
    if (query) {
      url.search = getQueryString(query);
    }
    return url;
  }

  /**
   * Sends a FHIR search request.
   *
   * @example
   * Example using a FHIR search string:
   *
   * ```typescript
   * const bundle = await client.search('Patient', 'name=Alice');
   * console.log(bundle);
   * ```
   *
   * @example
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
   * @example
   * To query the count of a search, use the summary feature like so:
   *
   * ```typescript
   * const patients = medplum.search('Patient', '_summary=count');
   * ```
   *
   * See FHIR search for full details: https://www.hl7.org/fhir/search.html
   * @category Search
   * @param resourceType - The FHIR resource type.
   * @param query - Optional FHIR search query or structured query object. Can be any valid input to the URLSearchParams() constructor.
   * @param options - Optional fetch options.
   * @returns Promise to the search result bundle.
   */
  search<K extends ResourceType>(
    resourceType: K,
    query?: QueryTypes,
    options?: MedplumRequestOptions
  ): ReadablePromise<Bundle<ExtractResource<K>>> {
    const url = this.fhirSearchUrl(resourceType, query);
    const cacheKey = 'search-' + url.toString();
    const cached = this.getCacheEntry(cacheKey, options);
    if (cached) {
      return cached.value;
    }
    const promise = new ReadablePromise(
      (async () => {
        const bundle = await this.get<Bundle<ExtractResource<K>>>(url, options);
        if (bundle.entry) {
          for (const entry of bundle.entry) {
            this.cacheResource(entry.resource);
          }
        }
        return bundle;
      })()
    );
    this.setCacheEntry(cacheKey, promise);
    return promise;
  }

  /**
   * Sends a FHIR search request for a single resource.
   *
   * This is a convenience method for `search()` that returns the first resource rather than a `Bundle`.
   *
   * @example
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
   * @category Search
   * @param resourceType - The FHIR resource type.
   * @param query - Optional FHIR search query or structured query object. Can be any valid input to the URLSearchParams() constructor.
   * @param options - Optional fetch options.
   * @returns Promise to the first search result.
   */
  searchOne<K extends ResourceType>(
    resourceType: K,
    query?: QueryTypes,
    options?: MedplumRequestOptions
  ): ReadablePromise<ExtractResource<K> | undefined> {
    const url = this.fhirSearchUrl(resourceType, query);
    url.searchParams.set('_count', '1');
    url.searchParams.sort();
    const cacheKey = 'searchOne-' + url.toString();
    const cached = this.getCacheEntry(cacheKey, options);
    if (cached) {
      return cached.value;
    }
    const promise = new ReadablePromise(
      this.search<K>(resourceType, url.searchParams, options).then((b) => b.entry?.[0]?.resource)
    );
    this.setCacheEntry(cacheKey, promise);
    return promise;
  }

  /**
   * Sends a FHIR search request for an array of resources.
   *
   * This is a convenience method for `search()` that returns the resources as an array rather than a `Bundle`.
   *
   * @example
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
   * @category Search
   * @param resourceType - The FHIR resource type.
   * @param query - Optional FHIR search query or structured query object. Can be any valid input to the URLSearchParams() constructor.
   * @param options - Optional fetch options.
   * @returns Promise to the array of search results.
   */
  searchResources<K extends ResourceType>(
    resourceType: K,
    query?: QueryTypes,
    options?: MedplumRequestOptions
  ): ReadablePromise<ResourceArray<ExtractResource<K>>> {
    const url = this.fhirSearchUrl(resourceType, query);
    const cacheKey = 'searchResources-' + url.toString();
    const cached = this.getCacheEntry(cacheKey, options);
    if (cached) {
      return cached.value;
    }
    const promise = new ReadablePromise(this.search<K>(resourceType, query, options).then(bundleToResourceArray));
    this.setCacheEntry(cacheKey, promise);
    return promise;
  }

  /**
   * Creates an
   * [async generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator)
   * over a series of FHIR search requests for paginated search results. Each iteration of the generator yields
   * the array of resources on each page.
   *
   * @example
   *
   * ```typescript
   * for await (const page of medplum.searchResourcePages('Patient', { _count: 10 })) {
   *  for (const patient of page) {
   *    console.log(`Processing Patient resource with ID: ${patient.id}`);
   *  }
   * }
   * ```
   *
   * @category Search
   * @param resourceType - The FHIR resource type.
   * @param query - Optional FHIR search query or structured query object. Can be any valid input to the URLSearchParams() constructor.
   * @param options - Optional fetch options.
   * @yields An async generator, where each result is an array of resources for each page.
   */
  async *searchResourcePages<K extends ResourceType>(
    resourceType: K,
    query?: QueryTypes,
    options?: MedplumRequestOptions
  ): AsyncGenerator<ResourceArray<ExtractResource<K>>> {
    let url: URL | undefined = this.fhirSearchUrl(resourceType, query);

    while (url) {
      const searchParams: URLSearchParams = new URL(url).searchParams;
      const bundle = await this.search(resourceType, searchParams, options);
      const nextLink: BundleLink | undefined = bundle.link?.find((link) => link.relation === 'next');
      if (!bundle.entry?.length && !nextLink) {
        break;
      }

      yield bundleToResourceArray(bundle);
      url = nextLink?.url ? new URL(nextLink.url) : undefined;
    }
  }

  /**
   * Searches a ValueSet resource using the "expand" operation.
   * See: https://www.hl7.org/fhir/operation-valueset-expand.html
   * @category Search
   * @param system - The ValueSet system url.
   * @param filter - The search string.
   * @param options - Optional fetch options.
   * @returns Promise to expanded ValueSet.
   * @deprecated Use `valueSetExpand()` instead.
   */
  searchValueSet(system: string, filter: string, options?: MedplumRequestOptions): ReadablePromise<ValueSet> {
    return this.valueSetExpand({ url: system, filter }, options);
  }

  /**
   * Searches a ValueSet resource using the "expand" operation.
   * See: https://www.hl7.org/fhir/operation-valueset-expand.html
   * @category Search
   * @param params - The ValueSet expand parameters.
   * @param options - Optional fetch options.
   * @returns Promise to expanded ValueSet.
   */
  valueSetExpand(params: ValueSetExpandParams, options?: MedplumRequestOptions): ReadablePromise<ValueSet> {
    const url = this.fhirUrl('ValueSet', '$expand');
    url.search = new URLSearchParams(params as Record<string, string>).toString();
    return this.get(url.toString(), options);
  }

  /**
   * Returns a cached resource if it is available.
   * @category Caching
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @returns The resource if it is available in the cache; undefined otherwise.
   */
  getCached<K extends ResourceType>(resourceType: K, id: string): ExtractResource<K> | undefined {
    const cached = this.requestCache?.get(this.fhirUrl(resourceType, id).toString())?.value;
    return cached?.isOk() ? (cached.read() as ExtractResource<K>) : undefined;
  }

  /**
   * Returns a cached resource if it is available.
   * @category Caching
   * @param reference - The FHIR reference.
   * @returns The resource if it is available in the cache; undefined otherwise.
   */
  getCachedReference<T extends Resource>(reference: Reference<T>): T | undefined {
    const refString = reference.reference as string;
    if (!refString) {
      return undefined;
    }
    if (refString === 'system') {
      return system as T;
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
   * @example
   * Example:
   *
   * ```typescript
   * const patient = await medplum.readResource('Patient', '123');
   * console.log(patient);
   * ```
   *
   * See the FHIR "read" operation for full details: https://www.hl7.org/fhir/http.html#read
   * @category Read
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @param options - Optional fetch options.
   * @returns The resource if available.
   */
  readResource<K extends ResourceType>(
    resourceType: K,
    id: string,
    options?: MedplumRequestOptions
  ): ReadablePromise<ExtractResource<K>> {
    return this.get<ExtractResource<K>>(this.fhirUrl(resourceType, id), options);
  }

  /**
   * Reads a resource by `Reference`.
   *
   * This is a convenience method for `readResource()` that accepts a `Reference` object.
   *
   * @example
   * Example:
   *
   * ```typescript
   * const serviceRequest = await medplum.readResource('ServiceRequest', '123');
   * const patient = await medplum.readReference(serviceRequest.subject);
   * console.log(patient);
   * ```
   *
   * See the FHIR "read" operation for full details: https://www.hl7.org/fhir/http.html#read
   * @category Read
   * @param reference - The FHIR reference object.
   * @param options - Optional fetch options.
   * @returns The resource if available.
   */
  readReference<T extends Resource>(reference: Reference<T>, options?: MedplumRequestOptions): ReadablePromise<T> {
    const refString = reference.reference;
    if (!refString) {
      return new ReadablePromise(Promise.reject(new Error('Missing reference')));
    }
    if (refString === 'system') {
      return new ReadablePromise(Promise.resolve(system as unknown as T));
    }
    const [resourceType, id] = refString.split('/');
    if (!resourceType || !id) {
      return new ReadablePromise(Promise.reject(new Error('Invalid reference')));
    }
    return this.readResource(resourceType as ResourceType, id, options) as ReadablePromise<T>;
  }

  /**
   * Requests the schema for a resource type.
   * If the schema is already cached, the promise is resolved immediately.
   * @category Schema
   * @param resourceType - The FHIR resource type.
   * @returns Promise to a schema with the requested resource type.
   */
  requestSchema(resourceType: string): Promise<void> {
    if (isDataTypeLoaded(resourceType)) {
      return Promise.resolve();
    }

    const cacheKey = resourceType + '-requestSchema';
    const cached = this.getCacheEntry(cacheKey, undefined);
    if (cached) {
      return cached.value;
    }

    const promise = new ReadablePromise<void>(
      (async () => {
        const query = `{
      StructureDefinitionList(name: "${resourceType}") {
        resourceType,
        name,
        kind,
        description,
        type,
        snapshot {
          element {
            id,
            path,
            definition,
            min,
            max,
            base {
              path,
              min,
              max
            },
            contentReference,
            type {
              code,
              profile,
              targetProfile
            },
            binding {
              strength,
              valueSet
            }
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

        indexStructureDefinitionBundle(response.data.StructureDefinitionList);

        for (const searchParameter of response.data.SearchParameterList) {
          indexSearchParameter(searchParameter);
        }
      })()
    );
    this.setCacheEntry(cacheKey, promise);
    return promise;
  }

  /**
   * Requests the schema for a profile.
   * If the schema is already cached, the promise is resolved immediately.
   * @category Schema
   * @param profileUrl - The FHIR URL of the profile
   * @param options - (optional) Additional options
   * @returns Promise with an array of URLs of the profile(s) loaded.
   */
  requestProfileSchema(profileUrl: string, options?: RequestProfileSchemaOptions): Promise<string[]> {
    if (!options?.expandProfile && isProfileLoaded(profileUrl)) {
      return Promise.resolve([profileUrl]);
    }

    const cacheKey = profileUrl + '-requestSchema' + (options?.expandProfile ? '-nested' : '');
    const cached = this.getCacheEntry(cacheKey, undefined);
    if (cached) {
      return cached.value;
    }

    const promise = new ReadablePromise<string[]>(
      (async () => {
        if (options?.expandProfile) {
          const url = this.fhirUrl('StructureDefinition', '$expand-profile');
          url.search = new URLSearchParams({ url: profileUrl }).toString();
          const sdBundle = (await this.post(url.toString(), {})) as Bundle<StructureDefinition>;
          return bundleToResourceArray(sdBundle).map((sd) => {
            loadDataType(sd, sd.url);
            return sd.url;
          });
        } else {
          // Just sort by lastUpdated. Ideally, it would also be based on a logical sort of version
          // See https://hl7.org/fhir/references.html#canonical-matching for more discussion
          const sd = await this.searchOne('StructureDefinition', {
            url: profileUrl,
            _sort: '-_lastUpdated',
          });

          if (!sd) {
            console.warn(`No StructureDefinition found for ${profileUrl}!`);
            return [];
          }

          indexStructureDefinitionBundle([sd], profileUrl);
          return [profileUrl];
        }
      })()
    );
    this.setCacheEntry(cacheKey, promise);
    return promise;
  }

  /**
   * Reads resource history by resource type and ID.
   *
   * The return value is a bundle of all versions of the resource.
   *
   * @example
   * Example:
   *
   * ```typescript
   * const history = await medplum.readHistory('Patient', '123');
   * console.log(history);
   * ```
   *
   * See the FHIR "history" operation for full details: https://www.hl7.org/fhir/http.html#history
   * @category Read
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @param options - Optional fetch options.
   * @returns Promise to the resource history.
   */
  readHistory<K extends ResourceType>(
    resourceType: K,
    id: string,
    options?: MedplumRequestOptions
  ): ReadablePromise<Bundle<ExtractResource<K>>> {
    return this.get(this.fhirUrl(resourceType, id, '_history'), options);
  }

  /**
   * Reads a specific version of a resource by resource type, ID, and version ID.
   *
   * @example
   * Example:
   *
   * ```typescript
   * const version = await medplum.readVersion('Patient', '123', '456');
   * console.log(version);
   * ```
   *
   * See the FHIR "vread" operation for full details: https://www.hl7.org/fhir/http.html#vread
   * @category Read
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @param vid - The version ID.
   * @param options - Optional fetch options.
   * @returns The resource if available.
   */
  readVersion<K extends ResourceType>(
    resourceType: K,
    id: string,
    vid: string,
    options?: MedplumRequestOptions
  ): ReadablePromise<ExtractResource<K>> {
    return this.get(this.fhirUrl(resourceType, id, '_history', vid), options);
  }

  /**
   * Executes the Patient "everything" operation for a patient.
   *
   * @example
   * Example:
   *
   * ```typescript
   * const bundle = await medplum.readPatientEverything('123');
   * console.log(bundle);
   * ```
   *
   * See the FHIR "patient-everything" operation for full details: https://hl7.org/fhir/operation-patient-everything.html
   * @category Read
   * @param id - The Patient Id
   * @param options - Optional fetch options.
   * @returns A Bundle of all Resources related to the Patient
   */
  readPatientEverything(id: string, options?: MedplumRequestOptions): ReadablePromise<Bundle> {
    return this.get(this.fhirUrl('Patient', id, '$everything'), options);
  }

  /**
   * Creates a new FHIR resource.
   *
   * The return value is the newly created resource, including the ID and meta.
   *
   * @example
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
   * @category Create
   * @param resource - The FHIR resource to create.
   * @param options - Optional fetch options.
   * @returns The result of the create operation.
   */
  createResource<T extends Resource>(resource: T, options?: MedplumRequestOptions): Promise<T> {
    if (!resource.resourceType) {
      throw new Error('Missing resourceType');
    }
    this.invalidateSearches(resource.resourceType);
    return this.post(this.fhirUrl(resource.resourceType), resource, undefined, options);
  }

  /**
   * Conditionally create a new FHIR resource only if some equivalent resource does not already exist on the server.
   *
   * The return value is the existing resource or the newly created resource, including the ID and meta.
   *
   * @example
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
   * @category Create
   * @param resource - The FHIR resource to create.
   * @param query - The search query for an equivalent resource (should not include resource type or "?").
   * @param options - Optional fetch options.
   * @returns The result of the create operation.
   */
  async createResourceIfNoneExist<T extends Resource>(
    resource: T,
    query: string,
    options?: MedplumRequestOptions
  ): Promise<T> {
    return ((await this.searchOne(resource.resourceType, query, options)) ??
      this.createResource(resource, options)) as Promise<T>;
  }

  /**
   * Upsert a resource: update it in place if it exists, otherwise create it.  This is done in a single, transactional
   * request to guarantee data consistency.
   * @param resource - The resource to update or create.
   * @param query - A FHIR search query to uniquely identify the resource if it already exists.
   * @param options  - Optional fetch options.
   * @returns The updated/created resource.
   */
  async upsertResource<T extends Resource>(
    resource: T,
    query: QueryTypes,
    options?: MedplumRequestOptions
  ): Promise<T> {
    // Build conditional update URL, e.g. `PUT /ResourceType?search-param=value`
    const url = this.fhirSearchUrl(resource.resourceType, query);

    let result = await this.put(url, resource, undefined, options);
    if (!result) {
      // On 304 not modified, result will be undefined
      // Return the user input instead
      result = resource;
    }
    this.cacheResource(result);
    this.invalidateUrl(this.fhirUrl(resource.resourceType, resource.id as string, '_history'));
    this.invalidateSearches(resource.resourceType);
    return result;
  }

  /**
   * Creates a FHIR `Attachment` with the provided data content.
   *
   * This is a convenience method for creating a `Binary` resource and then creating an `Attachment` element.
   *
   * The `data` parameter can be a string or a `File` object.
   *
   * A `File` object often comes from a `<input type="file">` element.
   *
   * @example
   * Example:
   *
   * ```typescript
   * const result = await medplum.createAttachment(myFile, 'test.jpg', 'image/jpeg');
   * console.log(result);
   * ```
   *
   * See the FHIR "create" operation for full details: https://www.hl7.org/fhir/http.html#create
   * @category Create
   * @param createBinaryOptions -The binary options. See `CreateBinaryOptions` for full details.
   * @param requestOptions - Optional fetch options. **NOTE:** only `options.signal` is respected when `onProgress` is also provided.
   * @returns The result of the create operation.
   */
  createAttachment(
    createBinaryOptions: CreateBinaryOptions,
    requestOptions?: MedplumRequestOptions
  ): Promise<Attachment>;

  /**
   * @category Create
   * @param data - The binary data to upload.
   * @param filename - Optional filename for the binary.
   * @param contentType - Content type for the binary.
   * @param onProgress - Optional callback for progress events. **NOTE:** only `options.signal` is respected when `onProgress` is also provided.
   * @param options - Optional fetch options. **NOTE:** only `options.signal` is respected when `onProgress` is also provided.
   * @returns The result of the create operation.
   * @deprecated Use `createAttachment` with `CreateBinaryOptions` instead. To be removed in Medplum 4.0.
   */
  createAttachment(
    data: BinarySource,
    filename: string | undefined,
    contentType: string,
    onProgress?: (e: ProgressEvent) => void,
    options?: MedplumRequestOptions
  ): Promise<Attachment>;

  async createAttachment(
    arg1: BinarySource | CreateBinaryOptions,
    arg2: string | undefined | MedplumRequestOptions,
    arg3?: string,
    arg4?: (e: ProgressEvent) => void,
    arg5?: MedplumRequestOptions
  ): Promise<Attachment> {
    const createBinaryOptions = normalizeCreateBinaryOptions(arg1, arg2, arg3, arg4);
    const requestOptions = arg5 ?? (typeof arg2 === 'object' ? arg2 : {});
    const binary = await this.createBinary(createBinaryOptions, requestOptions);
    return {
      contentType: createBinaryOptions.contentType,
      url: binary.url,
      title: createBinaryOptions.filename,
    };
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
   * @example
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
   * @param createBinaryOptions -The binary options. See `CreateBinaryOptions` for full details.
   * @param requestOptions - Optional fetch options. **NOTE:** only `options.signal` is respected when `onProgress` is also provided.
   * @returns The result of the create operation.
   */
  createBinary(createBinaryOptions: CreateBinaryOptions, requestOptions?: MedplumRequestOptions): Promise<Binary>;

  /**
   * @category Create
   * @param data - The binary data to upload.
   * @param filename - Optional filename for the binary.
   * @param contentType - Content type for the binary.
   * @param onProgress - Optional callback for progress events. **NOTE:** only `options.signal` is respected when `onProgress` is also provided.
   * @param options - Optional fetch options. **NOTE:** only `options.signal` is respected when `onProgress` is also provided.
   * @returns The result of the create operation.
   * @deprecated Use `createBinary` with `CreateBinaryOptions` instead. To be removed in Medplum 4.0.
   */
  createBinary(
    data: BinarySource,
    filename: string | undefined,
    contentType: string,
    onProgress?: (e: ProgressEvent) => void,
    options?: MedplumRequestOptions
  ): Promise<Binary>;

  createBinary(
    arg1: BinarySource | CreateBinaryOptions,
    arg2: string | undefined | MedplumRequestOptions,
    arg3?: string,
    arg4?: (e: ProgressEvent) => void,
    arg5?: MedplumRequestOptions
  ): Promise<Binary> {
    const createBinaryOptions = normalizeCreateBinaryOptions(arg1, arg2, arg3, arg4);
    const requestOptions = arg5 ?? (typeof arg2 === 'object' ? arg2 : {});

    const { data, contentType, filename, securityContext, onProgress } = createBinaryOptions;

    const url = this.fhirUrl('Binary');
    if (filename) {
      url.searchParams.set('_filename', filename);
    }

    if (securityContext?.reference) {
      this.setRequestHeader(requestOptions, 'X-Security-Context', securityContext.reference);
    }

    if (onProgress) {
      return this.uploadwithProgress(url, data, contentType, onProgress, requestOptions);
    }
    return this.post(url, data, contentType, requestOptions);
  }

  uploadwithProgress(
    url: URL,
    data: BinarySource,
    contentType: string,
    onProgress: (e: ProgressEvent) => void,
    options?: MedplumRequestOptions
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Ensure the 'abort' event listener is removed from the signal to prevent memory leaks,
      // especially in scenarios where there is a long-lived signal across multiple requests.
      const handleSignalAbort = (): void => xhr.abort();
      options?.signal?.addEventListener('abort', handleSignalAbort);
      const sendResult = (result: any): void => {
        options?.signal?.removeEventListener('abort', handleSignalAbort);

        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      };

      xhr.responseType = 'json';
      xhr.onabort = () => sendResult(new Error('Request aborted'));
      xhr.onerror = () => sendResult(new Error('Request error'));

      if (onProgress) {
        xhr.upload.onprogress = (e) => onProgress(e);
        xhr.upload.onload = (e) => onProgress(e);
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          sendResult(xhr.response);
        } else {
          sendResult(new OperationOutcomeError(normalizeOperationOutcome(xhr.response || xhr.statusText)));
        }
      };

      xhr.open('POST', url);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Authorization', 'Bearer ' + this.accessToken);
      xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, max-age=0');
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('X-Medplum', 'extended');

      if (options?.headers) {
        const headers = options.headers as Record<string, string>;
        for (const [key, value] of Object.entries(headers)) {
          xhr.setRequestHeader(key, value);
        }
      }

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
   * @example
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
   * @category Media
   * @param createPdfOptions - The PDF creation options. See `CreatePdfOptions` for full details.
   * @param requestOptions - Optional fetch options.
   * @returns The result of the create operation.
   */
  createPdf(createPdfOptions: CreatePdfOptions, requestOptions?: MedplumRequestOptions): Promise<Binary>;

  /**
   * @category Media
   * @param docDefinition - The PDF document definition.
   * @param filename - Optional filename for the PDF binary resource.
   * @param tableLayouts - Optional pdfmake custom table layout.
   * @param fonts - Optional pdfmake custom font dictionary.
   * @returns The result of the create operation.
   * @deprecated Use `createPdf` with `CreatePdfOptions` instead. To be removed in Medplum 4.0.
   */
  createPdf(
    docDefinition: TDocumentDefinitions,
    filename: string | undefined,
    tableLayouts?: Record<string, CustomTableLayout>,
    fonts?: TFontDictionary
  ): Promise<Binary>;

  async createPdf(
    arg1: TDocumentDefinitions | CreatePdfOptions,
    arg2?: string | MedplumRequestOptions,
    arg3?: Record<string, CustomTableLayout>,
    arg4?: TFontDictionary
  ): Promise<Binary> {
    if (!this.createPdfImpl) {
      throw new Error('PDF creation not enabled');
    }
    const createPdfOptions = normalizeCreatePdfOptions(arg1, arg2, arg3, arg4);
    const requestOptions = typeof arg2 === 'object' ? arg2 : {};
    const { docDefinition, tableLayouts, fonts, ...rest } = createPdfOptions;
    const blob = await this.createPdfImpl(docDefinition, tableLayouts, fonts);
    const createBinaryOptions = { ...rest, data: blob, contentType: 'application/pdf' };
    return this.createBinary(createBinaryOptions, requestOptions);
  }

  /**
   * Creates a FHIR `Communication` resource with the provided data content.
   *
   * This is a convenience method to handle commmon cases where a `Communication` resource is created with a `payload`.
   * @category Create
   * @param resource - The FHIR resource to comment on.
   * @param text - The text of the comment.
   * @param options - Optional fetch options.
   * @returns The result of the create operation.
   */
  createComment(resource: Resource, text: string, options?: MedplumRequestOptions): Promise<Communication> {
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

    return this.createResource<Communication>(
      {
        resourceType: 'Communication',
        status: 'completed',
        basedOn: [createReference(resource)],
        encounter,
        subject,
        sender: profile ? createReference(profile) : undefined,
        sent: new Date().toISOString(),
        payload: [{ contentString: text }],
      },
      options
    );
  }

  /**
   * Updates a FHIR resource.
   *
   * The return value is the updated resource, including the ID and meta.
   *
   * @example
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
   * @category Write
   * @param resource - The FHIR resource to update.
   * @param options - Optional fetch options.
   * @returns The result of the update operation.
   */
  async updateResource<T extends Resource>(resource: T, options?: MedplumRequestOptions): Promise<T> {
    if (!resource.resourceType) {
      throw new Error('Missing resourceType');
    }
    if (!resource.id) {
      throw new Error('Missing id');
    }
    let result = await this.put(this.fhirUrl(resource.resourceType, resource.id), resource, undefined, options);
    if (!result) {
      // On 304 not modified, result will be undefined
      // Return the user input instead
      result = resource;
    }
    this.cacheResource(result);
    this.invalidateUrl(this.fhirUrl(resource.resourceType, resource.id, '_history'));
    this.invalidateSearches(resource.resourceType);
    return result;
  }

  /**
   * Updates a FHIR resource using JSONPatch operations.
   *
   * The return value is the updated resource, including the ID and meta.
   *
   * @example
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
   * @category Write
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @param operations - The JSONPatch operations.
   * @param options - Optional fetch options.
   * @returns The result of the patch operations.
   */
  async patchResource<K extends ResourceType>(
    resourceType: K,
    id: string,
    operations: PatchOperation[],
    options?: MedplumRequestOptions
  ): Promise<ExtractResource<K>> {
    const result = await this.patch(this.fhirUrl(resourceType, id), operations, options);
    this.cacheResource(result);
    this.invalidateUrl(this.fhirUrl(resourceType, id, '_history'));
    this.invalidateSearches(resourceType);
    return result;
  }

  /**
   * Deletes a FHIR resource by resource type and ID.
   *
   * @example
   * Example:
   *
   * ```typescript
   * await medplum.deleteResource('Patient', '123');
   * ```
   *
   * See the FHIR "delete" operation for full details: https://www.hl7.org/fhir/http.html#delete
   * @category Delete
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @param options - Optional fetch options.
   * @returns The result of the delete operation.
   */
  deleteResource(resourceType: ResourceType, id: string, options?: MedplumRequestOptions): Promise<any> {
    this.deleteCacheEntry(this.fhirUrl(resourceType, id).toString());
    this.invalidateSearches(resourceType);
    return this.delete(this.fhirUrl(resourceType, id), options);
  }

  /**
   * Executes the validate operation with the provided resource.
   *
   * @example
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
   * @param resource - The FHIR resource.
   * @param options - Optional fetch options.
   * @returns The validate operation outcome.
   */
  validateResource<T extends Resource>(resource: T, options?: MedplumRequestOptions): Promise<OperationOutcome> {
    return this.post(this.fhirUrl(resource.resourceType, '$validate'), resource, undefined, options);
  }

  /**
   * Executes a bot by ID or Identifier.
   * @param idOrIdentifier - The Bot ID or Identifier.
   * @param body - The content body. Strings and `File` objects are passed directly. Other objects are converted to JSON.
   * @param contentType - The content type to be included in the "Content-Type" header.
   * @param options - Optional fetch options.
   * @returns The Bot return value.
   */
  executeBot(
    idOrIdentifier: string | Identifier,
    body: any,
    contentType?: string,
    options?: MedplumRequestOptions
  ): Promise<any> {
    let url: URL;
    if (typeof idOrIdentifier === 'string') {
      const id = idOrIdentifier;
      url = this.fhirUrl('Bot', id, '$execute');
    } else {
      const identifier = idOrIdentifier;
      url = this.fhirUrl('Bot', '$execute');
      url.searchParams.set('identifier', identifier.system + '|' + identifier.value);
    }
    return this.post(url, body, contentType, options);
  }

  /**
   * Executes a batch or transaction of FHIR operations.
   *
   * @example
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
   * @param bundle - The FHIR batch/transaction bundle.
   * @param options - Optional fetch options.
   * @returns The FHIR batch/transaction response bundle.
   */
  executeBatch(bundle: Bundle, options?: MedplumRequestOptions): Promise<Bundle> {
    return this.post(this.fhirBaseUrl, bundle, undefined, options);
  }

  /**
   * Sends an email using the Medplum Email API.
   *
   * Builds the email using nodemailer MailComposer.
   *
   * Examples:
   *
   * @example
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
   * @example
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
   * @param email - The MailComposer options.
   * @param options - Optional fetch options.
   * @returns Promise to the operation outcome.
   */
  sendEmail(email: MailOptions, options?: MedplumRequestOptions): Promise<OperationOutcome> {
    return this.post('email/v1/send', email, ContentType.JSON, options);
  }

  /**
   * Executes a GraphQL query.
   *
   * @example
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
   * @example
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
   * @category Read
   * @param query - The GraphQL query.
   * @param operationName - Optional GraphQL operation name.
   * @param variables - Optional GraphQL variables.
   * @param options - Optional fetch options.
   * @returns The GraphQL result.
   */
  graphql(
    query: string,
    operationName?: string | null,
    variables?: any,
    options?: MedplumRequestOptions
  ): Promise<any> {
    return this.post(this.fhirUrl('$graphql'), { query, operationName, variables }, ContentType.JSON, options);
  }

  /**
   * Executes the $graph operation on this resource to fetch a Bundle of resources linked to the target resource
   * according to a graph definition
   * @category Read
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @param graphName - `name` parameter of the GraphDefinition
   * @param options - Optional fetch options.
   * @returns A Bundle
   */
  readResourceGraph<K extends ResourceType>(
    resourceType: K,
    id: string,
    graphName: string,
    options?: MedplumRequestOptions
  ): ReadablePromise<Bundle> {
    return this.get<Bundle>(`${this.fhirUrl(resourceType, id)}/$graph?graph=${graphName}`, options);
  }

  /**
   * Pushes a message to an agent.
   *
   * @param agent - The agent to push to.
   * @param destination - The destination device.
   * @param body - The message body.
   * @param contentType - Optional message content type.
   * @param waitForResponse - Optional wait for response flag.
   * @param options - Optional fetch options.
   * @returns Promise to the result. If waiting for response, the result is the response body. Otherwise, it is an operation outcome.
   */
  pushToAgent(
    agent: Agent | Reference<Agent>,
    destination: Device | Reference<Device> | string,
    body: any,
    contentType?: string,
    waitForResponse?: boolean,
    options?: MedplumRequestOptions
  ): Promise<any> {
    return this.post(
      this.fhirUrl('Agent', resolveId(agent) as string, '$push'),
      {
        destination: typeof destination === 'string' ? destination : getReferenceString(destination),
        body,
        contentType,
        waitForResponse,
      },
      ContentType.FHIR_JSON,
      options
    );
  }

  /**
   * @category Authentication
   * @returns The Login State
   */
  getActiveLogin(): LoginState | undefined {
    return this.storage.getObject('activeLogin');
  }

  /**
   * Sets the active login.
   * @param login - The new active login state.
   * @category Authentication
   */
  async setActiveLogin(login: LoginState): Promise<void> {
    if (!this.sessionDetails?.profile || getReferenceString(this.sessionDetails.profile) !== login.profile?.reference) {
      this.clearActiveLogin();
    }
    this.setAccessToken(login.accessToken, login.refreshToken);
    this.storage.setObject('activeLogin', login);
    this.addLogin(login);
    this.refreshPromise = undefined;
    await this.refreshProfile();
  }

  /**
   * Returns the current access token.
   * @returns The current access token.
   * @category Authentication
   */
  getAccessToken(): string | undefined {
    return this.accessToken;
  }

  /**
   * Sets the current access token.
   * @param accessToken - The new access token.
   * @param refreshToken - Optional refresh token.
   * @category Authentication
   */
  setAccessToken(accessToken: string, refreshToken?: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.sessionDetails = undefined;
    this.accessTokenExpires = tryGetJwtExpiration(accessToken);
    this.medplumServer = isMedplumAccessToken(accessToken);
  }

  /**
   * Returns the list of available logins.
   * @returns The list of available logins.
   * @category Authentication
   */
  getLogins(): LoginState[] {
    return this.storage.getObject<LoginState[]>('logins') ?? [];
  }

  private addLogin(newLogin: LoginState): void {
    const logins = this.getLogins().filter((login) => login.profile?.reference !== newLogin.profile?.reference);
    logins.push(newLogin);
    this.storage.setObject('logins', logins);
  }

  private async refreshProfile(): Promise<ProfileResource | undefined> {
    if (!this.medplumServer) {
      return Promise.resolve(undefined);
    }
    this.profilePromise = new Promise((resolve, reject) => {
      this.dispatchEvent({ type: 'profileRefreshing' });
      this.get('auth/me')
        .then((result: SessionDetails) => {
          this.profilePromise = undefined;
          const profileChanged = this.sessionDetails?.profile?.id !== result.profile.id;
          this.sessionDetails = result;
          if (profileChanged) {
            this.dispatchEvent({ type: 'change' });
          }
          this.dispatchEvent({ type: 'profileRefreshed' });
          resolve(result.profile);
        })
        .catch(reject);
    });

    return this.profilePromise;
  }

  /**
   * Returns true if the client is waiting for authentication.
   * @returns True if the client is waiting for authentication.
   * @category Authentication
   */
  isLoading(): boolean {
    return !this.isInitialized || !!this.profilePromise;
  }

  /**
   * Returns true if the current user is authenticated as a super admin.
   * @returns True if the current user is authenticated as a super admin.
   * @category Authentication
   */
  isSuperAdmin(): boolean {
    return !!this.sessionDetails?.project.superAdmin;
  }

  /**
   * Returns true if the current user is authenticated as a project admin.
   * @returns True if the current user is authenticated as a project admin.
   * @category Authentication
   */
  isProjectAdmin(): boolean {
    return !!this.sessionDetails?.membership.admin;
  }

  /**
   * Returns the current project if available.
   * @returns The current project if available.
   * @category User Profile
   */
  getProject(): Project | undefined {
    return this.sessionDetails?.project;
  }

  /**
   * Returns the current project membership if available.
   * @returns The current project membership if available.
   * @category User Profile
   */
  getProjectMembership(): ProjectMembership | undefined {
    return this.sessionDetails?.membership;
  }

  /**
   * Returns the current user profile resource if available.
   * This method does not wait for loading promises.
   * @returns The current user profile resource if available.
   * @category User Profile
   */
  getProfile(): ProfileResource | undefined {
    return this.sessionDetails?.profile;
  }

  /**
   * Returns the current user profile resource, retrieving form the server if necessary.
   * This method waits for loading promises.
   * @returns The current user profile resource.
   * @category User Profile
   */
  async getProfileAsync(): Promise<ProfileResource | undefined> {
    if (this.profilePromise) {
      return this.profilePromise;
    }
    if (this.sessionDetails) {
      return this.sessionDetails.profile;
    }
    return this.refreshProfile();
  }

  /**
   * Returns the current user configuration if available.
   * @returns The current user configuration if available.
   * @category User Profile
   */
  getUserConfiguration(): UserConfiguration | undefined {
    return this.sessionDetails?.config;
  }

  /**
   * Returns the current user access policy if available.
   * @returns The current user access policy if available.
   * @category User Profile
   */
  getAccessPolicy(): AccessPolicy | undefined {
    return this.sessionDetails?.accessPolicy;
  }

  /**
   * Downloads the URL as a blob. Can accept binary URLs in the form of `Binary/{id}` as well.
   * @category Read
   * @param url - The URL to request. Can be a standard URL or one in the form of `Binary/{id}`.
   * @param options - Optional fetch request init options.
   * @returns Promise to the response body as a blob.
   */
  async download(url: URL | string, options: MedplumRequestOptions = {}): Promise<Blob> {
    if (this.refreshPromise) {
      await this.refreshPromise;
    }
    const urlString = url.toString();
    if (urlString.startsWith(BINARY_URL_PREFIX)) {
      url = this.fhirUrl(urlString);
    }

    let headers = options.headers as Record<string, string> | undefined;
    if (!headers) {
      headers = {};
      options.headers = headers;
    }

    if (!headers['Accept']) {
      headers['Accept'] = '*/*';
    }

    this.addFetchOptionsDefaults(options);
    const response = await this.fetchWithRetry(url.toString(), options);
    return response.blob();
  }

  /**
   * Creates a FHIR Media resource with the provided data content.
   *
   * @category Create
   * @param createMediaOptions - The media creation options. See `CreateMediaOptions` for full details.
   * @param requestOptions - Optional fetch options.
   * @returns The new media resource.
   */
  async createMedia(createMediaOptions: CreateMediaOptions, requestOptions?: MedplumRequestOptions): Promise<Media> {
    const { additionalFields, ...createBinaryOptions } = createMediaOptions;

    // First, create the media:
    const media = await this.createResource({
      resourceType: 'Media',
      status: 'preparation',
      content: {
        contentType: createMediaOptions.contentType,
      },
      ...additionalFields,
    });

    // If the caller did not specify a security context, use the media reference:
    if (!createBinaryOptions.securityContext) {
      createBinaryOptions.securityContext = createReference(media);
    }

    // Next, upload the binary:
    const content = await this.createAttachment(createBinaryOptions, requestOptions);

    // Update the media with the binary content:
    return this.updateResource({
      ...media,
      status: 'completed',
      content,
    });
  }

  /**
   * Upload media to the server and create a Media instance for the uploaded content.
   * @param contents - The contents of the media file, as a string, Uint8Array, File, or Blob.
   * @param contentType - The media type of the content.
   * @param filename - Optional filename for the binary, or extended upload options (see `BinaryUploadOptions`).
   * @param additionalFields - Additional fields for Media.
   * @param options - Optional fetch options.
   * @returns Promise that resolves to the created Media
   * @deprecated Use `createMedia` with `CreateMediaOptions` instead. To be removed in Medplum 4.0.
   */
  async uploadMedia(
    contents: string | Uint8Array | File | Blob,
    contentType: string,
    filename: string | undefined,
    additionalFields?: Partial<Media>,
    options?: MedplumRequestOptions
  ): Promise<Media> {
    return this.createMedia(
      {
        data: contents,
        contentType,
        filename,
        additionalFields,
      },
      options
    );
  }

  /**
   * Performs Bulk Data Export operation request flow. See The FHIR "Bulk Data Export" for full details: https://build.fhir.org/ig/HL7/bulk-data/export.html#bulk-data-export
   * @param exportLevel - Optional export level. Defaults to system level export. 'Group/:id' - Group of Patients, 'Patient' - All Patients.
   * @param resourceTypes - A string of comma-delimited FHIR resource types.
   * @param since - Resources will be included in the response if their state has changed after the supplied time (e.g. if Resource.meta.lastUpdated is later than the supplied _since time).
   * @param options - Optional fetch options.
   * @returns Bulk Data Response containing links to Bulk Data files. See "Response - Complete Status" for full details: https://build.fhir.org/ig/HL7/bulk-data/export.html#response---complete-status
   */
  async bulkExport(
    //eslint-disable-next-line default-param-last
    exportLevel = '',
    resourceTypes?: string,
    since?: string,
    options?: MedplumRequestOptions
  ): Promise<Partial<BulkDataExport>> {
    const fhirPath = exportLevel ? `${exportLevel}/` : exportLevel;
    const url = this.fhirUrl(`${fhirPath}$export`);

    if (resourceTypes) {
      url.searchParams.set('_type', resourceTypes);
    }
    if (since) {
      url.searchParams.set('_since', since);
    }

    return this.startAsyncRequest<Partial<BulkDataExport>>(url.toString(), options);
  }

  /**
   * Starts an async request following the FHIR "Asynchronous Request Pattern".
   * See: https://hl7.org/fhir/r4/async.html
   * @param url - The URL to request.
   * @param options - Optional fetch options.
   * @returns The response body.
   */
  async startAsyncRequest<T>(url: string, options: MedplumRequestOptions = {}): Promise<T> {
    this.addFetchOptionsDefaults(options);

    const headers = options.headers as Record<string, string>;
    headers['Prefer'] = 'respond-async';

    return this.request('POST', url, options);
  }

  /**
   * Returns the key value client.
   * @returns The key value client.
   */
  get keyValue(): MedplumKeyValueClient {
    if (!this.keyValueClient) {
      this.keyValueClient = new MedplumKeyValueClient(this);
    }
    return this.keyValueClient;
  }

  //
  // Private helpers
  //

  /**
   * Returns the cache entry if available and not expired.
   * @param key - The cache key to retrieve.
   * @param options - Optional fetch options for cache settings.
   * @returns The cached entry if found.
   */
  private getCacheEntry(key: string, options: MedplumRequestOptions | undefined): RequestCacheEntry | undefined {
    if (!this.requestCache || options?.cache === 'no-cache' || options?.cache === 'reload') {
      return undefined;
    }
    const entry = this.requestCache.get(key);
    if (!entry || entry.requestTime + this.cacheTime < Date.now()) {
      return undefined;
    }
    return entry;
  }

  /**
   * Adds a readable promise to the cache.
   * @param key - The cache key to store.
   * @param value - The readable promise to store.
   */
  private setCacheEntry(key: string, value: ReadablePromise<any>): void {
    if (this.requestCache) {
      this.requestCache.set(key, { requestTime: Date.now(), value });
    }
  }

  /**
   * Adds a concrete value as the cache entry for the given resource.
   * This is used in cases where the resource is loaded indirectly.
   * For example, when a resource is loaded as part of a Bundle.
   * @param resource - The resource to cache.
   */
  private cacheResource(resource: Resource | undefined): void {
    if (resource?.id && !resource.meta?.tag?.some((t) => t.code === 'SUBSETTED')) {
      this.setCacheEntry(
        this.fhirUrl(resource.resourceType, resource.id).toString(),
        new ReadablePromise(Promise.resolve(resource))
      );
    }
  }

  /**
   * Deletes a cache entry.
   * @param key - The cache key to delete.
   */
  private deleteCacheEntry(key: string): void {
    if (this.requestCache) {
      this.requestCache.delete(key);
    }
  }

  /**
   * Makes an HTTP request.
   * @param method - The HTTP method (GET, POST, etc).
   * @param url - The target URL.
   * @param options - Optional fetch request init options.
   * @param state - Optional request state.
   * @returns The JSON content body if available.
   */
  private async request<T>(
    method: string,
    url: string,
    options: MedplumRequestOptions = {},
    state: RequestState = {}
  ): Promise<T> {
    await this.refreshIfExpired();

    options.method = method;
    this.addFetchOptionsDefaults(options);

    const response = await this.fetchWithRetry(url, options);

    if (response.status === 401) {
      // Refresh and try again
      return this.handleUnauthenticated(method, url, options);
    }

    if (response.status === 204 || response.status === 304) {
      // No content or change
      return undefined as unknown as T;
    }

    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('json');

    if (response.status === 404 && !isJson) {
      // Special case for non-JSON 404 responses
      // In the common case, the 404 response will include an OperationOutcome in JSON with additional details.
      // In the non-JSON case, we can't parse the response, so we'll just throw a generic "Not Found" error.
      throw new OperationOutcomeError(notFound);
    }

    const obj = await this.parseBody(response, isJson);

    if (
      (response.status === 200 && options.followRedirectOnOk) ||
      (response.status === 201 && options.followRedirectOnCreated)
    ) {
      const contentLocation = await tryGetContentLocation(response, obj);
      if (contentLocation) {
        return this.request('GET', contentLocation, { ...options, body: undefined });
      }
    }

    if (response.status === 202 && options.pollStatusOnAccepted) {
      const contentLocation = await tryGetContentLocation(response, obj);
      const statusUrl = contentLocation ?? state.statusUrl;
      if (statusUrl) {
        return this.pollStatus(statusUrl, options, state);
      }
    }

    if (response.status >= 400) {
      throw new OperationOutcomeError(normalizeOperationOutcome(obj));
    }

    return obj;
  }

  private async parseBody(response: Response, isJson: boolean | undefined): Promise<any> {
    let obj: any = undefined;
    if (isJson) {
      try {
        obj = await response.json();
      } catch (err) {
        console.error('Error parsing response', response.status, err);
        throw err;
      }
    } else {
      obj = await response.text();
    }
    return obj;
  }

  private async fetchWithRetry(url: string, options: MedplumRequestOptions): Promise<Response> {
    if (!url.startsWith('http')) {
      url = concatUrls(this.baseUrl, url);
    }

    // Previously default for maxRetries was 3, but we will interpret maxRetries literally and not count first attempt
    // Default of 2 matches old behavior with the new semantics
    const maxRetries = options?.maxRetries ?? 2;
    const retryDelay = 200;

    // We use <= since we want to retry maxRetries times and first retry is when attemptNum === 1
    for (let attemptNum = 0; attemptNum <= maxRetries; attemptNum++) {
      try {
        if (this.options.verbose) {
          this.logRequest(url, options);
        }
        const response = (await this.fetch(url, options)) as Response;
        if (this.options.verbose) {
          this.logResponse(response);
        }
        // Handle non-500 response and max retries exceeded
        // We return immediately for non-500 or 500 that has exceeded max retries
        if (response.status < 500 || attemptNum === maxRetries) {
          return response;
        }
      } catch (err) {
        // This is for the 1st retry to avoid multiple notifications
        if ((err as Error).message === 'Failed to fetch' && attemptNum === 0) {
          this.dispatchEvent({ type: 'offline' });
        }

        // If we got an abort error or exceeded retries, then throw immediately
        if ((err as Error).name === 'AbortError' || attemptNum === maxRetries) {
          throw err;
        }
      }

      await sleep(retryDelay);
    }

    throw new Error('Unreachable');
  }

  private logRequest(url: string, options: MedplumRequestOptions): void {
    console.log(`> ${options.method} ${url}`);
    if (options.headers) {
      const headers = options.headers as Record<string, string>;
      for (const key of sortStringArray(Object.keys(headers))) {
        console.log(`> ${key}: ${headers[key]}`);
      }
    }
  }

  private logResponse(response: Response): void {
    console.log(`< ${response.status} ${response.statusText}`);
    if (response.headers) {
      response.headers.forEach((value, key) => console.log(`< ${key}: ${value}`));
    }
  }

  private async pollStatus<T>(statusUrl: string, options: MedplumRequestOptions, state: RequestState): Promise<T> {
    const statusOptions: MedplumRequestOptions = { ...options, method: 'GET', body: undefined, redirect: 'follow' };
    if (state.pollCount === undefined) {
      // First request - try request immediately
      if (options.headers && typeof options.headers === 'object' && 'Prefer' in options.headers) {
        statusOptions.headers = { ...options.headers };
        delete statusOptions.headers.Prefer;
      }
      state.statusUrl = statusUrl;
      state.pollCount = 1;
    } else {
      // Subsequent requests - wait and retry
      const retryDelay = options.pollStatusPeriod ?? 1000;
      await sleep(retryDelay);
      state.pollCount++;
    }
    return this.request('GET', statusUrl, statusOptions, state);
  }

  /**
   * Executes a batch of requests that were automatically batched together.
   */
  private async executeAutoBatch(): Promise<void> {
    // Get the current queue
    const entries = [...(this.autoBatchQueue as AutoBatchEntry[])];

    // Clear the queue
    (this.autoBatchQueue as AutoBatchEntry[]).length = 0;

    // Clear the timer
    this.autoBatchTimerId = undefined;

    // If there is only one request in the batch, just execute it
    if (entries.length === 1) {
      const entry = entries[0];
      try {
        entry.resolve(await this.request(entry.method, concatUrls(this.fhirBaseUrl, entry.url), entry.options));
      } catch (err) {
        entry.reject(new OperationOutcomeError(normalizeOperationOutcome(err)));
      }
      return;
    }

    // Build the batch request
    const batch: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: entries.map(
        (e) =>
          ({
            request: {
              method: e.method,
              url: e.url,
            },
            resource: e.options.body ? (JSON.parse(e.options.body as string) as Resource) : undefined,
          }) as BundleEntry
      ),
    };

    // Execute the batch request
    const response = (await this.post(this.fhirBaseUrl, batch)) as Bundle;

    // Process the response
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const responseEntry = response.entry?.[i];
      if (responseEntry?.response?.outcome && !isOk(responseEntry.response.outcome)) {
        entry.reject(new OperationOutcomeError(responseEntry.response.outcome));
      } else {
        entry.resolve(responseEntry?.resource);
      }
    }
  }

  /**
   * Adds default options to the fetch options.
   * @param options - The options to add defaults to.
   */
  private addFetchOptionsDefaults(options: MedplumRequestOptions): void {
    this.setRequestHeader(options, 'X-Medplum', 'extended');
    this.setRequestHeader(options, 'Accept', DEFAULT_ACCEPT, true);

    if (options.body) {
      this.setRequestHeader(options, 'Content-Type', ContentType.FHIR_JSON, true);
    }

    if (this.accessToken) {
      this.setRequestHeader(options, 'Authorization', 'Bearer ' + this.accessToken);
    } else if (this.basicAuth) {
      this.setRequestHeader(options, 'Authorization', 'Basic ' + this.basicAuth);
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
   * @param options - The fetch options.
   * @param contentType - The new content type to set.
   */
  private setRequestContentType(options: MedplumRequestOptions, contentType: string): void {
    this.setRequestHeader(options, 'Content-Type', contentType);
  }

  /**
   * Sets a header on fetch options.
   * @param options - The fetch options.
   * @param key - The header key.
   * @param value - The header value.
   * @param ifNoneExist - Optional flag to only set the header if it doesn't already exist.
   */
  private setRequestHeader(options: MedplumRequestOptions, key: string, value: string, ifNoneExist = false): void {
    if (!options.headers) {
      options.headers = {};
    }
    const headers = options.headers as Record<string, string>;
    if (ifNoneExist && headers[key]) {
      return;
    }
    headers[key] = value;
  }

  /**
   * Sets the body on fetch options.
   * @param options - The fetch options.
   * @param data - The new content body.
   */
  private setRequestBody(options: MedplumRequestOptions, data: any): void {
    if (
      typeof data === 'string' ||
      (typeof Blob !== 'undefined' && (data instanceof Blob || data.constructor.name === 'Blob')) ||
      (typeof File !== 'undefined' && (data instanceof File || data.constructor.name === 'File')) ||
      (typeof Uint8Array !== 'undefined' && (data instanceof Uint8Array || data.constructor.name === 'Uint8Array'))
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
   * @param method - The HTTP method of the original request.
   * @param url - The URL of the original request.
   * @param options - Optional fetch request init options.
   * @returns The result of the retry.
   */
  private handleUnauthenticated(method: string, url: string, options: MedplumRequestOptions): Promise<any> {
    if (this.refresh()) {
      return this.request(method, url, options);
    }
    this.clear();
    if (this.onUnauthenticated) {
      this.onUnauthenticated();
    }
    return Promise.reject(new Error('Unauthenticated'));
  }

  /**
   * Starts a new PKCE flow.
   * These PKCE values are stateful, and must survive redirects and page refreshes.
   * @category Authentication
   * @returns The PKCE code challenge details.
   */
  async startPkce(): Promise<{ codeChallengeMethod: CodeChallengeMethod; codeChallenge: string }> {
    const pkceState = getRandomString();
    sessionStorage.setItem('pkceState', pkceState);

    const codeVerifier = getRandomString();
    sessionStorage.setItem('codeVerifier', codeVerifier);

    const arrayHash = await encryptSHA256(codeVerifier);
    const codeChallenge = arrayBufferToBase64(arrayHash).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    sessionStorage.setItem('codeChallenge', codeChallenge);

    return { codeChallengeMethod: 'S256', codeChallenge };
  }

  /**
   * Redirects the user to the login screen for authorization.
   * Clears all auth state including local storage and session storage.
   * @param loginParams - The authorization login parameters.
   * @see https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
   */
  private async requestAuthorization(loginParams?: Partial<BaseLoginRequest>): Promise<void> {
    const loginRequest = await this.ensureCodeChallenge(loginParams ?? {});
    const url = new URL(this.authorizeUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', sessionStorage.getItem('pkceState') as string);
    url.searchParams.set('client_id', loginRequest.clientId ?? (this.clientId as string));
    url.searchParams.set('redirect_uri', loginRequest.redirectUri ?? getWindowOrigin());
    url.searchParams.set('code_challenge_method', loginRequest.codeChallengeMethod as string);
    url.searchParams.set('code_challenge', loginRequest.codeChallenge as string);
    url.searchParams.set('scope', loginRequest.scope ?? 'openid profile');
    window.location.assign(url.toString());
  }

  /**
   * Processes an OAuth authorization code.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenRequest
   * @param code - The authorization code received by URL parameter.
   * @param loginParams - Optional login parameters.
   * @returns The user profile resource.
   * @category Authentication
   */
  processCode(code: string, loginParams?: Partial<BaseLoginRequest>): Promise<ProfileResource> {
    const formBody = new URLSearchParams();
    formBody.set('grant_type', OAuthGrantType.AuthorizationCode);
    formBody.set('code', code);
    formBody.set('client_id', loginParams?.clientId ?? (this.clientId as string));
    formBody.set('redirect_uri', loginParams?.redirectUri ?? getWindowOrigin());

    if (typeof sessionStorage !== 'undefined') {
      const codeVerifier = sessionStorage.getItem('codeVerifier');
      if (codeVerifier) {
        formBody.set('code_verifier', codeVerifier);
      }
    }

    return this.fetchTokens(formBody);
  }

  /**
   * Refreshes the access token using the refresh token if available.
   * @returns Promise to refresh the access token.
   */
  refreshIfExpired(): Promise<void> {
    // If (1) not already refreshing, (2) we have an access token, and (3) the access token is expired,
    // then start a refresh.
    if (!this.refreshPromise && this.accessTokenExpires !== undefined && this.accessTokenExpires < Date.now()) {
      // The result of the `refresh()` function is cached in `this.refreshPromise`,
      // so we can safely ignore the return value here.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.refresh();
    }
    return this.refreshPromise ?? Promise.resolve();
  }

  /**
   * Tries to refresh the auth tokens.
   * @returns The refresh promise if available; otherwise undefined.
   * @see https://openid.net/specs/openid-connect-core-1_0.html#RefreshTokens
   */
  private refresh(): Promise<void> | undefined {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (this.refreshToken) {
      const formBody = new URLSearchParams();
      formBody.set('grant_type', OAuthGrantType.RefreshToken);
      formBody.set('client_id', this.clientId as string);
      formBody.set('refresh_token', this.refreshToken);
      this.refreshPromise = this.fetchTokens(formBody);
      return this.refreshPromise;
    }

    if (this.clientId && this.clientSecret) {
      this.refreshPromise = this.startClientLogin(this.clientId, this.clientSecret);
      return this.refreshPromise;
    }

    return undefined;
  }

  /**
   * Starts a new OAuth2 client credentials flow.
   *
   * @example
   * ```typescript
   * await medplum.startClientLogin(import.meta.env.MEDPLUM_CLIENT_ID, import.meta.env.MEDPLUM_CLIENT_SECRET)
   * // Example Search
   * await medplum.searchResources('Patient')
   * ```
   *
   * See: https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
   *
   * @category Authentication
   * @param clientId - The client ID.
   * @param clientSecret - The client secret.
   * @returns Promise that resolves to the client profile.
   */
  async startClientLogin(clientId: string, clientSecret: string): Promise<ProfileResource> {
    this.clientId = clientId;
    this.clientSecret = clientSecret;

    const formBody = new URLSearchParams();
    formBody.set('grant_type', OAuthGrantType.ClientCredentials);
    formBody.set('client_id', clientId);
    formBody.set('client_secret', clientSecret);
    return this.fetchTokens(formBody);
  }

  /**
   * Starts a new OAuth2 JWT bearer flow.
   *
   * @example
   * ```typescript
   * await medplum.startJwtBearerLogin(import.meta.env.MEDPLUM_CLIENT_ID, import.meta.env.MEDPLUM_JWT_BEARER_ASSERTION, 'openid profile');
   * // Example Search
   * await medplum.searchResources('Patient')
   * ```
   *
   * See: https://datatracker.ietf.org/doc/html/rfc7523#section-2.1
   *
   * @category Authentication
   * @param clientId - The client ID.
   * @param assertion - The JWT assertion.
   * @param scope - The OAuth scope.
   * @returns Promise that resolves to the client profile.
   */
  async startJwtBearerLogin(clientId: string, assertion: string, scope: string): Promise<ProfileResource> {
    this.clientId = clientId;

    const formBody = new URLSearchParams();
    formBody.set('grant_type', OAuthGrantType.JwtBearer);
    formBody.set('client_id', clientId);
    formBody.set('assertion', assertion);
    formBody.set('scope', scope);
    return this.fetchTokens(formBody);
  }

  /**
   * Starts a new OAuth2 JWT assertion flow.
   *
   * See: https://datatracker.ietf.org/doc/html/rfc7523#section-2.2
   *
   * @category Authentication
   * @param jwt - The JWT assertion.
   * @returns Promise that resolves to the client profile.
   */
  async startJwtAssertionLogin(jwt: string): Promise<ProfileResource> {
    const formBody = new URLSearchParams();
    formBody.append('grant_type', OAuthGrantType.ClientCredentials);
    formBody.append('client_assertion_type', OAuthClientAssertionType.JwtBearer);
    formBody.append('client_assertion', jwt);
    return this.fetchTokens(formBody);
  }

  /**
   * Sets the client ID and secret for basic auth.
   *
   * @example
   * ```typescript
   * medplum.setBasicAuth(import.meta.env.MEDPLUM_CLIENT_ID, import.meta.env.MEDPLUM_CLIENT_SECRET);
   * // Example Search
   * await medplum.searchResources('Patient');
   * ```
   *
   * @category Authentication
   * @param clientId - The client ID.
   * @param clientSecret - The client secret.
   */
  setBasicAuth(clientId: string, clientSecret: string): void {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.basicAuth = encodeBase64(clientId + ':' + clientSecret);
  }

  /**
   * Subscribes to a specified topic, listening for a list of specified events.
   *
   * Once you have the `SubscriptionRequest` returned from this method, you can call `fhircastConnect(subscriptionRequest)` to connect to the subscription stream.
   *
   * @category FHIRcast
   * @param topic - The topic to publish to. Usually a UUID.
   * @param events - An array of event names to listen for.
   * @returns A `Promise` that resolves once the request completes, or rejects if it fails.
   */
  async fhircastSubscribe(topic: string, events: FhircastEventName[]): Promise<SubscriptionRequest> {
    if (!(typeof topic === 'string' && topic !== '')) {
      throw new OperationOutcomeError(validationError('Invalid topic provided. Topic must be a valid string.'));
    }
    if (!(typeof events === 'object' && Array.isArray(events) && events.length > 0)) {
      throw new OperationOutcomeError(
        validationError(
          'Invalid events provided. Events must be an array of event names containing at least one event.'
        )
      );
    }

    const subRequest = {
      channelType: 'websocket',
      mode: 'subscribe',
      topic,
      events,
    } as PendingSubscriptionRequest;

    const body = (await this.post(
      '/fhircast/STU3',
      serializeFhircastSubscriptionRequest(subRequest),
      ContentType.FORM_URL_ENCODED
    )) as { 'hub.channel.endpoint': string };

    const endpoint = body['hub.channel.endpoint'];
    if (!endpoint) {
      throw new Error('Invalid response!');
    }

    // Add endpoint to subscription request before returning
    (subRequest as SubscriptionRequest).endpoint = endpoint;
    return subRequest as SubscriptionRequest;
  }

  /**
   * Unsubscribes from the specified topic.
   *
   * @category FHIRcast
   * @param subRequest - A `SubscriptionRequest` representing a subscription to cancel. Mode will be set to `unsubscribe` automatically.
   * @returns A `Promise` that resolves when request to unsubscribe is completed.
   */
  async fhircastUnsubscribe(subRequest: SubscriptionRequest): Promise<void> {
    if (!validateFhircastSubscriptionRequest(subRequest)) {
      throw new OperationOutcomeError(
        validationError('Invalid topic or subscriptionRequest. SubscriptionRequest must be an object.')
      );
    }
    if (!(subRequest.endpoint && typeof subRequest.endpoint === 'string' && subRequest.endpoint.startsWith('ws'))) {
      throw new OperationOutcomeError(
        validationError('Provided subscription request must have an endpoint in order to unsubscribe.')
      );
    }

    // Turn subRequest -> unsubRequest
    subRequest.mode = 'unsubscribe';
    // Send unsub request
    await this.post('/fhircast/STU3', serializeFhircastSubscriptionRequest(subRequest), ContentType.FORM_URL_ENCODED);
  }

  /**
   * Connects to a `FHIRcast` session.
   *
   * @category FHIRcast
   * @param subRequest - The `SubscriptionRequest` to use for connecting.
   * @returns A `FhircastConnection` which emits lifecycle events for the `FHIRcast` WebSocket connection.
   */
  fhircastConnect(subRequest: SubscriptionRequest): FhircastConnection {
    return new FhircastConnection(subRequest);
  }

  /**
   * Publishes a new context to a given topic for a specified event type.
   *
   * @category FHIRcast
   * @param topic - The topic to publish to. Usually a UUID.
   * @param event - The name of the event to publish an updated context for, ie. `Patient-open`.
   * @param context - The updated context containing resources relevant to this event.
   * @param versionId - The `versionId` of the `anchor context` of the given event. Used for `DiagnosticReport-update` event.
   * @returns A `Promise` that resolves once the request completes, or rejects if it fails.
   */
  async fhircastPublish<EventName extends FhircastEventVersionOptional>(
    topic: string,
    event: EventName,
    context: FhircastEventContext<EventName> | FhircastEventContext<EventName>[],
    versionId?: never
  ): Promise<Record<string, any>>;

  async fhircastPublish<RequiredVersionEvent extends FhircastEventVersionRequired>(
    topic: string,
    event: RequiredVersionEvent,
    context: FhircastEventContext<RequiredVersionEvent> | FhircastEventContext<RequiredVersionEvent>[],
    versionId: string
  ): Promise<Record<string, any>>;

  async fhircastPublish<EventName extends FhircastEventVersionRequired | FhircastEventVersionOptional>(
    topic: string,
    event: EventName,
    context: FhircastEventContext<EventName> | FhircastEventContext<EventName>[],
    versionId?: string | undefined
  ): Promise<Record<string, any>> {
    if (isContextVersionRequired(event)) {
      return this.post(
        `/fhircast/STU3/${topic}`,
        createFhircastMessagePayload<typeof event>(topic, event, context, versionId as string),
        ContentType.JSON
      );
    }
    assertContextVersionOptional(event);
    return this.post(
      `/fhircast/STU3/${topic}`,
      createFhircastMessagePayload<typeof event>(topic, event, context),
      ContentType.JSON
    );
  }

  /**
   * Gets the current context of the given FHIRcast `topic`.
   *
   * @category FHIRcast
   * @param topic - The topic to get the current context for. Usually a UUID.
   * @returns A Promise which resolves to the `CurrentContext` for the given topic.
   */
  async fhircastGetContext(topic: string): Promise<CurrentContext> {
    return this.get(`/fhircast/STU3/${topic}`);
  }

  /**
   * Invite a user to a project.
   * @param projectId - The project ID.
   * @param body - The InviteRequest.
   * @returns Promise that returns a project membership or an operation outcome.
   */
  async invite(projectId: string, body: InviteRequest): Promise<ProjectMembership | OperationOutcome> {
    return this.post('admin/projects/' + projectId + '/invite', body);
  }

  /**
   * Makes a POST request to the tokens endpoint.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
   * @param formBody - Token parameters in URL encoded format.
   * @returns The user profile resource.
   */
  private async fetchTokens(formBody: URLSearchParams): Promise<ProfileResource> {
    const options: MedplumRequestOptions = {
      method: 'POST',
      headers: { 'Content-Type': ContentType.FORM_URL_ENCODED },
      body: formBody.toString(),
      credentials: 'include',
    };
    const headers = options.headers as Record<string, string>;

    if (this.basicAuth) {
      headers['Authorization'] = `Basic ${this.basicAuth}`;
    }

    let response: Response;
    try {
      response = await this.fetchWithRetry(this.tokenUrl, options);
    } catch (err) {
      this.refreshPromise = undefined;
      throw err;
    }

    if (!response.ok) {
      this.clearActiveLogin();
      try {
        const error = await response.json();
        throw new OperationOutcomeError(badRequest(error.error_description));
      } catch (err) {
        throw new OperationOutcomeError(badRequest('Failed to fetch tokens'), err);
      }
    }
    const tokens = await response.json();
    await this.verifyTokens(tokens);
    return this.getProfile() as ProfileResource;
  }

  /**
   * Verifies the tokens received from the auth server.
   * Validates the JWT against the JWKS.
   * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
   * @param tokens - The token response.
   * @returns Promise to complete.
   */
  private async verifyTokens(tokens: TokenResponse): Promise<void> {
    const token = tokens.access_token;

    if (isJwt(token)) {
      // Verify token has not expired
      const tokenPayload = parseJWTPayload(token);

      if (Date.now() >= (tokenPayload.exp as number) * 1000) {
        this.clearActiveLogin();
        throw new Error('Token expired');
      }

      // Verify app_client_id
      if (tokenPayload.cid) {
        if (tokenPayload.cid !== this.clientId) {
          this.clearActiveLogin();
          throw new Error('Token was not issued for this audience');
        }
      } else if (this.clientId && tokenPayload.client_id !== this.clientId) {
        this.clearActiveLogin();
        throw new Error('Token was not issued for this audience');
      }
    }

    return this.setActiveLogin({
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
  private setupStorageListener(): void {
    try {
      window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === null || e.key === 'activeLogin') {
          // Storage events fire when different tabs make changes.
          // On storage clear (key === null) or activeLogin change (key === 'activeLogin')
          // Refresh the page to ensure the active login is up to date.
          window.location.reload();
        }
      });
    } catch (_err) {
      // Silently ignore if this environment does not support storage events
    }
  }

  /**
   * Gets the `SubscriptionManager` for WebSocket subscriptions.
   *
   * @category Subscriptions
   * @returns the `SubscriptionManager` for this client.
   */
  getSubscriptionManager(): SubscriptionManager {
    if (!this.subscriptionManager) {
      this.subscriptionManager = new SubscriptionManager(this, getWebSocketUrl(this.baseUrl, '/ws/subscriptions-r4'));
    }
    return this.subscriptionManager;
  }

  /**
   * Subscribes to a given criteria, listening to notifications over WebSockets.
   *
   * This uses Medplum's `WebSocket Subscriptions` under the hood.
   *
   * A `SubscriptionEmitter` is returned from this function, which can be used to listen for updates to resources described by the given criteria.
   *
   * When subscribing to the same criteria multiple times, the same `SubscriptionEmitter` will be returned, and a reference count will be incremented.
   *
   * -----
   * @example
   * ```ts
   * const emitter = medplum.subscribeToCriteria('Communication');
   *
   * emitter.addEventListener('message', (bundle: Bundle) => {
   *   // Called when a `Communication` resource is created or modified
   *   console.log(bundle?.entry?.[1]?.resource); // Logs the `Communication` resource that was updated
   * });
   * ```
   *
   * @category Subscriptions
   * @param criteria - The criteria to subscribe to.
   * @param subscriptionProps - Optional properties to add to the created `Subscription` resource.
   * @returns a `SubscriptionEmitter` that emits `Bundle` resources containing changes to resources based on the given criteria.
   */
  subscribeToCriteria(criteria: string, subscriptionProps?: Partial<Subscription>): SubscriptionEmitter {
    return this.getSubscriptionManager().addCriteria(criteria, subscriptionProps);
  }

  /**
   * Unsubscribes from the given criteria.
   *
   * When called the same amount of times as proceeding calls to `subscribeToCriteria` on a given `criteria`,
   * the criteria is fully removed from the `SubscriptionManager`.
   *
   * @category Subscriptions
   * @param criteria - The criteria to unsubscribe from.
   * @param subscriptionProps - The optional properties that `subscribeToCriteria` was called with.
   */
  unsubscribeFromCriteria(criteria: string, subscriptionProps?: Partial<Subscription>): void {
    if (!this.subscriptionManager) {
      return;
    }
    this.subscriptionManager.removeCriteria(criteria, subscriptionProps);
    if (this.subscriptionManager.getCriteriaCount() === 0) {
      this.subscriptionManager.closeWebSocket();
    }
  }

  /**
   * Get the master `SubscriptionEmitter` for the `SubscriptionManager`.
   *
   * The master `SubscriptionEmitter` gets messages for all subscribed `criteria` as well as WebSocket errors, `connect` and `disconnect` events, and the `close` event.
   *
   * It can also be used to listen for `heartbeat` messages.
   *
   *------
   * @example
   * ### Listening for `heartbeat`:
   * ```ts
   * const masterEmitter = medplum.getMasterSubscriptionEmitter();
   *
   * masterEmitter.addEventListener('heartbeat', (bundle: Bundle<SubscriptionStatus>) => {
   *   console.log(bundle?.entry?.[0]?.resource); // A `SubscriptionStatus` of type `heartbeat`
   * });
   *
   * ```
   * @category Subscriptions
   * @returns the master `SubscriptionEmitter` from the `SubscriptionManager`.
   */
  getMasterSubscriptionEmitter(): SubscriptionEmitter {
    return this.getSubscriptionManager().getMasterEmitter();
  }
}

/**
 * Returns the default fetch method.
 * The default fetch is currently only available in browser environments.
 * If you want to use SSR such as Next.js, you should pass a custom fetch function.
 * @returns The default fetch function for the current environment.
 */
function getDefaultFetch(): FetchLike {
  if (!globalThis.fetch) {
    throw new Error('Fetch not available in this environment');
  }
  return globalThis.fetch.bind(globalThis);
}

/**
 * Returns the base URL for the current page.
 * @returns The window origin string.
 * @category HTTP
 */
function getWindowOrigin(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.location.protocol + '//' + window.location.host + '/';
}

/**
 * Attempts to retrieve the content location from the given HTTP response.
 *
 * This function prioritizes the "Content-Location" HTTP header as the
 * most authoritative source for the content location. If this header is
 * not present, it falls back to the "Location" HTTP header.
 *
 * Note that the FHIR spec does not follow the traditional HTTP semantics of "Content-Location" and "Location".
 * "Content-Location" is not typically used with HTTP 202 responses because the content itself isn't available at the time of the response.
 * However, the FHIR spec explicitly recommends it:
 *
 *   3.2.6.1.2 Kick-off Request
 *   3.2.6.1.2.0.3 Response - Success
 *   HTTP Status Code of 202 Accepted
 *   Content-Location header with the absolute URL of an endpoint for subsequent status requests (polling location)
 *
 * Source: https://hl7.org/fhir/async-bulk.html
 *
 * In cases where neither of these headers are available (for instance,
 * due to CORS restrictions), it attempts to retrieve the content location
 * from the 'diagnostics' field of the first issue in an OperationOutcome object
 * present in the response body. If all attempts fail, the function returns 'undefined'.
 *
 * @async
 * @param response - The HTTP response object from which to extract the content location.
 * @param body - The response body.
 * @returns A Promise that resolves to the content location string if it is found, or 'undefined' if the content location cannot be determined from the response.
 */
async function tryGetContentLocation(response: Response, body: any): Promise<string | undefined> {
  // Accepted content location can come from multiple sources
  // The authoritative source is the "Content-Location" HTTP header.
  const contentLocation = response.headers.get('content-location');
  if (contentLocation) {
    return contentLocation;
  }

  // The next best source is the "Location" HTTP header.
  const location = response.headers.get('location');
  if (location) {
    return location;
  }

  // However, "Content-Location" may not be available due to CORS limitations.
  // In this case, we use the OperationOutcome.diagnostics field.
  if (isOperationOutcome(body) && body.issue?.[0]?.diagnostics) {
    return body.issue[0].diagnostics;
  }

  // If all else fails, return undefined.
  return undefined;
}

/**
 * Converts a FHIR resource bundle to a resource array.
 * The bundle is attached to the array as a property named "bundle".
 * @param bundle - A FHIR resource bundle.
 * @returns The resource array with the bundle attached.
 */
function bundleToResourceArray<T extends Resource>(bundle: Bundle<T>): ResourceArray<T> {
  const array = bundle.entry?.map((e) => e.resource as T) ?? [];
  return Object.assign(array, { bundle });
}

function isCreateBinaryOptions(input: unknown): input is CreateBinaryOptions {
  return isObject(input) && 'data' in input && 'contentType' in input;
}

// This function can be deleted after Medplum 4.0 and we remove the legacy createBinary method
export function normalizeCreateBinaryOptions(
  arg1: BinarySource | CreateBinaryOptions,
  arg2: string | undefined | MedplumRequestOptions,
  arg3?: string,
  arg4?: (e: ProgressEvent) => void
): CreateBinaryOptions {
  if (isCreateBinaryOptions(arg1)) {
    return arg1;
  }
  return {
    data: arg1,
    filename: arg2 as string | undefined,
    contentType: arg3 as string,
    onProgress: arg4,
  };
}

function isCreatePdfOptions(input: unknown): input is CreatePdfOptions {
  return isObject(input) && 'docDefinition' in input;
}

// This function can be deleted after Medplum 4.0 and we remove the legacy createPdf method
export function normalizeCreatePdfOptions(
  arg1: TDocumentDefinitions | CreatePdfOptions,
  arg2: string | undefined | MedplumRequestOptions,
  arg3: Record<string, CustomTableLayout> | undefined,
  arg4: TFontDictionary | undefined
): CreatePdfOptions {
  if (isCreatePdfOptions(arg1)) {
    return arg1;
  }
  return {
    docDefinition: arg1,
    filename: arg2 as string,
    tableLayouts: arg3,
    fonts: arg4,
  };
}
