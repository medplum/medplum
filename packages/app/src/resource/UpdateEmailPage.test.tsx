// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanNotifications } from '@mantine/notifications';
import { allOk } from '@medplum/core';
import type { User } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen, waitFor } from '../test-utils/render';

describe('UpdateEmailPage', () => {
  afterEach(() => {
    act(() => {
      cleanNotifications();
    });
  });

  function getEmailInput(): HTMLElement {
    return screen.getByPlaceholderText('new@example.com');
  }

  test('Shows alert for server-scoped user', async () => {
    const medplum = new MockClient();
    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Server',
      lastName: 'User',
      email: 'server@example.com',
    });

    await act(async () => {
      renderAppRoutes(medplum, `/User/${user.id}/email`);
    });

    expect(await screen.findByText('Update Email is only available for project-scoped Users.')).toBeInTheDocument();
  });

  test('Shows form for project-scoped user', async () => {
    const medplum = new MockClient();
    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Project',
      lastName: 'User',
      email: 'project@example.com',
      project: { reference: 'Project/123' },
    });

    await act(async () => {
      renderAppRoutes(medplum, `/User/${user.id}/email`);
    });

    expect(await screen.findByText('project@example.com')).toBeInTheDocument();
    expect(getEmailInput()).toBeInTheDocument();
    expect(screen.getByText('Update profile telecom')).toBeInTheDocument();
    expect(screen.getByText('Skip email verification')).toBeInTheDocument();
  });

  test('Submits update-email operation', async () => {
    const medplum = new MockClient();
    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Project',
      lastName: 'User',
      email: 'project@example.com',
      project: { reference: 'Project/123' },
    });

    medplum.router.router.add('POST', 'User/:id/$update-email', async () => [
      allOk,
      { ...user, email: 'new@example.com' },
    ]);

    await act(async () => {
      renderAppRoutes(medplum, `/User/${user.id}/email`);
    });

    expect(await screen.findByPlaceholderText('new@example.com')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(getEmailInput(), { target: { value: 'new@example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update Email' }));
    });

    await waitFor(() => expect(screen.getByText('Email updated successfully')).toBeInTheDocument());
  });

  test('Shows error on failed submission', async () => {
    const medplum = new MockClient();
    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Project',
      lastName: 'User',
      email: 'project@example.com',
      project: { reference: 'Project/123' },
    });

    medplum.router.router.add('POST', 'User/:id/$update-email', async () => {
      throw new Error('Forbidden');
    });

    await act(async () => {
      renderAppRoutes(medplum, `/User/${user.id}/email`);
    });

    expect(await screen.findByPlaceholderText('new@example.com')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(getEmailInput(), { target: { value: 'new@example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update Email' }));
    });

    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });

  test('Submits with optional checkboxes', async () => {
    const medplum = new MockClient();
    const user = await medplum.createResource<User>({
      resourceType: 'User',
      firstName: 'Project',
      lastName: 'User',
      email: 'project@example.com',
      project: { reference: 'Project/123' },
    });

    medplum.router.router.add('POST', 'User/:id/$update-email', async () => [
      allOk,
      { ...user, email: 'new@example.com' },
    ]);

    await act(async () => {
      renderAppRoutes(medplum, `/User/${user.id}/email`);
    });

    expect(await screen.findByPlaceholderText('new@example.com')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(getEmailInput(), { target: { value: 'new@example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Update profile telecom'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Skip email verification'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update Email' }));
    });

    await waitFor(() => expect(screen.getByText('Email updated successfully')).toBeInTheDocument());
  });
});
