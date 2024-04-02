import { createReference } from '@medplum/core';
import { MedicationRequest } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
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
      fireEvent.click(screen.getByText('+ Add'));
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
      fireEvent.click(screen.getByLabelText('Edit Tylenol'));
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
});
