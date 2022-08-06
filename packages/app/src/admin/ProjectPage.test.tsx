import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BotsPage } from './BotsPage';
import { ClientsPage } from './ClientsPage';
import { CreateBotPage } from './CreateBotPage';
import { CreateClientPage } from './CreateClientPage';
import { InvitePage } from './InvitePage';
import { PatientsPage } from './PatientsPage';
import { ProjectDetailsPage } from './ProjectDetailsPage';
import { ProjectPage } from './ProjectPage';
import { SecretsPage } from './SecretsPage';
import { UsersPage } from './UsersPage';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/admin" element={<ProjectPage />}>
              <Route path="patients" element={<PatientsPage />} />
              <Route path="bots/new" element={<CreateBotPage />} />
              <Route path="bots" element={<BotsPage />} />
              <Route path="clients/new" element={<CreateClientPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="details" element={<ProjectDetailsPage />} />
              <Route path="invite" element={<InvitePage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="project" element={<ProjectDetailsPage />} />
              <Route path="secrets" element={<SecretsPage />} />
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

  test('Tab change', async () => {
    await setup('/admin/details');
    await waitFor(() => screen.getByText('Users'));

    await act(async () => {
      fireEvent.click(screen.getByText('Users'));
    });

    expect(screen.getByText('Invite new user')).toBeInTheDocument();
  });

  test('Users page', async () => {
    await setup('/admin/users');
    await waitFor(() => screen.getByText('Invite new user'));
    expect(screen.getByText('Invite new user')).toBeInTheDocument();
  });

  test('Patients page', async () => {
    await setup('/admin/patients');
    await waitFor(() => screen.getByText('Invite new patient'));
    expect(screen.getByText('Invite new patient')).toBeInTheDocument();
  });

  test('Clients page', async () => {
    await setup('/admin/clients');
    await waitFor(() => screen.getByText('Create new client'));
    expect(screen.getByText('Create new client')).toBeInTheDocument();
  });

  test('Bots page', async () => {
    await setup('/admin/bots');
    await waitFor(() => screen.getByText('Create new bot'));
    expect(screen.getByText('Create new bot')).toBeInTheDocument();
  });

  test('Secrets page', async () => {
    await setup('/admin/secrets');
    await waitFor(() => screen.getByText('Coming soon'));
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });
});
