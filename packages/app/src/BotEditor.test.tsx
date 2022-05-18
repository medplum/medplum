import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ResourcePage } from './ResourcePage';

let medplum: MockClient;

describe('BotEditor', () => {
  async function setup(url: string): Promise<void> {
    medplum = new MockClient();
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <Routes>
              <Route path="/:resourceType/:id/:tab" element={<ResourcePage />} />
            </Routes>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  beforeAll(() => {
    window.MessageChannel = jest.fn(
      () =>
        ({
          port1: jest.fn(),
          port2: jest.fn(),
        } as unknown as MessageChannel)
    );
  });

  test('Bot editor', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Editor'));
    expect(screen.getByText('Editor')).toBeInTheDocument();
  });

  test('Save', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Save'));

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Simulate', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Simulate'));

    await act(async () => {
      fireEvent.click(screen.getByText('Simulate'));
    });
  });

  test('Deploy', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Deploy'));

    await act(async () => {
      fireEvent.click(screen.getByText('Deploy'));
    });
  });

  test('Execute', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Execute'));

    await act(async () => {
      fireEvent.click(screen.getByText('Execute'));
    });
  });
});
