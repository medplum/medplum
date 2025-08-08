// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, forbidden, MedplumClient } from '@medplum/core';
import { Questionnaire } from '@medplum/fhirtypes';
import {
  HEALTH_GORILLA_SYSTEM,
  HGAutocompleteBotInput,
  HGAutocompleteBotResponse,
  LabOrganization,
  TestCoding,
} from '@medplum/health-gorilla-core';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { getAutocompleteSearchFunction } from './autocomplete-endpoint';

export const QUEST_LAB: LabOrganization = {
  resourceType: 'Organization',
  id: '123-quest',
  name: 'Quest Diagnostics',
  identifier: [{ system: HEALTH_GORILLA_SYSTEM, value: 'f-12345' }],
};

export const NO_AOE_TEST = {
  system: 'urn:uuid:f:777777777777777777777777',
  code: 'NO_AOE',
  display: 'does not have an AOE',
} as TestCoding;

export const RWS_AOE_TEST = {
  system: 'urn:uuid:f:777777777777777777777777',
  code: 'RWS_AOE',
  display: 'required when specimen AOE',
} as TestCoding;

export const REQUIRED_AOE_TEST = {
  system: 'urn:uuid:f:777777777777777777777777',
  code: 'REQUIRED_AOE',
  display: 'required AOE',
} as TestCoding;

export const QUERY_FOR_TEST_WITHOUT_AOE = 'does not';

const ALL_TESTS = [NO_AOE_TEST, RWS_AOE_TEST, REQUIRED_AOE_TEST];

const ALL_AOES: Record<string, Questionnaire | undefined> = {
  REQUIRED_AOE: {
    resourceType: 'Questionnaire',
    name: 'AOE Testing AOE questions',
    status: 'active',
    subjectType: ['Patient'],
    item: [
      {
        linkId: 'fasting',
        required: true,
        type: 'choice',
        answerOption: [
          {
            valueCoding: {
              code: 'Y',
              display: 'Yes',
            },
          },
          {
            valueCoding: {
              code: 'N',
              display: 'No',
            },
          },
        ],
      },
    ],
  } as Questionnaire,
  RWS_AOE: {
    resourceType: 'Questionnaire',
    name: 'AOE Testing AOE questions',
    status: 'active',
    subjectType: ['Patient'],
    item: [
      {
        extension: [
          {
            url: 'https://www.healthgorilla.com/fhir/StructureDefinition/questionnaire-requiredwhenspecimen',
            valueBoolean: true,
          },
        ],
        linkId: 'fasting',
        type: 'choice',
        answerOption: [
          {
            valueCoding: {
              code: 'Y',
              display: 'Yes',
            },
          },
          {
            valueCoding: {
              code: 'N',
              display: 'No',
            },
          },
        ],
      },
    ],
  } as Questionnaire,
};

export function getMockAutocompleteBot({
  invalidType,
  invalidResultType,
  errorType,
}: {
  invalidType?: boolean;
  invalidResultType?: boolean;
  errorType?: boolean;
}): MedplumClient['executeBot'] {
  const mockAutocompleteBot: MedplumClient['executeBot'] = async (
    idOrIdentifier,
    botInput
  ): Promise<HGAutocompleteBotResponse> => {
    if (invalidType) {
      return { foo: 'bar' } as unknown as HGAutocompleteBotResponse;
    }

    if (errorType) {
      return { outcome: forbidden, type: 'error', args: botInput };
    }

    if (
      typeof idOrIdentifier === 'string' ||
      idOrIdentifier.system !== 'https://www.medplum.com/integrations/bot-identifier' ||
      idOrIdentifier.value !== 'health-gorilla-labs/autocomplete'
    ) {
      throw new Error(`Attempted to execute a non-mocked Bot ${JSON.stringify(idOrIdentifier)}`);
    }

    const input = botInput as HGAutocompleteBotInput;
    switch (input.type) {
      case 'lab': {
        const result = [];
        if (invalidResultType) {
          result.push({ resourceType: 'Patient', name: [{ text: 'Test Patient' }] } as unknown as LabOrganization);
        }

        if (input.query.toLocaleLowerCase().includes('quest')) {
          result.push(QUEST_LAB);
        }
        return { outcome: allOk, type: 'lab', result };
      }
      case 'test': {
        const q = input.query.toLocaleLowerCase();
        let result: TestCoding[] = [];
        if (invalidResultType) {
          result = [{ resourceType: 'Patient', name: [{ text: 'Test Patient' }] } as unknown as TestCoding];
        } else {
          result = ALL_TESTS.filter((test) => test.display?.toLocaleLowerCase().includes(q));
        }
        return { outcome: allOk, type: 'test', result };
      }
      case 'aoe': {
        const type = invalidType ? ('xxx' as unknown as 'aoe') : 'aoe';
        let result: Questionnaire | undefined;
        if (invalidResultType) {
          result = { resourceType: 'Patient', name: [{ text: 'Test Patient' }] } as unknown as Questionnaire;
        } else {
          result = input.testCode.code ? ALL_AOES[input.testCode.code] : undefined;
        }
        return { outcome: allOk, type, result };
      }
      default: {
        input satisfies never;
        throw new Error('Unexpected search type: ' + (input as any).type);
      }
    }
  };

  return mockAutocompleteBot;
}

describe('getAutocompleteSearchFunction', () => {
  let medplum: MedplumClient;
  beforeEach(async () => {
    medplum = new MockClient();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const BOT_IDENTIFIER = {
    system: 'https://www.medplum.com/integrations/bot-identifier',
    value: 'health-gorilla-labs/autocomplete',
  };

  test('lab search', async () => {
    vi.spyOn(medplum, 'executeBot').mockImplementation(getMockAutocompleteBot({}));

    const searchFunc = getAutocompleteSearchFunction(medplum, BOT_IDENTIFIER);
    const result = await searchFunc({ type: 'lab', query: 'quest' });
    expect(result).toStrictEqual({
      type: 'lab',
      result: [QUEST_LAB],
    });
  });

  test('error response type', async () => {
    vi.spyOn(medplum, 'executeBot').mockImplementation(getMockAutocompleteBot({ errorType: true }));

    const searchFunc = getAutocompleteSearchFunction(medplum, BOT_IDENTIFIER);
    await expect(searchFunc({ type: 'lab', query: 'quest' })).rejects.toThrow();
  });

  test('invalid response type', async () => {
    vi.spyOn(medplum, 'executeBot').mockImplementation(getMockAutocompleteBot({ invalidType: true }));

    const searchFunc = getAutocompleteSearchFunction(medplum, BOT_IDENTIFIER);
    await expect(searchFunc({ type: 'lab', query: 'quest' })).rejects.toThrow();
  });

  test('invalid result types', async () => {
    vi.spyOn(medplum, 'executeBot').mockImplementation(getMockAutocompleteBot({ invalidResultType: true }));
    const searchFunc = getAutocompleteSearchFunction(medplum, BOT_IDENTIFIER);

    await expect(searchFunc({ type: 'lab', query: 'quest' })).rejects.toThrow();
    await expect(searchFunc({ type: 'test', query: 'blood', labId: 'some-lab' })).rejects.toThrow();
    await expect(searchFunc({ type: 'aoe', testCode: NO_AOE_TEST })).rejects.toThrow();
  });
});
