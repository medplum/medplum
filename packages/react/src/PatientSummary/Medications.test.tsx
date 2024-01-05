import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
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
          { resourceType: 'MedicationRequest', id: 'peanut', medicationCodeableConcept: { text: 'Tylenol' } },
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

    const input = screen.getByRole('searchbox') as HTMLInputElement;

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
