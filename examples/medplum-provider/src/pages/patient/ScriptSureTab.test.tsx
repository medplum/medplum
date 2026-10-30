// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type * as ScriptSureReactModule from '@medplum/scriptsure-react';
import { useScriptSureIFrame } from '@medplum/scriptsure-react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { applyDarkmode } from '../../components/meds/applyDarkmode';
import { ScriptSureTab } from './ScriptSureTab';

const mockIframeUrl = 'https://scriptsure.example.com/chart/123/prescriptions';
const mockRenderedIframeUrl = applyDarkmode(mockIframeUrl, 'light');

vi.mock('@medplum/scriptsure-react', async (importOriginal) => {
  const actual = await importOriginal<typeof ScriptSureReactModule>();
  return {
    ...actual,
    useScriptSureIFrame: vi.fn(() => mockIframeUrl),
  };
});

describe('ScriptSureTab', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (url: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/scriptsure" element={<ScriptSureTab />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders iframe when patientId is present', async () => {
    setup(`/Patient/${HomerSimpson.id}/scriptsure`);

    await waitFor(() => {
      const iframe = document.querySelector('iframe#scriptsure-iframe');
      expect(iframe).toBeInTheDocument();
    });
  });

  test('Renders iframe with correct src attribute', async () => {
    setup(`/Patient/${HomerSimpson.id}/scriptsure`);

    await waitFor(() => {
      const iframe = document.querySelector('iframe#scriptsure-iframe');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', mockRenderedIframeUrl);
    });
  });

  test('Does not render iframe when iframeUrl is undefined', async () => {
    vi.mocked(useScriptSureIFrame).mockReturnValue(undefined);

    setup(`/Patient/${HomerSimpson.id}/scriptsure`);

    await waitFor(() => {
      const iframe = document.querySelector('iframe#scriptsure-iframe');
      expect(iframe).not.toBeInTheDocument();
    });
  });

  test('Calls onPatientSyncSuccess and onIframeSuccess callbacks and shows notification', async () => {
    let capturedOptions: any = {};

    vi.mocked(useScriptSureIFrame).mockImplementation((options) => {
      capturedOptions = options;
      return 'https://scriptsure.example.com/chart/123/prescriptions';
    });

    setup(`/Patient/${HomerSimpson.id}/scriptsure`);

    await act(async () => {
      capturedOptions.onPatientSyncSuccess?.();
      capturedOptions.onIframeSuccess?.();
    });

    await waitFor(() => {
      expect(screen.getByText('Successfully connected to ScriptSure')).toBeInTheDocument();
    });
  });

  test('Shows the unwrapped bot error in a notification and hides the loader', async () => {
    let capturedOptions: any = {};

    vi.mocked(useScriptSureIFrame).mockImplementation((options) => {
      capturedOptions = options;
      return undefined;
    });

    setup(`/Patient/${HomerSimpson.id}/scriptsure`);
    expect(document.querySelector('.mantine-Loader-root')).toBeInTheDocument();

    await act(async () => {
      // A bot that throws returns its runtime payload as a JSON string in the error message.
      capturedOptions.onError?.(
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
    expect(document.querySelector('.mantine-Loader-root')).not.toBeInTheDocument();
  });

  test('Passes correct patientId to useScriptSureIFrame', async () => {
    vi.mocked(useScriptSureIFrame).mockReturnValue('https://scriptsure.example.com/chart/123/prescriptions');

    setup(`/Patient/custom-patient-id/scriptsure`);

    expect(useScriptSureIFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'custom-patient-id',
      })
    );
  });

  test('Iframe has correct attributes', async () => {
    vi.mocked(useScriptSureIFrame).mockReturnValue('https://scriptsure.example.com/chart/123/prescriptions');

    setup(`/Patient/${HomerSimpson.id}/scriptsure`);

    await waitFor(() => {
      const iframe = document.querySelector('iframe#scriptsure-iframe') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      expect(iframe.name).toBe('scriptsure-iframe');
      expect(iframe.id).toBe('scriptsure-iframe');
      expect(iframe.style.width).toBe('100%');
      expect(iframe.style.height).toBe('100%');
    });
  });
});
