import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

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
    expect(await screen.findAllByText('Project 123')).toHaveLength(2);
  });

  test('Backwards compat', async () => {
    await setup('/admin/project');
    expect(await screen.findAllByText('Project 123')).toHaveLength(2);
  });

  test('Tab change', async () => {
    await setup('/admin/details');
    expect(await screen.findByText('Users')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Users'));
    });

    expect(screen.getByText('Invite new user')).toBeInTheDocument();
  });

  test('Users page', async () => {
    await setup('/admin/users');
    expect(await screen.findByText('Invite new user')).toBeInTheDocument();
  });

  test('Patients page', async () => {
    await setup('/admin/patients');
    expect(await screen.findByText('Invite new patient')).toBeInTheDocument();
  });

  test('Clients page', async () => {
    await setup('/admin/clients');
    expect(await screen.findByText('Create new client')).toBeInTheDocument();
  });

  test('Bots page', async () => {
    await setup('/admin/bots');
    expect(await screen.findByText('Create new bot')).toBeInTheDocument();
  });
});
