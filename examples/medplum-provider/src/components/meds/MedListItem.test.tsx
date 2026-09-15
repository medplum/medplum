// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { MedicationOrderExtensions } from '@medplum/core';
import type { MedicationRequest, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MedTab } from './MedListItem';
import { MedListItem } from './MedListItem';

const extensions: MedicationOrderExtensions = {
  pendingOrderIdSystem: 'https://scriptsure.com/pending-order-id',
  pendingOrderStatusUrl: 'https://scriptsure.com/pending-order-status',
  iframeUrlExtension: 'https://scriptsure.com/iframe-url',
};

const requester: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-1',
  name: [{ given: ['Alice'], family: 'Smith', prefix: ['Dr.'] }],
};

const baseRequest: MedicationRequest = {
  resourceType: 'MedicationRequest',
  id: 'rx-1',
  status: 'active',
  intent: 'order',
  medicationCodeableConcept: { text: 'Alinia 500 mg tablet' },
  subject: { reference: 'Patient/patient-1' },
  authoredOn: '2024-01-15T10:00:00Z',
};

describe('MedListItem', () => {
  let medplum: MockClient;
  const getItemUrl = vi.fn((item: MedicationRequest) => `/meds/${item.id}`);

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    await medplum.createResource(requester);
  });

  const setup = (
    item: MedicationRequest,
    selectedItem: MedicationRequest | undefined = undefined,
    activeTab: MedTab = 'active'
  ): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <MedListItem
              item={item}
              selectedItem={selectedItem}
              activeTab={activeTab}
              getItemUrl={getItemUrl}
              medicationOrderExtensions={extensions}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  describe('Medication display', () => {
    test('renders the medication name', () => {
      setup(baseRequest);
      expect(screen.getByText('Alinia 500 mg tablet')).toBeInTheDocument();
    });

    test('renders fallback text when the medication is missing', () => {
      setup({ ...baseRequest, medicationCodeableConcept: undefined });
      expect(screen.getByText('Medication order')).toBeInTheDocument();
    });
  });

  describe('Status badge', () => {
    test.each<[MedicationRequest['status'], string]>([
      ['active', 'Active'],
      ['draft', 'Draft'],
      ['on-hold', 'On Hold'],
      ['cancelled', 'Cancelled'],
      ['entered-in-error', 'Error'],
      ['completed', 'Completed'],
      ['stopped', 'Stopped'],
    ])('shows %s status as "%s"', (status, label) => {
      setup({ ...baseRequest, status });
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    test('shows the raw status for an unrecognized status', () => {
      setup({ ...baseRequest, status: 'unknown' });
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });

    test('shows "Unknown" when status is missing', () => {
      setup({ ...baseRequest, status: undefined as unknown as MedicationRequest['status'] });
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    test('hides the status badge on the completed tab', () => {
      setup({ ...baseRequest, status: 'completed' }, undefined, 'completed');
      expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    });
  });

  describe('Pending vendor status badge', () => {
    test('shows the pending order status when the extension is present', () => {
      setup({
        ...baseRequest,
        extension: [{ url: extensions.pendingOrderStatusUrl, valueString: 'Pending signature' }],
      });
      expect(screen.getByText('ScriptSure: Pending signature')).toBeInTheDocument();
    });

    test('hides the pending badge when the extension is absent', () => {
      setup(baseRequest);
      expect(screen.queryByText(/ScriptSure:/)).not.toBeInTheDocument();
    });
  });

  describe('Sub text', () => {
    test('shows the authored date only when there is no requester or dosage', () => {
      setup(baseRequest);
      expect(screen.getByText('1/15/2024')).toBeInTheDocument();
    });

    test('falls back to meta.lastUpdated when authoredOn is missing', () => {
      setup({ ...baseRequest, authoredOn: undefined, meta: { lastUpdated: '2024-02-20T10:00:00Z' } });
      expect(screen.getByText('2/20/2024')).toBeInTheDocument();
    });

    test('appends the dosage instruction text', () => {
      setup({ ...baseRequest, dosageInstruction: [{ text: 'Take 1 tablet twice daily' }] });
      expect(screen.getByText('1/15/2024 · Take 1 tablet twice daily')).toBeInTheDocument();
    });

    test('includes the requester name once resolved', async () => {
      setup({
        ...baseRequest,
        requester: { reference: 'Practitioner/practitioner-1' },
        dosageInstruction: [{ text: 'Take 1 tablet daily' }],
      });
      expect(await screen.findByText('1/15/2024 · Dr. Alice Smith · Take 1 tablet daily')).toBeInTheDocument();
    });

    test('omits the requester when it is not a Practitioner', async () => {
      await medplum.createResource({ resourceType: 'Organization', id: 'org-1', name: 'Acme Clinic' });
      const readReference = vi.spyOn(medplum, 'readReference');
      setup({ ...baseRequest, requester: { reference: 'Organization/org-1' } });

      await waitFor(() => expect(readReference).toHaveBeenCalledWith({ reference: 'Organization/org-1' }));
      await act(async () => {
        await readReference.mock.results[0].value;
      });

      expect(screen.getByText('1/15/2024')).toBeInTheDocument();
      expect(screen.queryByText(/Acme Clinic/)).not.toBeInTheDocument();
    });
  });

  describe('Selection and link', () => {
    test('links to the URL returned by getItemUrl', () => {
      setup(baseRequest);
      expect(getItemUrl).toHaveBeenCalledWith(baseRequest);
      expect(screen.getByRole('link')).toHaveAttribute('href', '/meds/rx-1');
    });

    test('applies selected class when the item matches the selected item', () => {
      const { container } = setup(baseRequest, baseRequest);
      expect(container.querySelector('[class*="selected"]')).toBeInTheDocument();
    });

    test('does not apply selected class when a different item is selected', () => {
      const { container } = setup(baseRequest, { ...baseRequest, id: 'rx-2' });
      expect(container.querySelector('[class*="selected"]')).not.toBeInTheDocument();
    });
  });
});
