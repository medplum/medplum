import {
  allOk,
  badRequest,
  getStatus,
  LoginState,
  MedplumClient,
  notFound,
  parseSearchDefinition,
  ProfileResource,
} from '@medplum/core';
import { Binary, Bundle, BundleEntry, Practitioner } from '@medplum/fhirtypes';
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
  HomerServiceRequest,
  HomerSimpson,
  HomerSimpsonPreviousVersion,
  HomerSimpsonSpecimen,
  TestOrganization,
} from './mocks';
import { ExampleAccessPolicy, ExampleStatusValueSet, ExampleUserConfiguration } from './mocks/accesspolicy';
import { MemoryRepository } from './repo';

export interface MockClientOptions {
  readonly debug?: boolean;
}

export class MockClient extends MedplumClient {
  activeLoginOverride?: LoginState;

  constructor(clientOptions?: MockClientOptions) {
    super({
      baseUrl: 'https://example.com/',
      clientId: 'my-client-id',
      fetch: (url: string, options: any) => {
        const method = options.method || 'GET';
        const path = url.replace('https://example.com/', '');

        if (clientOptions?.debug) {
          console.log('MockClient', method, path);
        }

        const response = mockHandler(method, path, options);

        if (clientOptions?.debug && !response) {
          console.log('MockClient: not found', method, path);
        }

        if (clientOptions?.debug) {
          console.log('MockClient', JSON.stringify(response, null, 2));
        }

        return Promise.resolve({
          blob: () => Promise.resolve(response),
          json: () => Promise.resolve(response),
        });
      },
    });
  }

  clear(): void {
    super.clear();
    this.activeLoginOverride = undefined;
  }

  getProfile(): ProfileResource {
    return {
      resourceType: 'Practitioner',
      id: '123',
      meta: {
        versionId: '456',
      },
    } as Practitioner;
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

  createBinary(_data: any, filename: string, contentType: string): Promise<Binary> {
    if (filename.endsWith('.exe')) {
      return Promise.reject(badRequest('Invalid file type'));
    }

    return Promise.resolve({
      resourceType: 'Binary',
      title: filename,
      contentType,
      url: 'https://example.com/binary/123',
    });
  }
}

function mockHandler(method: string, path: string, options: any): any {
  if (path.startsWith('admin/')) {
    return mockAdminHandler(method, path);
  } else if (path.startsWith('auth/')) {
    return mockAuthHandler(method, path, options);
  } else if (path.startsWith('fhir/R4')) {
    return mockFhirHandler(method, path, options);
  } else {
    return null;
  }
}

function mockAdminHandler(_method: string, path: string): any {
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

function mockAuthHandler(method: string, path: string, options: any): any {
  if (path.startsWith('auth/changepassword')) {
    return mockChangePasswordHandler(method, path, options);
  }

  if (path.startsWith('auth/login')) {
    return mockLoginHandler(method, path, options);
  }

  if (path.startsWith('auth/setpassword')) {
    return mockSetPasswordHandler(method, path, options);
  }

  if (path.startsWith('auth/register')) {
    return mockRegisterHandler(method, path, options);
  }

  if (path.startsWith('auth/resetpassword')) {
    return mockResetPasswordHandler(method, path, options);
  }

  if (path.startsWith('auth/me')) {
    return {
      profile: { reference: 'Practitioner/123' },
    };
  }

  return null;
}

function mockChangePasswordHandler(_method: string, _path: string, options: any): any {
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

function mockLoginHandler(_method: string, _path: string, options: any): any {
  const { body } = options;
  const { password } = JSON.parse(body);
  if (password === 'password') {
    return {
      profile: { reference: 'Practitioner/123' },
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

function mockSetPasswordHandler(_method: string, _path: string, options: any): any {
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

function mockRegisterHandler(_method: string, _path: string, options: any): any {
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

function mockResetPasswordHandler(_method: string, _path: string, options: any): any {
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

const mockRepo = new MemoryRepository();
mockRepo.createResource(HomerSimpsonPreviousVersion);
mockRepo.createResource(HomerSimpson);
mockRepo.createResource(ExampleAccessPolicy);
mockRepo.createResource(ExampleStatusValueSet);
mockRepo.createResource(ExampleUserConfiguration);
mockRepo.createResource(ExampleBot);
mockRepo.createResource(ExampleClient);
mockRepo.createResource(HomerDiagnosticReport);
mockRepo.createResource(HomerEncounter);
mockRepo.createResource(HomerCommunication);
mockRepo.createResource(HomerMedia);
mockRepo.createResource(HomerObservation1);
mockRepo.createResource(HomerObservation2);
mockRepo.createResource(HomerObservation3);
mockRepo.createResource(HomerObservation4);
mockRepo.createResource(HomerObservation5);
mockRepo.createResource(HomerObservation6);
mockRepo.createResource(HomerSimpsonSpecimen);
mockRepo.createResource(TestOrganization);
mockRepo.createResource(DifferentOrganization);
mockRepo.createResource(ExampleQuestionnaire);
mockRepo.createResource(ExampleQuestionnaireResponse);
mockRepo.createResource(HomerServiceRequest);
mockRepo.createResource(ExampleSubscription);
mockRepo.createResource(BartSimpson);
mockRepo.createResource(DrAliceSmithPreviousVersion);
mockRepo.createResource(DrAliceSmith);
mockRepo.createResource(DrAliceSmithSchedule);
DrAliceSmithSlots.forEach((slot) => mockRepo.createResource(slot));

function mockFhirHandler(method: string, url: string, options: any): any {
  const path = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
  const match = /fhir\/R4\/?([^/]+)?\/?([^/]+)?\/?([^/]+)?\/?([^/]+)?/.exec(path);
  const resourceType = match?.[1];
  const id = match?.[2];
  const operation = match?.[3];
  const versionId = match?.[4];
  if (path.startsWith('fhir/R4/ValueSet/%24expand')) {
    return exampleValueSet;
  } else if (path === 'fhir/R4/%24graphql') {
    return mockFhirGraphqlHandler(method, path, options);
  } else if (path === 'not-found' || id === 'not-found') {
    return notFound;
  } else if (method === 'POST') {
    if (resourceType && id && operation) {
      return {};
    } else if (resourceType) {
      return mockRepo.createResource(JSON.parse(options.body));
    } else {
      return mockFhirBatchHandler(method, path, options);
    }
  } else if (method === 'GET') {
    if (resourceType && id && versionId) {
      return mockRepo.readVersion(resourceType, id, versionId);
    } else if (resourceType && id && operation === '_history') {
      return mockRepo.readHistory(resourceType, id);
    } else if (resourceType && id) {
      return mockRepo.readResource(resourceType, id);
    } else if (resourceType) {
      return mockRepo.search(parseSearchDefinition(url));
    }
  } else if (method === 'PUT') {
    return mockRepo.createResource(JSON.parse(options.body));
  } else if (method === 'DELETE') {
    if (resourceType && id) {
      return mockRepo.deleteResource(resourceType, id);
    } else {
      return notFound;
    }
  }
}

function mockFhirGraphqlHandler(_method: string, _path: string, options: any): any {
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

function mockFhirBatchHandler(_method: string, _path: string, options: any): any {
  const { body } = options;
  const request = JSON.parse(body) as Bundle;
  return {
    resourceType: 'Bundle',
    type: 'batch-response',
    entry: request.entry?.map((e: BundleEntry) => {
      const url = 'fhir/R4/' + e?.request?.url;
      const method = e?.request?.method as string;
      const resource = mockHandler(method, url, null);
      if (resource?.resourceType === 'OperationOutcome') {
        return { resource, response: { status: getStatus(resource).toString() } };
      } else if (resource) {
        return { resource, response: { status: '200' } };
      } else {
        return { resource: notFound, response: { status: '404' } };
      }
    }),
  };
}
