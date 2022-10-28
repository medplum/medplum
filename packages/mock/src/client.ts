import {
  allOk,
  badRequest,
  getStatus,
  isOk,
  LoginState,
  MedplumClient,
  notFound,
  parseSearchDefinition,
  ProfileResource,
} from '@medplum/core';
import { Binary, Bundle, BundleEntry, OperationOutcome, Resource, UserConfiguration } from '@medplum/fhirtypes';
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
  GraphQLSchemaResponse,
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

import { MemoryRepository } from './repo';

export interface MockClientOptions {
  readonly debug?: boolean;
}

export class MockClient extends MedplumClient {
  readonly debug: boolean;
  activeLoginOverride?: LoginState;

  constructor(clientOptions?: MockClientOptions) {
    const mockFetchClient = new MockFetchClient(clientOptions?.debug);

    super({
      baseUrl: 'https://example.com/',
      clientId: 'my-client-id',
      createPdf: (
        docDefinition: TDocumentDefinitions,
        tableLayouts?: { [name: string]: CustomTableLayout },
        fonts?: TFontDictionary | undefined
      ) => mockFetchClient.mockCreatePdf(docDefinition, tableLayouts, fonts),
      fetch: (url: string, options: any) => {
        return mockFetchClient.mockFetch(url, options);
      },
    });
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
          link: [{ name: 'Patients', target: '/Patient' }],
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
  readonly mockRepo: MemoryRepository;

  constructor(readonly debug = false) {
    this.mockRepo = new MemoryRepository();
    this.initMockRepo();
  }

  async mockFetch(url: string, options: any): Promise<any> {
    const method = options.method || 'GET';
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

    if (response?.resourceType === 'OperationOutcome' && !isOk(response)) {
      return Promise.reject(response);
    }

    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(response),
      json: () => Promise.resolve(response),
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

  private async mockHandler(method: string, path: string, options: any): Promise<any> {
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

  private mockAdminHandler(_method: string, path: string): any {
    if (path.startsWith('admin/projects/123')) {
      return {
        project: { id: '123', name: 'Project 123' },
        members: [
          { id: '123', profile: { reference: 'Practitioner/123', display: 'Alice Smith' }, role: 'owner' },
          { id: '888', profile: { reference: 'ClientApplication/123', display: 'Test Client' }, role: 'client' },
          { id: '999', profile: { reference: 'Bot/123', display: 'Test Bot' }, role: 'bot' },
        ],
      };
    }

    return {
      ok: true,
    };
  }

  private mockAuthHandler(method: string, path: string, options: any): any {
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
        profile: { reference: 'Practitioner/123' },
      };
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

  private mockOAuthHandler(_method: string, path: string, _options: any): any {
    if (path.startsWith('oauth2/token')) {
      return {
        access_token: 'header.' + window.btoa(JSON.stringify({ client_id: 'my-client-id' })) + '.signature',
      };
    }

    return null;
  }

  private initMockRepo(): void {
    this.mockRepo.createResource(HomerSimpsonPreviousVersion);
    this.mockRepo.createResource(HomerSimpson);
    this.mockRepo.createResource(ExampleAccessPolicy);
    this.mockRepo.createResource(ExampleStatusValueSet);
    this.mockRepo.createResource(ExampleUserConfiguration);
    this.mockRepo.createResource(ExampleBot);
    this.mockRepo.createResource(ExampleClient);
    this.mockRepo.createResource(HomerDiagnosticReport);
    this.mockRepo.createResource(HomerEncounter);
    this.mockRepo.createResource(HomerCommunication);
    this.mockRepo.createResource(HomerMedia);
    this.mockRepo.createResource(HomerObservation1);
    this.mockRepo.createResource(HomerObservation2);
    this.mockRepo.createResource(HomerObservation3);
    this.mockRepo.createResource(HomerObservation4);
    this.mockRepo.createResource(HomerObservation5);
    this.mockRepo.createResource(HomerObservation6);
    this.mockRepo.createResource(HomerObservation7);
    this.mockRepo.createResource(HomerObservation8);
    this.mockRepo.createResource(HomerSimpsonSpecimen);
    this.mockRepo.createResource(TestOrganization);
    this.mockRepo.createResource(DifferentOrganization);
    this.mockRepo.createResource(ExampleQuestionnaire);
    this.mockRepo.createResource(ExampleQuestionnaireResponse);
    this.mockRepo.createResource(HomerServiceRequest);
    this.mockRepo.createResource(ExampleSubscription);
    this.mockRepo.createResource(BartSimpson);
    this.mockRepo.createResource(DrAliceSmithPreviousVersion);
    this.mockRepo.createResource(DrAliceSmith);
    this.mockRepo.createResource(DrAliceSmithSchedule);
    this.mockRepo.createResource(ExampleWorkflowQuestionnaire1);
    this.mockRepo.createResource(ExampleWorkflowQuestionnaire2);
    this.mockRepo.createResource(ExampleWorkflowQuestionnaire3);
    this.mockRepo.createResource(ExampleWorkflowPlanDefinition);
    this.mockRepo.createResource(ExampleWorkflowQuestionnaireResponse1);
    this.mockRepo.createResource(ExampleWorkflowTask1);
    this.mockRepo.createResource(ExampleWorkflowTask2);
    this.mockRepo.createResource(ExampleWorkflowTask3);
    this.mockRepo.createResource(ExampleWorkflowRequestGroup);

    DrAliceSmithSlots.forEach((slot) => this.mockRepo.createResource(slot));
  }

  private async mockFhirHandler(method: string, url: string, options: any): Promise<Resource> {
    const path = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
    const match = /fhir\/R4\/?([^/]+)?\/?([^/]+)?\/?([^/]+)?\/?([^/]+)?/.exec(path);
    const resourceType = match?.[1];
    const id = match?.[2];
    const operation = match?.[3];
    const versionId = match?.[4];
    if (path.startsWith('fhir/R4/ValueSet/$expand')) {
      return exampleValueSet;
    } else if (path === 'fhir/R4/$graphql') {
      return this.mockFhirGraphqlHandler(method, path, options);
    } else if (path === 'not-found' || id === 'not-found') {
      return notFound;
    } else if (method === 'POST') {
      if (resourceType && id && operation) {
        return allOk;
      } else if (resourceType) {
        return this.mockRepo.createResource(JSON.parse(options.body));
      } else {
        return this.mockFhirBatchHandler(method, path, options);
      }
    } else if (method === 'GET') {
      if (resourceType && id && versionId) {
        return this.mockRepo.readVersion(resourceType, id, versionId);
      } else if (resourceType && id && operation === '_history') {
        return this.mockRepo.readHistory(resourceType, id);
      } else if (resourceType && id === '$csv') {
        return allOk;
      } else if (resourceType && id) {
        return this.mockRepo.readResource(resourceType, id);
      } else if (resourceType) {
        return this.mockRepo.search(parseSearchDefinition(url));
      }
    } else if (method === 'PUT') {
      return this.mockRepo.updateResource(JSON.parse(options.body));
    } else if (method === 'PATCH') {
      if (resourceType && id) {
        return this.mockRepo.patchResource(resourceType, id, JSON.parse(options.body));
      }
    } else if (method === 'DELETE') {
      if (resourceType && id) {
        this.mockRepo.deleteResource(resourceType, id);
        return allOk;
      }
    }
    throw notFound;
  }

  private mockFhirGraphqlHandler(_method: string, _path: string, options: any): any {
    const { body } = options;
    if (body.includes('ResourceList: ServiceRequestList')) {
      return {
        data: {
          ResourceList: [
            {
              ...HomerServiceRequest,
              ObservationList: [
                HomerObservation1,
                HomerObservation2,
                HomerObservation3,
                HomerObservation4,
                HomerObservation5,
                HomerObservation6,
              ],
            },
          ],
        },
      };
    }
    return GraphQLSchemaResponse;
  }

  private async mockFhirBatchHandler(_method: string, _path: string, options: any): Promise<Bundle> {
    const { body } = options;
    const request = JSON.parse(body) as Bundle;
    let entry: BundleEntry[] | undefined;

    if (request.entry) {
      entry = [];
      for (const input of request.entry) {
        entry.push(await this.handleBatchEntry(input));
      }
    }

    return {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry,
    };
  }

  private async handleBatchEntry(input: BundleEntry): Promise<BundleEntry> {
    try {
      const url = 'fhir/R4/' + input.request?.url;
      const method = input.request?.method as string;
      const resource = await this.mockHandler(method, url, {
        body: input.resource ? JSON.stringify(input.resource) : undefined,
      });
      if (resource?.resourceType === 'OperationOutcome') {
        return {
          resource,
          response: { status: getStatus(resource).toString() },
        };
      } else if (resource) {
        return { resource, response: { status: '200' } };
      } else {
        return { resource: notFound, response: { status: '404' } };
      }
    } catch (err) {
      const outcome = err as OperationOutcome;
      return {
        response: {
          status: getStatus(outcome).toString(),
          outcome,
        },
      };
    }
  }
}
