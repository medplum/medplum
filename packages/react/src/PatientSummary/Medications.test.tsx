// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { MedicationRequest } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { Medications } from './Medications';

const medplum = new MockClient();

describe('PatientSummary - Medications', () => {
  async function setup(children: ReactNode): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', async () => {
    await setup(<Medications patient={HomerSimpson} medicationRequests={[]} />);
    expect(screen.getByText('Medications')).toBeInTheDocument();
  });

  test('Renders existing', async () => {
    await setup(
      <Medications
        patient={HomerSimpson}
        medicationRequests={[
          {
            resourceType: 'MedicationRequest',
            id: 'peanut',
            status: 'active',
            intent: 'order',
            subject: { reference: 'Patient/123' },
            medicationCodeableConcept: { text: 'Tylenol' },
          },
        ]}
      />
    );
    expect(screen.getByText('Medications')).toBeInTheDocument();
    expect(screen.getByText('Tylenol')).toBeInTheDocument();
  });

  test('Add medication', async () => {
    await setup(<Medications patient={HomerSimpson} medicationRequests={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    const input = (await screen.findByRole('searchbox')) as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Test Display')).toBeDefined();

    // Click "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Edit medication', async () => {
    const medication: MedicationRequest = {
      resourceType: 'MedicationRequest',
      id: 'tylenol',
      status: 'active',
      intent: 'order',
      subject: createReference(HomerSimpson),
      medicationCodeableConcept: { text: 'Tylenol' },
    };

    await setup(<Medications patient={HomerSimpson} medicationRequests={[medication]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Tylenol'));
    });

    const input = (await screen.findByRole('searchbox')) as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Test Display')).toBeDefined();

    // Click "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Medication status colors', async () => {
    await setup(
      <Medications
        patient={HomerSimpson}
        medicationRequests={[
          {
            resourceType: 'MedicationRequest',
            id: 'active',
            status: 'active',
            intent: 'order',
            subject: createReference(HomerSimpson),
            medicationCodeableConcept: { text: 'Active Medication' },
          },
          {
            resourceType: 'MedicationRequest',
            id: 'on-hold',
            status: 'on-hold',
            intent: 'order',
            subject: createReference(HomerSimpson),
            medicationCodeableConcept: { text: 'On Hold Medication' },
          },
          {
            resourceType: 'MedicationRequest',
            id: 'cancelled',
            status: 'cancelled',
            intent: 'order',
            subject: createReference(HomerSimpson),
            medicationCodeableConcept: { text: 'Cancelled Medication' },
          },
          {
            resourceType: 'MedicationRequest',
            id: 'completed',
            status: 'completed',
            intent: 'order',
            subject: createReference(HomerSimpson),
            medicationCodeableConcept: { text: 'Completed Medication' },
          },
          {
            resourceType: 'MedicationRequest',
            id: 'entered-in-error',
            status: 'entered-in-error',
            intent: 'order',
            subject: createReference(HomerSimpson),
            medicationCodeableConcept: { text: 'Error Medication' },
          },
          {
            resourceType: 'MedicationRequest',
            id: 'draft',
            status: 'draft',
            intent: 'order',
            subject: createReference(HomerSimpson),
            medicationCodeableConcept: { text: 'Draft Medication' },
          },
          {
            resourceType: 'MedicationRequest',
            id: 'stopped',
            status: 'stopped',
            intent: 'order',
            subject: createReference(HomerSimpson),
            medicationCodeableConcept: { text: 'Stopped Medication' },
          },
          {
            resourceType: 'MedicationRequest',
            id: 'unknown',
            status: 'unknown',
            intent: 'order',
            subject: createReference(HomerSimpson),
            medicationCodeableConcept: { text: 'Unknown Medication' },
          },
        ]}
      />
    );

    const activeBadge = screen.getByText('active').closest('[class*="mantine-Badge-root"]');
    expect(activeBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-green-light-color)' });

    const onHoldBadge = screen.getByText('on hold').closest('[class*="mantine-Badge-root"]');
    expect(onHoldBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-yellow-light-color)' });

    const cancelledBadge = screen.getByText('cancelled').closest('[class*="mantine-Badge-root"]');
    expect(cancelledBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-red-light-color)' });

    const completedBadge = screen.getByText('completed').closest('[class*="mantine-Badge-root"]');
    expect(completedBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-blue-light-color)' });

    const errorBadge = screen.getByText('entered in error').closest('[class*="mantine-Badge-root"]');
    expect(errorBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-red-light-color)' });

    const draftBadge = screen.getByText('draft').closest('[class*="mantine-Badge-root"]');
    expect(draftBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-gray-light-color)' });

    const stoppedBadge = screen.getByText('stopped').closest('[class*="mantine-Badge-root"]');
    expect(stoppedBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-red-light-color)' });

    const unknownBadge = screen.getByText('unknown').closest('[class*="mantine-Badge-root"]');
    expect(unknownBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-gray-light-color)' });
  });
});
