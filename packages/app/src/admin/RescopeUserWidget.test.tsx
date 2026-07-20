// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk, badRequest } from '@medplum/core';
import type { Project, User } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import type { MockInstance } from 'vitest';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { RescopeUserWidget } from './RescopeUserWidget';

describe('RescopeUserWidget', () => {
  let medplum: MockClient;
  let postSpy: MockInstance;

  const project: Project = { resourceType: 'Project', id: 'project-1', name: 'Test Project' };
  const projectScopedUser: User = {
    resourceType: 'User',
    id: 'user-1',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Example',
    meta: { project: 'project-1' },
  };
  const serverUser: User = {
    resourceType: 'User',
    id: 'user-2',
    email: 'bob@example.com',
    firstName: 'Bob',
    lastName: 'Example',
  };

  function setup(opts: { superAdmin?: boolean } = {}): void {
    vi.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => opts.superAdmin ?? true);
    if (!opts.superAdmin) {
      medplum.setActiveLoginOverride({
        accessToken: 't',
        refreshToken: 'r',
        profile: { reference: 'Practitioner/1' },
        project: { reference: 'Project/project-1' },
      });
    }
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <MantineProvider env="test">
            <Notifications />
            <RescopeUserWidget />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  async function selectProject(): Promise<void> {
    const projectInput = screen.getByPlaceholderText('Select a Project');
    await act(async () => {
      fireEvent.change(projectInput, { target: { value: 'Test' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      fireEvent.keyDown(projectInput, { key: 'ArrowDown', code: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(projectInput, { key: 'Enter', code: 'Enter' });
    });
  }

  async function selectUser(): Promise<void> {
    const userInput = screen.getByPlaceholderText('Search by email');
    await act(async () => {
      fireEvent.change(userInput, { target: { value: 'alice' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      fireEvent.keyDown(userInput, { key: 'ArrowDown', code: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(userInput, { key: 'Enter', code: 'Enter' });
    });
  }

  function mockUser(user: User): void {
    medplum.router.add('GET', 'User', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'searchset', entry: [{ resource: user }] } as any,
    ]);
    vi.spyOn(medplum, 'readResource').mockImplementation(((resourceType: string, id: string) => {
      if (resourceType === 'User' && id === user.id) {
        return Promise.resolve(user);
      }
      return MockClient.prototype.readResource.call(medplum, resourceType as any, id);
    }) as any);
  }

  beforeEach(() => {
    medplum = new MockClient();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    medplum.router.add('GET', 'Project', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'searchset', entry: [{ resource: project }] } as any,
    ]);
    postSpy = vi.spyOn(medplum, 'post');
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
    vi.clearAllMocks();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();
  });

  test('renders title and form (super admin)', () => {
    mockUser(projectScopedUser);
    setup({ superAdmin: true });
    expect(screen.getByRole('heading', { name: 'Rescope User' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Select a Project')).toBeInTheDocument();
    expect(screen.queryByLabelText('Target scope')).not.toBeInTheDocument();
  });

  test('hides Project selector for non-super-admin', () => {
    mockUser(projectScopedUser);
    setup({ superAdmin: false });
    expect(screen.queryByPlaceholderText('Select a Project')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by email')).toBeInTheDocument();
  });

  test('shows User Details with name + scope chip when user selected (project scope)', async () => {
    mockUser(projectScopedUser);
    setup({ superAdmin: true });

    await selectProject();
    await selectUser();
    // Wait for scope resolution
    await act(async () => {
      await Promise.resolve();
    });

    expect(await screen.findByText('Alice Example (alice@example.com)')).toBeInTheDocument();
    expect(screen.getByText('Project', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release User to Server' })).toBeEnabled();
  });

  test('Releases project-scoped user to server with no project param', async () => {
    mockUser(projectScopedUser);
    medplum.router.add('POST', 'User/user-1/$rescope', async () => [
      allOk,
      { resourceType: 'Parameters', parameter: [] },
    ]);
    setup({ superAdmin: true });

    await selectProject();
    await selectUser();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release User to Server' }));
    });
    expect(screen.getByText('Confirm User Rescope')).toBeInTheDocument();
    expect(screen.getByText('release', { selector: 'strong' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Rescope' }));
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    const args = postSpy.mock.calls[0] as unknown as unknown[];
    expect(String(args[0])).toContain('User/user-1/$rescope');
    expect(args[1]).toEqual({
      resourceType: 'Parameters',
      parameter: [{ name: 'scope', valueCode: 'server' }],
    });
    expect(await screen.findByText('User rescoped successfully')).toBeInTheDocument();
  });

  test('Assigns server-scoped user to project for super admin', async () => {
    mockUser(serverUser);
    medplum.router.add('POST', 'User/user-2/$rescope', async () => [
      allOk,
      { resourceType: 'Parameters', parameter: [] },
    ]);
    setup({ superAdmin: true });

    await selectProject();
    await selectUser();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Server', { selector: '.mantine-Badge-label' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Assign User to Project' }));
    });
    expect(screen.getByText('assign', { selector: 'strong' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Rescope' }));
    });

    const args = postSpy.mock.calls[0] as unknown as unknown[];
    expect(args[1]).toEqual({
      resourceType: 'Parameters',
      parameter: [
        { name: 'scope', valueCode: 'project' },
        { name: 'project', valueReference: expect.objectContaining({ reference: 'Project/project-1' }) },
      ],
    });
  });

  test('Non-super-admin sees a warning and disabled submit when user is server-scoped', async () => {
    mockUser(serverUser);
    setup({ superAdmin: false });

    await selectUser();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/Only a super admin can assign/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release User to Server' })).toBeDisabled();
  });

  test('Cancel closes the confirmation modal without posting', async () => {
    mockUser(projectScopedUser);
    setup({ superAdmin: true });
    await selectProject();
    await selectUser();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release User to Server' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(postSpy).not.toHaveBeenCalled();
  });

  test('Shows error notification when $rescope fails', async () => {
    mockUser(projectScopedUser);
    medplum.router.add('POST', 'User/user-1/$rescope', async () => [badRequest('Something went wrong')]);
    setup({ superAdmin: true });
    await selectProject();
    await selectUser();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release User to Server' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Rescope' }));
    });

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });
});
