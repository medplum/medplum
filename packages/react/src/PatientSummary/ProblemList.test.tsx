import { createReference } from '@medplum/core';
import { Condition } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ProblemList } from './ProblemList';

const medplum = new MockClient();

describe('PatientSummary - ProblemList', () => {
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
    await setup(<ProblemList patient={HomerSimpson} problems={[]} />);
    expect(screen.getByText('Problem List')).toBeInTheDocument();
  });

  test('Renders existing', async () => {
    await setup(
      <ProblemList
        patient={HomerSimpson}
        problems={[
          {
            resourceType: 'Condition',
            id: 'peanut',
            subject: { reference: 'Patient/123' },
            code: { text: 'Peanut' },
          },
        ]}
      />
    );
    expect(screen.getByText('Problem List')).toBeInTheDocument();
    expect(screen.getByText('Peanut')).toBeInTheDocument();
  });

  test('Add problem', async () => {
    await setup(<ProblemList patient={HomerSimpson} problems={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('+ Add'));
    });

    // Enter problem "Dizziness"
    const input = (await screen.findAllByRole('searchbox'))[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Dizziness' } });
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

    // Enter Dx Date
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Dx Date *'), { target: { value: '2021-01-01' } });
    });

    // Click "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Edit problem', async () => {
    const condition: Condition = {
      resourceType: 'Condition',
      id: 'dizziness',
      subject: createReference(HomerSimpson),
      code: { text: 'Dizziness' },
    };

    await setup(<ProblemList patient={HomerSimpson} problems={[condition]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Edit Dizziness'));
    });

    // Enter problem "Dizziness"
    const input = (await screen.findAllByRole('searchbox'))[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Dizziness' } });
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

    // Enter Dx Date
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Dx Date *'), { target: { value: '2021-01-01' } });
    });

    // Click "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });
});
