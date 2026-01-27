// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import * as medplumReact from '@medplum/react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ExportTab } from './ExportTab';

describe('ExportTab', () => {
  let medplum: MockClient;
  let patientExportFormSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    patientExportFormSpy = vi.spyOn(medplumReact, 'PatientExportForm');
  });

  const setup = (url: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <medplumReact.MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/export" element={<ExportTab />} />
            </Routes>
          </MantineProvider>
        </medplumReact.MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders PatientExportForm', async () => {
    setup(`/Patient/${HomerSimpson.id}/export`);

    await waitFor(() => {
      expect(patientExportFormSpy).toHaveBeenCalled();
    });
  });

  test('Passes correct patient reference to PatientExportForm', async () => {
    setup(`/Patient/${HomerSimpson.id}/export`);

    await waitFor(() => {
      expect(patientExportFormSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          patient: { reference: `Patient/${HomerSimpson.id}` },
        }),
        undefined
      );
    });
  });
});
