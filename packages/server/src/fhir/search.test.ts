import {
  createReference,
  getReferenceString,
  LOINC,
  normalizeErrorString,
  normalizeOperationOutcome,
  OperationOutcomeError,
  Operator,
  parseSearchDefinition,
  parseSearchRequest,
  parseSearchUrl,
  SearchRequest,
  SNOMED,
} from '@medplum/core';
import {
  ActivityDefinition,
  AllergyIntolerance,
  Appointment,
  AuditEvent,
  Bundle,
  CareTeam,
  Coding,
  Communication,
  Condition,
  DiagnosticReport,
  Encounter,
  Observation,
  Organization,
  Patient,
  PlanDefinition,
  Practitioner,
  Provenance,
  Questionnaire,
  QuestionnaireResponse,
  Resource,
  RiskAssessment,
  SearchParameter,
  ServiceRequest,
  StructureDefinition,
  Task,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { bundleContains, withTestContext } from '../test.setup';
import { systemRepo } from './repo';

jest.mock('hibp');
jest.mock('ioredis');

describe('FHIR Search', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Search total', async () => {
    const result1 = await systemRepo.search({
      resourceType: 'Patient',
    });
    expect(result1.total).toBeUndefined();
    expect(result1.link?.length).toBe(3);

    const result2 = await systemRepo.search({
      resourceType: 'Patient',
      total: 'none',
    });
    expect(result2.total).toBeUndefined();

    const result3 = await systemRepo.search({
      resourceType: 'Patient',
      total: 'accurate',
    });
    expect(result3.total).toBeDefined();
    expect(typeof result3.total).toBe('number');

    const result4 = await systemRepo.search({
      resourceType: 'Patient',
      total: 'estimate',
    });
    expect(result4.total).toBeDefined();
    expect(typeof result4.total).toBe('number');
  });

  test('Search count=0', async () => {
    const result1 = await systemRepo.search({
      resourceType: 'Patient',
      count: 0,
    });
    expect(result1.entry).toBeUndefined();
    expect(result1.link).toBeDefined();
    expect(result1.link?.length).toBe(1);
  });

  test('Search _summary', () =>
    withTestContext(async () => {
      const subsetTag: Coding = { system: 'http://hl7.org/fhir/v3/ObservationValue', code: 'SUBSETTED' };
      const patient: Patient = {
        resourceType: 'Patient',
        meta: {
          profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
          tag: [{ system: 'http://example.com/', code: 'test' }],
        },
        text: {
          status: 'generated',
          div: '<div xmlns="http://www.w3.org/1999/xhtml"></div>',
        },
        identifier: [
          {
            use: 'usual',
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                  code: 'MR',
                  display: 'Medical Record Number',
                },
              ],
              text: 'Medical Record Number',
            },
            system: 'http://hospital.smarthealthit.org',
            value: '1032702',
          },
        ],
        active: true,
        name: [
          {
            use: 'old',
            family: 'Shaw',
            given: ['Amy', 'V.'],
            period: {
              start: '2016-12-06',
              end: '2020-07-22',
            },
          },
          {
            family: 'Baxter',
            given: ['Amy', 'V.'],
            suffix: ['PharmD'],
            period: {
              start: '2020-07-22',
            },
          },
        ],
        telecom: [
          {
            system: 'phone',
            value: '555-555-5555',
            use: 'home',
          },
          {
            system: 'email',
            value: 'amy.shaw@example.com',
          },
        ],
        gender: 'female',
        birthDate: '1987-02-20',
        multipleBirthInteger: 2,
        address: [
          {
            use: 'old',
            line: ['49 Meadow St'],
            city: 'Mounds',
            state: 'OK',
            postalCode: '74047',
            country: 'US',
            period: {
              start: '2016-12-06',
              end: '2020-07-22',
            },
          },
          {
            line: ['183 Mountain View St'],
            city: 'Mounds',
            state: 'OK',
            postalCode: '74048',
            country: 'US',
            period: {
              start: '2020-07-22',
            },
          },
        ],
      };
      const resource = await systemRepo.createResource(patient);

      // _summary=text
      const textResults = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: resource.id as string }],
        summary: 'text',
      });
      expect(textResults.entry).toHaveLength(1);
      const textResult = textResults.entry?.[0]?.resource as Resource;
      expect(textResult).toEqual<Partial<Patient>>({
        resourceType: 'Patient',
        id: resource.id,
        meta: expect.objectContaining({
          profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
          tag: [{ system: 'http://example.com/', code: 'test' }, subsetTag],
        }),
        text: {
          status: 'generated',
          div: '<div xmlns="http://www.w3.org/1999/xhtml"></div>',
        },
      });

      // _summary=data
      const dataResults = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: resource.id as string }],
        summary: 'data',
      });
      expect(dataResults.entry).toHaveLength(1);
      const dataResult = dataResults.entry?.[0]?.resource as Resource;
      const { text: _1, ...dataExpected } = resource;
      dataExpected.meta?.tag?.push(subsetTag);
      expect(dataResult).toEqual<Partial<Patient>>({ ...dataExpected });

      // _summary=true
      const summaryResults = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: resource.id as string }],
        summary: 'true',
      });
      expect(summaryResults.entry).toHaveLength(1);
      const summaryResult = summaryResults.entry?.[0]?.resource as Resource;
      const { multipleBirthInteger: _2, text: _3, ...summaryResource } = resource;
      expect(summaryResult).toEqual<Partial<Patient>>(summaryResource);
    }));

  test('Search _elements', () =>
    withTestContext(async () => {
      const subsetTag: Coding = { system: 'http://hl7.org/fhir/v3/ObservationValue', code: 'SUBSETTED' };
      const patient: Patient = {
        resourceType: 'Patient',
        birthDate: '2000-01-01',
        _birthDate: {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/patient-birthTime',
              valueDateTime: '2000-01-01T00:00:00.001Z',
            },
          ],
        },
        multipleBirthInteger: 2,
        deceasedBoolean: false,
      } as unknown as Patient;
      const resource = await systemRepo.createResource(patient);

      const results = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: resource.id as string }],
        fields: ['birthDate', 'deceased'],
      });
      expect(results.entry).toHaveLength(1);
      const result = results.entry?.[0]?.resource as Resource;
      expect(result).toEqual<Partial<Patient>>({
        resourceType: 'Patient',
        id: resource.id,
        meta: expect.objectContaining({
          tag: [subsetTag],
        }),
        birthDate: resource.birthDate,
        _birthDate: (resource as any)._birthDate,
        deceasedBoolean: resource.deceasedBoolean,
      } as unknown as Patient);
    }));

  test('Search next link', () =>
    withTestContext(async () => {
      const family = randomUUID();

      for (let i = 0; i < 2; i++) {
        await systemRepo.createResource({
          resourceType: 'Patient',
          name: [{ family }],
        });
      }

      const result1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: family }],
        count: 1,
      });
      expect(result1.entry).toHaveLength(1);
      expect(result1.link).toBeDefined();
      expect(result1.link?.find((e) => e.relation === 'next')).toBeDefined();

      const result2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: family }],
        count: 2,
      });
      expect(result2.entry).toHaveLength(2);
      expect(result2.link).toBeDefined();
      expect(result2.link?.find((e) => e.relation === 'next')).toBeUndefined();

      const result3 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: family }],
        count: 3,
      });
      expect(result3.entry).toHaveLength(2);
      expect(result3.link).toBeDefined();
      expect(result3.link?.find((e) => e.relation === 'next')).toBeUndefined();
    }));

  test('Search previous link', () =>
    withTestContext(async () => {
      const family = randomUUID();

      for (let i = 0; i < 2; i++) {
        await systemRepo.createResource({
          resourceType: 'Patient',
          name: [{ family }],
        });
      }

      const result1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: family }],
        count: 1,
        offset: 1,
      });
      expect(result1.entry).toHaveLength(1);
      expect(result1.link).toBeDefined();
      expect(result1.link?.find((e) => e.relation === 'previous')).toBeDefined();
    }));

  test('Search for Communications by Encounter', () =>
    withTestContext(async () => {
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient1).toBeDefined();

      const encounter1 = await systemRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        status: 'in-progress',
        class: {
          code: 'HH',
          display: 'home health',
        },
        subject: createReference(patient1 as Patient),
      });

      expect(encounter1).toBeDefined();

      const comm1 = await systemRepo.createResource<Communication>({
        resourceType: 'Communication',
        status: 'completed',
        encounter: createReference(encounter1 as Encounter),
        subject: createReference(patient1 as Patient),
        sender: createReference(patient1 as Patient),
        payload: [{ contentString: 'This is a test' }],
      });

      expect(comm1).toBeDefined();

      const patient2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Bob'], family: 'Jones' }],
      });

      expect(patient2).toBeDefined();

      const encounter2 = await systemRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        status: 'in-progress',
        class: {
          code: 'HH',
          display: 'home health',
        },
        subject: createReference(patient2 as Patient),
      });

      expect(encounter2).toBeDefined();

      const comm2 = await systemRepo.createResource<Communication>({
        resourceType: 'Communication',
        status: 'completed',
        encounter: createReference(encounter2 as Encounter),
        subject: createReference(patient2 as Patient),
        sender: createReference(patient2 as Patient),
        payload: [{ contentString: 'This is another test' }],
      });

      expect(comm2).toBeDefined();

      const searchResult = await systemRepo.search({
        resourceType: 'Communication',
        filters: [
          {
            code: 'encounter',
            operator: Operator.EQUALS,
            value: getReferenceString(encounter1 as Encounter),
          },
        ],
      });

      expect(searchResult.entry?.length).toEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(comm1.id);
    }));

  test('Search for Communications by ServiceRequest', () =>
    withTestContext(async () => {
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient1).toBeDefined();

      const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: {
          text: 'text',
        },
        subject: createReference(patient1 as Patient),
      });

      expect(serviceRequest1).toBeDefined();

      const comm1 = await systemRepo.createResource<Communication>({
        resourceType: 'Communication',
        status: 'completed',
        basedOn: [createReference(serviceRequest1 as ServiceRequest)],
        subject: createReference(patient1 as Patient),
        sender: createReference(patient1 as Patient),
        payload: [{ contentString: 'This is a test' }],
      });

      expect(comm1).toBeDefined();

      const patient2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Bob'], family: 'Jones' }],
      });

      expect(patient2).toBeDefined();

      const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: {
          text: 'test',
        },
        subject: createReference(patient2 as Patient),
      });

      expect(serviceRequest2).toBeDefined();

      const comm2 = await systemRepo.createResource<Communication>({
        resourceType: 'Communication',
        status: 'completed',
        basedOn: [createReference(serviceRequest2 as ServiceRequest)],
        subject: createReference(patient2 as Patient),
        sender: createReference(patient2 as Patient),
        payload: [{ contentString: 'This is another test' }],
      });

      expect(comm2).toBeDefined();

      const searchResult = await systemRepo.search({
        resourceType: 'Communication',
        filters: [
          {
            code: 'based-on',
            operator: Operator.EQUALS,
            value: getReferenceString(serviceRequest1 as ServiceRequest),
          },
        ],
      });

      expect(searchResult.entry?.length).toEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(comm1.id);
    }));

  test('Search for QuestionnaireResponse by Questionnaire', () =>
    withTestContext(async () => {
      const questionnaire = await systemRepo.createResource<Questionnaire>({
        resourceType: 'Questionnaire',
        status: 'active',
      });

      const response1 = await systemRepo.createResource<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        questionnaire: getReferenceString(questionnaire),
      });

      await systemRepo.createResource<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        questionnaire: `Questionnaire/${randomUUID()}`,
      });

      const bundle = await systemRepo.search({
        resourceType: 'QuestionnaireResponse',
        filters: [
          {
            code: 'questionnaire',
            operator: Operator.EQUALS,
            value: getReferenceString(questionnaire),
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(1);
      expect(bundle.entry?.[0]?.resource?.id).toEqual(response1.id);
    }));

  test('Search for token in array', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'SearchParameter',
      filters: [
        {
          code: 'base',
          operator: Operator.EQUALS,
          value: 'Patient',
        },
      ],
      count: 100,
    });

    expect(bundle.entry?.find((e) => (e.resource as SearchParameter).code === 'name')).toBeDefined();
    expect(bundle.entry?.find((e) => (e.resource as SearchParameter).code === 'email')).toBeDefined();
  });

  test('Search sort by Patient.id', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: '_id' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.meta.lastUpdated', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: '_lastUpdated' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.identifier', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'identifier' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.name', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'name' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.given', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'given' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.address', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'address' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.telecom', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'telecom' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.email', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'email' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.birthDate', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'birthdate' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Filter and sort on same search parameter', () =>
    withTestContext(async () => {
      await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Marge'], family: 'Simpson' }],
      });

      await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Homer'], family: 'Simpson' }],
      });

      const bundle = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: 'family', operator: Operator.EQUALS, value: 'Simpson' }],
        sortRules: [{ code: 'family' }],
      });

      expect(bundle.entry).toBeDefined();
      expect(bundle.entry?.length).toBeGreaterThanOrEqual(2);
    }));

  test('Search birthDate after delete', () =>
    withTestContext(async () => {
      const family = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family }],
        birthDate: '1971-02-02',
      });

      const searchResult1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'family',
            operator: Operator.EQUALS,
            value: family,
          },
          {
            code: 'birthdate',
            operator: Operator.EQUALS,
            value: '1971-02-02',
          },
        ],
      });

      expect(searchResult1.entry?.length).toEqual(1);
      expect(searchResult1.entry?.[0]?.resource?.id).toEqual(patient.id);

      await systemRepo.deleteResource('Patient', patient.id as string);

      const searchResult2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'family',
            operator: Operator.EQUALS,
            value: family,
          },
          {
            code: 'birthdate',
            operator: Operator.EQUALS,
            value: '1971-02-02',
          },
        ],
      });

      expect(searchResult2.entry?.length).toEqual(0);
    }));

  test('Search identifier after delete', () =>
    withTestContext(async () => {
      const identifier = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        identifier: [{ system: 'https://www.example.com', value: identifier }],
      });

      const searchResult1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: identifier,
          },
        ],
      });

      expect(searchResult1.entry?.length).toEqual(1);
      expect(searchResult1.entry?.[0]?.resource?.id).toEqual(patient.id);

      await systemRepo.deleteResource('Patient', patient.id as string);

      const searchResult2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: identifier,
          },
        ],
      });

      expect(searchResult2.entry?.length).toEqual(0);
    }));

  test('String filter', async () => {
    const bundle1 = await systemRepo.search<StructureDefinition>({
      resourceType: 'StructureDefinition',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Questionnaire',
        },
      ],
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
      ],
    });
    expect(bundle1.entry?.map((e) => e.resource?.name)).toEqual(['Questionnaire', 'QuestionnaireResponse']);

    const bundle2 = await systemRepo.search({
      resourceType: 'StructureDefinition',
      filters: [
        {
          code: 'name',
          operator: Operator.EXACT,
          value: 'Questionnaire',
        },
      ],
    });
    expect(bundle2.entry?.length).toEqual(1);
    expect((bundle2.entry?.[0]?.resource as StructureDefinition).name).toEqual('Questionnaire');
  });

  test('Filter by _id', () =>
    withTestContext(async () => {
      // Unique family name to isolate the test
      const family = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family }],
      });
      expect(patient).toBeDefined();

      const searchResult1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: '_id',
            operator: Operator.EQUALS,
            value: patient.id as string,
          },
        ],
      });

      expect(searchResult1.entry?.length).toEqual(1);
      expect(bundleContains(searchResult1 as Bundle, patient as Patient)).toEqual(true);

      const searchResult2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: family,
          },
          {
            code: '_id',
            operator: Operator.NOT_EQUALS,
            value: patient.id as string,
          },
        ],
      });

      expect(searchResult2.entry?.length).toEqual(0);
    }));

  test('Empty _id', async () => {
    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: '_id',
          operator: Operator.EQUALS,
          value: '',
        },
      ],
    });

    expect(searchResult1.entry?.length).toEqual(0);
  });

  test('Non UUID _id', async () => {
    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: '_id',
          operator: Operator.EQUALS,
          value: 'x',
        },
      ],
    });

    expect(searchResult1.entry?.length).toEqual(0);
  });

  test('Non UUID _compartment', async () => {
    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: '_compartment',
          operator: Operator.EQUALS,
          value: 'x',
        },
      ],
    });

    expect(searchResult1.entry?.length).toEqual(0);
  });

  test('Reference string _compartment', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });

      const searchResult1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: '_compartment',
            operator: Operator.EQUALS,
            value: getReferenceString(patient),
          },
        ],
      });

      expect(searchResult1.entry?.length).toEqual(1);
      expect(bundleContains(searchResult1 as Bundle, patient as Patient)).toEqual(true);
    }));

  test('Filter by _project', () =>
    withTestContext(async () => {
      const project1 = randomUUID();
      const project2 = randomUUID();

      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice1'], family: 'Smith1' }],
        meta: {
          project: project1,
        },
      });
      expect(patient1).toBeDefined();

      const patient2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice2'], family: 'Smith2' }],
        meta: {
          project: project2,
        },
      });
      expect(patient2).toBeDefined();

      const bundle = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: '_project',
            operator: Operator.EQUALS,
            value: project1,
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(1);
      expect(bundleContains(bundle as Bundle, patient1 as Patient)).toEqual(true);
      expect(bundleContains(bundle as Bundle, patient2 as Patient)).toEqual(false);
    }));

  test('Handle malformed _lastUpdated', async () => {
    try {
      await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: '_lastUpdated',
            operator: Operator.GREATER_THAN,
            value: 'xyz',
          },
        ],
      });
      fail('Expected error');
    } catch (err) {
      expect(normalizeErrorString(err)).toEqual('Invalid date value: xyz');
    }
  });

  test('Filter by _lastUpdated', () =>
    withTestContext(async () => {
      // Create 2 patients
      // One with a _lastUpdated of 1 second ago
      // One with a _lastUpdated of 2 seconds ago
      const family = randomUUID();
      const now = new Date();
      const nowMinus1Second = new Date(now.getTime() - 1000);
      const nowMinus2Seconds = new Date(now.getTime() - 2000);
      const nowMinus3Seconds = new Date(now.getTime() - 3000);

      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family }],
        meta: {
          lastUpdated: nowMinus1Second.toISOString(),
        },
      });
      expect(patient1).toBeDefined();

      const patient2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family }],
        meta: {
          lastUpdated: nowMinus2Seconds.toISOString(),
        },
      });
      expect(patient2).toBeDefined();

      // Greater than (newer than) 2 seconds ago should only return patient 1
      const searchResult1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: family,
          },
          {
            code: '_lastUpdated',
            operator: Operator.GREATER_THAN,
            value: nowMinus2Seconds.toISOString(),
          },
        ],
      });

      expect(bundleContains(searchResult1 as Bundle, patient1 as Patient)).toEqual(true);
      expect(bundleContains(searchResult1 as Bundle, patient2 as Patient)).toEqual(false);

      // Greater than (newer than) or equal to 2 seconds ago should return both patients
      const searchResult2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: family,
          },
          {
            code: '_lastUpdated',
            operator: Operator.GREATER_THAN_OR_EQUALS,
            value: nowMinus2Seconds.toISOString(),
          },
        ],
      });

      expect(bundleContains(searchResult2 as Bundle, patient1 as Patient)).toEqual(true);
      expect(bundleContains(searchResult2 as Bundle, patient2 as Patient)).toEqual(true);

      // Less than (older than) to 1 seconds ago should only return patient 2
      const searchResult3 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: family,
          },
          {
            code: '_lastUpdated',
            operator: Operator.GREATER_THAN,
            value: nowMinus3Seconds.toISOString(),
          },
          {
            code: '_lastUpdated',
            operator: Operator.LESS_THAN,
            value: nowMinus1Second.toISOString(),
          },
        ],
      });

      expect(bundleContains(searchResult3 as Bundle, patient1 as Patient)).toEqual(false);
      expect(bundleContains(searchResult3 as Bundle, patient2 as Patient)).toEqual(true);

      // Less than (older than) or equal to 1 seconds ago should return both patients
      const searchResult4 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: family,
          },
          {
            code: '_lastUpdated',
            operator: Operator.GREATER_THAN,
            value: nowMinus3Seconds.toISOString(),
          },
          {
            code: '_lastUpdated',
            operator: Operator.LESS_THAN_OR_EQUALS,
            value: nowMinus1Second.toISOString(),
          },
        ],
      });

      expect(bundleContains(searchResult4 as Bundle, patient1 as Patient)).toEqual(true);
      expect(bundleContains(searchResult4 as Bundle, patient2 as Patient)).toEqual(true);
    }));

  test('Sort by _lastUpdated', () =>
    withTestContext(async () => {
      const project = randomUUID();

      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice1'], family: 'Smith1' }],
        meta: {
          lastUpdated: '2020-01-01T00:00:00.000Z',
          project,
        },
      });
      expect(patient1).toBeDefined();

      const patient2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice2'], family: 'Smith2' }],
        meta: {
          lastUpdated: '2020-01-02T00:00:00.000Z',
          project,
        },
      });
      expect(patient2).toBeDefined();

      const bundle3 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: '_project',
            operator: Operator.EQUALS,
            value: project,
          },
        ],
        sortRules: [
          {
            code: '_lastUpdated',
            descending: false,
          },
        ],
      });
      expect(bundle3.entry?.length).toEqual(2);
      expect(bundle3.entry?.[0]?.resource?.id).toEqual(patient1.id);
      expect(bundle3.entry?.[1]?.resource?.id).toEqual(patient2.id);

      const bundle4 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: '_project',
            operator: Operator.EQUALS,
            value: project,
          },
        ],
        sortRules: [
          {
            code: '_lastUpdated',
            descending: true,
          },
        ],
      });
      expect(bundle4.entry?.length).toEqual(2);
      expect(bundle4.entry?.[0]?.resource?.id).toEqual(patient2.id);
      expect(bundle4.entry?.[1]?.resource?.id).toEqual(patient1.id);
    }));

  test('Filter by Coding', () =>
    withTestContext(async () => {
      const auditEvents = [] as AuditEvent[];

      for (let i = 0; i < 3; i++) {
        const resource = await systemRepo.createResource<AuditEvent>({
          resourceType: 'AuditEvent',
          recorded: new Date().toISOString(),
          type: {
            code: randomUUID(),
          },
          agent: [
            {
              who: { reference: 'Practitioner/' + randomUUID() },
              requestor: true,
            },
          ],
          source: {
            observer: { reference: 'Practitioner/' + randomUUID() },
          },
        });
        auditEvents.push(resource);
      }

      for (let i = 0; i < 3; i++) {
        const bundle = await systemRepo.search({
          resourceType: 'AuditEvent',
          filters: [
            {
              code: 'type',
              operator: Operator.CONTAINS,
              value: auditEvents[i].type?.code as string,
            },
          ],
        });
        expect(bundle.entry?.length).toEqual(1);
        expect(bundle.entry?.[0]?.resource?.id).toEqual(auditEvents[i].id);
      }
    }));

  test('Filter by CodeableConcept', () =>
    withTestContext(async () => {
      const x1 = randomUUID();
      const x2 = randomUUID();
      const x3 = randomUUID();

      // Create test patient
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: 'CodeableConcept' }],
      });

      const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        code: { coding: [{ code: x1 }] },
      });

      const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        code: { coding: [{ code: x2 }] },
      });

      const serviceRequest3 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        code: { coding: [{ code: x3 }] },
      });

      const bundle1 = await systemRepo.search({
        resourceType: 'ServiceRequest',
        filters: [
          {
            code: 'code',
            operator: Operator.EQUALS,
            value: x1,
          },
        ],
      });
      expect(bundle1.entry?.length).toEqual(1);
      expect(bundleContains(bundle1, serviceRequest1)).toEqual(true);
      expect(bundleContains(bundle1, serviceRequest2)).toEqual(false);
      expect(bundleContains(bundle1, serviceRequest3)).toEqual(false);

      const bundle2 = await systemRepo.search({
        resourceType: 'ServiceRequest',
        filters: [
          {
            code: 'code',
            operator: Operator.EQUALS,
            value: x2,
          },
        ],
      });
      expect(bundle2.entry?.length).toEqual(1);
      expect(bundleContains(bundle2, serviceRequest1)).toEqual(false);
      expect(bundleContains(bundle2, serviceRequest2)).toEqual(true);
      expect(bundleContains(bundle2, serviceRequest3)).toEqual(false);

      const bundle3 = await systemRepo.search({
        resourceType: 'ServiceRequest',
        filters: [
          {
            code: 'code',
            operator: Operator.EQUALS,
            value: x3,
          },
        ],
      });
      expect(bundle3.entry?.length).toEqual(1);
      expect(bundleContains(bundle3, serviceRequest1)).toEqual(false);
      expect(bundleContains(bundle3, serviceRequest2)).toEqual(false);
      expect(bundleContains(bundle3, serviceRequest3)).toEqual(true);
    }));

  test('Filter by Quantity.value', () =>
    withTestContext(async () => {
      const code = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: 'Quantity' }],
      });

      const observation1 = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: { coding: [{ code }] },
        valueQuantity: { value: 1, unit: 'mg' },
      });

      const observation2 = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: { coding: [{ code }] },
        valueQuantity: { value: 5, unit: 'mg' },
      });

      const observation3 = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        code: { coding: [{ code }] },
        valueQuantity: { value: 10, unit: 'mg' },
      });

      const bundle1 = await systemRepo.search<Observation>({
        resourceType: 'Observation',
        filters: [{ code: 'code', operator: Operator.EQUALS, value: code }],
        sortRules: [{ code: 'value-quantity', descending: false }],
      });
      expect(bundle1.entry?.length).toEqual(3);
      expect(bundle1.entry?.[0]?.resource?.id).toEqual(observation1.id);
      expect(bundle1.entry?.[1]?.resource?.id).toEqual(observation2.id);
      expect(bundle1.entry?.[2]?.resource?.id).toEqual(observation3.id);

      const bundle2 = await systemRepo.search<Observation>({
        resourceType: 'Observation',
        filters: [{ code: 'code', operator: Operator.EQUALS, value: code }],
        sortRules: [{ code: 'value-quantity', descending: true }],
      });
      expect(bundle2.entry?.length).toEqual(3);
      expect(bundle2.entry?.[0]?.resource?.id).toEqual(observation3.id);
      expect(bundle2.entry?.[1]?.resource?.id).toEqual(observation2.id);
      expect(bundle2.entry?.[2]?.resource?.id).toEqual(observation1.id);

      const bundle3 = await systemRepo.search<Observation>({
        resourceType: 'Observation',
        filters: [
          { code: 'code', operator: Operator.EQUALS, value: code },
          { code: 'value-quantity', operator: Operator.GREATER_THAN, value: '8' },
        ],
      });
      expect(bundle3.entry?.length).toEqual(1);
      expect(bundle3.entry?.[0]?.resource?.id).toEqual(observation3.id);
    }));

  test('ServiceRequest.orderDetail search', () =>
    withTestContext(async () => {
      const orderDetailText = randomUUID();
      const orderDetailCode = randomUUID();

      const serviceRequest = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: {
          reference: 'Patient/' + randomUUID(),
        },
        code: {
          coding: [
            {
              code: 'order-type',
            },
          ],
        },
        orderDetail: [
          {
            text: orderDetailText,
            coding: [
              {
                system: 'custom-order-system',
                code: orderDetailCode,
              },
            ],
          },
        ],
      });

      const bundle1 = await systemRepo.search({
        resourceType: 'ServiceRequest',
        filters: [
          {
            code: 'order-detail',
            operator: Operator.CONTAINS,
            value: orderDetailText,
          },
        ],
      });
      expect(bundle1.entry?.length).toEqual(1);
      expect(bundle1.entry?.[0]?.resource?.id).toEqual(serviceRequest.id);
    }));

  test('Comma separated value', () =>
    withTestContext(async () => {
      const category = randomUUID();
      const codes = [randomUUID(), randomUUID(), randomUUID()];
      const serviceRequests = [];

      for (const code of codes) {
        const serviceRequest = await systemRepo.createResource<ServiceRequest>({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'order',
          subject: { reference: 'Patient/' + randomUUID() },
          category: [{ coding: [{ code: category }] }],
          code: { coding: [{ code: code }] },
        });
        serviceRequests.push(serviceRequest);
      }

      const bundle1 = await systemRepo.search(
        parseSearchRequest('ServiceRequest', { category, code: `${codes[0]},${codes[1]}` })
      );
      expect(bundle1.entry?.length).toEqual(2);
      expect(bundleContains(bundle1, serviceRequests[0])).toEqual(true);
      expect(bundleContains(bundle1, serviceRequests[1])).toEqual(true);
    }));

  test('Token not equals', () =>
    withTestContext(async () => {
      const category = randomUUID();
      const code1 = randomUUID();
      const code2 = randomUUID();

      const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        category: [{ coding: [{ code: category }] }],
        code: { coding: [{ code: code1 }] },
      });

      const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        category: [{ coding: [{ code: category }] }],
        code: { coding: [{ code: code2 }] },
      });

      const bundle1 = await systemRepo.search(parseSearchRequest('ServiceRequest', { category, 'code:not': code1 }));
      expect(bundle1.entry?.length).toEqual(1);
      expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
      expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);
    }));

  test('Token array not equals', () =>
    withTestContext(async () => {
      const category1 = randomUUID();
      const category2 = randomUUID();
      const code = randomUUID();

      const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        category: [{ coding: [{ code: category1 }] }],
        code: { coding: [{ code }] },
      });

      const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        category: [{ coding: [{ code: category2 }] }],
        code: { coding: [{ code }] },
      });

      const bundle1 = await systemRepo.search(
        parseSearchRequest('ServiceRequest', { code, 'category:not': category1 })
      );
      expect(bundle1.entry?.length).toEqual(1);
      expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
      expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);
    }));

  test('Null token array not equals', () =>
    withTestContext(async () => {
      const category1 = randomUUID();
      const code = randomUUID();

      const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        category: [{ coding: [{ code: category1 }] }],
        code: { coding: [{ code }] },
      });

      const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        code: { coding: [{ code }] },
      });

      const bundle1 = await systemRepo.search(
        parseSearchRequest('ServiceRequest', { code, 'category:not': category1 })
      );
      expect(bundle1.entry?.length).toEqual(1);
      expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
      expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);
    }));

  test('Missing', () =>
    withTestContext(async () => {
      const code = randomUUID();

      // Test both an array column (specimen) and a non-array column (encounter),
      // because the resulting SQL could be subtly different.

      const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: { coding: [{ code }] },
        subject: { reference: 'Patient/' + randomUUID() },
        specimen: [{ reference: 'Specimen/' + randomUUID() }],
        encounter: { reference: 'Encounter/' + randomUUID() },
      });

      const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: { coding: [{ code }] },
        subject: { reference: 'Patient/' + randomUUID() },
      });

      const bundle1 = await systemRepo.search(
        parseSearchRequest('ServiceRequest', { code, 'specimen:missing': 'true' })
      );
      expect(bundle1.entry?.length).toEqual(1);
      expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
      expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);

      const bundle2 = await systemRepo.search(
        parseSearchRequest('ServiceRequest', { code, 'specimen:missing': 'false' })
      );
      expect(bundle2.entry?.length).toEqual(1);
      expect(bundleContains(bundle2, serviceRequest1)).toEqual(true);
      expect(bundleContains(bundle2, serviceRequest2)).toEqual(false);

      const bundle3 = await systemRepo.search(
        parseSearchRequest('ServiceRequest', { code, 'encounter:missing': 'true' })
      );
      expect(bundle3.entry?.length).toEqual(1);
      expect(bundleContains(bundle3, serviceRequest1)).toEqual(false);
      expect(bundleContains(bundle3, serviceRequest2)).toEqual(true);

      const bundle4 = await systemRepo.search(
        parseSearchRequest('ServiceRequest', { code, 'encounter:missing': 'false' })
      );
      expect(bundle4.entry?.length).toEqual(1);
      expect(bundleContains(bundle4, serviceRequest1)).toEqual(true);
      expect(bundleContains(bundle4, serviceRequest2)).toEqual(false);
    }));

  test('Missing with logical (identifier) references', () =>
    withTestContext(async () => {
      const patientIdentifier = randomUUID();
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [
          {
            system: 'http://example.com/guid',
            value: patientIdentifier,
          },
        ],
        generalPractitioner: [
          {
            identifier: {
              system: 'http://hl7.org/fhir/sid/us-npi',
              value: '9876543210',
            },
          },
        ],
        managingOrganization: {
          identifier: {
            system: 'http://hl7.org/fhir/sid/us-npi',
            value: '0123456789',
          },
        },
      });

      // Test singlet reference column
      let results = await systemRepo.searchResources(
        parseSearchDefinition(`Patient?identifier=${patientIdentifier}&organization:missing=false`)
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toEqual(patient.id);

      // Test array reference column
      results = await systemRepo.searchResources(
        parseSearchDefinition(`Patient?identifier=${patientIdentifier}&general-practitioner:missing=false`)
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toEqual(patient.id);
    }));

  test('Starts after', () =>
    withTestContext(async () => {
      // Create 2 appointments
      // One with a start date of 1 second ago
      // One with a start date of 2 seconds ago
      const code = randomUUID();
      const now = new Date();
      const nowMinus1Second = new Date(now.getTime() - 1000);
      const nowMinus2Seconds = new Date(now.getTime() - 2000);
      const nowMinus3Seconds = new Date(now.getTime() - 3000);
      const patient: Patient = { resourceType: 'Patient' };
      const patientReference = createReference(patient);
      const appt1 = await systemRepo.createResource<Appointment>({
        resourceType: 'Appointment',
        status: 'booked',
        serviceType: [{ coding: [{ code }] }],
        participant: [{ status: 'accepted', actor: patientReference }],
        start: nowMinus1Second.toISOString(),
        end: now.toISOString(),
      });
      expect(appt1).toBeDefined();

      const appt2 = await systemRepo.createResource<Appointment>({
        resourceType: 'Appointment',
        status: 'booked',
        serviceType: [{ coding: [{ code }] }],
        participant: [{ status: 'accepted', actor: patientReference }],
        start: nowMinus2Seconds.toISOString(),
        end: now.toISOString(),
      });
      expect(appt2).toBeDefined();

      // Greater than (newer than) 2 seconds ago should only return appt 1
      const searchResult1 = await systemRepo.search({
        resourceType: 'Appointment',
        filters: [
          {
            code: 'service-type',
            operator: Operator.EQUALS,
            value: code,
          },
          {
            code: 'date',
            operator: Operator.STARTS_AFTER,
            value: nowMinus2Seconds.toISOString(),
          },
        ],
      });

      expect(bundleContains(searchResult1 as Bundle, appt1 as Appointment)).toEqual(true);
      expect(bundleContains(searchResult1 as Bundle, appt2 as Appointment)).toEqual(false);

      // Greater than (newer than) or equal to 2 seconds ago should return both appts
      const searchResult2 = await systemRepo.search({
        resourceType: 'Appointment',
        filters: [
          {
            code: 'service-type',
            operator: Operator.EQUALS,
            value: code,
          },
          {
            code: 'date',
            operator: Operator.GREATER_THAN_OR_EQUALS,
            value: nowMinus2Seconds.toISOString(),
          },
        ],
      });

      expect(bundleContains(searchResult2 as Bundle, appt1 as Appointment)).toEqual(true);
      expect(bundleContains(searchResult2 as Bundle, appt2 as Appointment)).toEqual(true);

      // Less than (older than) to 1 seconds ago should only return appt 2
      const searchResult3 = await systemRepo.search({
        resourceType: 'Appointment',
        filters: [
          {
            code: 'service-type',
            operator: Operator.EQUALS,
            value: code,
          },
          {
            code: 'date',
            operator: Operator.STARTS_AFTER,
            value: nowMinus3Seconds.toISOString(),
          },
          {
            code: 'date',
            operator: Operator.ENDS_BEFORE,
            value: nowMinus1Second.toISOString(),
          },
        ],
      });

      expect(bundleContains(searchResult3 as Bundle, appt1 as Appointment)).toEqual(false);
      expect(bundleContains(searchResult3 as Bundle, appt2 as Appointment)).toEqual(true);

      // Less than (older than) or equal to 1 seconds ago should return both appts
      const searchResult4 = await systemRepo.search({
        resourceType: 'Appointment',
        filters: [
          {
            code: 'service-type',
            operator: Operator.EQUALS,
            value: code,
          },
          {
            code: 'date',
            operator: Operator.STARTS_AFTER,
            value: nowMinus3Seconds.toISOString(),
          },
          {
            code: 'date',
            operator: Operator.LESS_THAN_OR_EQUALS,
            value: nowMinus1Second.toISOString(),
          },
        ],
      });

      expect(bundleContains(searchResult4 as Bundle, appt1 as Appointment)).toEqual(true);
      expect(bundleContains(searchResult4 as Bundle, appt2 as Appointment)).toEqual(true);
    }));

  test('Boolean search', () =>
    withTestContext(async () => {
      const family = randomUUID();
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
        active: true,
      });
      const searchResult = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: family,
          },
          {
            code: 'active',
            operator: Operator.EQUALS,
            value: 'true',
          },
        ],
      });
      expect(searchResult.entry).toHaveLength(1);
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);
    }));

  test('Not equals with comma separated values', () =>
    withTestContext(async () => {
      // Create 3 service requests
      // All 3 have the same category for test isolation
      // Each have a different code
      const category = randomUUID();
      const serviceRequests = [];
      for (let i = 0; i < 3; i++) {
        serviceRequests.push(
          await systemRepo.createResource({
            resourceType: 'ServiceRequest',
            status: 'active',
            intent: 'order',
            subject: { reference: 'Patient/' + randomUUID() },
            category: [{ coding: [{ code: category }] }],
            code: { coding: [{ code: randomUUID() }] },
          })
        );
      }

      // Search for service requests with category
      // and code "not equals" the first two separated by a comma
      const searchResult = await systemRepo.search({
        resourceType: 'ServiceRequest',
        filters: [
          {
            code: 'category',
            operator: Operator.EQUALS,
            value: category,
          },
          {
            code: 'code',
            operator: Operator.NOT_EQUALS,
            value: serviceRequests[0].code.coding[0].code + ',' + serviceRequests[1].code.coding[0].code,
          },
        ],
      });
      expect(searchResult.entry).toHaveLength(1);
    }));

  test('_id equals with comma separated values', () =>
    withTestContext(async () => {
      // Create 3 service requests
      const serviceRequests = [];
      for (let i = 0; i < 3; i++) {
        serviceRequests.push(
          await systemRepo.createResource<ServiceRequest>({
            resourceType: 'ServiceRequest',
            status: 'active',
            intent: 'order',
            subject: { reference: 'Patient/' + randomUUID() },
            code: { text: randomUUID() },
          })
        );
      }

      // Search for service requests with _id equals the first two separated by a comma
      const searchResult = await systemRepo.search({
        resourceType: 'ServiceRequest',
        filters: [
          {
            code: '_id',
            operator: Operator.EQUALS,
            value: serviceRequests[0].id + ',' + serviceRequests[1].id,
          },
        ],
      });
      expect(searchResult.entry).toHaveLength(2);
    }));

  test('Error on invalid search parameter', async () => {
    try {
      await systemRepo.search({
        resourceType: 'ServiceRequest',
        filters: [
          {
            code: 'basedOn', // should be "based-on"
            operator: Operator.EQUALS,
            value: 'ServiceRequest/123',
          },
        ],
      });
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toEqual('Unknown search parameter: basedOn');
    }
  });

  test('Patient search without resource type', () =>
    withTestContext(async () => {
      // Create Patient
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
      });

      // Create AllergyIntolerance
      const allergyIntolerance = await systemRepo.createResource<AllergyIntolerance>({
        resourceType: 'AllergyIntolerance',
        patient: createReference(patient),
        clinicalStatus: { text: 'active' },
      });

      // Search by patient
      const searchResult = await systemRepo.search({
        resourceType: 'AllergyIntolerance',
        filters: [
          {
            code: 'patient',
            operator: Operator.EQUALS,
            value: patient.id as string,
          },
        ],
      });
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(allergyIntolerance.id);
    }));

  test('Subject search without resource type', () =>
    withTestContext(async () => {
      // Create Patient
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
      });

      // Create Observation
      const observation = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: createReference(patient),
      });

      // Search by patient
      const searchResult = await systemRepo.search({
        resourceType: 'Observation',
        filters: [
          {
            code: 'subject',
            operator: Operator.EQUALS,
            value: patient.id as string,
          },
        ],
      });
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(observation.id);
    }));

  test('Chained search on array columns', () =>
    withTestContext(async () => {
      // Create Practitioner
      const pcp = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
      });
      // Create Patient
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        generalPractitioner: [createReference(pcp)],
      });

      // Create CareTeam
      const code = randomUUID();
      const categorySystem = 'http://example.com/care-team-category';
      await systemRepo.createResource<CareTeam>({
        resourceType: 'CareTeam',
        category: [
          {
            coding: [
              {
                system: categorySystem,
                code,
                display: 'Public health-focused care team',
              },
            ],
          },
        ],
        participant: [{ member: createReference(pcp) }],
      });

      // Search chain
      const searchResult = await systemRepo.search(
        parseSearchDefinition(
          `Patient?general-practitioner:Practitioner._has:CareTeam:participant:category=${categorySystem}|${code}`
        )
      );
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);
    }));

  test('Chained search on singlet columns', () =>
    withTestContext(async () => {
      const code = randomUUID();
      // Create linked resources
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
      });
      const encounter = await systemRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        status: 'finished',
        class: { system: 'http://example.com/appt-type', code },
      });
      const observation = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Throat culture' },
        subject: createReference(patient),
        encounter: createReference(encounter),
      });
      await systemRepo.createResource<DiagnosticReport>({
        resourceType: 'DiagnosticReport',
        status: 'final',
        code: { text: 'Strep test' },
        encounter: createReference(encounter),
        result: [createReference(observation)],
      });

      const result = await systemRepo.search(
        parseSearchDefinition(`Patient?_has:Observation:subject:encounter:Encounter.class=${code}`)
      );
      expect(result.entry?.[0]?.resource?.id).toEqual(patient.id);
    }));

  test('Rejects too long chained search', () =>
    withTestContext(async () => {
      await expect(() =>
        systemRepo.search(
          parseSearchDefinition(
            `Patient?_has:Observation:subject:encounter:Encounter._has:DiagnosticReport:encounter:result.specimen.parent.collected=2023`
          )
        )
      ).rejects.toEqual(new Error('Search chains longer than three links are not currently supported'));
    }));

  test.each([
    ['Patient?organization.invalid.name=Kaiser', 'Invalid search parameter in chain: Organization?invalid'],
    ['Patient?organization.invalid=true', 'Invalid search parameter at end of chain: Organization?invalid'],
    [
      'Patient?general-practitioner.qualification-period=2023',
      'Unable to identify next resource type for search parameter: Patient?general-practitioner',
    ],
    ['Patient?_has:Observation:invalid:status=active', 'Invalid search parameter in chain: Observation?invalid'],
    [
      'Patient?_has:Observation:encounter:status=active',
      'Invalid reverse chain link: search parameter Observation?encounter does not refer to Patient',
    ],
    ['Patient?_has:Observation:status=active', 'Invalid search chain: _has:Observation:status'],
  ])('Invalid chained search parameters: %s', (searchString: string, errorMsg: string) => {
    return expect(systemRepo.search(parseSearchDefinition(searchString))).rejects.toEqual(new Error(errorMsg));
  });

  test('Include references success', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });
      const order = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
      });
      const bundle = await systemRepo.search({
        resourceType: 'ServiceRequest',
        include: [
          {
            resourceType: 'ServiceRequest',
            searchParam: 'subject',
          },
        ],
        total: 'accurate',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: order.id as string }],
      });
      expect(bundle.total).toEqual(1);
      expect(bundleContains(bundle, order)).toBeTruthy();
      expect(bundleContains(bundle, patient)).toBeTruthy();
    }));

  test('Include canonical success', () =>
    withTestContext(async () => {
      const canonicalURL = 'http://example.com/fhir/Questionnaire/PHQ-9/' + randomUUID();
      const questionnaire = await systemRepo.createResource<Questionnaire>({
        resourceType: 'Questionnaire',
        status: 'active',
        url: canonicalURL,
      });
      const response = await systemRepo.createResource<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        questionnaire: canonicalURL,
      });
      const bundle = await systemRepo.search({
        resourceType: 'QuestionnaireResponse',
        include: [
          {
            resourceType: 'QuestionnaireResponse',
            searchParam: 'questionnaire',
          },
        ],
        total: 'accurate',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: response.id as string }],
      });
      expect(bundle.total).toEqual(1);
      expect(bundleContains(bundle, response)).toBeTruthy();
      expect(bundleContains(bundle, questionnaire)).toBeTruthy();
    }));

  test('Include PlanDefinition mixed types', () =>
    withTestContext(async () => {
      const canonical = 'http://example.com/fhir/R4/ActivityDefinition/' + randomUUID();
      const uri = 'http://example.com/fhir/R4/ActivityDefinition/' + randomUUID();
      const plan = await systemRepo.createResource<PlanDefinition>({
        resourceType: 'PlanDefinition',
        status: 'active',
        action: [{ definitionCanonical: canonical }, { definitionUri: uri }],
      });
      const activity1 = await systemRepo.createResource<ActivityDefinition>({
        resourceType: 'ActivityDefinition',
        status: 'active',
        url: canonical,
      });
      const activity2 = await systemRepo.createResource<ActivityDefinition>({
        resourceType: 'ActivityDefinition',
        status: 'active',
        url: uri,
      });
      const bundle = await systemRepo.search({
        resourceType: 'PlanDefinition',
        include: [
          {
            resourceType: 'PlanDefinition',
            searchParam: 'definition',
          },
        ],
        total: 'accurate',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: plan.id as string }],
      });
      expect(bundle.total).toEqual(1);
      expect(bundleContains(bundle, plan)).toBeTruthy();
      expect(bundleContains(bundle, activity1)).toBeTruthy();
      expect(bundleContains(bundle, activity2)).toBeTruthy();
    }));

  test('Include references invalid search param', async () => {
    try {
      await systemRepo.search({
        resourceType: 'ServiceRequest',
        include: [
          {
            resourceType: 'ServiceRequest',
            searchParam: 'xyz',
          },
        ],
      });
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toEqual('Invalid include parameter: ServiceRequest:xyz');
    }
  });

  test('Reverse include Provenance', () =>
    withTestContext(async () => {
      const family = randomUUID();

      const practitioner1 = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        name: [{ given: ['Homer'], family }],
      });

      const practitioner2 = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        name: [{ given: ['Marge'], family }],
      });

      const searchRequest: SearchRequest = {
        resourceType: 'Practitioner',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: family }],
        revInclude: [
          {
            resourceType: 'Provenance',
            searchParam: 'target',
          },
        ],
      };

      const searchResult1 = await systemRepo.search(searchRequest);
      expect(searchResult1.entry).toHaveLength(2);
      expect(bundleContains(searchResult1, practitioner1)).toBeTruthy();
      expect(bundleContains(searchResult1, practitioner2)).toBeTruthy();

      const provenance1 = await systemRepo.createResource<Provenance>({
        resourceType: 'Provenance',
        target: [createReference(practitioner1)],
        agent: [{ who: createReference(practitioner1) }],
        recorded: new Date().toISOString(),
      });

      const provenance2 = await systemRepo.createResource<Provenance>({
        resourceType: 'Provenance',
        target: [createReference(practitioner2)],
        agent: [{ who: createReference(practitioner2) }],
        recorded: new Date().toISOString(),
      });

      const searchResult2 = await systemRepo.search(searchRequest);
      expect(searchResult2.entry).toHaveLength(4);
      expect(bundleContains(searchResult2, practitioner1)).toBeTruthy();
      expect(bundleContains(searchResult2, practitioner2)).toBeTruthy();
      expect(bundleContains(searchResult2, provenance1)).toBeTruthy();
      expect(bundleContains(searchResult2, provenance2)).toBeTruthy();
    }));

  test('Reverse include canonical', () =>
    withTestContext(async () => {
      const canonicalURL = 'http://example.com/fhir/Questionnaire/PHQ-9/' + randomUUID();
      const questionnaire = await systemRepo.createResource<Questionnaire>({
        resourceType: 'Questionnaire',
        status: 'active',
        url: canonicalURL,
      });
      const response = await systemRepo.createResource<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        questionnaire: canonicalURL,
      });
      const bundle = await systemRepo.search({
        resourceType: 'Questionnaire',
        revInclude: [
          {
            resourceType: 'QuestionnaireResponse',
            searchParam: 'questionnaire',
          },
        ],
        total: 'accurate',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: questionnaire.id as string }],
      });
      expect(bundle.total).toEqual(1);
      expect(bundleContains(bundle, response)).toBeTruthy();
      expect(bundleContains(bundle, questionnaire)).toBeTruthy();
    }));

  test('_include:iterate', () =>
    withTestContext(async () => {
      /*
    Construct resources for the search to operate on.  The test search query and resource graph it will act on are shown below.
    
    Query: /Patient?identifier=patient
      &_include=Patient:organization
      &_include:iterate=Patient:link
      &_include:iterate=Patient:general-practitioner

    ┌──────────────────────────────────┐            
    │patient                           │            
    └┬────────┬────────┬────────┬─────┬┘            
    ┌▽──────┐┌▽──────┐┌▽──────┐┌▽───┐┌▽────────────┐
    │linked2││linked1││related││org1││practitioner1│
    └┬──────┘└┬──────┘└───────┘└────┘└─────────────┘
     │┌───────▽───────┐
     ││linked3        │
     │└┬────────────┬─┘                
    ┌▽─▽──────────┐┌▽─────┐                         
    │practitioner2││org2 *│                         
    └─────────────┘└──────┘                         
      * omitted from search results

    This verifies the following behaviors of the :iterate modifier:
    1. _include w/ :iterate recursively applies the same parameter (Patient:link)
    2. _include w/ :iterate applies to resources from other _include parameters (Patient:general-practitioner)
    3. _include w/o :iterate does not apply recursively (Patient:organization)
    4. Resources which are included multiple times are deduplicated in the search results
    */
      const rootPatientIdentifier = randomUUID();
      const organization1 = await systemRepo.createResource<Organization>({
        resourceType: 'Organization',
        name: 'org1',
      });
      const organization2 = await systemRepo.createResource<Organization>({
        resourceType: 'Organization',
        name: 'org2',
      });
      const practitioner1 = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });
      const practitioner2 = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });
      const linked3 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        managingOrganization: { reference: `Organization/${organization2.id}` },
        generalPractitioner: [
          {
            reference: `Practitioner/${practitioner2.id}`,
          },
        ],
      });
      const linked1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        link: [
          {
            other: { reference: `Patient/${linked3.id}` },
            type: 'replaces',
          },
        ],
      });
      const linked2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        generalPractitioner: [
          {
            reference: `Practitioner/${practitioner2.id}`,
          },
        ],
      });
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [
          {
            value: rootPatientIdentifier,
          },
        ],
        link: [
          {
            other: { reference: `Patient/${linked1.id}` },
            type: 'replaces',
          },
          {
            other: { reference: `Patient/${linked2.id}` },
            type: 'replaces',
          },
        ],
        managingOrganization: {
          reference: `Organization/${organization1.id}`,
        },
        generalPractitioner: [
          {
            reference: `Practitioner/${practitioner1.id}`,
          },
        ],
      });

      // Run the test search query
      const bundle = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: rootPatientIdentifier,
          },
        ],
        include: [
          { resourceType: 'Patient', searchParam: 'organization' },
          { resourceType: 'Patient', searchParam: 'link', modifier: Operator.ITERATE },
          { resourceType: 'Patient', searchParam: 'general-practitioner', modifier: Operator.ITERATE },
        ],
      });

      const expected = [
        `Patient/${patient.id}`,
        `Patient/${linked1.id}`,
        `Patient/${linked2.id}`,
        `Patient/${linked3.id}`,
        `Organization/${organization1.id}`,
        `Practitioner/${practitioner1.id}`,
        `Practitioner/${practitioner2.id}`,
      ].sort();

      expect(bundle.entry?.map((e) => `${e.resource?.resourceType}/${e.resource?.id}`).sort()).toEqual(expected);
    }));

  test('_revinclude:iterate', () =>
    withTestContext(async () => {
      /*
    Construct resources for the search to operate on.  The test search query and resource graph it will act on are shown below.
    
    Query: /Patient?identifier=patient
      &_revinclude=Patient:link
      &_revinclude:iterate=Observation:subject
      &_revinclude:iterate=Observation:has-member

    ┌─────────┐┌────────────┐┌────────────┐
    │linked3 *││observation3││observation4│
    └┬────────┘└┬───────────┘└┬───────────┘
    ┌▽──────┐┌──▽────┐┌───────▽────┐       
    │linked1││linked2││observation2│       
    └┬──────┘└┬──────┘└┬───────────┘       
     │        │┌───────▽─────────┐         
     │        ││observation1     │         
     │        │└┬────────────────┘         
    ┌▽────────▽─▽┐                         
    │patient     │                         
    └────────────┘                         
      * omitted from search results

    This verifies the following behaviors of the :iterate modifier:
    1. _revinclude w/ :iterate recursively applies the same parameter (Observation:has-member)
    2. _revinclude w/ :iterate applies to resources from other _revinclude parameters (Observation:subject)
    3. _revinclude w/o :iterate does not apply recursively (Patient:link)
    */
      const rootPatientIdentifier = randomUUID();
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [
          {
            value: rootPatientIdentifier,
          },
        ],
      });
      const linked1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        link: [
          {
            other: { reference: `Patient/${patient.id}` },
            type: 'replaced-by',
          },
        ],
      });
      const linked2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        link: [
          {
            other: { reference: `Patient/${patient.id}` },
            type: 'replaced-by',
          },
        ],
      });
      await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        link: [
          {
            other: { reference: `Patient/${linked1.id}` },
            type: 'replaced-by',
          },
        ],
      });
      const baseObservation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [
            {
              system: LOINC,
              code: 'fake',
            },
          ],
        },
      };
      const observation1 = await systemRepo.createResource<Observation>({
        ...baseObservation,
        subject: {
          reference: `Patient/${patient.id}`,
        },
      });
      const observation2 = await systemRepo.createResource<Observation>({
        ...baseObservation,
        subject: {
          display: 'Alex J. Chalmers',
        },
        hasMember: [
          {
            reference: `Observation/${observation1.id}`,
          },
        ],
      });
      const observation3 = await systemRepo.createResource<Observation>({
        ...baseObservation,
        subject: {
          reference: `Patient/${linked2.id}`,
        },
      });
      const observation4 = await systemRepo.createResource<Observation>({
        ...baseObservation,
        subject: {
          display: 'Alex J. Chalmers',
        },
        hasMember: [
          {
            reference: `Observation/${observation2.id}`,
          },
        ],
      });

      // Run the test search query
      const bundle = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: rootPatientIdentifier,
          },
        ],
        revInclude: [
          { resourceType: 'Patient', searchParam: 'link' },
          { resourceType: 'Observation', searchParam: 'subject', modifier: Operator.ITERATE },
          { resourceType: 'Observation', searchParam: 'has-member', modifier: Operator.ITERATE },
        ],
      });

      const expected = [
        `Patient/${patient.id}`,
        `Patient/${linked1.id}`,
        `Patient/${linked2.id}`,
        `Observation/${observation1.id}`,
        `Observation/${observation2.id}`,
        `Observation/${observation3.id}`,
        `Observation/${observation4.id}`,
      ].sort();

      expect(bundle.entry?.map((e) => `${e.resource?.resourceType}/${e.resource?.id}`).sort()).toEqual(expected);
    }));

  test('_include depth limit', () =>
    withTestContext(async () => {
      const rootPatientIdentifier = randomUUID();
      const linked6 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
      });
      const linked5 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        link: [
          {
            other: { reference: `Patient/${linked6.id}` },
            type: 'replaces',
          },
        ],
      });
      const linked4 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        link: [
          {
            other: { reference: `Patient/${linked5.id}` },
            type: 'replaces',
          },
        ],
      });
      const linked3 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        link: [
          {
            other: { reference: `Patient/${linked4.id}` },
            type: 'replaces',
          },
        ],
      });
      const linked2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        link: [
          {
            other: { reference: `Patient/${linked3.id}` },
            type: 'replaces',
          },
        ],
      });
      const linked1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        link: [
          {
            other: { reference: `Patient/${linked2.id}` },
            type: 'replaces',
          },
        ],
      });
      await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [
          {
            value: rootPatientIdentifier,
          },
        ],
        link: [
          {
            other: { reference: `Patient/${linked1.id}` },
            type: 'replaces',
          },
        ],
      });

      return expect(
        systemRepo.search({
          resourceType: 'Patient',
          filters: [
            {
              code: 'identifier',
              operator: Operator.EQUALS,
              value: rootPatientIdentifier,
            },
          ],
          include: [{ resourceType: 'Patient', searchParam: 'link', modifier: Operator.ITERATE }],
        })
      ).rejects.toBeDefined();
    }));

  test('_include on empty search results', async () => {
    return expect(
      systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: randomUUID(),
          },
        ],
        include: [{ resourceType: 'Patient', searchParam: 'link', modifier: Operator.ITERATE }],
      })
    ).resolves.toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
      total: undefined,
    });
  });

  test('DiagnosticReport category with system', () =>
    withTestContext(async () => {
      const code = randomUUID();
      const dr = await systemRepo.createResource<DiagnosticReport>({
        resourceType: 'DiagnosticReport',
        status: 'final',
        code: { coding: [{ code }] },
        category: [{ coding: [{ system: LOINC, code: 'LP217198-3' }] }],
      });

      const bundle = await systemRepo.search({
        resourceType: 'DiagnosticReport',
        filters: [
          {
            code: 'code',
            operator: Operator.EQUALS,
            value: code,
          },
          {
            code: 'category',
            operator: Operator.EQUALS,
            value: `${LOINC}|LP217198-3`,
          },
        ],
        count: 1,
      });

      expect(bundleContains(bundle, dr)).toBeTruthy();
    }));

  test('Encounter.period date search', () =>
    withTestContext(async () => {
      const e = await systemRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        identifier: [{ value: randomUUID() }],
        status: 'finished',
        class: { code: 'test' },
        period: {
          start: '2020-02-01',
          end: '2020-02-02',
        },
      });

      const bundle = await systemRepo.search({
        resourceType: 'Encounter',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: e.identifier?.[0]?.value as string,
          },
          {
            code: 'date',
            operator: Operator.GREATER_THAN,
            value: '2020-01-01',
          },
        ],
        count: 1,
      });

      expect(bundleContains(bundle, e)).toBeTruthy();
    }));

  test('Encounter.period dateTime search', () =>
    withTestContext(async () => {
      const e = await systemRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        identifier: [{ value: randomUUID() }],
        status: 'finished',
        class: { code: 'test' },
        period: {
          start: '2020-02-01T13:30:00Z',
          end: '2020-02-01T14:15:00Z',
        },
      });

      const bundle = await systemRepo.search({
        resourceType: 'Encounter',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: e.identifier?.[0]?.value as string,
          },
          {
            code: 'date',
            operator: Operator.GREATER_THAN,
            value: '2020-02-01T12:00Z',
          },
        ],
        count: 1,
      });

      expect(bundleContains(bundle, e)).toBeTruthy();
    }));

  test('Condition.code system search', () =>
    withTestContext(async () => {
      const p = await systemRepo.createResource({
        resourceType: 'Patient',
        name: [{ family: randomUUID() }],
      });

      const c1 = await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        subject: createReference(p),
        code: { coding: [{ system: SNOMED, code: '165002' }] },
      });

      const c2 = await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        subject: createReference(p),
        code: { coding: [{ system: 'https://example.com', code: 'test' }] },
      });

      const bundle = await systemRepo.search({
        resourceType: 'Condition',
        filters: [
          {
            code: 'subject',
            operator: Operator.EQUALS,
            value: getReferenceString(p),
          },
          {
            code: 'code',
            operator: Operator.EQUALS,
            value: `${SNOMED}|`,
          },
        ],
      });

      expect(bundle.entry?.length).toEqual(1);
      expect(bundleContains(bundle, c1)).toBeTruthy();
      expect(bundleContains(bundle, c2)).not.toBeTruthy();
    }));

  test('Condition.code :not next URL', () =>
    withTestContext(async () => {
      const p = await systemRepo.createResource({
        resourceType: 'Patient',
        name: [{ family: randomUUID() }],
      });

      await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        subject: createReference(p),
        code: { coding: [{ system: SNOMED, code: '165002' }] },
      });

      await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        subject: createReference(p),
        code: { coding: [{ system: 'https://example.com', code: 'test' }] },
      });

      const bundle = await systemRepo.search(
        parseSearchUrl(
          new URL(`https://x/Condition?subject=${getReferenceString(p)}&code:not=x&_count=1&_total=accurate`)
        )
      );
      expect(bundle.entry?.length).toEqual(1);

      const nextUrl = bundle.link?.find((l) => l.relation === 'next')?.url;
      expect(nextUrl).toBeDefined();
      expect(nextUrl).toContain('code:not=x');
    }));

  test('Condition.code :in search', () =>
    withTestContext(async () => {
      // ValueSet: http://hl7.org/fhir/ValueSet/condition-code
      // compose includes codes from http://snomed.info/sct
      // but does not include codes from https://example.com

      const p = await systemRepo.createResource({
        resourceType: 'Patient',
        name: [{ family: randomUUID() }],
      });

      const c1 = await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        subject: createReference(p),
        code: { coding: [{ system: SNOMED, code: '165002' }] },
      });

      const c2 = await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        subject: createReference(p),
        code: { coding: [{ system: 'https://example.com', code: 'test' }] },
      });

      const bundle = await systemRepo.search({
        resourceType: 'Condition',
        filters: [
          {
            code: 'subject',
            operator: Operator.EQUALS,
            value: getReferenceString(p),
          },
          {
            code: 'code',
            operator: Operator.IN,
            value: 'http://hl7.org/fhir/ValueSet/condition-code',
          },
        ],
      });

      expect(bundle.entry?.length).toEqual(1);
      expect(bundleContains(bundle, c1)).toBeTruthy();
      expect(bundleContains(bundle, c2)).not.toBeTruthy();
    }));

  test('Reference identifier search', () =>
    withTestContext(async () => {
      const code = randomUUID();

      const c1 = await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        code: { coding: [{ code }] },
        subject: { identifier: { system: 'mrn', value: '123456' } },
      });

      const c2 = await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        code: { coding: [{ code }] },
        subject: { identifier: { system: 'xyz', value: '123456' } },
      });

      // Search with system
      const bundle1 = await systemRepo.search(
        parseSearchDefinition(`Condition?code=${code}&subject:identifier=mrn|123456`)
      );
      expect(bundle1.entry?.length).toEqual(1);
      expect(bundleContains(bundle1, c1)).toBeTruthy();
      expect(bundleContains(bundle1, c2)).not.toBeTruthy();

      // Search without system
      const bundle2 = await systemRepo.search(
        parseSearchDefinition(`Condition?code=${code}&subject:identifier=123456`)
      );
      expect(bundle2.entry?.length).toEqual(2);
      expect(bundleContains(bundle2, c1)).toBeTruthy();
      expect(bundleContains(bundle2, c2)).toBeTruthy();

      // Search with count
      const bundle3 = await systemRepo.search(
        parseSearchDefinition(`Condition?code=${code}&subject:identifier=mrn|123456&_total=accurate`)
      );
      expect(bundle3.entry?.length).toEqual(1);
      expect(bundle3.total).toBe(1);
      expect(bundleContains(bundle3, c1)).toBeTruthy();
      expect(bundleContains(bundle3, c2)).not.toBeTruthy();
    }));

  test('Task patient identifier search', () =>
    withTestContext(async () => {
      const identifier = randomUUID();

      // Create a Task with a patient identifier reference _with_ Reference.type
      const task1 = await systemRepo.createResource<Task>({
        resourceType: 'Task',
        status: 'accepted',
        intent: 'order',
        for: {
          type: 'Patient',
          identifier: { system: 'mrn', value: identifier },
        },
      });

      // Create a Task with a patient identifier reference _without_ Reference.type
      const task2 = await systemRepo.createResource<Task>({
        resourceType: 'Task',
        status: 'accepted',
        intent: 'order',
        for: {
          identifier: { system: 'mrn', value: identifier },
        },
      });

      // Search by "subject"
      // This will include both Tasks, because the "subject" search parameter does not care about "type"
      const bundle1 = await systemRepo.search(
        parseSearchDefinition(`Task?subject:identifier=mrn|${identifier}&_total=accurate`)
      );
      expect(bundle1.total).toEqual(2);
      expect(bundle1.entry?.length).toEqual(2);
      expect(bundleContains(bundle1, task1)).toBeTruthy();
      expect(bundleContains(bundle1, task2)).toBeTruthy();

      // Search by "patient"
      // This will only include the Task with the explicit "Patient" type, because the "patient" search parameter does care about "type"
      const bundle2 = await systemRepo.search(
        parseSearchDefinition(`Task?patient:identifier=mrn|${identifier}&_total=accurate`)
      );
      expect(bundle2.total).toEqual(1);
      expect(bundle2.entry?.length).toEqual(1);
      expect(bundleContains(bundle2, task1)).toBeTruthy();
      expect(bundleContains(bundle2, task2)).not.toBeTruthy();
    }));

  test('Resource search params', () =>
    withTestContext(async () => {
      const patientIdentifier = randomUUID();
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [{ system: 'http://example.com', value: patientIdentifier }],
        meta: {
          profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
          security: [{ system: 'http://hl7.org/fhir/v3/Confidentiality', code: 'N' }],
          source: 'http://example.org',
          tag: [{ system: 'http://hl7.org/fhir/v3/ObservationValue', code: 'SUBSETTED' }],
        },
      });
      const identifierFilter = {
        code: 'identifier',
        operator: Operator.EQUALS,
        value: patientIdentifier,
      };

      const bundle1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          identifierFilter,
          {
            code: '_profile',
            operator: Operator.EQUALS,
            value: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
          },
        ],
      });
      expect(bundleContains(bundle1, patient)).toBeTruthy();

      const bundle2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          identifierFilter,
          {
            code: '_security',
            operator: Operator.EQUALS,
            value: 'http://hl7.org/fhir/v3/Confidentiality|N',
          },
        ],
      });
      expect(bundleContains(bundle2, patient)).toBeTruthy();

      const bundle3 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          identifierFilter,
          {
            code: '_source',
            operator: Operator.EQUALS,
            value: 'http://example.org',
          },
        ],
      });
      expect(bundleContains(bundle3, patient)).toBeTruthy();

      const bundle4 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          identifierFilter,
          {
            code: '_tag',
            operator: Operator.EQUALS,
            value: 'http://hl7.org/fhir/v3/ObservationValue|SUBSETTED',
          },
        ],
      });
      expect(bundleContains(bundle4, patient)).toBeTruthy();
    }));

  test('Token :text search', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });

      const obs1 = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: randomUUID() },
        subject: createReference(patient),
      });

      const obs2 = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ display: randomUUID() }] },
        subject: createReference(patient),
      });

      const result1 = await systemRepo.search({
        resourceType: 'Observation',
        filters: [{ code: 'code', operator: Operator.TEXT, value: obs1.code?.text as string }],
      });
      expect(result1.entry?.[0]?.resource?.id).toEqual(obs1.id);

      const result2 = await systemRepo.search({
        resourceType: 'Observation',
        filters: [{ code: 'code', operator: Operator.TEXT, value: obs2.code?.coding?.[0]?.display as string }],
      });
      expect(result2.entry?.[0]?.resource?.id).toEqual(obs2.id);
    }));

  test('_filter search', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });
      const statuses: ('preliminary' | 'final')[] = ['preliminary', 'final'];
      const codes = ['123', '456'];
      const observations = [];

      for (const status of statuses) {
        for (const code of codes) {
          observations.push(
            await systemRepo.createResource<Observation>({
              resourceType: 'Observation',
              subject: createReference(patient),
              status,
              code: { coding: [{ code }] },
            })
          );
        }
      }

      const result = await systemRepo.search({
        resourceType: 'Observation',
        filters: [
          {
            code: 'subject',
            operator: Operator.EQUALS,
            value: getReferenceString(patient),
          },
          {
            code: '_filter',
            operator: Operator.EQUALS,
            value: '(status eq preliminary and code eq 123) or (not (status eq preliminary) and code eq 456)',
          },
        ],
      });
      expect(result.entry).toHaveLength(2);
    }));

  test('_filter ne', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Eve'] }],
        managingOrganization: { reference: 'Organization/' + randomUUID() },
      });

      const result = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'organization',
            operator: Operator.EQUALS,
            value: patient.managingOrganization?.reference as string,
          },
          {
            code: '_filter',
            operator: Operator.EQUALS,
            value: 'given ne Eve',
          },
        ],
      });

      expect(result.entry).toHaveLength(0);
    }));

  test('_filter re', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Eve'] }],
        managingOrganization: { reference: 'Organization/' + randomUUID() },
      });

      const result = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: '_filter',
            operator: Operator.EQUALS,
            value: 'organization re ' + patient.managingOrganization?.reference,
          },
        ],
      });

      expect(result.entry).toHaveLength(1);
      expect(result.entry?.[0]?.resource?.id).toEqual(patient.id);
    }));

  test('Lookup table exact match with comma disjunction', () =>
    withTestContext(async () => {
      const family = randomUUID();
      const p1 = await systemRepo.createResource({ resourceType: 'Patient', name: [{ given: ['x'], family }] });
      const p2 = await systemRepo.createResource({ resourceType: 'Patient', name: [{ given: ['xx'], family }] });
      const p3 = await systemRepo.createResource({ resourceType: 'Patient', name: [{ given: ['y'], family }] });
      const p4 = await systemRepo.createResource({ resourceType: 'Patient', name: [{ given: ['yy'], family }] });

      const bundle = await systemRepo.search({
        resourceType: 'Patient',
        total: 'accurate',
        filters: [
          {
            code: 'given',
            operator: Operator.EXACT,
            value: 'x,y',
          },
          {
            code: 'family',
            operator: Operator.EXACT,
            value: family,
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(2);
      expect(bundle.total).toEqual(2);
      expect(bundleContains(bundle, p1)).toBeTruthy();
      expect(bundleContains(bundle, p2)).not.toBeTruthy();
      expect(bundleContains(bundle, p3)).toBeTruthy();
      expect(bundleContains(bundle, p4)).not.toBeTruthy();
    }));

  test('Duplicate rows from token lookup', () =>
    withTestContext(async () => {
      const code = randomUUID();

      const p = await systemRepo.createResource({ resourceType: 'Patient' });
      const s = await systemRepo.createResource({
        resourceType: 'ServiceRequest',
        subject: createReference(p),
        status: 'active',
        intent: 'order',
        category: [
          {
            text: code,
            coding: [
              {
                system: 'https://example.com/category',
                code,
              },
            ],
          },
        ],
      });

      const bundle = await systemRepo.search<ServiceRequest>({
        resourceType: 'ServiceRequest',
        filters: [{ code: 'category', operator: Operator.EQUALS, value: code }],
      });
      expect(bundle.entry?.length).toEqual(1);
      expect(bundleContains(bundle, s)).toBeTruthy();
    }));

  test('Filter task by due date', () =>
    withTestContext(async () => {
      const code = randomUUID();

      // Create 3 tasks
      // Mix of "no due date", using "start", and using "end"
      const task1 = await systemRepo.createResource<Task>({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: { coding: [{ code }] },
      });
      const task2 = await systemRepo.createResource<Task>({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: { coding: [{ code }] },
        restriction: { period: { start: '2023-06-02T00:00:00.000Z' } },
      });
      const task3 = await systemRepo.createResource<Task>({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: { coding: [{ code }] },
        restriction: { period: { end: '2023-06-03T00:00:00.000Z' } },
      });

      // Sort and filter by due date
      const bundle = await systemRepo.search<Task>({
        resourceType: 'Task',
        filters: [
          { code: 'code', operator: Operator.EQUALS, value: code },
          { code: 'due-date', operator: Operator.GREATER_THAN, value: '2023-06-01T00:00:00.000Z' },
        ],
        sortRules: [{ code: 'due-date' }],
      });
      expect(bundle.entry?.length).toEqual(2);
      expect(bundle.entry?.[0]?.resource?.id).toEqual(task2.id);
      expect(bundle.entry?.[1]?.resource?.id).toEqual(task3.id);
      expect(bundleContains(bundle, task1)).not.toBeTruthy();
    }));

  test('Get estimated count with filter on human name', async () => {
    const result = await systemRepo.search({
      resourceType: 'Patient',
      total: 'estimate',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'John',
        },
      ],
    });
    expect(result.total).toBeDefined();
    expect(typeof result.total).toBe('number');
  });

  test('Organization by name', () =>
    withTestContext(async () => {
      const org = await systemRepo.createResource<Organization>({
        resourceType: 'Organization',
        name: randomUUID(),
      });
      const result = await systemRepo.search({
        resourceType: 'Organization',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: `wrongname,${(org.name as string).slice(0, 5)}`,
          },
        ],
      });
      expect(result.entry?.length).toBe(1);
    }));

  test('Patient by name with stop word', () =>
    withTestContext(async () => {
      const seed = randomUUID();
      await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [
          {
            given: [seed + 'Justin', 'Wynn'],
            family: 'Sanders' + seed,
          },
        ],
      });
      const result = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.CONTAINS,
            value: `${seed.slice(-3)}just`,
          },
        ],
      });
      expect(result.entry?.length).toBe(1);
    }));

  test('Sort by ID', () =>
    withTestContext(async () => {
      const org = await systemRepo.createResource<Organization>({ resourceType: 'Organization', name: 'org1' });
      const managingOrganization = createReference(org);
      await systemRepo.createResource<Patient>({ resourceType: 'Patient', managingOrganization });
      await systemRepo.createResource<Patient>({ resourceType: 'Patient', managingOrganization });

      const result1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: 'organization', operator: Operator.EQUALS, value: getReferenceString(org) }],
        sortRules: [{ code: '_id', descending: false }],
      });
      expect(result1.entry).toHaveLength(2);
      expect(result1.entry?.[0]?.resource?.id?.localeCompare(result1.entry?.[1]?.resource?.id as string)).toBe(-1);

      const result2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: 'organization', operator: Operator.EQUALS, value: getReferenceString(org) }],
        sortRules: [{ code: '_id', descending: true }],
      });
      expect(result2.entry).toHaveLength(2);
      expect(result2.entry?.[0]?.resource?.id?.localeCompare(result2.entry?.[1]?.resource?.id as string)).toBe(1);
    }));

  test('Numeric parameter', () =>
    withTestContext(async () => {
      const ident = randomUUID();
      const riskAssessment: RiskAssessment = {
        resourceType: 'RiskAssessment',
        status: 'final',
        identifier: [{ value: ident }],
        subject: {
          reference: 'Patient/test',
        },
        prediction: [
          {
            outcome: { text: 'Breast Cancer' },
            probabilityDecimal: 0.000168,
            whenRange: {
              high: { value: 53, unit: 'years' },
            },
          },
          {
            outcome: { text: 'Breast Cancer' },
            probabilityDecimal: 0.000368,
            whenRange: {
              low: { value: 54, unit: 'years' },
              high: { value: 57, unit: 'years' },
            },
          },
          {
            outcome: { text: 'Breast Cancer' },
            probabilityDecimal: 0.000594,
            whenRange: {
              low: { value: 58, unit: 'years' },
              high: { value: 62, unit: 'years' },
            },
          },
          {
            outcome: { text: 'Breast Cancer' },
            probabilityDecimal: 0.000838,
            whenRange: {
              low: { value: 63, unit: 'years' },
              high: { value: 67, unit: 'years' },
            },
          },
        ],
      };

      await systemRepo.createResource(riskAssessment);
      const result = await systemRepo.search({
        resourceType: 'RiskAssessment',
        filters: [
          { code: 'identifier', operator: Operator.EQUALS, value: ident },
          { code: 'probability', operator: Operator.GREATER_THAN, value: '0.0005' },
        ],
      });
      expect(result.entry).toHaveLength(1);
    }));

  test('Disjunction with lookup tables', () =>
    withTestContext(async () => {
      const n1 = randomUUID();
      const n2 = randomUUID();

      const p1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: n1 }],
      });

      const p2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: n2 }],
      });

      const result = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: '_filter', operator: Operator.EQUALS, value: `name co "${n1}" or name co "${n2}"` }],
      });

      expect(result.entry).toHaveLength(2);
      expect(bundleContains(result, p1)).toBe(true);
      expect(bundleContains(result, p2)).toBe(true);
    }));

  test('Sort by unknown search parameter', async () => {
    try {
      await systemRepo.search({
        resourceType: 'Patient',
        sortRules: [{ code: 'xyz' }],
      });
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      expect(outcome.issue?.[0]?.details?.text).toBe('Unknown search parameter: xyz');
    }
  });
});
