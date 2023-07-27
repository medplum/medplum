import {
  allOk,
  badRequest,
  getStatus,
  indexStructureDefinition,
  LoginState,
  MedplumClient,
  MedplumClientOptions,
  ProfileResource,
} from '@medplum/core';
import { FhirRequest, FhirRouter, HttpMethod, MemoryRepository } from '@medplum/fhir-router';
import { Binary, Resource, SearchParameter, StructureDefinition, UserConfiguration } from '@medplum/fhirtypes';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
/** @ts-ignore */
import type { CustomTableLayout, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import {
  BartSimpson,
  DifferentOrganization,
  DrAliceSmith,
  DrAliceSmithPreviousVersion,
  DrAliceSmithSchedule,
  DrAliceSmithSlots,
  ExampleBot,
  ExampleClient,
  ExampleQuestionnaire,
  ExampleQuestionnaireResponse,
  ExampleSubscription,
  exampleValueSet,
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
} from './mocks';
import { ExampleAccessPolicy, ExampleStatusValueSet, ExampleUserConfiguration } from './mocks/accesspolicy';
import { TestProject, TestProjectMembersihp } from './mocks/project';
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

export interface MockClientOptions extends MedplumClientOptions {
  readonly debug?: boolean;
}

export class MockClient extends MedplumClient {
  readonly router: FhirRouter;
  readonly repo: MemoryRepository;
  readonly client: MockFetchClient;
  readonly debug: boolean;
  activeLoginOverride?: LoginState;

  constructor(clientOptions?: MockClientOptions) {
    const router = new FhirRouter();
    const repo = new MemoryRepository();
    const client = new MockFetchClient(router, repo, clientOptions?.debug);

    super({
      baseUrl: clientOptions?.baseUrl ?? 'https://example.com/',
      clientId: clientOptions?.clientId,
      storage: clientOptions?.storage,
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
    this.debug = !!clientOptions?.debug;
  }

  clear(): void {
    super.clear();
    this.activeLoginOverride = undefined;
  }

  getProfile(): ProfileResource {
    return DrAliceSmith;
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
    data: string | File | Blob | Uint8Array,
    filename: string | undefined,
    contentType: string,
    onProgress?: (e: ProgressEvent) => void
  ): Promise<Binary> {
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
}

class MockFetchClient {
  readonly router: FhirRouter;
  readonly repo: MemoryRepository;
  initialized = false;
  initPromise?: Promise<void>;

  constructor(router: FhirRouter, repo: MemoryRepository, readonly debug = false) {
    this.router = router;
    this.repo = new MemoryRepository();
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
    const path = url.replace('https://example.com/', '');

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
        get: () => 'application/fhir+json',
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
      return this.mockAdminHandler(method, path);
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

  private async mockAdminHandler(_method: string, path: string): Promise<any> {
    const projectMatch = /^admin\/projects\/([\w-]+)$/.exec(path);
    if (projectMatch) {
      return {
        project: await this.repo.readResource('Project', projectMatch[1]),
      };
    }

    const membershipMatch = /^admin\/projects\/([\w-]+)\/members\/([\w-]+)$/.exec(path);
    if (membershipMatch) {
      return this.repo.readResource('ProjectMembership', membershipMatch[2]);
    }

    return {
      ok: true,
    };
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
      const clientId = (options.body as URLSearchParams).get('client_id') ?? 'my-client-id';
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
      TestProjectMembersihp,
    ];

    for (const resource of defaultResources) {
      await this.repo.createResource(resource);
    }

    for (const structureDefinition of StructureDefinitionList as StructureDefinition[]) {
      indexStructureDefinition(structureDefinition);
      await this.repo.createResource(structureDefinition);
    }

    for (const searchParameter of SearchParameterList) {
      await this.repo.createResource(searchParameter as SearchParameter);
    }

    DrAliceSmithSlots.forEach((slot) => this.repo.createResource(slot));
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
      } catch (err) {
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
