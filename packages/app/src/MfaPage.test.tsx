import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { act, fireEvent, render, screen } from './test-utils/render';

const medplum = new MockClient();

async function setup(): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/mfa']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <AppRoutes />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('MfaPage', () => {
  test('Renders', async () => {
    await setup();
    expect(screen.getByText('Multi Factor Auth Setup')).toBeInTheDocument();
  });

  test('Enroll', async () => {
    await setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enroll' }));
    });
    expect(screen.getByText('MFA is enabled')).toBeInTheDocument();
  });
});
