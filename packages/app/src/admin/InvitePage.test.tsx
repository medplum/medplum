import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InvitePage } from './InvitePage';
import { ProjectPage } from './ProjectPage';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/admin" element={<ProjectPage />}>
              <Route path="invite" element={<InvitePage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

describe('InvitePage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

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
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByTestId('firstName'), {
        target: { value: 'George' },
      });
      fireEvent.change(screen.getByTestId('lastName'), {
        target: { value: 'Washington' },
      });
      fireEvent.change(screen.getByTestId('email'), {
        target: { value: 'george@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Invite'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Submit with access policy', async () => {
    await setup('/admin/invite');
    await waitFor(() => screen.getByText('Invite'));

    expect(screen.getByText('Invite')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByTestId('firstName'), {
        target: { value: 'George' },
      });
      fireEvent.change(screen.getByTestId('lastName'), {
        target: { value: 'Washington' },
      });
      fireEvent.change(screen.getByTestId('email'), {
        target: { value: 'george@example.com' },
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
      fireEvent.click(screen.getByText('Invite'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });
});
