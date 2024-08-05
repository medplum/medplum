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
  extends Pick<MedplumClientOptions, 'baseUrl' | 'clientId' | 'storage' | 'cacheTime'> {
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
        fonts?: TFontDictionary | undefined
      ) => client.mockCreatePdf(docDefinition, tableLayouts, fonts),
      fetch: (url: string, options: any) => {
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

  getUserConfiguration(): UserConfiguration | undefined {
    return {
      resourceType: 'UserConfiguration',
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

  async createBinary(
    arg1: BinarySource | CreateBinaryOptions,
    arg2: string | undefined | MedplumRequestOptions,
    arg3?: string,
    arg4?: (e: ProgressEvent) => void
  ): Promise<Binary> {
    const createBinaryOptions = normalizeCreateBinaryOptions(arg1, arg2, arg3, arg4);
    const { filename, contentType, onProgress } = createBinaryOptions;

    if (filename?.endsWith('.exe')) {
      return Promise.reject(badRequest('Invalid file type'));
    }

    if (onProgress) {
      onProgress({ loaded: 0, lengthComputable: false } as ProgressEvent);
      onProgress({ loaded: 0, total: 100, lengthComputable: true } as ProgressEvent);
      onProgress({ loaded: 100, total: 100, lengthComputable: true } as ProgressEvent);
    }

    return {
      resourceType: 'Binary',
      contentType,
      url: 'https://example.com/binary/123',
    };
  }

  async pushToAgent(
    agent: Agent | Reference<Agent>,
    destination: Device | Reference<Device> | string,
    body: any,
    contentType?: string | undefined,
    _waitForResponse?: boolean | undefined,
    _options?: MedplumRequestOptions | undefined
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
        mockRobustWebSocket: true,
      });
    }
    return this.subManager;
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
  initialized = false;
  initPromise?: Promise<void>;

  constructor(
    readonly router: FhirRouter,
    readonly repo: MemoryRepository,
    readonly baseUrl: string,
    readonly debug = false
  ) {}

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
      headers: {
        get(name: string): string | undefined {
          return {
            'content-type': ContentType.FHIR_JSON,
          }[name];
        },
      } as unknown as Headers,
      blob: () => Promise.resolve(response),
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(response),
    });
  }

  mockCreatePdf(
    docDefinition: TDocumentDefinitions,
    tableLayouts?: { [name: string]: CustomTableLayout },
    fonts?: TFontDictionary | undefined
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
        access_token: 'header.' + base64Encode(JSON.stringify({ client_id: clientId })) + '.signature',
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

    const parsedUrl = new URL(url, 'https://example.com');

    let pathname = parsedUrl.pathname;
    if (pathname.includes('fhir/R4')) {
      pathname = pathname.substring(pathname.indexOf('fhir/R4') + 7);
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
      pathname,
      body,
      params: Object.create(null),
      query: Object.fromEntries(parsedUrl.searchParams),
    };

    const result = await this.router.handleRequest(request, this.repo);
    if (result.length === 1) {
      return result[0];
    } else {
      return result[1];
    }
  }
}

function base64Encode(str: string): string {
  return typeof window !== 'undefined' ? window.btoa(str) : Buffer.from(str).toString('base64');
}
