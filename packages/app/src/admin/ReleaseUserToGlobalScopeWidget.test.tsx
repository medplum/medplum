// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk, badRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { ReleaseUserToGlobalScopeWidget } from './ReleaseUserToGlobalScopeWidget';

describe('ReleaseUserToGlobalScopeWidget', () => {
  let medplum: MockClient;

  function setup(onSuccess?: () => void): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider env="test">
          <Notifications />
          <ReleaseUserToGlobalScopeWidget userId="user-1" onSuccess={onSuccess} />
        </MantineProvider>
      </MedplumProvider>
    );
  }

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
    jest.clearAllMocks();
  });

  test('renders title and Release User button', () => {
    setup();
    expect(screen.getByText('Release User to Global Scope')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release User' })).toBeInTheDocument();
  });

  test('opens confirmation modal when Release User clicked', async () => {
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release User' }));
    });
    expect(screen.getByText('Confirm Release to Global Scope')).toBeInTheDocument();
    expect(screen.getByText(/release User\/user-1/)).toBeInTheDocument();
  });

  test('Cancel closes the modal without posting', async () => {
    const postSpy = jest.spyOn(medplum, 'post');
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release User' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(postSpy).not.toHaveBeenCalled();
  });

  test('Confirm posts $rescope with global scope and calls onSuccess', async () => {
    const onSuccess = jest.fn();
    medplum.router.add('POST', 'User/user-1/$rescope', async () => [
      allOk,
      { resourceType: 'Parameters', parameter: [] },
    ]);
    const postSpy = jest.spyOn(medplum, 'post');

    setup(onSuccess);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release User' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release to Global' }));
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    const args = postSpy.mock.calls[0] as unknown as unknown[];
    expect(String(args[0])).toBe('https://example.com/fhir/R4/User/user-1/$rescope');
    expect(args[1]).toEqual({
      resourceType: 'Parameters',
      parameter: [{ name: 'scope', valueCode: 'global' }],
    });
    expect(await screen.findByText('User released to global scope')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('shows error notification on failure and does not call onSuccess', async () => {
    const onSuccess = jest.fn();
    medplum.router.add('POST', 'User/user-1/$rescope', async () => [badRequest('Nope')]);

    setup(onSuccess);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release User' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Release to Global' }));
    });

    expect(await screen.findByText('Nope')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
