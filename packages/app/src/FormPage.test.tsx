import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FormPage } from './FormPage';

const medplum = new MockClient();

describe('FormPage', () => {
  function setup(url: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/forms/:id" element={<FormPage />} />
            <Route path="/:resourceType/:id" element={<div />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  test('Not found', async () => {
    setup('/forms/not-found');

    await act(async () => {
      await waitFor(() => screen.getByTestId('error'));
    });

    expect(screen.getByTestId('error')).toBeInTheDocument();
  });

  test('Form renders', async () => {
    setup('/forms/123');

    await act(async () => {
      await waitFor(() => screen.getByText('First question'));
    });

    expect(screen.getByText('First question')).toBeInTheDocument();
  });

  test('Submit', async () => {
    setup('/forms/123');

    await act(async () => {
      await waitFor(() => screen.getByText('First question'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.queryByText('First question')).not.toBeInTheDocument();
  });

  test('Patient subject', async () => {
    setup('/forms/123?subject=Patient/123');

    await act(async () => {
      await waitFor(() => screen.getByText('First question'));
    });

    expect(screen.getByText('First question')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });
  });

  test('ServiceRequest subject', async () => {
    setup('/forms/123?subject=ServiceRequest/123');

    await act(async () => {
      await waitFor(() => screen.getByText('First question'));
    });

    expect(screen.getByText('First question')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });
});
