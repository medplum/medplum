// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type * as ScriptSureReactModule from '@medplum/scriptsure-react';
import { SCRIPTSURE_IFRAME_BOT, useScriptSureIFrame } from '@medplum/scriptsure-react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { applyDarkmode } from '../../components/meds/applyDarkmode';
import { act, render, screen, waitFor } from '../../test-utils/render';
import { ScriptSurePage } from './ScriptSurePage';

const mockIframeUrl = 'https://scriptsure.example.com/notifications';

vi.mock('@medplum/scriptsure-react', async (importOriginal) => {
  const actual = await importOriginal<typeof ScriptSureReactModule>();
  return {
    ...actual,
    useScriptSureIFrame: vi.fn(() => mockIframeUrl),
  };
});

describe('ScriptSurePage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    vi.mocked(useScriptSureIFrame).mockReturnValue(mockIframeUrl);
  });

  function setup(url = '/scriptsure'): ReturnType<typeof render> {
    return render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]}>
          <Notifications />
          <ScriptSurePage />
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  test('Renders the iframe with darkmode applied for the light color scheme', async () => {
    setup();

    await waitFor(() => {
      const iframe = screen.getByTitle<HTMLIFrameElement>('ScriptSure e-Prescribing');
      expect(iframe).toBeInTheDocument();
      // The bot URL is UI-agnostic; the page appends `darkmode=off` for the light scheme.
      expect(iframe).toHaveAttribute('src', applyDarkmode(mockIframeUrl, 'light'));
      expect(iframe.getAttribute('src')).toContain('darkmode=off');
    });
  });

  test('Does not render the iframe when the URL is undefined', () => {
    vi.mocked(useScriptSureIFrame).mockReturnValue(undefined);
    setup();

    expect(screen.queryByTitle('ScriptSure e-Prescribing')).not.toBeInTheDocument();
  });

  test('Calls useScriptSureIFrame without a patient id', () => {
    setup();

    expect(useScriptSureIFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        onIframeSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
    expect(useScriptSureIFrame).toHaveBeenCalledWith(expect.not.objectContaining({ patientId: expect.anything() }));
  });

  test('Shows a success notification when the iframe connects', async () => {
    setup();

    await act(async () => {
      vi.mocked(useScriptSureIFrame).mock.calls[0][0].onIframeSuccess?.(mockIframeUrl);
    });

    await waitFor(() => {
      expect(screen.getByText('Successfully connected to ScriptSure')).toBeInTheDocument();
    });
  });

  test('Shows the unwrapped bot error when the hook reports an error', async () => {
    vi.mocked(useScriptSureIFrame).mockReturnValue(undefined);
    setup();

    await act(async () => {
      // A bot that throws returns its runtime payload as a JSON string in the error message.
      vi.mocked(useScriptSureIFrame).mock.calls[0][0].onError?.(
        new Error(
          JSON.stringify({
            errorType: 'Error',
            errorMessage:
              'ScriptSure: The Practice ID: 6842 cannot be found as part of the available practices associated with your login',
            trace: [
              'Error: ScriptSure: The Practice ID: 6842 cannot be found',
              '    at ScriptSureClient.request (/var/task/user.cjs:1887:13)',
            ],
          })
        )
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          'ScriptSure: The Practice ID: 6842 cannot be found as part of the available practices associated with your login'
        )
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/trace/)).not.toBeInTheDocument();
  });

  test('Audit log tab loads the widget and keeps the prescribing iframe mounted', async () => {
    const executeBot = vi
      .spyOn(medplum, 'executeBot')
      .mockResolvedValue({ url: 'https://ssu.example/widgets/auditlog?sessiontoken=abc' });
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('tab', { name: 'Audit log' }));

    expect(executeBot).toHaveBeenCalledWith(SCRIPTSURE_IFRAME_BOT, { widget: 'auditlog', organizationId: undefined });
    expect(await screen.findByTitle('ScriptSure audit log')).toHaveAttribute(
      'src',
      'https://ssu.example/widgets/auditlog?sessiontoken=abc&darkmode=off'
    );
    expect(screen.getByTitle('ScriptSure e-Prescribing')).toBeInTheDocument();
  });

  test('Opens the Reports tab directly from the tab query param', async () => {
    const executeBot = vi
      .spyOn(medplum, 'executeBot')
      .mockResolvedValue({ url: 'https://ssu.example/widgets/report?sessiontoken=abc' });
    setup('/scriptsure?tab=report');

    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTitle('ScriptSure reports')).toBeInTheDocument();
    expect(executeBot).toHaveBeenCalledWith(SCRIPTSURE_IFRAME_BOT, { widget: 'report', organizationId: undefined });
  });

  test('Shows an error when the report widget URL cannot be created', async () => {
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(new Error('ScriptSure is down'));
    setup('/scriptsure?tab=auditlog');

    expect(await screen.findByText('ScriptSure is down')).toBeInTheDocument();
    expect(screen.queryByTitle('ScriptSure audit log')).not.toBeInTheDocument();
  });

  test('Iframe fills its container', async () => {
    setup();

    const iframe = await waitFor(() => screen.getByTitle<HTMLIFrameElement>('ScriptSure e-Prescribing'));
    expect(iframe.id).toBe('scriptsure-iframe');
    expect(iframe.name).toBe('scriptsure-iframe');
    expect(iframe.style.width).toBe('100%');
    expect(iframe.style.height).toBe('100%');
  });
});
