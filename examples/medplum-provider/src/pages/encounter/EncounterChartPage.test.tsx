// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as notificationsModule from '../../utils/notifications';
import { EncounterChartPage } from './EncounterChartPage';

describe('EncounterChartPage', () => {
  let medplum: MockClient;
  let showErrorNotificationSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    showErrorNotificationSpy = vi.spyOn(notificationsModule, 'showErrorNotification');
  });

  function setup(initialPath: string, routePattern: string = '/Encounter/:encounterId/*'): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path={routePattern} element={<EncounterChartPage />}>
                <Route path="*" element={<div data-testid="outlet">Outlet Content</div>} />
              </Route>
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders EncounterChart when encounterId is present', async () => {
    setup('/Encounter/encounter-123');

    await waitFor(() => {
      const loader = document.querySelector('.mantine-Loader-root');
      expect(loader).toBeInTheDocument();
    });
  });

  test('Renders Outlet when encounterId is present', async () => {
    setup('/Encounter/encounter-123');

    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
    });

    expect(screen.getByText('Outlet Content')).toBeInTheDocument();
  });

  test('Shows error notification and returns null when encounterId is missing', () => {
    setup('/Encounter', '/Encounter/:encounterId?/*');

    expect(showErrorNotificationSpy).toHaveBeenCalledWith('Encounter ID not found');
    const loader = document.querySelector('.mantine-Loader-root');
    expect(loader).not.toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  test('Creates correct encounter reference from encounterId', async () => {
    setup('/Encounter/encounter-456');

    await waitFor(() => {
      const loader = document.querySelector('.mantine-Loader-root');
      expect(loader).toBeInTheDocument();
    });
  });

  test('Handles nested routes correctly', async () => {
    setup('/Encounter/encounter-123/nested/path');

    await waitFor(() => {
      const loader = document.querySelector('.mantine-Loader-root');
      expect(loader).toBeInTheDocument();
    });

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });
});
