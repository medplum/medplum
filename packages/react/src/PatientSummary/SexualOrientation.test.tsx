import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SexualOrientation } from './SexualOrientation';

const medplum = new MockClient();

describe('PatientSummary - SexualOrientation', () => {
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
    await setup(<SexualOrientation patient={HomerSimpson} />);
    expect(screen.getByText('Sexual Orientation')).toBeInTheDocument();
  });

  test('Renders existing', async () => {
    await setup(
      <SexualOrientation
        patient={HomerSimpson}
        sexualOrientation={{
          resourceType: 'Observation',
          id: 'sexualOrientation',
          status: 'final',
          code: { text: 'Sexual orientation' },
          valueCodeableConcept: { text: 'Heterosexual' },
        }}
      />
    );
    expect(screen.getByText('Sexual Orientation')).toBeInTheDocument();
    expect(screen.getByText('Heterosexual')).toBeInTheDocument();
  });

  test('Edit status', async () => {
    await setup(<SexualOrientation patient={HomerSimpson} />);

    await act(async () => {
      fireEvent.click(screen.getByText('+ Edit'));
    });

    // Click "Save" button
    const saveButton = await screen.findByText('Save');
    await act(async () => {
      fireEvent.click(saveButton);
    });
  });
});
