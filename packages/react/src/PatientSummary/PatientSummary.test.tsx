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
  });
});
