// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PatientExportModal } from './PatientExportModal';

describe('PatientExportModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const renderModal = (opened: boolean, onClose = vi.fn()): JSX.Element => (
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Notifications />
          <PatientExportModal patient={HomerSimpson} opened={opened} onClose={onClose} />
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );

  const setup = (opened = true, onClose = vi.fn()): ReturnType<typeof render> => render(renderModal(opened, onClose));

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

  test('Locks the body height to the taller of the C-CDA and FHIR Everything tabs', () => {
    const heights = { ccda: 440, everything: 480 };
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.querySelector('[aria-selected="true"]')?.textContent === 'C-CDA' ? heights.ccda : heights.everything;
    });
    try {
      setup(true);
      const root = document.querySelector<HTMLElement>('.mantine-Modal-root');
      expect(root?.style.getPropertyValue('--medplum-modal-body-height')).toBe('480px');
      expect(screen.getByRole('tab', { name: 'FHIR Everything' })).toHaveAttribute('aria-selected', 'true');
    } finally {
      offsetHeight.mockRestore();
    }
  });

  test('Measures the body height again each time the modal opens', async () => {
    const heights = { ccda: 440, everything: 480 };
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.querySelector('[aria-selected="true"]')?.textContent === 'C-CDA' ? heights.ccda : heights.everything;
    });
    const bodyHeight = (): string | undefined =>
      document.querySelector<HTMLElement>('.mantine-Modal-root')?.style.getPropertyValue('--medplum-modal-body-height');
    try {
      const { rerender } = setup(true);
      expect(bodyHeight()).toBe('480px');

      rerender(renderModal(false));
      await waitFor(() => expect(screen.queryByRole('tab', { name: 'C-CDA' })).not.toBeInTheDocument());

      heights.ccda = 520;
      rerender(renderModal(true));
      await waitFor(() => expect(bodyHeight()).toBe('520px'));
    } finally {
      offsetHeight.mockRestore();
    }
  });
});
