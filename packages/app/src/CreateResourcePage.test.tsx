import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateResourcePage } from './CreateResourcePage';
import { ResourcePage } from './ResourcePage';

const medplum = new MockClient();

describe('CreateResourcePage', () => {
  async function setup(url: string): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <Routes>
              <Route path="/:resourceType/new" element={<CreateResourcePage />} />
              <Route path="/:resourceType/:id" element={<ResourcePage />} />
            </Routes>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Renders new Practitioner page', async () => {
    await setup('/Practitioner/new');
    await waitFor(() => screen.getByText('New Practitioner'));
    expect(screen.getByText('New Practitioner')).toBeInTheDocument();
  });

  test('Submit new Practitioner', async () => {
    await setup('/Practitioner/new');
    await waitFor(() => screen.getByText('OK'));
    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });
  });
});
