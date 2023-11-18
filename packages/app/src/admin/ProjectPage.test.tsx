import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <AppRoutes />
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
});
