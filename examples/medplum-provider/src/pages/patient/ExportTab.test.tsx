// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import * as medplumReact from '@medplum/react';
import { waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from '../../test-utils/render';
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
          <Notifications />
          <Routes>
            <Route path="/Patient/:patientId/export" element={<ExportTab />} />
          </Routes>
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
