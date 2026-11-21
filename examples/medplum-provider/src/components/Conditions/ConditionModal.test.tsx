// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from '../../test-utils/render';
import type { ConditionDialogProps } from './ConditionModal';
import ConditionModal from './ConditionModal';

const mockPatient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    code: 'AMB',
  },
  subject: { reference: 'Patient/patient-123' },
};

const asthma: Condition = {
  resourceType: 'Condition',
  subject: { reference: 'Patient/patient-123' },
  clinicalStatus: { coding: [{ code: 'active' }] },
  code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'J45.909', display: 'Asthma' }] },
};

describe('ConditionModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient({ seedDefaultData: false });
  });

  const modal = (props: Partial<ConditionDialogProps> = {}): JSX.Element => (
    <MedplumProvider medplum={medplum}>
      <ConditionModal
        opened
        onClose={vi.fn()}
        patient={mockPatient}
        encounter={mockEncounter}
        excludeCodes={[]}
        onSubmit={vi.fn()}
        onSelectExisting={vi.fn()}
        {...props}
      />
    </MedplumProvider>
  );

  test('opens on the existing tab and adds the picked diagnosis', async () => {
    const existing = await medplum.createResource(asthma);
    const onSelectExisting = vi.fn();
    const user = userEvent.setup();
    render(modal({ onSelectExisting }));

    expect(screen.getByRole('tab', { name: 'Existing Diagnosis' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Add Diagnosis' })).toBeDisabled();

    await user.click(await screen.findByRole('radio', { name: 'J45.909 Asthma' }));
    await user.click(screen.getByRole('button', { name: 'Add Diagnosis' }));
    expect(onSelectExisting).toHaveBeenCalledWith(existing);
  });

  test('new tab shows the code and status fields, defaulting the status to Active', async () => {
    const user = userEvent.setup();
    render(modal());

    await user.click(screen.getByRole('tab', { name: 'New Diagnosis' }));
    expect(screen.getByText('ICD-10 Code')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Status' })).toHaveValue('Active');
    expect(screen.getByRole('button', { name: 'Add Diagnosis' })).toBeDisabled();
  });

  test('does not show the previous results or tab when reopened', async () => {
    await medplum.createResource(asthma);
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(modal({ onClose }));
    await screen.findByRole('radio', { name: 'J45.909 Asthma' });
    await user.click(screen.getByRole('tab', { name: 'New Diagnosis' }));

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    rerender(modal({ onClose, opened: false }));
    rerender(modal({ onClose }));

    expect(screen.getByRole('tab', { name: 'Existing Diagnosis' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Searching')).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'J45.909 Asthma' })).toBeInTheDocument();
  });
});
