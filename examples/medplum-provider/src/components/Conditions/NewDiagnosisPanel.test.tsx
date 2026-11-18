// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { render } from '../../test-utils/render';
import NewDiagnosisPanel from './NewDiagnosisPanel';

const patient: Patient = { resourceType: 'Patient', id: 'patient-123' };
const encounter: Encounter = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: { code: 'AMB' },
};

describe('NewDiagnosisPanel', () => {
  test('requires an ICD-10 code, defaults the status to Active, and reports nothing until a code is picked', () => {
    const onChange = vi.fn();
    render(
      <MedplumProvider medplum={new MockClient()}>
        <NewDiagnosisPanel patient={patient} encounter={encounter} onChange={onChange} />
      </MedplumProvider>
    );
    expect(screen.getByText('ICD-10 Code')).toBeInTheDocument();
    expect(screen.getAllByText('*').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: 'Status' })).toHaveValue('Active');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
