import { allOk, badRequest, getStatus, LoginState, MedplumClient, notFound, ProfileResource } from '@medplum/core';
import { Binary, Bundle, BundleEntry, Communication, Media, Practitioner } from '@medplum/fhirtypes';
import {
  DifferentOrganization,
  DrAliceSmith,
  DrAliceSmithHistoryBundle,
  DrAliceSmithSchedule,
  DrAliceSmithSlots,
  EmptySearchBundle,
  ExampleAuditEventBundle,
  ExampleBot,
  ExampleQuestionnaire,
  ExampleQuestionnaireBundle,
  ExampleQuestionnaireResponse,
  ExampleSubscription,
  ExampleSubscriptionHistory,
  exampleValueSet,
  GraphQLSchemaResponse,
  HomerCommunications,
  HomerDiagnosticReport,
  HomerDiagnosticReportBundle,
  HomerEncounter,
  HomerEncounterHistory,
  HomerMedia,
  HomerObservation1,
  HomerObservation2,
  HomerObservation3,
  HomerObservation4,
  HomerObservation5,
  HomerObservation6,
  HomerObservationSearchBundle,
  HomerServiceRequest,
  HomerServiceRequestHistoryBundle,
  HomerServiceRequestSearchBundle,
  HomerSimpson,
  HomerSimpsonHistory,
  OrganizationSearchBundle,
  SimpsonSearchBundle,
  TestOrganization,
} from './mocks';
import { ExampleAccessPolicy, ExampleAccessPolicySearchBundle } from './mocks/accesspolicy';

const newComment: Communication = {
  resourceType: 'Communication',
  id: 'new-comment',
  payload: [
    {
      contentString: 'Test comment',
    },
  ],
};

const newMedia: Media = {
  resourceType: 'Media',
  id: 'new-media',
  content: {
    contentType: 'text/plain',
    url: 'https://example.com/test2.txt',
  },
};

const routes: Record<string, Record<string, any>> = {
  'admin/projects/123': {
    GET: {
      project: { id: '123', name: 'Project 123' },
      members: [
        { id: '123', profile: { reference: 'Practitioner/123', display: 'Alice Smith' }, role: 'owner' },
        { id: '888', profile: { reference: 'ClientApplication/123', display: 'Test Client' }, role: 'client' },
      ],
    },
  },
  'admin/super/structuredefinitions': {
    POST: {
      ok: true,
    },
  },
  'admin/super/valuesets': {
    POST: {
      ok: true,
    },
  },
  'admin/super/reindex': {
    POST: {
      ok: true,
    },
  },
  'auth/changepassword': {
    POST: (body: string) => {
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
    },
  },
  'auth/login': {
    POST: {
      profile: { reference: 'Practitioner/123' },
    },
  },
  'auth/setpassword': {
    POST: (body: string) => {
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
    },
  },
  'auth/register': {
    POST: (body: string) => {
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
    },
  },
  'auth/resetpassword': {
    POST: (body: string) => {
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
    },
  },
  'fhir/R4/AccessPolicy?name=Example%20Access%20Policy': {
    GET: ExampleAccessPolicySearchBundle,
  },
  'fhir/R4/AccessPolicy/123': {
    GET: ExampleAccessPolicy,
  },
  'fhir/R4/AuditEvent?entity=Subscription/123&_count=20&_sort=-_lastUpdated': {
    GET: ExampleAuditEventBundle,
  },
  'fhir/R4/Bot/123': {
    GET: ExampleBot,
  },
  'fhir/R4/Communication': {
    POST: newComment,
  },
  'fhir/R4/Communication?based-on=ServiceRequest/123': {
    GET: HomerCommunications,
  },
  'fhir/R4/Communication?encounter=Encounter/123': {
    GET: HomerCommunications,
  },
  'fhir/R4/Communication?subject=Patient/123': {
    GET: HomerCommunications,
  },
  'fhir/R4/Device?subject=Patient/123': {
    GET: EmptySearchBundle,
  },
  'fhir/R4/DeviceRequest?patient=Patient/123': {
    GET: EmptySearchBundle,
  },
  'fhir/R4/DiagnosticReport/123': {
    GET: HomerDiagnosticReport,
  },
  'fhir/R4/DiagnosticReport/123/_history': {
    GET: HomerDiagnosticReportBundle,
  },
  'fhir/R4/DiagnosticReport?based-on=ServiceRequest/123': {
    GET: HomerDiagnosticReportBundle,
  },
  'fhir/R4/DiagnosticReport?subject=Patient/123': {
    GET: HomerDiagnosticReportBundle,
  },
  'fhir/R4/Encounter/123': {
    GET: HomerEncounter,
  },
  'fhir/R4/Encounter/123/_history': {
    GET: HomerEncounterHistory,
  },
  'fhir/R4/Media': {
    POST: newMedia,
  },
  'fhir/R4/Media?based-on=ServiceRequest/123': {
    GET: HomerMedia,
  },
  'fhir/R4/Media?encounter=Encounter/123': {
    GET: HomerMedia,
  },
  'fhir/R4/Media?subject=Patient/123': {
    GET: HomerMedia,
  },
  'fhir/R4/Observation?_fields=value[x]': {
    GET: HomerObservationSearchBundle,
  },
  'fhir/R4/Observation?_fields=value[x]&_total=accurate': {
    GET: HomerObservationSearchBundle,
  },
  'fhir/R4/Observation/1': {
    GET: HomerObservation1,
  },
  'fhir/R4/Observation/2': {
    GET: HomerObservation2,
  },
  'fhir/R4/Observation/3': {
    GET: HomerObservation3,
  },
  'fhir/R4/Observation/4': {
    GET: HomerObservation4,
  },
  'fhir/R4/Observation/5': {
    GET: HomerObservation5,
  },
  'fhir/R4/Observation/6': {
    GET: HomerObservation6,
  },
  'fhir/R4/Organization?name=Different': {
    GET: OrganizationSearchBundle,
  },
  'fhir/R4/Organization/123': {
    GET: TestOrganization,
  },
  'fhir/R4/Organization/456': {
    GET: DifferentOrganization,
  },
  'fhir/R4/Patient?_total=accurate': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?name=Simpson': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_total=accurate&name=Simpson': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,name&_total=accurate': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,name&_total=accurate&name=Simpson': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,_lastUpdated,name': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,_lastUpdated,name&_total=accurate': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,_lastUpdated,name,birthDate': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,_lastUpdated,name,birthDate&_total=accurate': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,_lastUpdated,name,birthDate,active,telecom,email,phone&_total=accurate': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,_lastUpdated,name&name=Simpson': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,_lastUpdated,name&_total=accurate&name=Simpson': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_count=20&_fields=id,_lastUpdated,name,birthDate,gender&_sort=-_lastUpdated': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_count=20&_fields=id,_lastUpdated,name,birthDate,gender&_sort=-_lastUpdated&_total=accurate': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,_lastUpdated,name&_lastUpdated=ge2021-12-01T00%3A00%3A00.000Z': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?_fields=id,_lastUpdated,name&_lastUpdated=ge2021-12-01T00%3A00%3A00.000Z&_total=accurate': {
    GET: SimpsonSearchBundle,
  },
  'fhir/R4/Patient?name=Bob': {
    GET: EmptySearchBundle,
  },
  'fhir/R4/Patient?_total=accurate&name=Bob': {
    GET: EmptySearchBundle,
  },
  'fhir/R4/Patient/123': {
    GET: HomerSimpson,
  },
  'fhir/R4/Patient/123/_history': {
    GET: HomerSimpsonHistory,
  },
  'fhir/R4/Practitioner': {
    POST: HomerSimpson,
  },
  'fhir/R4/Practitioner/123': {
    GET: DrAliceSmith,
  },
  'fhir/R4/Practitioner/123/_history': {
    GET: DrAliceSmithHistoryBundle,
  },
  'fhir/R4/Practitioner/123/_history/1': {
    GET: DrAliceSmith,
  },
  'fhir/R4/Practitioner/not-found/_history': {
    GET: notFound,
  },
  'fhir/R4/Questionnaire?subject-type=Patient': {
    GET: ExampleQuestionnaireBundle,
  },
  'fhir/R4/Questionnaire/not-found': {
    GET: notFound,
  },
  'fhir/R4/Questionnaire/123': {
    GET: ExampleQuestionnaire,
  },
  'fhir/R4/QuestionnaireResponse': {
    POST: ExampleQuestionnaireResponse,
  },
  'fhir/R4/QuestionnaireResponse/123': {
    GET: ExampleQuestionnaireResponse,
  },
  'fhir/R4/Schedule/123': {
    GET: DrAliceSmithSchedule,
  },
  'fhir/R4/ServiceRequest/123': {
    GET: HomerServiceRequest,
  },
  'fhir/R4/ServiceRequest/123/_history': {
    GET: HomerServiceRequestHistoryBundle,
  },
  'fhir/R4/ServiceRequest?subject=Patient/123': {
    GET: HomerServiceRequestSearchBundle,
  },
  'fhir/R4/ServiceRequest?_fields=id,_lastUpdated,subject,code,status,orderDetail': {
    GET: HomerServiceRequestSearchBundle,
  },
  'fhir/R4/Slot?schedule=Schedule%2F123': {
    GET: DrAliceSmithSlots,
  },
  'fhir/R4/Subscription/123': {
    GET: ExampleSubscription,
  },
  'fhir/R4/Subscription/123/_history': {
    GET: ExampleSubscriptionHistory,
  },
  'fhir/R4/ValueSet/%24expand?url=https%3A%2F%2Fexample.com%2Ftest&filter=xyz': {
    GET: exampleValueSet,
  },
  'fhir/R4/%24graphql': {
    POST: GraphQLSchemaResponse,
  },
  'fhir/R4': {
    POST: (body: string) => {
      const request = JSON.parse(body) as Bundle;
      return {
        resourceType: 'Bundle',
        type: 'batch-response',
        entry: request.entry?.map((e: BundleEntry) => {
          const url = 'fhir/R4/' + e?.request?.url;
          const method = e?.request?.method as string;
          const resource = routes[url]?.[method];
          if (resource?.resourceType === 'OperationOutcome') {
            return { resource, response: { status: getStatus(resource).toString() } };
          } else if (resource) {
            return { resource, response: { status: '200' } };
          } else {
            return { resource: notFound, response: { status: '404' } };
          }
        }),
      };
    },
  },
};

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
        const method = options.method;
        const path = url.replace('https://example.com/', '');

        if (clientOptions?.debug) {
          console.log('MockClient', method, path);
        }

        let result = routes[path]?.[method];
        if (typeof result === 'function') {
          result = result(options.body);
        }

        if (clientOptions?.debug && !result) {
          console.log('MockClient: not found', method, path);
        }

        const response: any = {
          request: {
            url,
            options,
          },
          ...result,
        };

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

  createBinary(data: any, filename: string, contentType: string): Promise<Binary> {
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
