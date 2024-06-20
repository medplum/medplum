import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '../test-utils/render';
import { PatientSummary, PatientSummaryProps } from './PatientSummary';

const medplum = new MockClient();

describe('PatientSummary', () => {
  async function setup(args: PatientSummaryProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <PatientSummary {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders', async () => {
    await setup({ patient: HomerSimpson });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('No upcoming appointments')).toBeInTheDocument();
    expect(screen.getByText('No documented visits')).toBeInTheDocument();
  });

  test('Renders with gender missing', async () => {
    await setup({ patient: { ...HomerSimpson, gender: undefined } });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders without appointment and encounter links', async () => {
    await setup({
      patient: { ...HomerSimpson, gender: undefined },
      appointmentsUrl: undefined,
      encountersUrl: undefined,
    });

    // const foo = screen.findByText('No upcoming appointments')
    expect(screen.queryByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.queryByText('No upcoming appointments')).toBeNull();
    expect(screen.queryByText('No documented visits')).toBeNull();
  });
});
