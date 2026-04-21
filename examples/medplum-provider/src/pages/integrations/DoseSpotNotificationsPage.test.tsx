// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDoseSpotIFrame } from '@medplum/dosespot-react';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '../../test-utils/render';
import { DoseSpotNotificationsPage } from './DoseSpotNotificationsPage';

// Mock useDoseSpotIFrame
vi.mock('@medplum/dosespot-react', async () => {
  return {
    useDoseSpotIFrame: vi.fn(() => 'https://dosespot.example.com/iframe'),
    DOSESPOT_CLINIC_FAVORITE_ID_SYSTEM: 'http://dosespot.com/clinic-favorite-id',
    useDoseSpotClinicFormulary: vi.fn(() => ({
      state: {},
      saveFavoriteMedication: vi.fn(),
      searchMedications: vi.fn(),
      setSelectedMedicationDirections: vi.fn(),
      setSelectedMedication: vi.fn(),
      clear: vi.fn(),
    })),
  };
});

describe('DoseSpotNotificationsPage', () => {
  async function setup(): Promise<void> {
    const medplum = new MockClient();
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={['/dosespot']}>
            <DoseSpotNotificationsPage />
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Renders iframe', async () => {
    await setup();
    await waitFor(() => {
      const iframe = screen.getByTitle<HTMLIFrameElement>('dosespot-notifications-iframe');
      expect(iframe).toBeDefined();
      expect(iframe.src).toBe('https://dosespot.example.com/iframe');
    });
  });

  test('Does not render iframe when URL is undefined', async () => {
    vi.mocked(useDoseSpotIFrame).mockReturnValue(undefined);
    await setup();
    const iframe = screen.queryByTitle('dosespot-notifications-iframe');
    expect(iframe).toBeNull();
  });

  test('Calls useDoseSpotIFrame without patientId', async () => {
    vi.mocked(useDoseSpotIFrame).mockReturnValue('https://dosespot.example.com/iframe');
    await setup();
    expect(useDoseSpotIFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        onIframeSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
    expect(useDoseSpotIFrame).toHaveBeenCalledWith(
      expect.not.objectContaining({
        patientId: expect.anything(),
      })
    );
  });
});
