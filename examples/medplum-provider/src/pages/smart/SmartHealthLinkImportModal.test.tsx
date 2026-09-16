// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import type { SmartHealthLinkImportProps } from './SmartHealthLinkImport';
import { SmartHealthLinkImportModal } from './SmartHealthLinkImportModal';

vi.mock('./SmartHealthLinkImport', () => ({
  SmartHealthLinkImport: ({ onImported }: SmartHealthLinkImportProps) => (
    <button type="button" aria-label="import" onClick={() => onImported?.(HomerSimpson as WithId<Patient>)} />
  ),
}));

function setup(opened: boolean, onClose = vi.fn()): void {
  render(
    <MemoryRouter initialEntries={['/Patient']}>
      <MantineProvider>
        <Routes>
          <Route path="/Patient" element={<SmartHealthLinkImportModal opened={opened} onClose={onClose} />} />
          <Route path={`/Patient/${HomerSimpson.id}/timeline`} element={<div>patient timeline</div>} />
        </Routes>
      </MantineProvider>
    </MemoryRouter>
  );
}

describe('SmartHealthLinkImportModal', () => {
  test('renders nothing when closed, closes on the close button, and routes to the patient timeline', async () => {
    setup(false);
    expect(screen.queryByText('Import from SMART Health Card or Link')).not.toBeInTheDocument();
    const onClose = vi.fn();
    setup(true, onClose);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'import' }));
    expect(await screen.findByText('patient timeline')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
