import {
  allOk,
  badRequest,
  createReference,
  forbidden,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import {
  Binary,
  Bundle,
  Encounter,
  ExplanationOfBenefit,
  Extension,
  HumanName,
  OperationOutcome,
  Patient,
  SearchParameter,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { FhirRequest, FhirRouter } from '../fhirrouter';
import { MemoryRepository } from '../repo';
import { getRootSchema, graphqlHandler } from './graphql';

const repo = new MemoryRepository();
let binary: Binary;
let patient: Patient;
let serviceRequest: ServiceRequest;
let encounter1: Encounter;
let encounter2: Encounter;

describe('GraphQL', () => {
  beforeAll(async () => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
    getRootSchema();

    // Create a profile picture
    binary = await repo.createResource<Binary>({ resourceType: 'Binary' } as Binary);

    // Creat a simple patient
    patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
      photo: [
        {
          contentType: 'image/jpeg',
          url: getReferenceString(binary),
        },
      ],
    });

    // Create a service request
    serviceRequest = await repo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      code: {
        text: 'Chest CT',
      },
      subject: createReference(patient),
    });

    // Create an encounter referring to the patient
    encounter1 = await repo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: {
        code: 'HH',
      },
      subject: createReference(patient),
      basedOn: [createReference(serviceRequest)],
    });

    // Create an encounter referring to missing patient
    encounter2 = await repo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: {
        code: 'HH',
      },
      subject: {
        reference: 'Patient/' + randomUUID(),
      },
    });
  });

  test('Missing query', async () => {
    const fhirRouter = new FhirRouter();
    const [outcome] = await graphqlHandler(
      {
        method: 'POST',
        pathname: '/fhir/R4/$graphql',
        query: {},
        params: {},
        body: {},
      },
      repo,
      fhirRouter
    );
    expect(outcome).toMatchObject(badRequest('Must provide query.'));
  });

  test('Syntax error', async () => {
    const fhirRouter = new FhirRouter();
    const [outcome] = await graphqlHandler(
      {
        method: 'POST',
        pathname: '/fhir/R4/$graphql',
        query: {},
        params: {},
        body: {
          query: 'This is not valid GraphQL.',
        },
      },
      repo,
      fhirRouter
    );
    expect(outcome).toMatchObject(badRequest('GraphQL syntax error.'));
  });

  test('Introspection forbidden', async () => {
    // https://graphql.org/learn/introspection/
    const fhirRouter = new FhirRouter({ introspectionEnabled: false });
    const [outcome] = await graphqlHandler(
      {
        method: 'POST',
        pathname: '/fhir/R4/$graphql',
        query: {},
        params: {},
        body: {
          query: `{
            __schema {
              types {
                name
              }
            }
          }`,
        },
      },
      repo,
      fhirRouter
    );
    expect(outcome).toMatchObject(forbidden);
  });

  test('Introspection allowed', async () => {
    // https://graphql.org/learn/introspection/
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `{
          __schema {
            types {
              name
            }
          }
        }`,
      },
    };
    const fhirRouter = new FhirRouter({ introspectionEnabled: true });
    const res = await graphqlHandler(request, repo, fhirRouter);

    expect(res[0]).toMatchObject(allOk);
  });

  test('Read by ID', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        Patient(id: "${patient.id}") {
          id
          name { given }
          photo { url }
        }
      }
    `,
      },
    };
    const fhirRouter = new FhirRouter();
    const result = await graphqlHandler(request, repo, fhirRouter);
    expect(result).toBeDefined();
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject(allOk);

    const data = (result[1] as any).data;
    expect(data.Patient).toBeDefined();
    expect(data.Patient.id).toEqual(patient.id);
    expect(data.Patient.photo[0].url).toBeDefined();
  });

  test('Read by ID not found', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        Patient(id: "${randomUUID()}") {
          id
          name { given }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.Patient).toBeNull();

    const errors = (res[1] as any).errors;
    expect(errors[0].message).toEqual('Not found');
  });

  test('Search', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        PatientList(name: "Smith") {
          id
          name { given }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.PatientList).toBeDefined();
  });

  test('Search with _id', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        PatientList(_id: "${patient.id}") {
          id
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.PatientList).toBeDefined();
    expect(data.PatientList.length).toBe(1);
  });

  test('Search with _count', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        EncounterList(_count: 1) {
          id
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.EncounterList).toBeDefined();
    expect(data.EncounterList.length).toBe(1);
  });

  test('Search with based-on', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        EncounterList(based_on: "${getReferenceString(serviceRequest)}") {
          id
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.EncounterList).toBeDefined();
    expect(data.EncounterList.length).toBe(1);
  });

  test('Sort by _lastUpdated asc', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        EncounterList(_sort: "_lastUpdated") {
          id
          meta { lastUpdated }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.EncounterList).toBeDefined();
    expect(data.EncounterList.length >= 2).toBe(true);

    const e1 = data.EncounterList[0];
    const e2 = data.EncounterList[1];
    expect(e1.meta.lastUpdated.localeCompare(e2.meta.lastUpdated)).toBeLessThanOrEqual(0);
  });

  test('Sort by _lastUpdated desc', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        EncounterList(_sort: "-_lastUpdated") {
          id
          meta { lastUpdated }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.EncounterList).toBeDefined();
    expect(data.EncounterList.length >= 2).toBe(true);

    const e1 = data.EncounterList[0];
    const e2 = data.EncounterList[1];
    expect(e1.meta.lastUpdated.localeCompare(e2.meta.lastUpdated)).toBeGreaterThanOrEqual(0);
  });

  test('Read resource by reference', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
        {
          Encounter(id: "${encounter1.id}") {
            id
            meta {
              lastUpdated
            }
            subject {
              reference
              resource {
                ... on Patient {
                  id
                  name {
                    given
                    family
                  }
                }
              }
            }
          }
        }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const result = await graphqlHandler(request, repo, fhirRouter);
    expect(result).toBeDefined();
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject(allOk);

    const data = (result[1] as any).data;
    expect(data.Encounter.id).toEqual(encounter1.id);
    expect(data.Encounter.subject.resource).toBeDefined();
    expect(data.Encounter.subject.resource.id).toEqual(patient.id);
    expect(data.Encounter.subject.resource.name[0].given[0]).toEqual('Alice');
  });

  test('Read resource by reference not found', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
        {
          Encounter(id: "${encounter2.id}") {
            id
            meta {
              lastUpdated
            }
            subject {
              id
              reference
              resource {
                ... on Patient {
                  name {
                    given
                    family
                  }
                }
              }
            }
          }
        }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.Encounter).toBeDefined();
    expect(data.Encounter.subject.resource).toBeNull();
  });

  test('Reverse lookup with _reference', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        PatientList(_count: 1) {
          id
          ObservationList(_reference: subject) {
            id
            status
            code {
              text
            }
          }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.PatientList).toBeDefined();
    expect(data.PatientList[0].ObservationList).toBeDefined();
  });

  test('Reverse lookup without _reference', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        PatientList(_count: 1) {
          id
          ObservationList(subject: "xyz") {
            id
            status
            code {
              text
            }
          }
        }
      }
    `,
      },
    };
    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0].issue?.[0]?.details?.text).toEqual(
      'Field "ObservationList" argument "_reference" of type "Patient_Observation_reference!" is required, but it was not provided.'
    );
  });

  test('Max depth', async () => {
    // The definition of "depth" is a little abstract in GraphQL
    // We use "selection", which, in a well formatted query, is the level of indentation

    // 8 levels of depth is ok
    const request1: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
        {
          ServiceRequestList {
            id
            basedOn {
              resource {
                ...on ServiceRequest {
                  id
                  basedOn {
                    resource {
                      ...on ServiceRequest {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res1 = await graphqlHandler(request1, repo, fhirRouter);
    expect(res1[0]).toMatchObject(allOk);

    // 14 levels of nesting is too much
    const request2: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
        {
          ServiceRequestList {
            id
            basedOn {
              resource {
                ...on ServiceRequest {
                  id
                  basedOn {
                    resource {
                      ...on ServiceRequest {
                        id
                        basedOn {
                          resource {
                            ...on ServiceRequest {
                              id
                              basedOn {
                                resource {
                                  ...on ServiceRequest {
                                    id
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
    `,
      },
    };

    const res2 = await graphqlHandler(request2, repo, fhirRouter);
    expect(res2[0].issue?.[0]?.details?.text).toEqual('Field "id" exceeds max depth (depth=14, max=12)');

    // Customer request for patients and children via RelatedPerson links
    const request3: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `{
          PatientList {
            resourceType
            id
            name {
              given
              family
            }
            link {
              other {
                reference
                resource {
                  ... on RelatedPerson {
                    id
                    resourceType
                    relationship {
                      coding {
                        code
                      }
                    }
                    patient {
                      reference
                      resource {
                        ... on Patient {
                          name {
                            given
                            family
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
      },
    };

    const res3 = await graphqlHandler(request3, repo, fhirRouter);
    expect(res3[0]).toMatchObject(allOk);
  });

  test('Max depth override', async () => {
    // Project level settings can override the default depth
    const config = {
      graphqlMaxDepth: 6,
    };

    // 4 levels of depth is ok
    const request1: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      config,
      body: {
        query: `
        {
          ServiceRequestList {
            id
            basedOn {
              resource {
                ...on ServiceRequest {
                  id
                }
              }
            }
          }
        }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res1 = await graphqlHandler(request1, repo, fhirRouter);
    expect(res1[0]).toMatchObject(allOk);

    // 8 levels of nesting is too much
    const request2: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      config,
      body: {
        query: `
        {
          ServiceRequestList {
            id
            basedOn {
              resource {
                ...on ServiceRequest {
                  id
                  basedOn {
                    resource {
                      ...on ServiceRequest {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
    `,
      },
    };

    const res2 = await graphqlHandler(request2, repo, fhirRouter);
    expect(res2[0].issue?.[0]?.details?.text).toEqual('Field "id" exceeds max depth (depth=8, max=6)');
  });

  test('StructureDefinition query', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `{
          StructureDefinitionList(name: "Patient") {
            name
            description
            snapshot {
              element {
                id
                path
                min
                max
                type {
                  code
                  targetProfile
                }
                binding {
                  valueSet
                }
                definition
              }
            }
          }
          SearchParameterList(base: "Patient", _count: 100) {
            base
            code
            type
            expression
            target
          }
        }`,
      },
    };
    const fhirRouter = new FhirRouter();
    const [outcome, result] = (await graphqlHandler(request, repo, fhirRouter)) as [OperationOutcome, any];
    expect(outcome).toMatchObject(allOk);
    expect(result.data.StructureDefinitionList).toBeDefined();
    expect(result.data.SearchParameterList).toBeDefined();
  });

  test('_offset list field argument', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [
        { given: ['given1'], family: 'family1' },
        { given: ['given2'], family: 'family2' },
        { given: ['given3'], family: 'family3' },
      ],
    });

    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        Patient(id: "${patient.id}") {
          id
          name(_offset: 1) {
            given
            family
          }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.Patient).toBeDefined();
    expect(data.Patient.name).toHaveLength(2);
    expect(data.Patient.name[0]).toMatchObject(patient.name?.[1] as HumanName);
    expect(data.Patient.name[1]).toMatchObject(patient.name?.[2] as HumanName);
  });

  test('_count list field argument', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [
        { given: ['given1'], family: 'family1' },
        { given: ['given2'], family: 'family2' },
        { given: ['given3'], family: 'family3' },
      ],
    });

    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        Patient(id: "${patient.id}") {
          id
          name(_count: 1) {
            given
            family
          }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.Patient).toBeDefined();
    expect(data.Patient.name).toHaveLength(1);
    expect(data.Patient.name[0]).toMatchObject(patient.name?.[0] as HumanName);
  });

  test('fhirpath list field argument', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [
        { given: ['given1'], suffix: ['suffix1'] },
        { given: ['given2'], family: 'family2' },
        { given: ['given3'], family: 'family3' },
      ],
    });

    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        Patient(id: "${patient.id}") {
          id
          name(fhirpath: "family.exists()") {
            given
            family
          }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.Patient).toBeDefined();
    expect(data.Patient.name).toHaveLength(2);
    expect(data.Patient.name[0]).toMatchObject(patient.name?.[1] as HumanName);
    expect(data.Patient.name[1]).toMatchObject(patient.name?.[2] as HumanName);
  });

  test('List field argument by name', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [
        { use: 'official', given: ['given1'], family: 'family1' },
        { use: 'maiden', given: ['given2'], family: 'family2' },
        { use: 'nickname', given: ['given3'], family: 'family3' },
      ],
    });

    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        Patient(id: "${patient.id}") {
          id
          name(use: "maiden") {
            use
            given
            family
          }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.Patient).toBeDefined();
    expect(data.Patient.name).toHaveLength(1);
    expect(data.Patient.name[0]).toMatchObject(patient.name?.[1] as HumanName);
  });

  test('Extension list field argument', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      extension: [
        { url: 'https://example.com/1', valueString: 'value1' },
        { url: 'https://example.com/2', valueString: 'value2' },
        { url: 'https://example.com/3', valueString: 'value3' },
      ],
    });

    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        Patient(id: "${patient.id}") {
          id
          extension(url: "https://example.com/2") {
            url
            valueString
          }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.Patient).toBeDefined();
    expect(data.Patient.extension).toHaveLength(1);
    expect(data.Patient.extension[0]).toMatchObject(patient.extension?.[1] as Extension);
  });

  test('List field argument null values', async () => {
    const family = randomUUID();

    const p1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
    const p2 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
    const p3 = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ family }],
      extension: [
        { url: 'https://example.com/1', valueString: 'value1' },
        { url: 'https://example.com/2', valueString: 'value2' },
        { url: 'https://example.com/3', valueString: 'value3' },
      ],
    });

    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        PatientList(name: "${family}") {
          id
          extension(url: "https://example.com/2") {
            url
            valueString
          }
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.PatientList).toBeDefined();
    expect(data.PatientList).toHaveLength(3);

    const check1 = data.PatientList.find((p: any) => p.id === p1.id);
    expect(check1).toBeDefined();
    expect(check1.extension).toBeNull();

    const check2 = data.PatientList.find((p: any) => p.id === p2.id);
    expect(check2).toBeDefined();
    expect(check2.extension).toBeNull();

    const check3 = data.PatientList.find((p: any) => p.id === p3.id);
    expect(check3).toBeDefined();
    expect(check3.extension).toHaveLength(1);
    expect(check3.extension[0]).toMatchObject(p3.extension?.[1] as Extension);
  });

  test('Connection API', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        PatientConnection(name: "Smith") {
          count offset pageSize
          edges {
            mode, score, resource { id name { given } }
          }
          first previous next last
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.PatientConnection).toBeDefined();
    expect(data.PatientConnection).toMatchObject({
      count: 1,
      offset: 0,
      pageSize: 20,
      edges: [{ resource: { name: [{ given: ['Alice'] }] } }],
    });
  });

  test('Connection API without count field', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        PatientConnection(name: "Smith") {
          offset pageSize
          edges {
            mode, score, resource { id name { given } }
          }
          first previous next last
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.PatientConnection).toBeDefined();
    expect(data.PatientConnection).toMatchObject({
      offset: 0,
      pageSize: 20,
      edges: [{ resource: { name: [{ given: ['Alice'] }] } }],
    });
  });

  test('Connection API without edges field', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      {
        PatientConnection(name: "Smith") {
          count
        }
      }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.PatientConnection).toBeDefined();
    expect(data.PatientConnection.count).toBe(1);
    expect(data.PatientConnection.edges).toBeUndefined();
  });

  test('Create Patient Record', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      mutation {
        PatientCreate(
          res: {
            resourceType: "Patient"
            gender: "male"
            name: [
              {
                given: "Bob"
              }
            ]
          }
        ) {
          id
          gender
          name {
            given
          }
        }
      }
      `,
      },
    };
    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const data = (res[1] as any).data;
    expect(data.PatientCreate).toBeDefined();

    const retrievePatient = await repo.readResource<Patient>('Patient', data.PatientCreate.id ?? '');

    expect(retrievePatient.gender).toEqual('male');
    expect(retrievePatient.name?.[0].given).toEqual(['Bob']);
  });

  test('Create wrong resourceType error', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      mutation {
        PatientCreate(res: { resourceType: "ServiceRequest" }) { id }
      }
      `,
      },
    };
    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res).toMatchObject([
      {
        resourceType: 'OperationOutcome',
        id: 'ok',
        issue: [
          {
            severity: 'information',
            code: 'informational',
            details: { text: 'All OK' },
          },
        ],
      },
      {
        errors: [
          {
            message: 'Invalid resourceType',
            locations: [{ line: 3, column: 9 }],
            path: ['PatientCreate'],
          },
        ],
        data: {
          PatientCreate: null,
        },
      },
    ]);
  });

  test('Updating Patient Record', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      gender: 'female',
      name: [{ given: ['Alice'] }],
    });
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      mutation {
        PatientUpdate(
          id: "${patient.id}"
          res: {
            id: "${patient.id}"
            resourceType: "Patient"
            gender: "male"
            name: [
              {
                given: "Bob"
              },
              {
                family: "Smith"
              }
            ]
          }
        ) {
          id
          gender
          name {
            given
          }
        }
      }
      `,
      },
    };
    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);

    const retrievePatient = await repo.readResource<Patient>('Patient', patient.id ?? '');
    expect(retrievePatient.gender).toEqual('male');
    expect(retrievePatient.name?.[1].family).toEqual('Smith');
  });

  test('Invalid Update Mutation', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      gender: 'female',
      name: [{ given: ['Alice'] }],
    });
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      mutation {
        PatientUpdate(
          id: "${patient.id}"
        ) {
          id
          gender
          name {
            given
          }
        }
      }
      `,
      },
    };
    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]?.issue?.[0]?.details?.text).toEqual(
      'Field "PatientUpdate" argument "res" of type "PatientCreate!" is required, but it was not provided.'
    );
  });

  test('Update wrong resourceType error', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      mutation {
        PatientUpdate(
          id: "${patient.id}"
          res: {
            resourceType: "ServiceRequest"
            id: "${patient.id}"
          }
        ) {
          id
        }
      }
      `,
      },
    };
    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res).toMatchObject([
      {
        resourceType: 'OperationOutcome',
        id: 'ok',
        issue: [
          {
            severity: 'information',
            code: 'informational',
            details: { text: 'All OK' },
          },
        ],
      },
      {
        errors: [
          {
            message: 'Invalid resourceType',
            locations: [{ line: 3, column: 9 }],
            path: ['PatientUpdate'],
          },
        ],
        data: {
          PatientUpdate: null,
        },
      },
    ]);
  });

  test('Update wrong ID error', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      mutation {
        PatientUpdate(
          id: "${patient.id}"
          res: {
            resourceType: "Patient"
            id: "${randomUUID()}"
          }
        ) {
          id
        }
      }
      `,
      },
    };
    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res).toMatchObject([
      {
        resourceType: 'OperationOutcome',
        id: 'ok',
        issue: [
          {
            severity: 'information',
            code: 'informational',
            details: { text: 'All OK' },
          },
        ],
      },
      {
        errors: [
          {
            message: 'Invalid ID',
            locations: [{ line: 3, column: 9 }],
            path: ['PatientUpdate'],
          },
        ],
        data: {
          PatientUpdate: null,
        },
      },
    ]);
  });

  test('Delete Patient Record', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      gender: 'female',
      name: [{ given: ['Alice'] }],
    });
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
      mutation {
        PatientDelete(
          id: "${patient.id}"
        ) {
          id
        }
      }
      `,
      },
    };
    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);
    try {
      await repo.readReference(createReference(patient));
      throw new Error('Expected error');
    } catch (err) {
      expect((err as Error).message).toBe('Not found');
    }
  });

  test('Reference missing reference property', async () => {
    const eob = await repo.createResource<ExplanationOfBenefit>({
      resourceType: 'ExplanationOfBenefit',
      facility: {
        display: 'test',
      },
    } as ExplanationOfBenefit);
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
        {
          ExplanationOfBenefit(id: "${eob.id}") {
            facility {
              display
              resource {
                ... on Organization {
                  resourceType
                  name
                }
              }
            }
          }
        }
      `,
      },
    };
    const fhirRouter = new FhirRouter();
    const res = await graphqlHandler(request, repo, fhirRouter);
    expect(res[0]).toMatchObject(allOk);
    expect((res[1] as any).errors).toBeUndefined();
  });

  test('Fragment inclusion', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/fhir/R4/$graphql',
      query: {},
      params: {},
      body: {
        query: `
        query Visit {
          Encounter(id: "${encounter1.id}") {
            id
            meta {
              lastUpdated
            }
            subject {
              reference
              resource {
                ...PatientInfo
              }
            }
          }

        }

        fragment PatientInfo on Patient {
          id name { given family }
        }
    `,
      },
    };

    const fhirRouter = new FhirRouter();
    const result = await graphqlHandler(request, repo, fhirRouter);
    expect(result).toBeDefined();
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject(allOk);

    const data = (result[1] as any).data;
    expect(data.Encounter.id).toEqual(encounter1.id);
    expect(data.Encounter.subject.resource).toBeDefined();
    expect(data.Encounter.subject.resource.id).toEqual(patient.id);
    expect(data.Encounter.subject.resource.name[0].given[0]).toEqual('Alice');
  });
});
