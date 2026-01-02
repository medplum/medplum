// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { DoseSpotTab } from './DoseSpotTab';

// Mock useDoseSpotIFrame
vi.mock('@medplum/dosespot-react', () => ({
  useDoseSpotIFrame: vi.fn(() => 'https://dosespot.example.com/iframe'),
}));

describe('DoseSpotTab', () => {
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
              <Route path="/Patient/:patientId/dosespot" element={<DoseSpotTab />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders DoseSpotAdvancedOptions when patientId is present', async () => {
    setup(`/Patient/${HomerSimpson.id}/dosespot`);

    await waitFor(() => {
      expect(screen.getByText('Advanced Options')).toBeInTheDocument();
    });
  });

  test('Renders iframe when iframeUrl is available', async () => {
    setup(`/Patient/${HomerSimpson.id}/dosespot`);

    await waitFor(() => {
      const iframe = document.querySelector('iframe#dosespot-iframe');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://dosespot.example.com/iframe');
    });
  });
});
