// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Organization, Practitioner, PractitionerRole, ProjectMembership } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { RenderHookResult } from '@testing-library/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { SCRIPTSURE_PRACTICE_ID_SYSTEM } from './common';
import type { ScriptSurePracticeContextValue } from './useScriptSurePractice';
import { ScriptSurePracticeProvider, useScriptSurePractice } from './useScriptSurePractice';

const PRACTITIONER: Practitioner = { resourceType: 'Practitioner', id: 'prac-1' };

function practiceOrg(id: string, practiceId: string): Organization {
  return {
    resourceType: 'Organization',
    id,
    name: `Practice ${practiceId}`,
    identifier: [{ system: SCRIPTSURE_PRACTICE_ID_SYSTEM, value: practiceId }],
  };
}

describe('useScriptSurePractice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  function setup(medplum: MockClient): RenderHookResult<ScriptSurePracticeContextValue, unknown> {
    function wrapper({ children }: { children: ReactNode }): JSX.Element {
      return (
        <MedplumProvider medplum={medplum}>
          <ScriptSurePracticeProvider>{children}</ScriptSurePracticeProvider>
        </MedplumProvider>
      );
    }
    return renderHook(() => useScriptSurePractice(), { wrapper });
  }

  test('auto-selects the sole affiliated practice and lists only affiliations', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue(PRACTITIONER);
    const org = practiceOrg('org-1', '7256');
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-1' } },
    ] as Awaited<ReturnType<typeof medplum.searchResources>>);
    vi.spyOn(medplum, 'readReference').mockResolvedValue(org as Awaited<ReturnType<typeof medplum.readReference>>);

    const { result } = setup(medplum);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.practices.map((p) => p.id)).toEqual(['org-1']);
    expect(result.current.selectedOrganizationId).toBe('org-1');
  });

  test('does not auto-select when the prescriber has multiple affiliations', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue(PRACTITIONER);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-1' } },
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-2' } },
    ] as Awaited<ReturnType<typeof medplum.searchResources>>);
    vi.spyOn(medplum, 'readReference').mockImplementation((async (ref: { reference: string }) =>
      practiceOrg(
        ref.reference.slice('Organization/'.length),
        ref.reference.endsWith('1') ? '7256' : '7257'
      )) as typeof medplum.readReference);

    const { result } = setup(medplum);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.practices.map((p) => p.id).sort()).toEqual(['org-1', 'org-2']);
    expect(result.current.selectedOrganizationId).toBeUndefined();
  });

  test('excludes organizations without a practice-id identifier', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue(PRACTITIONER);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-1' } },
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-bare' } },
    ] as Awaited<ReturnType<typeof medplum.searchResources>>);
    vi.spyOn(medplum, 'readReference').mockImplementation((async (ref: { reference: string }) =>
      ref.reference === 'Organization/org-1'
        ? practiceOrg('org-1', '7256')
        : ({
            resourceType: 'Organization',
            id: 'org-bare',
            name: 'Not a practice',
          } as Organization)) as typeof medplum.readReference);

    const { result } = setup(medplum);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.practices.map((p) => p.id)).toEqual(['org-1']);
    expect(result.current.selectedOrganizationId).toBe('org-1');
  });

  test('ignores a stored selection that is no longer an affiliation', async () => {
    localStorage.setItem('medplum.scriptsure.selectedPracticeOrganization', 'org-stale');
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue(PRACTITIONER);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-1' } },
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-2' } },
    ] as Awaited<ReturnType<typeof medplum.searchResources>>);
    vi.spyOn(medplum, 'readReference').mockImplementation((async (ref: { reference: string }) =>
      practiceOrg(
        ref.reference.slice('Organization/'.length),
        ref.reference.endsWith('1') ? '7256' : '7257'
      )) as typeof medplum.readReference);

    const { result } = setup(medplum);

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Stale stored id is dropped (not in the affiliation set), and >1 affiliation → no auto-select.
    expect(result.current.selectedOrganizationId).toBeUndefined();
  });

  test('restores a stored selection that is still an affiliation', async () => {
    localStorage.setItem('medplum.scriptsure.selectedPracticeOrganization', 'org-2');
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue(PRACTITIONER);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-1' } },
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-2' } },
    ] as Awaited<ReturnType<typeof medplum.searchResources>>);
    vi.spyOn(medplum, 'readReference').mockImplementation((async (ref: { reference: string }) =>
      practiceOrg(
        ref.reference.slice('Organization/'.length),
        ref.reference.endsWith('1') ? '7256' : '7257'
      )) as typeof medplum.readReference);

    const { result } = setup(medplum);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedOrganizationId).toBe('org-2');
  });

  test('resolves the Practitioner id when the profile is a PractitionerRole', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue({
      resourceType: 'PractitionerRole',
      id: 'role-1',
      practitioner: { reference: 'Practitioner/prac-1' },
    } as PractitionerRole);
    const searchSpy = vi
      .spyOn(medplum, 'searchResources')
      .mockResolvedValue([
        { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-1' } },
      ] as Awaited<ReturnType<typeof medplum.searchResources>>);
    vi.spyOn(medplum, 'readReference').mockResolvedValue(
      practiceOrg('org-1', '7256') as Awaited<ReturnType<typeof medplum.readReference>>
    );

    const { result } = setup(medplum);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(searchSpy).toHaveBeenCalledWith(
      'PractitionerRole',
      expect.objectContaining({ practitioner: 'Practitioner/prac-1' })
    );
    expect(result.current.selectedOrganizationId).toBe('org-1');
  });

  test('discovers practices from ProjectMembership.access organization parameters', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue(PRACTITIONER);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as Awaited<ReturnType<typeof medplum.searchResources>>);
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue({
      resourceType: 'ProjectMembership',
      access: [{ parameter: [{ name: 'organization', valueReference: { reference: 'Organization/org-9' } }] }],
    } as ProjectMembership);
    vi.spyOn(medplum, 'readReference').mockResolvedValue(
      practiceOrg('org-9', '9001') as Awaited<ReturnType<typeof medplum.readReference>>
    );

    const { result } = setup(medplum);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.practices.map((p) => p.id)).toEqual(['org-9']);
    expect(result.current.selectedOrganizationId).toBe('org-9');
  });

  test('excludes inactive PractitionerRole affiliations', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue(PRACTITIONER);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      { resourceType: 'PractitionerRole', active: false, organization: { reference: 'Organization/org-inactive' } },
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-1' } },
    ] as Awaited<ReturnType<typeof medplum.searchResources>>);
    vi.spyOn(medplum, 'readReference').mockImplementation((async (ref: { reference: string }) =>
      practiceOrg(ref.reference.slice('Organization/'.length), '7256')) as typeof medplum.readReference);

    const { result } = setup(medplum);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.practices.map((p) => p.id)).toEqual(['org-1']);
  });

  test('setSelectedOrganizationId persists a selection and clears it', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue(PRACTITIONER);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-1' } },
      { resourceType: 'PractitionerRole', organization: { reference: 'Organization/org-2' } },
    ] as Awaited<ReturnType<typeof medplum.searchResources>>);
    vi.spyOn(medplum, 'readReference').mockImplementation((async (ref: { reference: string }) =>
      practiceOrg(
        ref.reference.slice('Organization/'.length),
        ref.reference.endsWith('1') ? '7256' : '7257'
      )) as typeof medplum.readReference);

    const { result } = setup(medplum);
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSelectedOrganizationId('org-2'));
    expect(result.current.selectedOrganizationId).toBe('org-2');
    expect(localStorage.getItem('medplum.scriptsure.selectedPracticeOrganization')).toBe('org-2');

    act(() => result.current.setSelectedOrganizationId(undefined));
    expect(result.current.selectedOrganizationId).toBeUndefined();
    expect(localStorage.getItem('medplum.scriptsure.selectedPracticeOrganization')).toBeNull();
  });

  test('falls back to no practices when affiliation discovery fails', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProfile').mockReturnValue(PRACTITIONER);
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('boom'));

    const { result } = setup(medplum);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.practices).toEqual([]);
    expect(result.current.selectedOrganizationId).toBeUndefined();
  });

  test('default context setter is a no-op when used outside the provider', () => {
    const { result } = renderHook(() => useScriptSurePractice());
    expect(result.current.practices).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(() => result.current.setSelectedOrganizationId('x')).not.toThrow();
  });
});
