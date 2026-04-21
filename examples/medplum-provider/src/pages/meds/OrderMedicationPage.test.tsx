// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { OrderMedicationPage } from './OrderMedicationPage';

describe('OrderMedicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows single and compound tabs', async () => {
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

    expect(await screen.findByText('Single medication')).toBeInTheDocument();
    expect(screen.getByText('Compound')).toBeInTheDocument();
  });
});
