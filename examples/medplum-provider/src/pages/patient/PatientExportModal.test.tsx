// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PatientExportModal } from './PatientExportModal';

describe('PatientExportModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (opened = true, onClose = vi.fn()): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <PatientExportModal patient={HomerSimpson} opened={opened} onClose={onClose} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders the export form when opened', () => {
    setup(true);
    expect(screen.getByRole('tab', { name: 'FHIR Everything' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Export Patient Records')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Homer Simpson’s Records' })).toBeInTheDocument();
  });

  test('Renders nothing when closed', () => {
    setup(false);
    expect(screen.queryByRole('button', { name: 'Export Homer Simpson’s Records' })).not.toBeInTheDocument();
  });

  test('Calls onClose when the modal is closed', async () => {
    const onClose = vi.fn();
    setup(true, onClose);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('Places the export button in the modal footer', () => {
    setup(true);
    const button = screen.getByRole('button', { name: 'Export Homer Simpson’s Records' });
    const scrollBody = screen.getByText('FHIR Everything').closest('.mantine-Modal-body > form > div');
    expect(scrollBody).not.toContainElement(button);
    expect(button.closest('form')).toContainElement(screen.getByPlaceholderText('Start date'));
  });
});
