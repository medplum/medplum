// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk, badRequest } from '@medplum/core';
import type { Project, User } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { RescopeUserWidget } from './RescopeUserWidget';

describe('RescopeUserWidget', () => {
  let medplum: MockClient;
  let postSpy: jest.SpyInstance;

  const project: Project = { resourceType: 'Project', id: 'project-1', name: 'Test Project' };
  const user: User = {
    resourceType: 'User',
    id: 'user-1',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Example',
  };

  function setup(): void {
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
      jest.advanceTimersByTime(1000);
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
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      fireEvent.keyDown(userInput, { key: 'ArrowDown', code: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(userInput, { key: 'Enter', code: 'Enter' });
    });
  }

  beforeEach(() => {
    medplum = new MockClient();
    jest.useFakeTimers();
    medplum.router.add('GET', 'Project', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'searchset', entry: [{ resource: project }] } as any,
    ]);
    medplum.router.add('GET', 'User', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'searchset', entry: [{ resource: user }] } as any,
    ]);
    postSpy = jest.spyOn(medplum, 'post');
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
    jest.clearAllMocks();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('renders title and form', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Rescope User' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Select a Project')).toBeInTheDocument();
    expect(screen.getByLabelText('Target scope')).toBeInTheDocument();
  });

  test('Submit button is disabled before project and user selected', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Rescope User' })).toBeDisabled();
  });

  test('Confirms and posts $rescope with global scope (no project param)', async () => {
    medplum.router.add('POST', 'User/user-1/$rescope', async () => [
      allOk,
      { resourceType: 'Parameters', parameter: [] },
    ]);
    setup();

    await selectProject();
    await selectUser();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rescope User' }));
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
      parameter: [{ name: 'scope', valueCode: 'global' }],
    });
    expect(await screen.findByText('User rescoped successfully')).toBeInTheDocument();
  });

  test('Posts $rescope with project scope and project param when scope=project', async () => {
    medplum.router.add('POST', 'User/user-1/$rescope', async () => [
      allOk,
      { resourceType: 'Parameters', parameter: [] },
    ]);
    setup();

    await selectProject();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Target scope'), { target: { value: 'project' } });
    });
    await selectUser();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rescope User' }));
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

  test('Cancel closes the confirmation modal without posting', async () => {
    setup();
    await selectProject();
    await selectUser();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rescope User' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(postSpy).not.toHaveBeenCalled();
  });

  test('Shows error notification when $rescope fails', async () => {
    medplum.router.add('POST', 'User/user-1/$rescope', async () => [badRequest('Something went wrong')]);
    setup();
    await selectProject();
    await selectUser();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rescope User' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Rescope' }));
    });

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });
});
