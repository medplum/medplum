import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateBotPage } from './CreateBotPage';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/admin/projects/:projectId/bot" element={<CreateBotPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

describe('CreateBotPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup('/admin/projects/123/bot');
    await waitFor(() => screen.getByText('Create Bot'));
    expect(screen.getByText('Create Bot')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    await setup('/admin/projects/123/bot');
    await waitFor(() => screen.getByText('Create Bot'));

    expect(screen.getByText('Create Bot')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByTestId('name'), {
        target: { value: 'Test Bot' },
      });
      fireEvent.change(screen.getByTestId('description'), {
        target: { value: 'Test Description' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create Bot'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Submit with access policy', async () => {
    await setup('/admin/projects/123/bot');
    await waitFor(() => screen.getByText('Create Bot'));

    expect(screen.getByText('Create Bot')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByTestId('name'), {
        target: { value: 'Test Bot' },
      });
      fireEvent.change(screen.getByTestId('description'), {
        target: { value: 'Test Description' },
      });
    });

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Example Access Policy"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Example Access Policy' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create Bot'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });
});
