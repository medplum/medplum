// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getSearchParameter, isUUID } from '@medplum/core';
import type { ResearchStudy } from '@medplum/fhirtypes';
import type { TokenColumnSearchParameterImplementation } from './searchparameter';
import { getSearchParameterImplementation } from './searchparameter';
import { loadStructureDefinitions } from './structure';
import { buildTokenColumns, getPaddingElement, hashTokenColumnValue } from './token-column';

const DELIM = '\x01';

describe('buildTokenColumns', () => {
  beforeAll(() => {
    loadStructureDefinitions();
  });

  test('shared columns', () => {
    const focus = getSearchParameter('ResearchStudy', 'focus');
    if (!focus) {
      throw new Error('Missing search parameter');
    }
    const focusImpl = getSearchParameterImplementation(
      'ResearchStudy',
      focus
    ) as TokenColumnSearchParameterImplementation;
    expect(focusImpl.searchStrategy).toStrictEqual('token-column');
    expect(focusImpl.hasDedicatedColumns).toStrictEqual(false);

    const location = getSearchParameter('ResearchStudy', 'location');
    if (!location) {
      throw new Error('Missing search parameter');
    }
    const locationImpl = getSearchParameterImplementation(
      'ResearchStudy',
      location
    ) as TokenColumnSearchParameterImplementation;
    expect(locationImpl.searchStrategy).toStrictEqual('token-column');
    expect(locationImpl.hasDedicatedColumns).toStrictEqual(false);

    const system = 'http://example.com';
    const rs: ResearchStudy = {
      resourceType: 'ResearchStudy',
      status: 'active',
      focus: [
        {
          coding: [
            {
              system,
              code: '123',
              display: 'ONE TWO THREE',
            },
          ],
        },
      ],
      location: [
        {
          coding: [
            {
              system,
              code: '123',
              display: 'ONE TWO THREE',
            },
          ],
        },
        {
          coding: [
            {
              system,
              code: '456',
              display: 'FOUR FIVE SIX',
            },
          ],
        },
      ],
    };

    const columns: Record<string, any> = {};

    buildTokenColumns(focus, focusImpl, columns, rs);
    expect(columns).toStrictEqual({
      __focusSort: '123',
      __sharedTokens: [
        'focus',
        'focus' + DELIM + DELIM + 'ONE TWO THREE', // since Medplum incorrectly supports exact search for :text entries
        'focus' + DELIM + system,
        'focus' + DELIM + system + DELIM + '123',
        'focus' + DELIM + DELIM + '123',
      ].map(hashTokenColumnValue),
      __sharedTokensText: ['focus' + DELIM + 'ONE TWO THREE'],
    });

    buildTokenColumns(location, locationImpl, columns, rs);
    expect(columns).toStrictEqual({
      __focusSort: '123',
      __locationSort: '123',
      __sharedTokens: [
        'focus',
        'focus' + DELIM + DELIM + 'ONE TWO THREE',
        'focus' + DELIM + system,
        'focus' + DELIM + system + DELIM + '123',
        'focus' + DELIM + DELIM + '123',
        'location',
        'location' + DELIM + DELIM + 'ONE TWO THREE',
        'location' + DELIM + system, // system is used twice in location, but should only appear once
        'location' + DELIM + system + DELIM + '123',
        'location' + DELIM + DELIM + '123',
        'location' + DELIM + DELIM + 'FOUR FIVE SIX',
        'location' + DELIM + system + DELIM + '456',
        'location' + DELIM + DELIM + '456',
      ].map(hashTokenColumnValue),
      __sharedTokensText: [
        'focus' + DELIM + 'ONE TWO THREE',
        'location' + DELIM + 'ONE TWO THREE',
        'location' + DELIM + 'FOUR FIVE SIX',
      ],
    });
  });
});

describe('getPaddingElement', () => {
  test('Math.random is 0.99999999', () => {
    const randomMock = jest.spyOn(Math, 'random').mockReturnValue(0.99999999);
    expect(getPaddingElement({ m: 1, lambda: 150, statisticsTarget: 1 })).toStrictEqual(undefined);
    // once to decide (not to) return a padding element
    expect(randomMock).toHaveBeenCalledTimes(1);
    randomMock.mockRestore();
  });

  test('Math.random is 0', () => {
    let callCount = 0;
    const randomMock = jest.spyOn(Math, 'random').mockImplementation(() => {
      // first call returns 0 to guarantee padding is returned
      if (callCount++ === 0) {
        return 0;
      }
      // second call returns 0.99999999 to guarantee the largest padding element is chosen
      return 0.99999999;
    });
    const paddingElement = getPaddingElement({ m: 20, lambda: 150, statisticsTarget: 1 });
    expect(paddingElement).toStrictEqual('00000000-0000-0000-0000-000000000019');
    expect(isUUID(paddingElement as string)).toStrictEqual(true);
    // once to decide whether to return a padding element, once to decide which padding element
    expect(randomMock).toHaveBeenCalledTimes(2);
    randomMock.mockRestore();
  });
});
