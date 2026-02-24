// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DOSESPOT_ADD_PATIENT_PHARMACY_BOT, DOSESPOT_SEARCH_PHARMACY_BOT } from './common';
import { useDoseSpotPharmacySearch } from './useDoseSpotPharmacySearch';

describe('useDoseSpotPharmacySearch', () => {
  let medplum: MedplumClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  function wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{children}</MedplumProvider>;
  }

  test('searchPharmacies calls executeBot with correct parameters', async () => {
    const mockResults: Organization[] = [{ resourceType: 'Organization', id: '1', name: 'Test Pharmacy' }];

    const executeBotSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValueOnce(mockResults);

    const { result } = renderHook(() => useDoseSpotPharmacySearch(), { wrapper });

    let pharmacies: Organization[] = [];
    await act(async () => {
      pharmacies = await result.current.searchPharmacies({ name: 'Test', city: 'Boston' });
    });

    expect(executeBotSpy).toHaveBeenCalledWith(DOSESPOT_SEARCH_PHARMACY_BOT, {
      name: 'Test',
      city: 'Boston',
    });
    expect(pharmacies).toEqual(mockResults);
  });

  test('searchPharmacies throws on invalid response', async () => {
    vi.spyOn(medplum, 'executeBot').mockResolvedValueOnce({ invalid: 'response' });

    const { result } = renderHook(() => useDoseSpotPharmacySearch(), { wrapper });

    await expect(
      act(async () => {
        await result.current.searchPharmacies({ name: 'Test' });
      })
    ).rejects.toThrow('Invalid response from pharmacy search');
  });

  test('addToFavorites calls executeBot with correct parameters', async () => {
    const mockResponse = { success: true, message: 'Pharmacy added successfully' };
    const mockPharmacy: Organization = { resourceType: 'Organization', id: '1', name: 'Test Pharmacy' };

    const executeBotSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useDoseSpotPharmacySearch(), { wrapper });

    let response: unknown;
    await act(async () => {
      response = await result.current.addToFavorites({
        patientId: 'patient-123',
        pharmacy: mockPharmacy,
        setAsPrimary: true,
      });
    });

    expect(executeBotSpy).toHaveBeenCalledWith(DOSESPOT_ADD_PATIENT_PHARMACY_BOT, {
      patientId: 'patient-123',
      pharmacy: mockPharmacy,
      setAsPrimary: true,
    });
    expect(response).toEqual(mockResponse);
  });

  test('addToFavorites throws on invalid response', async () => {
    const mockPharmacy: Organization = { resourceType: 'Organization', id: '1', name: 'Test Pharmacy' };

    vi.spyOn(medplum, 'executeBot').mockResolvedValueOnce('not a valid response');

    const { result } = renderHook(() => useDoseSpotPharmacySearch(), { wrapper });

    await expect(
      act(async () => {
        await result.current.addToFavorites({
          patientId: 'patient-123',
          pharmacy: mockPharmacy,
          setAsPrimary: false,
        });
      })
    ).rejects.toThrow('Invalid response from add pharmacy bot');
  });
});
