// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { LoginState } from '@medplum/core';
import { MockClient, TestProject } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, userEvent, waitFor } from '../../test-utils/render';
import { HIDE_GET_STARTED_SETTING } from '../../utils/projectSettings';
import { ProjectSettingsPage } from './ProjectSettingsPage';
import { renderSettingsPage } from './settingsTestUtils';

describe('ProjectSettingsPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('shows the project details', async () => {
    await renderSettingsPage(medplum, <ProjectSettingsPage />);
    expect(screen.getByText(TestProject.name)).toBeInTheDocument();
    expect(screen.getByText(TestProject.id)).toBeInTheDocument();
    expect(screen.getByText('scheduling')).toBeInTheDocument();
  });

  test('disables the Get Started switch for non-admins', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(false);
    await renderSettingsPage(medplum, <ProjectSettingsPage />);
    expect(screen.getByRole('switch', { name: 'Show Get Started guide' })).toBeDisabled();
    expect(screen.getByText('Only project admins can change this setting.')).toBeInTheDocument();
  });

  test('lets admins hide the Get Started guide', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    vi.spyOn(medplum, 'getActiveLogin').mockReturnValue({ project: {}, profile: {} } as LoginState);
    const setActiveLogin = vi.spyOn(medplum, 'setActiveLogin').mockResolvedValue();
    const post = vi.spyOn(medplum, 'post').mockResolvedValue({});
    await renderSettingsPage(medplum, <ProjectSettingsPage />);

    await user.click(screen.getByRole('switch', { name: 'Show Get Started guide' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toBe(`admin/projects/${TestProject.id}/settings`);
    expect(post.mock.calls[0][1]).toContainEqual({ name: HIDE_GET_STARTED_SETTING, valueBoolean: true });
    expect(setActiveLogin).toHaveBeenCalled();
    expect(await screen.findByText('Project updated')).toBeInTheDocument();
  });

  test('reports a failed update', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    vi.spyOn(medplum, 'post').mockRejectedValue(new Error('Forbidden'));
    await renderSettingsPage(medplum, <ProjectSettingsPage />);

    await user.click(screen.getByRole('switch', { name: 'Show Get Started guide' }));

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });
});
