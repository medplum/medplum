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
  Extension,
  HumanName,
  OperationOutcome,
  Patient,
  SearchParameter,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { FhirRequest } from './fhirrouter';
import { getRootSchema, graphqlHandler } from './graphql';
import { MemoryRepository } from './repo';

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
    binary = await repo.createResource<Binary>({ resourceType: 'Binary' });

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
    const [outcome] = await graphqlHandler(
      {
        method: 'POST',
        pathname: '/fhir/R4/$graphql',
        query: {},
        params: {},
        body: {},
      },
      repo
    );
    expect(outcome).toMatchObject(badRequest('Must provide query.'));
  });

  test('Syntax error', async () => {
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
      repo
    );
    expect(outcome).toMatchObject(badRequest('GraphQL syntax error.'));
  });

  test('Introspection forbidden', async () => {
    // https://graphql.org/learn/introspection/
    const [outcome] = await graphqlHandler(
      {
        method: 'POST',
        pathname: '/fhir/R4/$graphql',
        query: {},
        params: {},
        body: {
          query: `{
            __type(name: "Patient") {
              name
              kind
            }
          }`,
        },
      },
      repo
    );
    expect(outcome).toMatchObject(forbidden);
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

    const result = await graphqlHandler(request, repo);
    expect(result).toBeDefined();
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject(allOk);

    const data = (result?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
    expect(data.Patient).toBeNull();

    const errors = (res?.[1] as any).errors;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const result = await graphqlHandler(request, repo);
    expect(result).toBeDefined();
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject(allOk);

    const data = (result?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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
    const res = await graphqlHandler(request, repo);
    expect(res[0]?.issue?.[0]?.details?.text).toEqual(
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

    const res1 = await graphqlHandler(request1, repo);
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

    const res2 = await graphqlHandler(request2, repo);
    expect(res2[0]?.issue?.[0]?.details?.text).toEqual('Field "id" exceeds max depth (depth=14, max=12)');

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

    const res3 = await graphqlHandler(request3, repo);
    expect(res3[0]).toMatchObject(allOk);
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
    const [outcome, result] = (await graphqlHandler(request, repo)) as [OperationOutcome, any];
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
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

    const res = await graphqlHandler(request, repo);
    expect(res[0]).toMatchObject(allOk);

    const data = (res?.[1] as any).data;
    expect(data.Patient).toBeDefined();
    expect(data.Patient.extension).toHaveLength(1);
    expect(data.Patient.extension[0]).toMatchObject(patient.extension?.[1] as Extension);
  });
});
