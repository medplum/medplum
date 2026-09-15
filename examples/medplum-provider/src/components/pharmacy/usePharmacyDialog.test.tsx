// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Identifier } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { DoseSpotPharmacyDialog } from './DoseSpotPharmacyDialog';
import { ScriptSurePharmacyDialog } from './ScriptSurePharmacyDialog';
import { usePharmacyDialog } from './usePharmacyDialog';

const SCRIPTSURE: Identifier = { system: 'https://scriptsure.com', value: '1' };
const DOSESPOT: Identifier = { system: 'https://dosespot.com', value: '1' };

function renderWithIdentifiers(identifier: Identifier[] | undefined): ReturnType<typeof usePharmacyDialog> {
  const medplum = new MockClient();
  const membership = identifier ? { ...medplum.getProjectMembership(), identifier } : undefined;
  vi.spyOn(medplum, 'getProjectMembership').mockReturnValue(membership as never);
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  return renderHook(() => usePharmacyDialog(), { wrapper }).result.current;
}

describe('usePharmacyDialog', () => {
  test.each<[string, Identifier[] | undefined, ReturnType<typeof usePharmacyDialog>]>([
    ['a ScriptSure identifier', [SCRIPTSURE], ScriptSurePharmacyDialog],
    ['a DoseSpot identifier', [DOSESPOT], DoseSpotPharmacyDialog],
    ['both identifiers (ScriptSure wins)', [DOSESPOT, SCRIPTSURE], ScriptSurePharmacyDialog],
    ['only unrelated identifiers', [{ system: 'https://example.com', value: '1' }], undefined],
    ['no membership', undefined, undefined],
  ])('membership with %s', (_label, identifier, expected) => {
    expect(renderWithIdentifiers(identifier)).toBe(expected);
  });
});
