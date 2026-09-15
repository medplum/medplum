// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { PractitionerRole, ProjectMembership } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
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
  id: 'membership-alice',
  project: { reference: 'Project/test-project' },
  user: { reference: 'User/alice' },
  profile: { reference: `Practitioner/${DrAliceSmith.id}` },
};

const ENROLLED_MEMBERSHIP: ProjectMembership = {
  ...BASE_MEMBERSHIP,
  identifier: [{ system: 'https://dosespot.com/clinician-id', value: '12345' }],
};

const DOSESPOT_ROLE: WithId<PractitionerRole> = {
  resourceType: 'PractitionerRole',
  id: 'role-dosespot',
  active: true,
  practitioner: { reference: `Practitioner/${DrAliceSmith.id}` },
  code: [
    { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/practitioner-role', code: 'doctor' }] },
    { coding: [{ system: DOSESPOT_PRACTITIONER_ROLE_TYPE_SYSTEM, code: 'prescriber' }] },
  ],
};

/** Exercises every falsy path of the role check: no code, a code with no coding, and another system. */
const UNRELATED_ROLES: WithId<PractitionerRole>[] = [
  {
    resourceType: 'PractitionerRole',
    id: 'role-no-code',
    active: true,
    practitioner: { reference: `Practitioner/${DrAliceSmith.id}` },
  },
  {
    resourceType: 'PractitionerRole',
    id: 'role-text-only',
    active: true,
    practitioner: { reference: `Practitioner/${DrAliceSmith.id}` },
    code: [{ text: 'Attending' }],
  },
  {
    resourceType: 'PractitionerRole',
    id: 'role-other-system',
    active: true,
    practitioner: { reference: `Practitioner/${DrAliceSmith.id}` },
    code: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/practitioner-role', code: 'nurse' }] }],
  },
];

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('useDoseSpotAccess', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('grants access without a role lookup when the membership already has a DoseSpot identifier', async () => {
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(ENROLLED_MEMBERSHIP);
    const searchResources = vi.spyOn(medplum, 'searchResources');

    const { result } = renderHook(() => useDoseSpotAccess(), { wrapper: wrapper(medplum) });

    expect(result.current).toEqual({ enrolled: true, hasAccess: true, needsSelfEnroll: false, loading: false });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(searchResources).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('reports loading while the PractitionerRole search is in flight', async () => {
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(BASE_MEMBERSHIP);
    vi.spyOn(medplum, 'searchResources').mockImplementation(() => new Promise(() => {}) as never);

    const { result } = renderHook(() => useDoseSpotAccess(), { wrapper: wrapper(medplum) });

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.enrolled).toBe(false);
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.needsSelfEnroll).toBe(false);
  });

  test('authorizes self-enrollment when an active PractitionerRole carries the DoseSpot code', async () => {
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(BASE_MEMBERSHIP);
    const searchResources = vi
      .spyOn(medplum, 'searchResources')
      .mockResolvedValue(Object.assign([...UNRELATED_ROLES, DOSESPOT_ROLE], { bundle: {} }) as never);

    const { result } = renderHook(() => useDoseSpotAccess(), { wrapper: wrapper(medplum) });

    await waitFor(() => expect(result.current.hasAccess).toBe(true));
    expect(result.current).toEqual({ enrolled: false, hasAccess: true, needsSelfEnroll: true, loading: false });
    expect(searchResources).toHaveBeenCalledWith(
      'PractitionerRole',
      expect.objectContaining({ practitioner: `Practitioner/${DrAliceSmith.id}`, active: 'true', _count: '10' })
    );
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('denies access when no PractitionerRole carries the DoseSpot code', async () => {
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(BASE_MEMBERSHIP);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue(
      Object.assign([...UNRELATED_ROLES], { bundle: {} }) as never
    );

    const { result } = renderHook(() => useDoseSpotAccess(), { wrapper: wrapper(medplum) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ enrolled: false, hasAccess: false, needsSelfEnroll: false, loading: false });
    expect(showNotification).not.toHaveBeenCalled();
  });

  test('denies access when the search returns no roles', async () => {
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(BASE_MEMBERSHIP);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue(Object.assign([], { bundle: {} }) as never);

    const { result } = renderHook(() => useDoseSpotAccess(), { wrapper: wrapper(medplum) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.needsSelfEnroll).toBe(false);
  });

  test('skips the role lookup when the profile is not a Practitioner', async () => {
    medplum.mock.setProfile(HomerSimpson);
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue({
      ...BASE_MEMBERSHIP,
      profile: { reference: `Patient/${HomerSimpson.id}` },
    });
    const searchResources = vi.spyOn(medplum, 'searchResources');

    const { result } = renderHook(() => useDoseSpotAccess(), { wrapper: wrapper(medplum) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ enrolled: false, hasAccess: false, needsSelfEnroll: false, loading: false });
    expect(searchResources).not.toHaveBeenCalled();
  });

  test('still runs the role lookup and reports not enrolled when there is no membership', async () => {
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(undefined);
    const searchResources = vi
      .spyOn(medplum, 'searchResources')
      .mockResolvedValue(Object.assign([DOSESPOT_ROLE], { bundle: {} }) as never);

    const { result } = renderHook(() => useDoseSpotAccess(), { wrapper: wrapper(medplum) });

    await waitFor(() => expect(result.current.hasAccess).toBe(true));
    expect(searchResources).toHaveBeenCalledWith(
      'PractitionerRole',
      expect.objectContaining({ practitioner: `Practitioner/${DrAliceSmith.id}` })
    );
    expect(result.current.enrolled).toBe(false);
    expect(result.current.needsSelfEnroll).toBe(true);
  });

  test('shows an error notification and denies access when the role search fails', async () => {
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(BASE_MEMBERSHIP);
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('Search exploded'));

    const { result } = renderHook(() => useDoseSpotAccess(), { wrapper: wrapper(medplum) });

    await waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1));
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'DoseSpot Access Check Failed', message: 'Search exploded', color: 'red' })
    );
    expect(result.current).toEqual({ enrolled: false, hasAccess: false, needsSelfEnroll: false, loading: false });
  });
});
