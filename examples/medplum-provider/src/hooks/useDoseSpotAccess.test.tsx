// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { PractitionerRole } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DOSESPOT_PRACTITIONER_ROLE_TYPE_SYSTEM } from '../components/utils';
import { useDoseSpotAccess } from './useDoseSpotAccess';

vi.mock('@mantine/notifications', () => ({ showNotification: vi.fn() }));

const DOSESPOT_ROLE: PractitionerRole = {
  resourceType: 'PractitionerRole',
  code: [{ coding: [{ system: DOSESPOT_PRACTITIONER_ROLE_TYPE_SYSTEM, code: 'prescriber' }] }],
};

const medplum = new MockClient();
const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
);

function renderAccess(): { current: ReturnType<typeof useDoseSpotAccess> } {
  return renderHook(() => useDoseSpotAccess(), { wrapper }).result;
}

describe('useDoseSpotAccess', () => {
  afterEach(() => vi.restoreAllMocks());

  test('grants access without a role lookup when the membership already has a DoseSpot identifier', () => {
    const membership = { identifier: [{ system: 'https://dosespot.com' }] } as never;
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(membership);
    const searchResources = vi.spyOn(medplum, 'searchResources');
    expect(renderAccess().current).toEqual({ enrolled: true, hasAccess: true, needsSelfEnroll: false, loading: false });
    expect(searchResources).not.toHaveBeenCalled();
  });

  test('authorizes self-enrollment when an active PractitionerRole carries the DoseSpot code', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources').mockResolvedValue([DOSESPOT_ROLE] as never);
    const result = renderAccess();
    await waitFor(() => expect(result.current.hasAccess).toBe(true));
    expect(result.current).toEqual({ enrolled: false, hasAccess: true, needsSelfEnroll: true, loading: false });
    expect(searchResources.mock.calls[0][1]).toMatchObject({ practitioner: `Practitioner/${DrAliceSmith.id}` });
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('shows an error notification and denies access when the role search fails', async () => {
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('Search exploded'));
    const result = renderAccess();
    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'DoseSpot Access Check Failed', message: 'Search exploded', color: 'red' })
      )
    );
    expect(result.current).toEqual({ enrolled: false, hasAccess: false, needsSelfEnroll: false, loading: false });
  });
});
