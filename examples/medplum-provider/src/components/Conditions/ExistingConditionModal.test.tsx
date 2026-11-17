// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { sleep } from '@medplum/core';
import type { Condition, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from '../../test-utils/render';
import ExistingConditionModal from './ExistingConditionModal';

const patient: WithId<Patient> = { resourceType: 'Patient', id: 'patient-1' };

function condition(code: string, clinicalStatus: string, verificationStatus?: string): Condition {
  return {
    resourceType: 'Condition',
    subject: { reference: 'Patient/patient-1' },
    clinicalStatus: { coding: [{ code: clinicalStatus, display: clinicalStatus }] },
    verificationStatus: verificationStatus ? { coding: [{ code: verificationStatus }] } : undefined,
    code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code, display: `Dx ${code}` }] },
  };
}

describe('ExistingConditionModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient({ seedDefaultData: false });
  });

  function setup(excludeIds: string[] = [], onSubmit = vi.fn(), excludeCodes: string[] = []): void {
    render(
      <MedplumProvider medplum={medplum}>
        <ExistingConditionModal
          opened
          onClose={vi.fn()}
          patient={patient}
          excludeIds={excludeIds}
          excludeCodes={excludeCodes}
          onSubmit={onSubmit}
        />
      </MedplumProvider>
    );
  }

  test('lists only current ICD-10-coded conditions not already on the encounter and submits the choice', async () => {
    const active = await medplum.createResource(condition('E11.9', 'active'));
    const linked = await medplum.createResource(condition('I10', 'active'));
    await medplum.createResource(condition('J20.9', 'resolved'));
    await medplum.createResource(condition('R05.9', 'active', 'entered-in-error'));
    await medplum.createResource({ ...condition('I10', 'active'), code: { text: 'Hypertension' } });
    const onSubmit = vi.fn();
    setup([linked.id], onSubmit);

    const radio = await screen.findByRole('radio', { name: 'E11.9 Dx E11.9' });
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    await userEvent.setup().click(radio);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }));
    expect(onSubmit).toHaveBeenCalledWith(active);
  });

  test('shows one row per code, keeping the most recently updated condition', async () => {
    await medplum.createResource(condition('A00.1', 'active'));
    await sleep(5);
    const newer = await medplum.createResource(condition('A00.1', 'active'));
    const onSubmit = vi.fn();
    setup([], onSubmit);

    const radio = await screen.findByRole('radio', { name: 'A00.1 Dx A00.1' });
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    await userEvent.setup().click(radio);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }));
    expect(onSubmit).toHaveBeenCalledWith(newer);
  });

  test('hides conditions whose code is already on the encounter', async () => {
    await medplum.createResource(condition('A00.1', 'active'));
    setup([], vi.fn(), ['A00.1']);
    expect(await screen.findByText('No other active diagnoses for this patient')).toBeInTheDocument();
  });

  test('searches the patient conditions by name on the server', async () => {
    const searchSpy = vi.spyOn(medplum, 'searchResources');
    setup();
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Search diagnoses' }), 'asthma');
    expect(screen.getByLabelText('Searching')).toBeInTheDocument();
    await waitFor(() =>
      expect(searchSpy).toHaveBeenLastCalledWith(
        'Condition',
        expect.objectContaining({ 'code:text': 'asthma', _sort: '-_lastUpdated', _count: '20' }),
        expect.anything()
      )
    );
    await waitFor(() => expect(screen.queryByLabelText('Searching')).not.toBeInTheDocument());
  });

  test('shows at most five conditions after collapsing duplicates', async () => {
    for (const code of ['A01.00', 'A01.00', 'A01.01', 'A01.02', 'A01.03', 'A01.04', 'A01.05']) {
      await medplum.createResource(condition(code, 'active'));
    }
    setup();
    await screen.findAllByRole('radio');
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  test('shows an empty state when the patient has no other current conditions', async () => {
    setup();
    expect(await screen.findByText('No other active diagnoses for this patient')).toBeInTheDocument();
  });
});
