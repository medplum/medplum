// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ScriptSureTab } from './ScriptSureTab';
import { useScriptSureIFrame } from '@medplum/scriptsure-react';

vi.mock('@medplum/scriptsure-react', () => ({
  useScriptSureIFrame: vi.fn(() => 'https://scriptsure.example.com/chart/123/prescriptions'),
  SCRIPTSURE_IFRAME_BOT: { system: 'https://www.medplum.com/bots', value: 'scriptsure-iframe-bot' },
  SCRIPTSURE_PATIENT_SYNC_BOT: { system: 'https://www.medplum.com/bots', value: 'scriptsure-patient-sync-bot' },
}));

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
      expect(iframe).toHaveAttribute('src', 'https://scriptsure.example.com/chart/123/prescriptions');
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

  test('Calls onError callback and shows error notification', async () => {
    let capturedOptions: any = {};

    vi.mocked(useScriptSureIFrame).mockImplementation((options) => {
      capturedOptions = options;
      return 'https://scriptsure.example.com/chart/123/prescriptions';
    });

    setup(`/Patient/${HomerSimpson.id}/scriptsure`);

    await act(async () => {
      capturedOptions.onError?.(new Error('ScriptSure connection failed'));
    });

    await waitFor(() => {
      expect(screen.getByText(/ScriptSure connection failed/i)).toBeInTheDocument();
    });
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
