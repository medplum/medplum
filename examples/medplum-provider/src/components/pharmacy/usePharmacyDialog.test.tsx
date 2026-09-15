// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProjectMembership } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook } from '@testing-library/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DoseSpotPharmacyDialog } from './DoseSpotPharmacyDialog';
import { ScriptSurePharmacyDialog } from './ScriptSurePharmacyDialog';
import { usePharmacyDialog } from './usePharmacyDialog';

const baseMembership: ProjectMembership = {
  resourceType: 'ProjectMembership',
  id: 'membership-1',
  project: { reference: 'Project/test' },
  user: { reference: 'User/test' },
  profile: { reference: 'Practitioner/test' },
};

describe('usePharmacyDialog', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );

  const setMembership = (membership: ProjectMembership | undefined): void => {
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(membership);
  };

  test('returns the ScriptSure dialog when the membership has a ScriptSure identifier', () => {
    setMembership({ ...baseMembership, identifier: [{ system: 'https://scriptsure.com', value: '1' }] });
    const { result } = renderHook(() => usePharmacyDialog(), { wrapper });
    expect(result.current).toBe(ScriptSurePharmacyDialog);
  });

  test('returns the DoseSpot dialog when the membership has a DoseSpot identifier', () => {
    setMembership({ ...baseMembership, identifier: [{ system: 'https://dosespot.com', value: '1' }] });
    const { result } = renderHook(() => usePharmacyDialog(), { wrapper });
    expect(result.current).toBe(DoseSpotPharmacyDialog);
  });

  test('prefers ScriptSure when both identifiers are present', () => {
    setMembership({
      ...baseMembership,
      identifier: [
        { system: 'https://dosespot.com', value: '1' },
        { system: 'https://scriptsure.com', value: '2' },
      ],
    });
    const { result } = renderHook(() => usePharmacyDialog(), { wrapper });
    expect(result.current).toBe(ScriptSurePharmacyDialog);
  });

  test('returns undefined when the membership has unrelated identifiers', () => {
    setMembership({ ...baseMembership, identifier: [{ system: 'https://example.com', value: '1' }] });
    const { result } = renderHook(() => usePharmacyDialog(), { wrapper });
    expect(result.current).toBeUndefined();
  });

  test('returns undefined when there is no membership', () => {
    setMembership(undefined);
    const { result } = renderHook(() => usePharmacyDialog(), { wrapper });
    expect(result.current).toBeUndefined();
  });
});
