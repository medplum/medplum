// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { SCRIPTSURE_SEARCH_PHARMACY_BOT } from './common';
import { useScriptSurePharmacySearch } from './useScriptSurePharmacySearch';

describe('useScriptSurePharmacySearch', () => {
  const medplum = new MockClient();

  function wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{children}</MedplumProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('passes specialty filters to the search bot', async () => {
    const executeBot = vi.spyOn(medplum, 'executeBot').mockResolvedValue([]);

    const { result } = renderHook(() => useScriptSurePharmacySearch(), { wrapper });

    await result.current.searchPharmacies({ zip: '19720', specialties: ['Retail'] });

    await waitFor(() => {
      expect(executeBot).toHaveBeenCalledWith(SCRIPTSURE_SEARCH_PHARMACY_BOT, {
        zip: '19720',
        specialties: ['Retail'],
      });
    });
  });
});
