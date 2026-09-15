// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { PractitionerRole, ProjectMembership } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DOSESPOT_PRACTITIONER_ROLE_TYPE_SYSTEM } from '../components/utils';
import { useDoseSpotAccess } from './useDoseSpotAccess';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const BASE_MEMBERSHIP: ProjectMembership = {
  resourceType: 'ProjectMembership',
  project: { reference: 'Project/test-project' },
  user: { reference: 'User/alice' },
  profile: { reference: `Practitioner/${DrAliceSmith.id}` },
};

const DENIED = { enrolled: false, hasAccess: false, needsSelfEnroll: false, loading: false };

const UNRELATED_ROLE: PractitionerRole = { resourceType: 'PractitionerRole', id: 'role-other', code: [{ text: 'RN' }] };

const DOSESPOT_ROLE: PractitionerRole = {
  resourceType: 'PractitionerRole',
  id: 'role-dosespot',
  code: [{ coding: [{ system: DOSESPOT_PRACTITIONER_ROLE_TYPE_SYSTEM, code: 'prescriber' }] }],
};

describe('useDoseSpotAccess', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function renderAccess(membership: ProjectMembership): { current: ReturnType<typeof useDoseSpotAccess> } {
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(membership);
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    );
    return renderHook(() => useDoseSpotAccess(), { wrapper }).result;
  }

  test('grants access without a role lookup when the membership already has a DoseSpot identifier', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    const result = renderAccess({
      ...BASE_MEMBERSHIP,
      identifier: [{ system: 'https://dosespot.com/clinician-id', value: '12345' }],
    });

    expect(result.current).toEqual({ enrolled: true, hasAccess: true, needsSelfEnroll: false, loading: false });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(searchResources).not.toHaveBeenCalled();
  });

  test('authorizes self-enrollment when an active PractitionerRole carries the DoseSpot code', async () => {
    const searchResources = vi
      .spyOn(medplum, 'searchResources')
      .mockResolvedValue(Object.assign([UNRELATED_ROLE, DOSESPOT_ROLE], { bundle: {} }) as never);
    const result = renderAccess(BASE_MEMBERSHIP);

    await waitFor(() => expect(result.current.hasAccess).toBe(true));
    expect(result.current).toEqual({ enrolled: false, hasAccess: true, needsSelfEnroll: true, loading: false });
    expect(searchResources).toHaveBeenCalledWith(
      'PractitionerRole',
      expect.objectContaining({ practitioner: `Practitioner/${DrAliceSmith.id}`, active: 'true', _count: '10' })
    );
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('denies access when no PractitionerRole carries the DoseSpot code', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue(Object.assign([UNRELATED_ROLE], { bundle: {} }) as never);
    const result = renderAccess(BASE_MEMBERSHIP);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual(DENIED);
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('shows an error notification and denies access when the role search fails', async () => {
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('Search exploded'));
    const result = renderAccess(BASE_MEMBERSHIP);

    await waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1));
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'DoseSpot Access Check Failed', message: 'Search exploded', color: 'red' })
    );
    expect(result.current).toEqual(DENIED);
  });
});
