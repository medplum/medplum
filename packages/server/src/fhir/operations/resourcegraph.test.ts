import { ContentType, createReference, normalizeErrorString } from '@medplum/core';
import {
  ActivityDefinition,
  Bundle,
  DiagnosticReport,
  GraphDefinition,
  GraphDefinitionLink,
  Observation,
  ObservationDefinition,
  Organization,
  Patient,
  PlanDefinition,
  Questionnaire,
  Resource,
  ServiceRequest,
  SpecimenDefinition,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
let defaultAccessToken: string;

describe('Resource $graph', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    defaultAccessToken = await initTestAuth({ project: { strictMode: false } });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Smoke Test', async () => {
    // 1. Create a GraphDefinition
    // 2. Create a Patient
    // 3. Create a ServiceRequest
    // 4. Run the $graph operation
    // 5. Verify the Bundle

    const graphName = 'example-smoke-test';

    // 1. Create a GraphDefinition
    await createResource({
      resourceType: 'GraphDefinition',
      status: 'active',
      name: graphName,
      start: 'ServiceRequest',
      link: [{ path: 'ServiceRequest.subject', target: [{ type: 'Patient' }] }],
    } as GraphDefinition);

    // 2. Create a Patient
    const patient = await createResource({
      resourceType: 'Patient',
      name: [{ given: ['Graph'], family: 'Demo' }],
    } as Patient);

    // 3. Create a Service Request
    const serviceRequest = await createResource({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
    } as ServiceRequest);

    // 4. Apply the PlanDefinition to create the Task and RequestGroup
    const bundle = await getResourceGraph(serviceRequest, graphName);
    const resources = bundle.entry?.map((entry) => entry.resource);
    expect(resources).toHaveLength(2);
    expect(resources?.[0]).toMatchObject(serviceRequest);
    expect(resources?.[1]).toMatchObject(patient);
  });

  describe('Error cases', () => {
    test('Invalid graph parameter', async () => {
      // Abuse the graph parameter, express will parse it as string array rather than string
      const graphName = 'g&graph=g';
      const patient = await createResource({
        resourceType: 'Patient',
        name: [{ given: ['Graph'], family: 'Demo' }],
      } as Patient);

      await getResourceGraph(patient, graphName, 400);
    });

    test('Missing Graph Definition', async () => {
      const graphName = 'this-graph-doesnt-exist';
      const patient = await createResource({
        resourceType: 'Patient',
        name: [{ given: ['Graph'], family: 'Demo' }],
      } as Patient);

      await getResourceGraph(patient, graphName, 404);
    });

    test('Missing Resource', async () => {
      const graphName = 'test-missing-resource';
      await createResource<GraphDefinition>({
        resourceType: 'GraphDefinition',
        status: 'active',
        name: graphName,
        start: 'PlanDefinition',
        link: [{ path: 'PlanDefinition.action.definition', target: [{ type: 'Questionnaire' }] }],
      });

      await getResourceGraph({ resourceType: 'PlanDefinition', id: randomUUID() } as PlanDefinition, graphName, 404);
    });

    test('Missing Target', async () => {
      const graphName = 'test-missing-target';
      const patient = await createResource({
        resourceType: 'Patient',
        name: [{ given: ['Graph'], family: 'Demo' }],
      } as Patient);

      await createResource<GraphDefinition>({
        resourceType: 'GraphDefinition',
        status: 'active',
        name: graphName,
        start: 'Patient',
        link: [
          {
            path: 'Patient.generalPractitioner',
          },
        ],
      });

      const bundle = await getResourceGraph(patient, graphName);
      expect(bundle.entry).toHaveLength(1);
      expect(bundle.entry?.[0]?.resource?.resourceType).toEqual('Patient');
    });

    test('Malformed Target', async () => {
      const graphName = 'test-malformed-target';
      const patient = await createResource({
        resourceType: 'Patient',
        name: [{ given: ['Graph'], family: 'Demo' }],
      } as Patient);

      await createResource<GraphDefinition>({
        resourceType: 'GraphDefinition',
        status: 'active',
        name: graphName,
        start: 'Patient',
        link: [
          {
            target: [{ id: 'foo' }],
          } as GraphDefinitionLink,
        ],
      });

      const outcome = await getResourceGraph(patient, graphName, 400);
      expect(normalizeErrorString(outcome)).toContain('Invalid link');
    });

    test('Invalid Start', async () => {
      const graphName = 'test-invalid-start';
      const patient = await createResource({
        resourceType: 'Patient',
        name: [{ given: ['Graph'], family: 'Demo' }],
      } as Patient);

      await createResource<GraphDefinition>({
        resourceType: 'GraphDefinition',
        status: 'active',
        name: graphName,
        link: [
          {
            path: 'Patient.generalPractitioner',
            target: [{ type: 'Practitioner' }],
          },
        ],
      } as GraphDefinition);

      const outcome = await getResourceGraph(patient, graphName, 400);
      expect(normalizeErrorString(outcome)).toContain('Missing or incorrect `start` type');
    });

    test('Invalid link type', async () => {
      const graphName = 'test-invalid-link-type';
      const patient = await createResource({
        resourceType: 'Patient',
        name: [{ given: ['Graph'], family: 'Demo' }],
      } as Patient);

      await createResource<GraphDefinition>({
        resourceType: 'GraphDefinition',
        status: 'active',
        name: graphName,
        start: 'Patient',
        link: [
          {
            path: 'Patient.name',
            target: [{ type: 'Practitioner' }],
          },
        ],
      });

      const outcome = await getResourceGraph(patient, graphName, 400);
      expect(normalizeErrorString(outcome)).toContain('Invalid link path. Must return a path to a Reference type');
    });

    test('Missing ref', async () => {
      const graphName = 'test-missing-ref';

      const graphDefinition = await createResource<GraphDefinition>({
        resourceType: 'GraphDefinition',
        status: 'active',
        name: graphName,
        start: 'GraphDefinition',
        link: [{ target: [{ type: 'GraphDefinition', params: 'url=x' }] }],
      });

      const outcome = await getResourceGraph(graphDefinition, graphName, 400);
      expect(normalizeErrorString(outcome)).toContain('Link target search params must include {ref}');
    });
  });

  test('Canonical Link', async () => {
    const graphName = 'example-canonical';

    await createResource({
      resourceType: 'GraphDefinition',
      status: 'active',
      name: graphName,
      start: 'PlanDefinition',
      link: [{ path: 'PlanDefinition.action.definition', target: [{ type: 'Questionnaire' }] }],
    } as GraphDefinition);

    const q1 = await createResource({
      resourceType: 'Questionnaire',
      status: 'active',
      name: 'Patient Registration',
      title: 'Patient Registration',
      url: 'http://example.com/PatientRegistration',
    } as Questionnaire);

    const q2 = await createResource({
      resourceType: 'Questionnaire',
      status: 'active',
      name: 'Medical History',
      title: 'Medical History',
      url: 'http://example.com/MedicalHistory',
    } as Questionnaire);

    const q3 = await createResource({
      resourceType: 'Questionnaire',
      status: 'active',
      name: 'Medical History',
      title: 'Medical History',
      url: 'http://example.com/MedicalHistory',
    } as Questionnaire);

    // 3. Create a PlanDefinition
    const planDefinition = await createResource({
      resourceType: 'PlanDefinition',
      status: 'active',
      url: 'http://example.com/PlanDefinition',
      action: [
        { definitionCanonical: 'http://example.com/PatientRegistration' },
        { definitionCanonical: 'http://example.com/MedicalHistory' },
        { definitionCanonical: 'http://example.com/MedicalHistory' },
      ],
    } as PlanDefinition);

    // 4. Apply the PlanDefinition to create the Task and RequestGroup
    const bundle = await getResourceGraph(planDefinition, graphName);
    const resources = bundle.entry?.map((entry) => entry.resource);

    expect(resources).toHaveLength(4);
    expect(resources?.[0]).toMatchObject(planDefinition);
    expect(resources?.[1]).toMatchObject(q1);
    expect(resources?.[2]).toMatchObject(q2);
    expect(resources?.[3]).toMatchObject(q3);
  });

  test('Two Levels Deep', async () => {
    const graphName = 'example-two-levels';
    await createResource({
      resourceType: 'GraphDefinition',
      status: 'active',
      name: graphName,
      start: 'PlanDefinition',
      link: [
        {
          path: 'PlanDefinition.action.definition',
          target: [
            {
              type: 'ActivityDefinition',
              link: [
                {
                  path: 'ActivityDefinition.observationResultRequirement',
                  target: [{ type: 'ObservationDefinition' }],
                },
              ],
            },
          ],
        },
      ],
    } as GraphDefinition);

    const obsDefs = await Promise.all(
      ['ACT', 'BUN', 'HEM'].map((code) =>
        createResource<ObservationDefinition>({ resourceType: 'ObservationDefinition', code: { text: code } })
      )
    );

    const a1 = await createResource({
      resourceType: 'ActivityDefinition',
      status: 'active',
      name: 'ACT Test',
      title: 'ACT Test',
      url: 'http://example.com/ActTest',
      observationResultRequirement: [createReference(obsDefs[0])],
    } as ActivityDefinition);

    const a2 = await createResource({
      resourceType: 'ActivityDefinition',
      status: 'active',
      name: 'BUN Panel',
      title: 'BUN Panel',
      url: 'http://example.com/BunPanel',
      observationResultRequirement: [createReference(obsDefs[1]), createReference(obsDefs[2])],
    } as ActivityDefinition);

    // 3. Create a PlanDefinition
    const planDefinition = await createResource({
      resourceType: 'PlanDefinition',
      status: 'active',
      action: [
        { definitionCanonical: 'http://example.com/ActTest' },
        { definitionCanonical: 'http://example.com/BunPanel' },
      ],
    } as PlanDefinition);

    // 4. Apply the PlanDefinition to create the Task and RequestGroup
    const bundle = await getResourceGraph(planDefinition, graphName);
    const resources = bundle.entry?.map((entry) => entry.resource);

    expect(resources).toHaveLength(6);
    expect(resources?.[0]).toMatchObject(planDefinition);
    expect(resources?.filter((e) => e?.resourceType === 'ActivityDefinition')).toMatchObject([a1, a2]);
    expect(resources?.filter((e) => e?.resourceType === 'ObservationDefinition')).toMatchObject(obsDefs);
  });

  test('Parallel Links', async () => {
    const graphName = 'example-parallel-link';
    await createResource({
      resourceType: 'GraphDefinition',
      status: 'active',
      name: graphName,
      start: 'PlanDefinition',
      link: [
        {
          path: 'PlanDefinition.action.definition',
          target: [
            {
              type: 'ActivityDefinition',
              link: [
                {
                  path: 'ActivityDefinition.observationResultRequirement',
                  target: [{ type: 'ObservationDefinition' }],
                },
                {
                  path: 'ActivityDefinition.specimenRequirement',
                  target: [{ type: 'SpecimenDefinition' }],
                },
              ],
            },
          ],
        },
      ],
    } as GraphDefinition);

    const obsDefs = await Promise.all(
      ['ACT', 'BUN', 'HEM'].map((code) =>
        createResource<ObservationDefinition>({ resourceType: 'ObservationDefinition', code: { text: code } })
      )
    );

    const specDefs = [
      await createResource<SpecimenDefinition>({
        resourceType: 'SpecimenDefinition',
        collection: [{ text: 'finger prick' }],
      }),
      await createResource<SpecimenDefinition>({
        resourceType: 'SpecimenDefinition',
        collection: [{ text: 'saliva' }],
      }),
    ];

    const a1 = await createResource({
      resourceType: 'ActivityDefinition',
      status: 'active',
      name: 'ACT Test',
      title: 'ACT Test',
      url: 'http://example.com/ActTest-Parallel',
      observationResultRequirement: [createReference(obsDefs[0])],
      specimenRequirement: [createReference(specDefs[0])],
    } as ActivityDefinition);

    const a2 = await createResource({
      resourceType: 'ActivityDefinition',
      status: 'active',
      name: 'BUN Panel',
      title: 'BUN Panel',
      url: 'http://example.com/BunPanel-Parallel',
      observationResultRequirement: [createReference(obsDefs[1]), createReference(obsDefs[2])],
      specimenRequirement: [createReference(specDefs[1])],
    } as ActivityDefinition);

    // 3. Create a PlanDefinition
    const planDefinition = await createResource({
      resourceType: 'PlanDefinition',
      status: 'active',
      action: [{ definitionCanonical: a1.url }, { definitionCanonical: a2.url }],
    } as PlanDefinition);

    // 4. Apply the PlanDefinition to create the Task and RequestGroup
    const bundle = await getResourceGraph(planDefinition, graphName);
    const resources = bundle.entry?.map((entry) => entry.resource);

    expect(resources).toHaveLength(8);
    expect(resources?.[0]).toMatchObject(planDefinition);
    expect(resources?.filter((e) => e?.resourceType === 'ActivityDefinition')).toMatchObject([a1, a2]);
    expect(resources?.filter((e) => e?.resourceType === 'ObservationDefinition')).toMatchObject(obsDefs);
    expect(resources?.filter((e) => e?.resourceType === 'SpecimenDefinition')).toMatchObject(specDefs);
  });

  test('Search Based Link', async () => {
    const graphName = 'example-search-based-link';

    // 1. Create a GraphDefinition
    await createResource({
      resourceType: 'GraphDefinition',
      status: 'active',
      name: graphName,
      start: 'ServiceRequest',
      link: [{ target: [{ type: 'DiagnosticReport', params: 'based-on={ref}' }], max: '*' }],
    } as GraphDefinition);

    const patient = await createResource({
      resourceType: 'Patient',
      name: [{ given: ['Graph'], family: 'Demo' }],
    } as Patient);

    const serviceRequest = await createResource({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
    } as ServiceRequest);

    // 2. Create a DiagnosticReport
    const report = await createResource({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { text: 'foo' },
      basedOn: [createReference(serviceRequest)],
    } as DiagnosticReport);

    // 4. Apply the PlanDefinition to create the Task and RequestGroup
    const bundle = await getResourceGraph(serviceRequest, graphName);
    const resources = bundle.entry?.map((entry) => entry.resource);
    expect(resources).toHaveLength(2);
    expect(resources?.[0]).toMatchObject(serviceRequest);
    expect(resources?.[1]).toMatchObject(report);
  });

  test('Nested Search Links', async () => {
    const graphName = 'example-nested-search';

    // 1. Create a GraphDefinition
    await createResource({
      resourceType: 'GraphDefinition',
      status: 'active',
      name: graphName,
      start: 'ServiceRequest',
      link: [
        {
          target: [
            {
              type: 'Observation',
              params: 'based-on={ref}',
              link: [{ path: 'Observation.performer', target: [{ type: 'Organization' }] }],
            },
          ],
        },
      ],
    } as GraphDefinition);

    const patient = await createResource({
      resourceType: 'Patient',
      name: [{ given: ['Graph'], family: 'Demo' }],
    } as Patient);

    const serviceRequest = await createResource({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
    } as ServiceRequest);

    const performer = await createResource({
      resourceType: 'Organization',
      name: 'Foo Medical',
    } as Organization);

    const observations = await Promise.all(
      ['AAA', 'BBB', 'CCC'].map((code) =>
        createResource<Observation>({
          resourceType: 'Observation',
          status: 'final',
          code: { text: code },
          performer: [createReference(performer)],
          basedOn: [createReference(serviceRequest)],
        })
      )
    );

    // 4. Apply the PlanDefinition to create the Task and RequestGroup
    const bundle = await getResourceGraph(serviceRequest, graphName);
    const resources = bundle.entry?.map((entry) => entry.resource);
    expect(resources).toHaveLength(5);
    expect(resources?.[0]).toMatchObject(serviceRequest);
    expect(resources?.filter((res) => res?.resourceType === 'Observation')).toContainEqual(observations[0]);
    expect(resources?.filter((res) => res?.resourceType === 'Observation')).toContainEqual(observations[1]);
    expect(resources?.filter((res) => res?.resourceType === 'Observation')).toContainEqual(observations[2]);

    // All 3 observations have the same performer, so we should expect a single Organization entry
    expect(resources?.filter((res) => res?.resourceType === 'Organization')).toMatchObject([performer]);
  });
});

async function getResourceGraph(
  resource: Resource,
  graphName: string,
  expectedReturnCode = 200,
  token: string | undefined = undefined
): Promise<Bundle> {
  const url = `/fhir/R4/${resource?.resourceType}/${resource?.id}/$graph?graph=${graphName}`;
  const currentToken = token || defaultAccessToken;

  const res = await request(app)
    .get(url)
    .set('Authorization', 'Bearer ' + currentToken);

  expect(res.status).toBe(expectedReturnCode);
  return res.body as Bundle;
}

async function createResource<T extends Resource>(resource: T, token?: string): Promise<T> {
  const currentToken = token || defaultAccessToken;
  const res = await request(app)
    .post(`/fhir/R4/${resource.resourceType}`)
    .set('Authorization', 'Bearer ' + currentToken)
    .set('Content-Type', ContentType.FHIR_JSON)
    .send(resource);
  expect(res.status).toBe(201);
  return res.body;
}
