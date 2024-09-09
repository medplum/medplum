import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { Vitals } from './Vitals';

const medplum = new MockClient();

describe('PatientSummary - Vitals', () => {
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
    await setup(<Vitals patient={HomerSimpson} vitals={[]} />);
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });

  test('Renders existing', async () => {
    await setup(
      <Vitals
        patient={HomerSimpson}
        vitals={[
          {
            resourceType: 'Observation',
            id: 'height',
            status: 'final',
            code: { coding: [{ code: '8302-2', display: 'height' }] },
            valueQuantity: { value: 180, unit: 'cm' },
          },
        ]}
      />
    );
    expect(screen.getByText('Vitals')).toBeInTheDocument();
    expect(screen.getByText('180 cm')).toBeInTheDocument();
  });

  test('Add vitals', async () => {
    await setup(<Vitals patient={HomerSimpson} vitals={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('+ Add'));
    });

    await screen.findByLabelText('BP Sys');

    // Enter systolic
    await act(async () => {
      fireEvent.change(screen.getByLabelText('BP Sys'), { target: { value: '100' } });
    });

    // Enter diastolic
    await act(async () => {
      fireEvent.change(screen.getByLabelText('BP Dias'), { target: { value: '80' } });
    });

    // Enter temperature
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Temp'), { target: { value: '98.6' } });
    });

    // Click "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });
});
