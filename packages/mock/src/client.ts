// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BinarySource,
  ContentType,
  CreateBinaryOptions,
  LoginState,
  MedplumClient,
  MedplumClientOptions,
  MedplumRequestOptions,
  OperationOutcomeError,
  ProfileResource,
  SubscriptionEmitter,
  WithId,
  allOk,
  badRequest,
  generateId,
  getReferenceString,
  getStatus,
  indexSearchParameter,
  loadDataType,
  normalizeCreateBinaryOptions,
} from '@medplum/core';
import { FhirRequest, FhirRouter, HttpMethod, MemoryRepository } from '@medplum/fhir-router';
import {
  Agent,
  Binary,
  Bot,
  Device,
  Reference,
  Resource,
  SearchParameter,
  StructureDefinition,
  Subscription,
  UserConfiguration,
} from '@medplum/fhirtypes';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
/** @ts-ignore */
import type { CustomTableLayout, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import {
  BartSimpson,
  DifferentOrganization,
  DrAliceSmith,
  DrAliceSmithPreviousVersion,
  DrAliceSmithSchedule,
  ExampleBot,
  ExampleClient,
  ExampleQuestionnaire,
  ExampleQuestionnaireResponse,
  ExampleSubscription,
  ExampleThreadHeader,
  ExampleThreadMessages,
  HomerCommunication,
  HomerDiagnosticReport,
  HomerEncounter,
  HomerMedia,
  HomerObservation1,
  HomerObservation2,
  HomerObservation3,
  HomerObservation4,
  HomerObservation5,
  HomerObservation6,
  HomerObservation7,
  HomerObservation8,
  HomerServiceRequest,
  HomerSimpson,
  HomerSimpsonPreviousVersion,
  HomerSimpsonSpecimen,
  TestOrganization,
  exampleValueSet,
  makeDrAliceSmithSlots,
} from './mocks';
import { ExampleAccessPolicy, ExampleStatusValueSet, ExampleUserConfiguration } from './mocks/accesspolicy';
import { TestProject, TestProjectMembership } from './mocks/project';
import SearchParameterList from './mocks/searchparameters.json';
import { ExampleSmartClientApplication } from './mocks/smart';
import StructureDefinitionList from './mocks/structuredefinitions.json';
import {
  ExampleWorkflowPlanDefinition,
  ExampleWorkflowQuestionnaire1,
  ExampleWorkflowQuestionnaire2,
  ExampleWorkflowQuestionnaire3,
  ExampleWorkflowQuestionnaireResponse1,
  ExampleWorkflowRequestGroup,
  ExampleWorkflowTask1,
  ExampleWorkflowTask2,
  ExampleWorkflowTask3,
} from './mocks/workflow';
import { MockSubscriptionManager } from './subscription-manager';

export interface MockClientOptions
  extends Pick<MedplumClientOptions, 'baseUrl' | 'clientId' | 'storage' | 'cacheTime' | 'fetch'> {
  readonly debug?: boolean;
  /**
   * Override currently logged in user. Specifying null results in
   * MedplumContext.profile returning undefined as if no one were logged in.
   */
  readonly profile?: ReturnType<MedplumClient['getProfile']> | null;
  /**
   * Override the `MockFetchClient` used by this `MockClient`.
   */
  readonly mockFetchOverride?: MockFetchOverrideOptions;
}

/**
 * Override must contain all of `router`, `repo`, and `client`.
 */
export type MockFetchOverrideOptions = {
  client: MockFetchClient;
  router: FhirRouter;
  repo: MemoryRepository;
};

export class MockClient extends MedplumClient {
  readonly router: FhirRouter;
  readonly repo: MemoryRepository;
  readonly client: MockFetchClient;
  readonly debug: boolean;
  activeLoginOverride?: LoginState;
  private agentAvailable = true;
  private profile: ReturnType<MedplumClient['getProfile']>;
  subManager: MockSubscriptionManager | undefined;

  constructor(clientOptions?: MockClientOptions) {
    const baseUrl = clientOptions?.baseUrl ?? 'https://example.com/';

    let router: FhirRouter;
    let repo: MemoryRepository;
    let client: MockFetchClient;

    if (clientOptions?.mockFetchOverride) {
      if (
        !(
          clientOptions.mockFetchOverride?.router &&
          clientOptions.mockFetchOverride?.repo &&
          clientOptions.mockFetchOverride?.client
        )
      ) {
        throw new Error('mockFetchOverride must specify all fields: client, repo, router');
      }
      router = clientOptions.mockFetchOverride.router;
      repo = clientOptions.mockFetchOverride.repo;
      client = clientOptions.mockFetchOverride.client;
    } else {
      router = new FhirRouter();
      repo = new MemoryRepository();
      client = new MockFetchClient(router, repo, baseUrl, clientOptions?.debug);
    }

    super({
      baseUrl,
      clientId: clientOptions?.clientId,
      storage: clientOptions?.storage,
      cacheTime: clientOptions?.cacheTime,
      createPdf: (
        docDefinition: TDocumentDefinitions,
        tableLayouts?: { [name: string]: CustomTableLayout },
        fonts?: TFontDictionary
      ) => client.mockCreatePdf(docDefinition, tableLayouts, fonts),
      fetch: clientOptions?.fetch
        ? clientOptions.fetch
        : (url: string, options: any) => {
            return client.mockFetch(url, options);
          },
    });

    this.router = router;
    this.repo = repo;
    this.client = client;
    // if null is specified, treat it as if no one is logged in
    this.profile = clientOptions?.profile === null ? undefined : (clientOptions?.profile ?? DrAliceSmith);
    this.debug = !!clientOptions?.debug;
  }

  clear(): void {
    super.clear();
    this.activeLoginOverride = undefined;
  }

  getProfile(): ProfileResource | undefined {
    return this.profile;
  }

  getUserConfiguration(): WithId<UserConfiguration> | undefined {
    return {
      resourceType: 'UserConfiguration',
      id: 'mock-user-config',
      menu: [
        {
          title: 'Favorites',
          link: [
            { name: 'Patients', target: '/Patient' },
            { name: 'Active Orders', target: '/ServiceRequest?status=active' },
            { name: 'Completed Orders', target: '/ServiceRequest?status=completed' },
          ],
        },
        {
          title: 'Admin',
          link: [
            { name: 'Project', target: '/admin/project' },
            { name: 'Batch', target: '/batch' },
          ],
        },
      ],
    };
  }

  setActiveLoginOverride(activeLoginOverride: LoginState): void {
    this.activeLoginOverride = activeLoginOverride;
  }

  setProfile(profile: ProfileResource | undefined): void {
    this.profile = profile;
    this.dispatchEvent({ type: 'change' });
  }

  getActiveLogin(): LoginState | undefined {
    if (this.activeLoginOverride !== undefined) {
      return this.activeLoginOverride;
    }
    return super.getActiveLogin();
  }

  getLogins(): LoginState[] {
    if (this.activeLoginOverride !== undefined) {
      return [this.activeLoginOverride];
    }
    return super.getLogins();
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
  createBinary(
    createBinaryOptions: CreateBinaryOptions,
    requestOptions?: MedplumRequestOptions
  ): Promise<WithId<Binary>>;

  /**
   * @category Create
   * @param data - The binary data to upload.
   * @param filename - Optional filename for the binary.
   * @param contentType - Content type for the binary.
   * @param onProgress - Optional callback for progress events. **NOTE:** only `options.signal` is respected when `onProgress` is also provided.
   * @param options - Optional fetch options. **NOTE:** only `options.signal` is respected when `onProgress` is also provided.
   * @returns The result of the create operation.
   * @deprecated Use `createBinary` with `CreateBinaryOptions` instead. To be removed in a future version.
   */
  createBinary(
    data: BinarySource,
    filename: string | undefined,
    contentType: string,
    onProgress?: (e: ProgressEvent) => void,
    options?: MedplumRequestOptions
  ): Promise<WithId<Binary>>;

  async createBinary(
    arg1: BinarySource | CreateBinaryOptions,
    arg2: string | undefined | MedplumRequestOptions,
    arg3?: string,
    arg4?: (e: ProgressEvent) => void
  ): Promise<WithId<Binary>> {
    const createBinaryOptions = normalizeCreateBinaryOptions(arg1, arg2, arg3, arg4);
    const { filename, contentType, onProgress, securityContext } = createBinaryOptions;

    if (filename?.endsWith('.exe')) {
      throw new OperationOutcomeError(badRequest('Invalid file type'));
    }

    if (onProgress) {
      onProgress({ loaded: 0, lengthComputable: false } as ProgressEvent);
      onProgress({ loaded: 0, total: 100, lengthComputable: true } as ProgressEvent);
      onProgress({ loaded: 100, total: 100, lengthComputable: true } as ProgressEvent);
    }

    let data: string | undefined;
    if (typeof createBinaryOptions.data === 'string') {
      data = base64Encode(createBinaryOptions.data);
    }

    const binary = await this.repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType,
      data,
      securityContext,
    });

    return {
      ...binary,
      url: `https://example.com/binary/${binary.id}`,
    };
  }

  async pushToAgent(
    agent: Agent | Reference<Agent>,
    destination: Device | Reference<Device> | string,
    body: any,
    contentType?: string,
    _waitForResponse?: boolean,
    _options?: MedplumRequestOptions
  ): Promise<any> {
    if (contentType === ContentType.PING) {
      if (!this.agentAvailable) {
        throw new OperationOutcomeError(badRequest('Timeout'));
      }
      if (typeof destination !== 'string' || (destination !== '8.8.8.8' && destination !== 'localhost')) {
        // Exception for test case
        if (destination !== 'abc123') {
          console.warn(
            'IPs other than 8.8.8.8 and hostnames other than `localhost` will always throw an error in MockClient'
          );
        }
        throw new OperationOutcomeError(badRequest('Destination device not found'));
      }
      const ip = destination === 'localhost' ? '127.0.0.1' : destination;
      return `PING ${destination} (${ip}): 56 data bytes
64 bytes from ${ip}: icmp_seq=0 ttl=115 time=10.977 ms
64 bytes from ${ip}: icmp_seq=1 ttl=115 time=13.037 ms
64 bytes from ${ip}: icmp_seq=2 ttl=115 time=23.159 ms
64 bytes from ${ip}: icmp_seq=3 ttl=115 time=12.725 ms

--- ${destination} ping statistics ---
4 packets transmitted, 4 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 10.977/14.975/23.159/4.790 ms
`;
    }
    return undefined;
  }

  setAgentAvailable(value: boolean): void {
    this.agentAvailable = value;
  }

  getSubscriptionManager(): MockSubscriptionManager {
    if (!this.subManager) {
      this.subManager = new MockSubscriptionManager(this, 'wss://example.com/ws/subscriptions-r4', {
        mockReconnectingWebSocket: true,
      });
    }
    return this.subManager;
  }

  setSubscriptionManager(subManager: MockSubscriptionManager): void {
    if (this.subManager) {
      this.subManager.closeWebSocket();
    }
    this.subManager = subManager;
  }

  subscribeToCriteria(criteria: string, subscriptionProps?: Partial<Subscription>): SubscriptionEmitter {
    return this.getSubscriptionManager().addCriteria(criteria, subscriptionProps);
  }

  unsubscribeFromCriteria(criteria: string, subscriptionProps?: Partial<Subscription>): void {
    this.getSubscriptionManager().removeCriteria(criteria, subscriptionProps);
  }

  getMasterSubscriptionEmitter(): SubscriptionEmitter {
    return this.getSubscriptionManager().getMasterEmitter();
  }
}

export class MockFetchClient {
  readonly router: FhirRouter;
  readonly repo: MemoryRepository;
  readonly baseUrl: string;
  readonly debug: boolean;
  initialized = false;
  initPromise?: Promise<void>;

  constructor(router: FhirRouter, repo: MemoryRepository, baseUrl: string, debug = false) {
    this.router = router;
    this.repo = repo;
    this.baseUrl = baseUrl;
    this.debug = debug;
  }

  async mockFetch(url: string, options: any): Promise<Partial<Response>> {
    if (!this.initialized) {
      if (!this.initPromise) {
        this.initPromise = this.initMockRepo();
      }
      await this.initPromise;
      this.initialized = true;
    }

    const method = options.method ?? 'GET';
    const path = url.replace(this.baseUrl, '');

    if (this.debug) {
      console.log('MockClient', method, path);
    }

    const response = await this.mockHandler(method, path, options);

    if (this.debug && !response) {
      console.log('MockClient: not found', method, path);
    }

    if (this.debug) {
      console.log('MockClient', JSON.stringify(response, null, 2));
    }

    return Promise.resolve({
      ok: true,
      status: response?.resourceType === 'OperationOutcome' ? getStatus(response) : 200,
      headers: new Headers({
        'content-type': ContentType.FHIR_JSON,
      }),
      blob: () => Promise.resolve(response),
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(response),
    });
  }

  mockCreatePdf(
    docDefinition: TDocumentDefinitions,
    tableLayouts?: { [name: string]: CustomTableLayout },
    fonts?: TFontDictionary
  ): Promise<any> {
    if (this.debug) {
      console.log(`Mock Client: createPdf(`);
      console.log(`  ${JSON.stringify(docDefinition, null, 2)},`);
      console.log(`  ${JSON.stringify(tableLayouts, null, 2)},`);
      console.log(`  ${JSON.stringify(fonts, null, 2)});`);
    }
    return Promise.resolve({});
  }

  private async mockHandler(method: HttpMethod, path: string, options: any): Promise<any> {
    if (path.startsWith('admin/')) {
      return this.mockAdminHandler(method, path, options);
    } else if (path.startsWith('auth/')) {
      return this.mockAuthHandler(method, path, options);
    } else if (path.startsWith('oauth2/')) {
      return this.mockOAuthHandler(method, path, options);
    } else if (path.startsWith('fhir/R4')) {
      return this.mockFhirHandler(method, path, options);
    } else {
      return null;
    }
  }

  private async mockAdminHandler(method: string, path: string, options: RequestInit): Promise<any> {
    if (path === 'admin/projects/setpassword' && method.toUpperCase() === 'POST') {
      return { ok: true };
    }

    // Create new bot
    const botCreateMatch = /^admin\/projects\/([\w(-)?]+)\/bot$/.exec(path);
    if (botCreateMatch && method.toUpperCase() === 'POST') {
      const body = options.body;
      let jsonBody: Record<string, any> | undefined;
      if (body) {
        jsonBody = JSON.parse(body as string);
      }

      const binary = await this.repo.createResource<Binary>({
        id: generateId(),
        resourceType: 'Binary',
        contentType: ContentType.TYPESCRIPT,
      });

      const projectId = botCreateMatch[1];
      return this.repo.createResource<Bot>({
        meta: {
          project: projectId,
        },
        id: generateId(),
        resourceType: 'Bot',
        name: jsonBody?.name,
        description: jsonBody?.description,
        runtimeVersion: jsonBody?.runtimeVersion ?? 'awslambda',
        sourceCode: {
          contentType: ContentType.TYPESCRIPT,
          title: 'index.ts',
          url: getReferenceString(binary),
        },
      });
    }

    const projectMatch = /^admin\/projects\/([\w(-)?]+)$/.exec(path);
    if (projectMatch) {
      return {
        project: await this.repo.readResource('Project', projectMatch[1]),
      };
    }

    const membershipMatch = /^admin\/projects\/([\w(-)?]+)\/members\/([\w(-)?]+)$/.exec(path);
    if (membershipMatch) {
      return this.repo.readResource('ProjectMembership', membershipMatch[2]);
    }

    return { ok: true };
  }

  private mockAuthHandler(method: HttpMethod, path: string, options: any): any {
    if (path.startsWith('auth/method')) {
      return {};
    }

    if (path.startsWith('auth/changepassword')) {
      return this.mockChangePasswordHandler(method, path, options);
    }

    if (path.startsWith('auth/login')) {
      return this.mockLoginHandler(method, path, options);
    }

    if (path.startsWith('auth/setpassword')) {
      return this.mockSetPasswordHandler(method, path, options);
    }

    if (path.startsWith('auth/newuser')) {
      return this.mockNewUserHandler(method, path, options);
    }

    if (path.startsWith('auth/newproject') || path.startsWith('auth/newpatient') || path.startsWith('auth/scope')) {
      return {
        login: '123',
        code: 'xyz',
      };
    }

    if (path.startsWith('auth/resetpassword')) {
      return this.mockResetPasswordHandler(method, path, options);
    }

    if (path.startsWith('auth/me')) {
      return {
        profile: DrAliceSmith,
        security: {
          mfaEnrolled: false,
          sessions: [
            {
              id: '123',
              lastUpdated: new Date().toISOString(),
              authMethod: 'password',
              remoteAddress: '5.5.5.5',
              browser: 'Chrome',
              os: 'Linux',
            },
            {
              id: '456',
              lastUpdated: new Date().toISOString(),
              authMethod: 'password',
              remoteAddress: '6.6.6.6',
              browser: 'Chrome',
              os: 'Android',
            },
          ],
        },
      };
    }

    if (path.startsWith('auth/mfa/status')) {
      return {
        enrolled: false,
        enrollUri: 'otpauth://totp/medplum.com:alice.smith%40example',
      };
    }

    if (path.startsWith('auth/mfa/enroll')) {
      return allOk;
    }

    if (path.startsWith('auth/mfa/verify')) {
      return {
        login: '123',
        code: 'xyz',
      };
    }

    if (path.startsWith('auth/mfa/disable')) {
      if (options.body && JSON.parse(options.body)?.token !== 'INVALID_TOKEN') {
        return allOk;
      }
      return badRequest('Invalid token');
    }

    return null;
  }

  private mockChangePasswordHandler(_method: string, _path: string, options: any): any {
    const { body } = options;
    const { oldPassword } = JSON.parse(body);
    if (oldPassword === 'orange') {
      return allOk;
    } else {
      return {
        resourceType: 'OperationOutcome',
        issue: [
          {
            expression: ['oldPassword'],
            details: {
              text: 'Incorrect password',
            },
          },
        ],
      };
    }
  }

  private mockLoginHandler(_method: string, _path: string, options: any): any {
    const { body } = options;
    const { password } = JSON.parse(body);
    if (password === 'password') {
      return {
        login: '123',
        code: 'xyz',
      };
    } else {
      return {
        resourceType: 'OperationOutcome',
        issue: [
          {
            expression: ['password'],
            details: {
              text: 'Invalid password',
            },
          },
        ],
      };
    }
  }

  private mockSetPasswordHandler(_method: string, _path: string, options: any): any {
    const { body } = options;
    const { password } = JSON.parse(body);
    if (password === 'orange') {
      return allOk;
    } else {
      return {
        resourceType: 'OperationOutcome',
        issue: [
          {
            expression: ['password'],
            details: {
              text: 'Invalid password',
            },
          },
        ],
      };
    }
  }

  private mockNewUserHandler(_method: string, _path: string, options: any): any {
    const { body } = options;
    const { email, password } = JSON.parse(body);
    if (email === 'george@example.com' && password === 'password') {
      return allOk;
    } else {
      return {
        resourceType: 'OperationOutcome',
        issue: [
          {
            details: {
              text: 'Invalid',
            },
          },
        ],
      };
    }
  }

  private mockResetPasswordHandler(_method: string, _path: string, options: any): any {
    const { body } = options;
    const { email } = JSON.parse(body);
    if (email === 'admin@example.com') {
      return allOk;
    } else {
      return {
        resourceType: 'OperationOutcome',
        issue: [
          {
            expression: ['email'],
            details: {
              text: 'Email not found',
            },
          },
        ],
      };
    }
  }

  private mockOAuthHandler(_method: string, path: string, options: any): any {
    if (path.startsWith('oauth2/token')) {
      const formBody = new URLSearchParams(options.body);
      const clientId = formBody.get('client_id') ?? 'my-client-id';
      return {
        access_token: createFakeJwt({
          sub: '1234567890',
          iat: Math.ceil(Date.now() / 1000),
          exp: Math.ceil(Date.now() / 1000) + 60 * 60, // adding one hour in seconds
          client_id: clientId,
          login_id: '123',
        }),
        refresh_token: createFakeJwt({ client_id: 123 }),
        profile: { reference: 'Practitioner/123' },
      };
    }

    return null;
  }

  private async initMockRepo(): Promise<void> {
    const defaultResources = [
      HomerSimpsonPreviousVersion,
      HomerSimpson,
      ExampleAccessPolicy,
      ExampleStatusValueSet,
      ExampleUserConfiguration,
      ExampleBot,
      ExampleClient,
      HomerDiagnosticReport,
      HomerEncounter,
      HomerCommunication,
      HomerMedia,
      HomerObservation1,
      HomerObservation2,
      HomerObservation3,
      HomerObservation4,
      HomerObservation5,
      HomerObservation6,
      HomerObservation7,
      HomerObservation8,
      HomerSimpsonSpecimen,
      TestOrganization,
      DifferentOrganization,
      ExampleQuestionnaire,
      ExampleQuestionnaireResponse,
      HomerServiceRequest,
      ExampleSubscription,
      BartSimpson,
      DrAliceSmithPreviousVersion,
      DrAliceSmith,
      DrAliceSmithSchedule,
      ExampleWorkflowQuestionnaire1,
      ExampleWorkflowQuestionnaire2,
      ExampleWorkflowQuestionnaire3,
      ExampleWorkflowPlanDefinition,
      ExampleWorkflowQuestionnaireResponse1,
      ExampleWorkflowTask1,
      ExampleWorkflowTask2,
      ExampleWorkflowTask3,
      ExampleWorkflowRequestGroup,
      ExampleSmartClientApplication,
      TestProject,
      TestProjectMembership,
      ExampleThreadHeader,
      ...ExampleThreadMessages,
    ] satisfies Resource[];

    for (const resource of defaultResources) {
      await this.repo.createResource(resource);
    }

    for (const structureDefinition of StructureDefinitionList as StructureDefinition[]) {
      structureDefinition.kind = 'resource';
      structureDefinition.url = 'http://hl7.org/fhir/StructureDefinition/' + structureDefinition.name;
      loadDataType(structureDefinition);
      await this.repo.createResource(structureDefinition);
    }

    for (const searchParameter of SearchParameterList) {
      indexSearchParameter(searchParameter as SearchParameter);
      await this.repo.createResource(searchParameter as SearchParameter);
    }

    makeDrAliceSmithSlots().forEach((slot) => this.repo.createResource(slot));
  }

  private async mockFhirHandler(method: HttpMethod, url: string, options: any): Promise<Resource> {
    if (url.startsWith('fhir/R4/ValueSet/$expand')) {
      return exampleValueSet;
    }

    if (url.includes('fhir/R4')) {
      url = url.substring(url.indexOf('fhir/R4') + 7);
    }

    let body = undefined;
    if (options.body) {
      try {
        body = JSON.parse(options.body);
      } catch (_err) {
        body = options.body;
      }
    }

    const request: FhirRequest = {
      method,
      url,
      pathname: '',
      body,
      params: Object.create(null),
      query: Object.create(null),
      headers: toIncomingHttpHeaders(options.headers),
    };

    const result = await this.router.handleRequest(request, this.repo);
    if (result.length === 1) {
      return result[0];
    } else {
      return result[1];
    }
  }
}

/**
 * Creates a fake JWT token with the provided claims for testing.
 *
 * **NOTE: This function does not create a real signed JWT. Attempting to read the header or signature will fail.**
 *
 * @param claims - The claims to encode in the body of the fake JWT.
 * @returns A stringified fake JWT token.
 */
export function createFakeJwt(claims: Record<string, string | number>): string {
  return 'header.' + base64Encode(JSON.stringify(claims)) + '.signature';
}

function base64Encode(str: string): string {
  return typeof window !== 'undefined' ? window.btoa(str) : Buffer.from(str).toString('base64');
}

// even though it's just a type, avoid importing IncomingHttpHeaders from node:http
// since MockClient needs to work in the browser. Use a reasonable approximation instead
interface PseudoIncomingHttpHeaders {
  [key: string]: string | undefined;
}
function toIncomingHttpHeaders(headers: HeadersInit | undefined): PseudoIncomingHttpHeaders {
  const result: PseudoIncomingHttpHeaders = {};

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (typeof value === 'string') {
        result[lowerKey] = value;
      } else {
        console.warn(`Ignoring non-string value ${value} for header ${lowerKey}`);
      }
    }
  }

  return result;
}
