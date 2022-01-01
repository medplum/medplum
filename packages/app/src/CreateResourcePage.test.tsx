import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateResourcePage } from './CreateResourcePage';
import { ResourcePage } from './ResourcePage';

const medplum = new MockClient();

describe('CreateResourcePage', () => {
  function setup(url: string): void {
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
  }

  test('Renders new Practitioner page', async () => {
    setup('/Practitioner/new');

    await act(async () => {
      await waitFor(() => screen.getByText('New Practitioner'));
    });

    expect(screen.getByText('New Practitioner')).toBeInTheDocument();
  });

  test('Submit new Practitioner', async () => {
    setup('/Practitioner/new');

    await act(async () => {
      await waitFor(() => screen.getByText('OK'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });
  });
});
