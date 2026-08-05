// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AddPharmacyResponse } from '@medplum/core';
import type { Identifier, Organization } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { usePharmacySearch } from './usePharmacySearch';

const SEARCH_BOT: Identifier = { system: 'https://example.com/bot', value: 'search' };
const ADD_BOT: Identifier = { system: 'https://example.com/bot', value: 'add' };
const PHARMACY: Organization = { resourceType: 'Organization', id: 'pharm-1', name: 'Test Pharmacy' };

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('usePharmacySearch', () => {
  test('searchPharmacies returns organizations from the search bot', async () => {
    const medplum = new MockClient();
    const executeBot = vi.spyOn(medplum, 'executeBot').mockResolvedValue([PHARMACY]);

    const { result } = renderHook(() => usePharmacySearch(SEARCH_BOT, ADD_BOT), { wrapper: wrapper(medplum) });

    let orgs: Organization[] = [];
    await act(async () => {
      orgs = await result.current.searchPharmacies({
        name: 'Test',
        organization: { reference: 'Organization/org-1' },
      });
    });

    expect(orgs).toEqual([PHARMACY]);
    expect(executeBot).toHaveBeenCalledWith(SEARCH_BOT, { name: 'Test', organizationId: 'org-1' });
  });

  test('searchPharmacies throws on an invalid response', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ not: 'an array' });

    const { result } = renderHook(() => usePharmacySearch(SEARCH_BOT, ADD_BOT), { wrapper: wrapper(medplum) });

    await act(async () => {
      await expect(result.current.searchPharmacies({ name: 'Test' })).rejects.toThrow('Invalid response');
    });
  });

  test('addToFavorites resolves the practice reference for the add bot', async () => {
    const medplum = new MockClient();
    const response: AddPharmacyResponse = { success: true, message: 'ok', organization: PHARMACY };
    const executeBot = vi.spyOn(medplum, 'executeBot').mockResolvedValue(response);

    const { result } = renderHook(() => usePharmacySearch(SEARCH_BOT, ADD_BOT), { wrapper: wrapper(medplum) });

    let res: AddPharmacyResponse | undefined;
    await act(async () => {
      res = await result.current.addToFavorites({
        patientId: 'pat-1',
        pharmacy: PHARMACY,
        setAsPrimary: true,
        organization: { reference: 'Organization/org-9' },
      });
    });

    expect(res).toEqual(response);
    expect(executeBot).toHaveBeenCalledWith(ADD_BOT, {
      patientId: 'pat-1',
      pharmacy: PHARMACY,
      setAsPrimary: true,
      organizationId: 'org-9',
    });
  });

  test('addToFavorites throws on an invalid response', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ unexpected: true });

    const { result } = renderHook(() => usePharmacySearch(SEARCH_BOT, ADD_BOT), { wrapper: wrapper(medplum) });

    await act(async () => {
      await expect(
        result.current.addToFavorites({ patientId: 'pat-1', pharmacy: PHARMACY, setAsPrimary: false })
      ).rejects.toThrow('Invalid response');
    });
  });
});
