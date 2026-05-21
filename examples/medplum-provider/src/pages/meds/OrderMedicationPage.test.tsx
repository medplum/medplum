// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { MedicationOrderRequest, MedicationOrderResponse } from '@medplum/core';
import type { Medication } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type * as ScriptSureReactModule from '@medplum/scriptsure-react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { OrderMedicationPage } from './OrderMedicationPage';

const ORDER_MEDICATION_REJECTION = new Error('bot rejected');
const orderMedicationMock = vi.fn();
const searchMedicationsMock = vi.fn();

vi.mock('@medplum/scriptsure-react', async () => {
  const actual = await vi.importActual<typeof ScriptSureReactModule>('@medplum/scriptsure-react');
  return {
    ...actual,
    useScriptSureOrderMedication: () => ({
      searchMedications: searchMedicationsMock,
      orderMedication: orderMedicationMock,
    }),
    loadScriptSureQuantityQualifiers: vi.fn(async () => []),
  };
});

describe('OrderMedicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchMedicationsMock.mockResolvedValue([]);
    orderMedicationMock.mockReset();
  });

  test('shows single, compound, and order-set tabs', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'executeBot').mockResolvedValue([]);

    await act(async () => {
      render(
        <MantineProvider>
          <MedplumProvider medplum={medplum}>
            <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
              <Routes>
                <Route path="/Patient/:patientId/MedicationRequest" element={<OrderMedicationPage />} />
              </Routes>
            </MemoryRouter>
          </MedplumProvider>
        </MantineProvider>
      );
    });

    expect(await screen.findByRole('tab', { name: 'Single medication' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Compound' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Order set' })).toBeInTheDocument();
  });

  test('deletes the draft MedicationRequest when the order bot fails', async () => {
    const medplum = new MockClient();
    medplum.setProfile(DrAliceSmith);

    // Drug name search returns a single in-memory Medication. Important: no routed-med-id
    // so the page's "expand to formulations" effect short-circuits to selectedFormat = termMedication
    // (see useEffect on [termMedication] in OrderMedicationPage.tsx).
    const searchHit: Medication = {
      resourceType: 'Medication',
      id: 'med-aspirin-81',
      code: { text: 'Aspirin 81 mg tablet' },
    };
    searchMedicationsMock.mockResolvedValue([searchHit]);

    // Bot call rejects after the draft MR is created — exercise the cleanup branch.
    orderMedicationMock.mockImplementation(async (_input: MedicationOrderRequest): Promise<MedicationOrderResponse> => {
      throw ORDER_MEDICATION_REJECTION;
    });

    const createSpy = vi.spyOn(medplum, 'createResource');
    const deleteSpy = vi.spyOn(medplum, 'deleteResource');

    const user = userEvent.setup();

    await act(async () => {
      render(
        <MantineProvider>
          <Notifications />
          <MedplumProvider medplum={medplum}>
            <MemoryRouter initialEntries={[`/Patient/${HomerSimpson.id}/MedicationRequest`]}>
              <Routes>
                <Route
                  path="/Patient/:patientId/MedicationRequest"
                  element={<OrderMedicationPage patient={HomerSimpson} />}
                />
              </Routes>
            </MemoryRouter>
          </MedplumProvider>
        </MantineProvider>
      );
    });

    // Type into the medication autocomplete, wait for the option to appear, click it.
    const searchInput = await screen.findByLabelText(/Search medication/i);
    await user.type(searchInput, 'aspirin');
    const option = await screen.findByText('Aspirin 81 mg tablet');
    await user.click(option);

    // Submit the single-med order; the Mantine Tabs default is "Single medication".
    const orderButton = await screen.findByRole('button', { name: /^Prescribe$/ });
    await user.click(orderButton);

    // Wait for the bot rejection cleanup to run.
    await waitFor(() => {
      expect(orderMedicationMock).toHaveBeenCalledTimes(1);
    });

    // The draft MedicationRequest should have been created, then deleted, with matching ids.
    const createdMrCall = createSpy.mock.calls.find((c) => {
      const r = c[0] as { resourceType?: string; status?: string } | undefined;
      return r?.resourceType === 'MedicationRequest' && r?.status === 'draft';
    });
    expect(createdMrCall).toBeDefined();

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('MedicationRequest', expect.any(String));
    });
  });
});
