// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SmartHealthLinkImportProps } from './SmartHealthLinkImport';
import type { SmartHealthLinkImportModalProps } from './SmartHealthLinkImportModal';
import { SmartHealthLinkImportModal } from './SmartHealthLinkImportModal';

const IMPORTED_PATIENT: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'imported-patient',
  name: [{ given: ['Homer'], family: 'Simpson' }],
};

/**
 * The import flow itself is covered by SmartHealthLinkImport.test.tsx. The modal only needs the
 * flow to report an import, which is what it reacts to.
 */
vi.mock('./SmartHealthLinkImport', () => ({
  SmartHealthLinkImport: ({ onImported }: SmartHealthLinkImportProps) => (
    <button type="button" onClick={() => onImported?.(IMPORTED_PATIENT)}>
      simulate-import
    </button>
  ),
}));

function LocationDisplay(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe('SmartHealthLinkImportModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function setup(props: Partial<SmartHealthLinkImportModalProps> = {}): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={['/Patient']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <LocationDisplay />
            <Routes>
              <Route path="/Patient" element={<SmartHealthLinkImportModal opened onClose={vi.fn()} {...props} />} />
              <Route path="/Patient/:id/timeline" element={<div>patient timeline</div>} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders the titled modal with the import flow when opened', () => {
    setup();
    expect(screen.getByText('Import from SMART Health Card or Link')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'simulate-import' })).toBeInTheDocument();
  });

  test('Renders nothing when closed', () => {
    setup({ opened: false });
    expect(screen.queryByText('Import from SMART Health Card or Link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'simulate-import' })).not.toBeInTheDocument();
  });

  test('Closes via the modal close button without navigating', async () => {
    const onClose = vi.fn();
    setup({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location').textContent).toBe('/Patient');
    expect(screen.queryByText('patient timeline')).not.toBeInTheDocument();
  });

  test('Closes and routes to the imported patient timeline after an import', async () => {
    const onClose = vi.fn();
    setup({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'simulate-import' }));
    expect(await screen.findByText('patient timeline')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/Patient/imported-patient/timeline');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
