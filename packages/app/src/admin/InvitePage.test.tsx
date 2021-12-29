import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InvitePage } from './InvitePage';

const medplum = new MockClient();

const setup = (url: string) => {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <Routes>
          <Route path="/admin/projects/:id/invite" element={<InvitePage />} />
        </Routes>
      </MemoryRouter>
    </MedplumProvider>
  );
};

describe('InvitePage', () => {
  test('Renders', async () => {
    setup('/admin/projects/123/invite');

    await act(async () => {
      await waitFor(() => screen.getByText('Invite'));
    });

    expect(screen.getByText('Invite')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    setup('/admin/projects/123/invite');

    await act(async () => {
      await waitFor(() => screen.getByText('Invite'));
    });

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
});
