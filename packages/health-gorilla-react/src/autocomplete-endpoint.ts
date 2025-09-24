// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, MedplumClient, isCoding, isResource } from '@medplum/core';
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

export function getAutocompleteSearchFunction(
  medplum: MedplumClient,
  autocompleteBot: string | Identifier
): HGSearchFunction {
  return async (params) => {
    const botResponse: HGAutocompleteBotResponse = await medplum.executeBot(autocompleteBot, params, ContentType.JSON);
    if (botResponse.type === 'error') {
      throw new Error('Error executing autocomplete bot', { cause: botResponse });
    }

    const { result } = botResponse;
    switch (botResponse.type) {
      case 'lab': {
        if (Array.isArray(result) && result.every((item) => isResource(item, 'Organization'))) {
          return { type: 'lab', result } as LabSearchResult;
        }
        break;
      }
      case 'test': {
        const { result } = botResponse;
        if (Array.isArray(result) && result.every((item) => isCoding(item))) {
          return { type: 'test', result } as TestSearchResult;
        }
        break;
      }
      case 'aoe': {
        const { result } = botResponse;
        if (result === undefined || result.resourceType === 'Questionnaire') {
          return { type: 'aoe', result } as AOESearchResult;
        }
        break;
      }
      default: {
        botResponse satisfies never;
      }
    }
    throw new Error(`Invalid bot response for ${JSON.stringify(params)}`);
  };
}
