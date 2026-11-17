// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { cleanNotifications, Notifications } from '@mantine/notifications';
import { ReadablePromise } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { SCRIPTSURE_IFRAME_BOT, ScriptSurePracticeProvider } from '@medplum/scriptsure-react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ScriptSureReportsMenu } from './ScriptSureReportsMenu';

async function setup(medplum: MockClient, wrap?: (children: ReactNode) => JSX.Element): Promise<void> {
  const menu = <ScriptSureReportsMenu />;
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Notifications />
          {wrap ? wrap(menu) : menu}
        </MantineProvider>
      </MedplumProvider>
    );
  });
}

describe('ScriptSureReportsMenu', () => {
  beforeEach(() => {
    cleanNotifications();
  });

  test.each([
    ['Audit log', 'auditlog', 'ScriptSure audit log'],
    ['Reports', 'report', 'ScriptSure reports'],
  ])('%s opens the %s widget in a modal', async (label, widget, title) => {
    const medplum = new MockClient();
    const executeBot = vi
      .spyOn(medplum, 'executeBot')
      .mockResolvedValue({ url: `https://ssu.example/widgets/${widget}?sessiontoken=abc` });
    const user = userEvent.setup();
    await setup(medplum);

    await user.click(screen.getByLabelText('Audit log and reports'));
    await user.click(await screen.findByRole('menuitem', { name: label }));

    expect(executeBot).toHaveBeenCalledWith(SCRIPTSURE_IFRAME_BOT, { widget, organizationId: undefined });
    const iframe = await screen.findByTitle(title);
    expect(iframe).toHaveAttribute('src', `https://ssu.example/widgets/${widget}?sessiontoken=abc&darkmode=off`);
  });

  test('is disabled until the practice selection has loaded', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockReturnValue(
      new ReadablePromise(
        new Promise(() => {
          // Never settles, so the practice provider stays loading.
        })
      )
    );
    await setup(medplum, (children) => <ScriptSurePracticeProvider>{children}</ScriptSurePracticeProvider>);

    expect(screen.getByLabelText('Audit log and reports')).toBeDisabled();
  });

  test('shows an error and no modal when the widget URL cannot be created', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(new Error('ScriptSure is down'));
    const user = userEvent.setup();
    await setup(medplum);

    await user.click(screen.getByLabelText('Audit log and reports'));
    await user.click(await screen.findByRole('menuitem', { name: 'Audit log' }));

    expect(await screen.findByText('ScriptSure is down')).toBeInTheDocument();
    expect(screen.queryByTitle('ScriptSure audit log')).not.toBeInTheDocument();
  });
});
