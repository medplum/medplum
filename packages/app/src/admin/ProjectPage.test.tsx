import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectDetailsPage } from './ProjectDetailsPage';
import { ProjectPage } from './ProjectPage';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/admin" element={<ProjectPage />}>
              <Route path="details" element={<ProjectDetailsPage />} />
              <Route path="project" element={<ProjectDetailsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

describe('ProjectPage', () => {
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

  test('Renders', async () => {
    await setup('/admin/details');
    await waitFor(() => screen.queryAllByText('Project 123'));
    expect(screen.queryAllByText('Project 123')).toHaveLength(2);
  });

  test('Backwards compat', async () => {
    await setup('/admin/project');
    await waitFor(() => screen.queryAllByText('Project 123'));
    expect(screen.queryAllByText('Project 123')).toHaveLength(2);
  });
});
