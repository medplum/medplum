import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditMembershipPage } from './EditMembershipPage';

const medplum = new MockClient({
  'admin/projects/123': {
    GET: {
      project: { id: '123', name: 'Project 123' },
      members: [{ profile: 'Practitioner/456', name: 'Alice Smith' }],
    },
  },
});

const setup = (url: string) => {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <Routes>
          <Route path="/admin/projects/:projectId/members/:membershipId" element={<EditMembershipPage />} />
        </Routes>
      </MemoryRouter>
    </MedplumProvider>
  );
};

describe('EditMembershipPage', () => {
  test('Renders', async () => {
    setup('/admin/projects/123/members/456');

    await act(async () => {
      await waitFor(() => screen.getByText('Edit'));
    });

    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    setup('/admin/projects/123/members/456');

    await act(async () => {
      await waitFor(() => screen.getByText('Edit'));
    });

    expect(screen.getByText('Edit')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });
});
