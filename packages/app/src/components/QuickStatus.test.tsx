import { getReferenceString } from '@medplum/core';
import { ExampleUserConfiguration, HomerServiceRequest, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

const medplum = new MockClient();
medplum.getUserConfiguration = () => ExampleUserConfiguration;

describe('QuickStatus', () => {
  async function setup(url: string): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <AppRoutes />
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Updates on change', async () => {
    await setup(`/${getReferenceString(HomerServiceRequest)}`);

    // Wait for the page to load
    expect(await screen.findByDisplayValue('ORDERED')).toBeInTheDocument();

    // Expect the status selector to be visible
    expect(screen.getByDisplayValue('ORDERED')).toBeInTheDocument();

    // Change the status
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('ORDERED'), {
        target: { value: 'SENT_TO_CUSTOMER' },
      });
    });
  });
});
