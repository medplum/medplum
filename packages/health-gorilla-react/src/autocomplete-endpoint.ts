import { MedplumClient, isCoding, isResource } from '@medplum/core';
import { Identifier, Questionnaire } from '@medplum/fhirtypes';
import { HGAutocompleteBotResponse, LabOrganization, TestCoding } from '@medplum/health-gorilla-core';

export type LabSearchParams = { type: 'lab'; query: string };
export type TestSearchParams = { type: 'test'; query: string; labId: string };
export type AOESearchParams = { type: 'aoe'; testCode: TestCoding };

export type LabSearchResult = { type: 'lab'; result: LabOrganization[] };
export type TestSearchResult = { type: 'test'; result: TestCoding[] };
export type AOESearchResult = { type: 'aoe'; result: Questionnaire | undefined };

export type LabSearch = { params: LabSearchParams; results: LabSearchResult };
export type TestSearch = { params: TestSearchParams; results: TestSearchResult };
export type AOESearch = { params: AOESearchParams; results: AOESearchResult };
export type HGSearch = LabSearch | TestSearch | AOESearch;

export type HGSearchFunction = <T extends HGSearch>(params: T['params']) => Promise<T['results']>;

export function prepareAutocompleteBot(medplum: MedplumClient, autocompleteBot: string | Identifier): HGSearchFunction {
  // Test bot connection and functionality.
  // try {
  // const result = await medplum.executeBot(autocompleteBot, { type: 'lab', query: 'quest' });
  // if (!Array.isArray(result.result) || result.result.length === 0) {
  // throw new Error('Invalid bot response');
  // }
  // } catch (err) {
  // console.log('Error testing bot execution', err);
  // throw err;
  // }

  const searchFunction: HGSearchFunction = async (params) => {
    let botResponse: HGAutocompleteBotResponse;
    try {
      botResponse = await medplum.executeBot(autocompleteBot, params);
      if (botResponse.type === 'error') {
        throw new Error('Error executing bot', { cause: botResponse });
      }
    } catch (err) {
      console.warn('Error executing autocomplete bot', err);
      throw err;
    }
    switch (botResponse.type) {
      case 'lab': {
        const { result } = botResponse;
        if (
          !Array.isArray(result) ||
          result.some((item) => !isResource(item) || item.resourceType !== 'Organization')
        ) {
          throw new Error('Invalid bot response for lab search');
        }
        return { type: 'lab', result } as LabSearchResult;
      }
      case 'test': {
        const { result } = botResponse;
        if (!Array.isArray(result) || result.some((item) => !isCoding(item))) {
          throw new Error('Invalid bot response for test search');
        }
        return { type: 'test', result } as TestSearchResult;
      }
      case 'aoe': {
        const { result } = botResponse;
        if (result !== undefined && result.resourceType !== 'Questionnaire') {
          throw new Error('Invalid bot response for aoe search');
        }
        return { type: 'aoe', result } as AOESearchResult;
      }
      default: {
        botResponse satisfies never;
        throw new Error('Unexpected search response type: ' + botResponse);
      }
    }
  };

  return searchFunction;
}
