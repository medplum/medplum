// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import type { SmartHealthLinkImportProps } from './SmartHealthLinkImport';
import type { SmartHealthLinkImportModalProps } from './SmartHealthLinkImportModal';
import { SmartHealthLinkImportModal } from './SmartHealthLinkImportModal';

/** The import flow is covered by SmartHealthLinkImport.test.tsx; the modal only reacts to its onImported callback. */
vi.mock('./SmartHealthLinkImport', () => ({
  SmartHealthLinkImport: ({ onImported }: SmartHealthLinkImportProps) => (
    <button type="button" onClick={() => onImported?.(HomerSimpson as WithId<Patient>)}>
      simulate-import
    </button>
  ),
}));

function setup(props: Partial<SmartHealthLinkImportModalProps> = {}): void {
  render(
    <MemoryRouter initialEntries={['/Patient']}>
      <MedplumProvider medplum={new MockClient()}>
        <MantineProvider>
          <Routes>
            <Route path="/Patient" element={<SmartHealthLinkImportModal opened onClose={vi.fn()} {...props} />} />
            <Route path={`/Patient/${HomerSimpson.id}/timeline`} element={<div>patient timeline</div>} />
          </Routes>
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('SmartHealthLinkImportModal', () => {
  test('renders nothing when closed', () => {
    setup({ opened: false });
    expect(screen.queryByText('Import from SMART Health Card or Link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'simulate-import' })).not.toBeInTheDocument();
  });

  test('closes via the modal close button without navigating', async () => {
    const onClose = vi.fn();
    setup({ onClose });
    expect(screen.getByText('Import from SMART Health Card or Link')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('patient timeline')).not.toBeInTheDocument();
  });

  test('closes and routes to the imported patient timeline after an import', async () => {
    const onClose = vi.fn();
    setup({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'simulate-import' }));
    expect(await screen.findByText('patient timeline')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
