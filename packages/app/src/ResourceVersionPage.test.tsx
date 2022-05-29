import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ResourceVersionPage } from './ResourceVersionPage';

const medplum = new MockClient();

describe('ResourceVersionPage', () => {
  function setup(url: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/:resourceType/:id/_history/:versionId/:tab" element={<ResourceVersionPage />} />
            <Route path="/:resourceType/:id/_history/:versionId" element={<ResourceVersionPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  test('Resource not found', async () => {
    await act(async () => {
      setup('/Practitioner/not-found/_history/1');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource not found'));
    });

    expect(screen.getByText('Resource not found')).toBeInTheDocument();
  });

  test('Version not found', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/3');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Version not found'));
    });

    expect(screen.getByText('Version not found')).toBeInTheDocument();
  });

  test('Diff tab renders', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Diff'));
    });

    expect(screen.getByText('Diff')).toBeInTheDocument();
  });

  test('Diff tab renders last version', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/2');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Diff'));
    });

    expect(screen.getByText('Diff')).toBeInTheDocument();
  });

  test('Raw tab renders', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1/raw');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Raw'));
    });

    expect(screen.getByText('Raw')).toBeInTheDocument();
  });

  test('Change tab', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Diff'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Raw'));
    });

    expect(screen.getByText('Raw')).toBeInTheDocument();
  });
});
