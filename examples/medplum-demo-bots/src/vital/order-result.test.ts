import {
  MedplumClient,
  createReference,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, BundleEntry, Observation, Patient, ProjectSetting, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MockedFunction, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDiagnoticReport, fetchFhirResults } from './order-result';

global.fetch = vi.fn();

const API_KEY = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const BASE_URL = 'https://api.dev.tryvital.io';

describe('Create Order Bot', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  type Context = {
    medplum: MedplumClient;
    patient: Patient;
    secrets: Record<string, ProjectSetting>;
  };

  beforeEach<Context>(async (ctx) => {
    (global.fetch as MockedFunction<typeof fetch>).mockReset();

    const medplum = new MockClient();

    const patient = buildPatient();

    const secrets = {
      VITAL_BASE_URL: {
        name: 'VITAL_BASE_URL',
        valueString: BASE_URL,
      },
      VITAL_API_KEY: {
        name: 'VITAL_API_KEY',
        valueString: API_KEY,
      },
    };

    Object.assign(ctx, {
      medplum,
      patient,
      secrets,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  test<Context>('fetchFhirResults', async (ctx) => {
    const orderID = '28a3b3b3-0b3b-4b3b-8b3b-2b3b3b3b3b3b';
    const respBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: ctx.patient,
        },
      ],
    };

    (fetch as any).mockResolvedValue(createFetchResponse(respBundle, 200));

    const bundle = await fetchFhirResults(ctx.secrets, orderID);

    // Check that the patient was sent to the Vital API
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/v3/order/${orderID}/result/fhir`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-vital-api-key': API_KEY,
      },
    });

    // Patient
    const patient = bundle.entry?.find((e: any) => e.resource.resourceType === 'Patient') as
      | BundleEntry<Patient>
      | undefined;
    expect(patient?.resource).toEqual(ctx.patient);
  });

  test<Context>('fetchFhirResultsFails', async (ctx) => {
    const orderID = '28a3b3b3-0b3b-4b3b-8b3b-2b3b3b3b3b3b';
    (fetch as any).mockResolvedValue(createFetchResponse('Internal Server Error', 500));

    await expect(() => fetchFhirResults(ctx.secrets, orderID)).rejects.toThrowError();

    // Check that the patient was sent to the Vital API
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/v3/order/${orderID}/result/fhir`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-vital-api-key': API_KEY,
      },
    });
  });

  test<Context>('createDiagnoticReport', async (ctx) => {
    const patient = await ctx.medplum.createResource(ctx.patient);

    const orderID = '28a3b3b3-0b3b-4b3b-8b3b-2b3b3b3b3b3b';
    const diagnosticReport = await createDiagnoticReport(
      ctx.medplum,
      buildAPIBundleResponse(patient),
      undefined,
      orderID
    );

    expect(diagnosticReport.conclusion).toEqual('Normal');
    expect(diagnosticReport.conclusionCode).toEqual([
      {
        coding: [
          {
            code: 'N',
            display: 'Normal',
            system: 'https://fhir-ru.github.io/valueset-observation-interpretation.html',
          },
        ],
      },
    ]);
    expect(diagnosticReport.identifier).toEqual([
      {
        system: 'vital_order_id',
        value: orderID,
      },
    ]);
    expect(diagnosticReport.subject).toEqual(createReference(patient));
    expect(diagnosticReport.result).toHaveLength(1);
  });
});

function buildAPIBundleResponse(patient: Patient): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      {
        resource: patient,
      },
      {
        resource: buildObservation(patient),
      },
    ],
  };
}

function buildObservation(patient: Patient): Observation {
  return {
    resourceType: 'Observation',
    status: 'final',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '12345-6',
          display: 'Test Result',
        },
      ],
    },
    subject: createReference(patient),
    effectiveDateTime: '2021-01-01T12:00:00Z',
    interpretation: [
      {
        coding: [
          {
            system: 'https://fhir-ru.github.io/valueset-observation-interpretation.html',
            code: 'N',
            display: 'Normal',
          },
        ],
      },
    ],
    valueQuantity: {
      value: 123,
      unit: 'mg/dL',
      system: 'http://unitsofmeasure.org',
      code: 'mg/dL',
    },
  };
}

function buildPatient(): Patient {
  return {
    resourceType: 'Patient',
    id: '3f4b3b3b-0b3b-4b3b-8b3b-2b3b3b3b3b3b',
    name: [{ family: 'Doe', given: ['John'] }],
    birthDate: '1970-01-01',
    gender: 'male',
    address: [
      {
        line: ['123 Main St'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'US',
      },
    ],
    identifier: [
      {
        system: 'vital_sample_id',
        value: '12345',
      },
    ],
  };
}

function createFetchResponse(data: any, status = 200): Response {
  return {
    status,
    json: () =>
      new Promise((resolve) => {
        resolve(data);
      }),
    ok: status >= 200 && status < 300,
  } as Response;
}
