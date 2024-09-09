import { createReference } from '@medplum/core';
import { AllergyIntolerance } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { Allergies } from './Allergies';

const medplum = new MockClient();

describe('PatientSummary - Allergies', () => {
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
    await setup(<Allergies patient={HomerSimpson} allergies={[]} />);
    expect(screen.getByText('Allergies')).toBeInTheDocument();
  });

  test('Renders existing', async () => {
    await setup(
      <Allergies
        patient={HomerSimpson}
        allergies={[
          {
            resourceType: 'AllergyIntolerance',
            id: 'peanut',
            patient: { reference: 'Patient/123' },
            code: { text: 'Peanut' },
          },
        ]}
      />
    );
    expect(screen.getByText('Allergies')).toBeInTheDocument();
    expect(screen.getByText('Peanut')).toBeInTheDocument();
  });

  test('Add allergy', async () => {
    await setup(<Allergies patient={HomerSimpson} allergies={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('+ Add'));
    });

    const input = (await screen.findAllByRole('searchbox'))[0] as HTMLInputElement;

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

  test('Edit allergy', async () => {
    const allergy: AllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      id: 'peanut',
      patient: createReference(HomerSimpson),
      code: { text: 'Peanut' },
    };

    await setup(<Allergies patient={HomerSimpson} allergies={[allergy]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Edit Peanut'));
    });

    const input = (await screen.findAllByRole('searchbox'))[0] as HTMLInputElement;

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
