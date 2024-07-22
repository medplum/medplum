import { MedplumClient, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import {
  Bundle,
  QuestionnaireItem,
  SearchParameter,
  Questionnaire,
  QuestionnaireItemAnswerOption,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, MockedFunction, beforeAll, describe, test, vi, expect } from 'vitest';
import { Marker, handler } from './vital';

global.fetch = vi.fn();

describe('Vital API', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  type Context = {
    medplum: MedplumClient;
  };

  beforeEach<Context>(async (ctx) => {
    (global.fetch as MockedFunction<typeof fetch>).mockReset();

    const medplum = new MockClient();

    Object.assign(ctx, {
      medplum,
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  test<Context>('Get Lab Tests', async (ctx) => {
    const apiKey = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const baseURL = 'https://api.dev.tryvital.io';

    const labTests = [
      {
        lab: {
          id: 24,
          slug: 'ussl',
          name: 'USSL',
          collection_methods: ['testkit'],
        },
      },
      {
        lab: {
          id: 2,
          slug: 'spiriplex',
          name: 'Spiriplex',
          collection_methods: ['testkit'],
        },
      },
      {
        lab: {
          id: 27,
          slug: 'labcorp',
          name: 'Labcorp',
          collection_methods: ['at_home_phlebotomy', 'walk_in_test'],
        },
      },
    ];

    (fetch as any).mockResolvedValue(createFetchResponse(labTests));

    const labTestsResponse = await handler(ctx.medplum, {
      bot: { reference: 'Bot/123' },
      input: {
        endpoint: 'get_lab_tests',
      },
      contentType: 'application/fhir+json',
      secrets: {
        VITAL_BASE_URL: {
          name: 'VITAL_BASE_URL',
          valueString: baseURL,
        },
        VITAL_API_KEY: {
          name: 'VITAL_API_KEY',
          valueString: apiKey,
        },
      },
    });

    expect(fetch).toHaveBeenCalledWith(`${baseURL}/v3/lab_tests`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-vital-api-key': apiKey,
      },
    });

    expect(labTestsResponse).toEqual(labTests);
  });

  test<Context>('Get Lab Tests with lab filter', async (ctx) => {
    const apiKey = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const baseURL = 'https://api.dev.tryvital.io';

    const labTests = [
      {
        lab: {
          id: 24,
          slug: 'ussl',
          name: 'USSL',
          collection_methods: ['testkit'],
        },
      },
      {
        lab: {
          id: 2,
          slug: 'spiriplex',
          name: 'Spiriplex',
          collection_methods: ['testkit'],
        },
      },
      {
        lab: {
          id: 27,
          slug: 'labcorp',
          name: 'Labcorp',
          collection_methods: ['at_home_phlebotomy', 'walk_in_test'],
        },
      },
    ];

    (fetch as any).mockResolvedValue(createFetchResponse(labTests));

    const labTestsResponse = await handler(ctx.medplum, {
      bot: { reference: 'Bot/123' },
      input: {
        endpoint: 'get_lab_tests',
        payload: {
          labID: 24,
        },
      },
      contentType: 'application/fhir+json',
      secrets: {
        VITAL_BASE_URL: {
          name: 'VITAL_BASE_URL',
          valueString: baseURL,
        },
        VITAL_API_KEY: {
          name: 'VITAL_API_KEY',
          valueString: apiKey,
        },
      },
    });

    expect(fetch).toHaveBeenCalledWith(`${baseURL}/v3/lab_tests`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-vital-api-key': apiKey,
      },
    });

    expect(labTestsResponse).toEqual(labTests.filter((lt) => lt.lab.id === 24));
  });

  test<Context>('Get Labs', async (ctx) => {
    const apiKey = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const baseURL = 'https://api.dev.tryvital.io';

    const labTests = [
      {
        lab: {
          id: 24,
          slug: 'ussl',
          name: 'USSL',
          collection_methods: ['testkit'],
        },
      },
      {
        lab: {
          id: 2,
          slug: 'spiriplex',
          name: 'Spiriplex',
          collection_methods: ['testkit'],
        },
      },
      {
        lab: {
          id: 27,
          slug: 'labcorp',
          name: 'Labcorp',
          collection_methods: ['at_home_phlebotomy', 'walk_in_test'],
        },
      },
    ];

    (fetch as any).mockResolvedValue(createFetchResponse(labTests));

    const labs = await handler(ctx.medplum, {
      bot: { reference: 'Bot/123' },
      input: {
        endpoint: 'get_labs',
      },
      contentType: 'application/fhir+json',
      secrets: {
        VITAL_BASE_URL: {
          name: 'VITAL_BASE_URL',
          valueString: baseURL,
        },
        VITAL_API_KEY: {
          name: 'VITAL_API_KEY',
          valueString: apiKey,
        },
      },
    });

    expect(fetch).toHaveBeenCalledWith(`${baseURL}/v3/lab_tests`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-vital-api-key': apiKey,
      },
    });

    expect(labs).toEqual(labTests.map((lt) => lt.lab));
  });

  test<Context>('Get Markers', async (ctx) => {
    const apiKey = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const baseURL = 'https://api.dev.tryvital.io';

    const labTests = [
      {
        id: '3ffa4b3b-0b3b-4b3b-8b3b-2b3b3b3b3b3b',
        markers: [
          {
            id: 1,
            name: 'Hemoglobin A1c',
            slug: 'hemoglobin-a1c',
            lab_id: 24,
          },
          {
            id: 2,
            name: 'Lipid Panel',
            slug: 'lipid-panel',
            lab_id: 24,
          },
          {
            id: 3,
            name: 'Complete Blood Count',
            slug: 'complete-blood-count',
            lab_id: 24,
          },
        ],
      },
      {
        id: '42fa4b3b-0b3b-4b3b-8b3b-2b3b3b3b3b3b',
        markers: [
          {
            id: 3,
            name: 'Complete Blood Count',
            slug: 'complete-blood-count',
            lab_id: 24,
          },
        ],
      },
    ];

    (fetch as any).mockResolvedValue(createFetchResponse(labTests));

    const markers = await handler(ctx.medplum, {
      bot: { reference: 'Bot/123' },
      input: {
        endpoint: 'get_markers',
        payload: {
          labTestID: '3ffa4b3b-0b3b-4b3b-8b3b-2b3b3b3b3b3b',
        },
      },
      contentType: 'application/fhir+json',
      secrets: {
        VITAL_BASE_URL: {
          name: 'VITAL_BASE_URL',
          valueString: baseURL,
        },
        VITAL_API_KEY: {
          name: 'VITAL_API_KEY',
          valueString: apiKey,
        },
      },
    });

    expect(fetch).toHaveBeenCalledWith(`${baseURL}/v3/lab_tests`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-vital-api-key': apiKey,
      },
    });

    expect(markers).toEqual(labTests[0].markers);
  });

  test<Context>('Get AOEs', async (ctx) => {
    const apiKey = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const baseURL = 'https://api.dev.tryvital.io';

    const labTests = [
      {
        id: '3ffa4b3b-0b3b-4b3b-8b3b-2b3b3b3b3b3b',
        markers: [
          {
            id: 1,
            name: 'Hemoglobin A1c',
            slug: 'hemoglobin-a1c',
            aoe: {
              questions: [
                {
                  id: 1,
                  required: true,
                  code: 'HemoglobinA1c',
                  value: 'What is your Hemoglobin A1c?',
                  type: 'numeric',
                  sequence: 1,
                  answers: [],
                },
              ],
            },
          },
        ],
      },
    ];

    (fetch as any).mockResolvedValue(createFetchResponse(labTests));

    const questionnaire = await handler(ctx.medplum, {
      bot: { reference: 'Bot/123' },
      input: {
        endpoint: 'get_aoe_questionnaire',
        payload: {
          labTestID: '3ffa4b3b-0b3b-4b3b-8b3b-2b3b3b3b3b3b',
        },
      },
      contentType: 'application/fhir+json',
      secrets: {
        VITAL_BASE_URL: {
          name: 'VITAL_BASE_URL',
          valueString: baseURL,
        },
        VITAL_API_KEY: {
          name: 'VITAL_API_KEY',
          valueString: apiKey,
        },
      },
    });

    expect(fetch).toHaveBeenCalledWith(`${baseURL}/v3/lab_tests`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-vital-api-key': apiKey,
      },
    });

    expect(questionnaire).toEqual(buildQuestionnaire(labTests[0].markers));
  });
});

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

function buildQuestionnaire(markers: Partial<Marker>[]): Questionnaire {
  return {
    resourceType: 'Questionnaire',
    title: 'Ask on Order Entry (AOE)',
    status: 'active',
    item: markers.map((marker) => ({
      linkId: marker.id?.toString() || '',
      text: marker.name,
      type: 'group',
      item: marker.aoe?.questions.map<QuestionnaireItem>((question) => ({
        linkId: question.id.toString(),
        text: question.value,
        type: (question.type === 'numeric' ? 'decimal' : question.type) as QuestionnaireItem['type'],
        required: question.required,
        answerOption: question.answers?.map<QuestionnaireItemAnswerOption>((answer) => ({
          valueString: question.type !== 'numeric' ? answer.value : undefined,
          valueInteger: question.type === 'numeric' ? parseFloat(answer.value) : undefined,
        })),
      })),
    })),
  };
}
