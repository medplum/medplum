import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectPage } from './ProjectPage';

const medplum = new MockClient();

function setup(url: string): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <Routes>
          <Route path="/admin/project" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>
    </MedplumProvider>
  );
}

describe('ProjectPage', () => {
  test('Renders', async () => {
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

    setup('/admin/project');

    await act(async () => {
      await waitFor(() => screen.getByText('Alice Smith'));
    });

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });
});
