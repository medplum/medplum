// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { act, renderHook, waitFor } from '@testing-library/react';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { useDoseSpotAllergenSearch } from './useDoseSpotAllergenSearch';
import type { CodeableConcept } from '@medplum/fhirtypes';

const medplum = new MockClient();

describe('useDoseSpotAllergenSearch', () => {
  async function setup(): Promise<ReturnType<typeof useDoseSpotAllergenSearch>> {
    return renderHook(() => useDoseSpotAllergenSearch(), {
      wrapper: ({ children }: { children: ReactNode }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>,
    }).result.current;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('searchAllergens returns allergens successfully', async () => {
    const mockAllergens: CodeableConcept[] = [
      {
        text: 'Penicillin',
        coding: [
          {
            system: 'https://dosespot.com/allergen-id',
            code: '123',
            display: 'Penicillin',
          },
        ],
      },
      {
        text: 'Amoxicillin',
        coding: [
          {
            system: 'https://dosespot.com/allergen-id',
            code: '456',
            display: 'Amoxicillin',
          },
        ],
      },
    ];

    medplum.executeBot = jest.fn().mockResolvedValue(mockAllergens);

    const { searchAllergens } = await setup();

    let result: CodeableConcept[] = [];
    await act(async () => {
      result = await searchAllergens('penicillin');
    });

    await waitFor(() => {
      expect(result).toEqual(mockAllergens);
      expect(medplum.executeBot).toHaveBeenCalledWith(
        { system: 'https://www.medplum.com/bots', value: 'dosespot-search-allergen-bot' },
        { name: 'penicillin' }
      );
    });
  });

  test('searchAllergens handles empty results', async () => {
    medplum.executeBot = jest.fn().mockResolvedValue([]);

    const { searchAllergens } = await setup();

    let result: CodeableConcept[] = [];
    await act(async () => {
      result = await searchAllergens('nonexistent');
    });

    await waitFor(() => {
      expect(result).toEqual([]);
      expect(medplum.executeBot).toHaveBeenCalledWith(
        { system: 'https://www.medplum.com/bots', value: 'dosespot-search-allergen-bot' },
        { name: 'nonexistent' }
      );
    });
  });

  test('searchAllergens handles errors', async () => {
    const mockError = new Error('Bot execution failed');
    medplum.executeBot = jest.fn().mockRejectedValue(mockError);

    const { searchAllergens } = await setup();

    await expect(async () => {
      await act(async () => {
        await searchAllergens('test');
      });
    }).rejects.toThrow('Bot execution failed');
  });
});

