import { MockClient } from '@medplum/mock';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from './MedplumProvider';
import { RequestGroupDisplay } from './RequestGroupDisplay';

const medplum = new MockClient();

async function setup(ui: React.ReactElement): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{ui}</MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('RequestGroupDisplay', () => {
  test('Renders undefined', async () => {
    await setup(<RequestGroupDisplay />);
  });

  test('Renders reference', async () => {
    await setup(<RequestGroupDisplay value={{ reference: 'RequestGroup/workflow-request-group-1' }} />);
    expect(screen.getByText('Patient Registration')).toBeDefined();
  });
});
