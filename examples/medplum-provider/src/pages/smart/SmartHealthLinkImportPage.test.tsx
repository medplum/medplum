// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SmartHealthLinkImportProps } from './SmartHealthLinkImport';
import { SmartHealthLinkImportPage } from './SmartHealthLinkImportPage';

const IMPORTED_PATIENT: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'imported-patient',
  name: [{ given: ['Homer'], family: 'Simpson' }],
};

// The flow itself is covered by SmartHealthLinkImport.test.tsx. Here it only needs to report an
// import, which is what the page reacts to.
vi.mock('./SmartHealthLinkImport', () => ({
  SmartHealthLinkImport: ({ onImported }: SmartHealthLinkImportProps) => (
    <button type="button" onClick={() => onImported?.(IMPORTED_PATIENT)}>
      simulate-import
    </button>
  ),
}));

describe('SmartHealthLinkImportPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function setup(): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={['/smart-health-link']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/smart-health-link" element={<SmartHealthLinkImportPage />} />
              <Route path="/Patient/:id/timeline" element={<div>patient timeline</div>} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Explains what the page imports', () => {
    setup();
    expect(screen.getByText('Import from SMART Health Card or Link')).toBeInTheDocument();
    expect(
      screen.getByText('Scan a patient-shared QR code, match the patient, and import selected resources.')
    ).toBeInTheDocument();
  });

  test('Routes to the imported patient timeline', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'simulate-import' }));
    expect(await screen.findByText('patient timeline')).toBeInTheDocument();
  });
});
