// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { MedicationOrderExtensions } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import type { MedTab } from './MedListItem';
import { MedListItem } from './MedListItem';

const extensions: MedicationOrderExtensions = {
  pendingOrderIdSystem: 'https://scriptsure.com/pending-order-id',
  pendingOrderStatusUrl: 'https://scriptsure.com/pending-order-status',
  iframeUrlExtension: 'https://scriptsure.com/iframe-url',
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
  const getItemUrl = vi.fn((item: MedicationRequest) => `/meds/${item.id}`);

  function setup(item: MedicationRequest, selectedItem?: MedicationRequest, activeTab: MedTab = 'active'): HTMLElement {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={new MockClient()}>
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
    ).container;
  }

  test('renders the medication name, links to getItemUrl, and marks the selected item', () => {
    const container = setup(baseRequest, baseRequest);
    expect(screen.getByText('Alinia 500 mg tablet')).toBeInTheDocument();
    expect(getItemUrl).toHaveBeenCalledWith(baseRequest);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/meds/rx-1');
    expect(container.querySelector('[class*="selected"]')).toBeInTheDocument();
  });

  test('falls back to a generic title and meta.lastUpdated, and stays unselected for another item', () => {
    const item = { ...baseRequest, medicationCodeableConcept: undefined, authoredOn: undefined };
    const container = setup({ ...item, meta: { lastUpdated: '2024-02-20T10:00:00Z' } }, { ...baseRequest, id: 'rx-2' });
    expect(screen.getByText('Medication order')).toBeInTheDocument();
    expect(screen.getByText('2/20/2024')).toBeInTheDocument();
    expect(container.querySelector('[class*="selected"]')).not.toBeInTheDocument();
  });

  test.each<[MedicationRequest['status'], string]>([
    ['active', 'Active'],
    ['draft', 'Draft'],
    ['on-hold', 'On Hold'],
    ['cancelled', 'Cancelled'],
    ['entered-in-error', 'Error'],
    ['completed', 'Completed'],
    ['stopped', 'Stopped'],
    ['unknown', 'unknown'],
    [undefined as unknown as MedicationRequest['status'], 'Unknown'],
  ])('shows %s status as "%s"', (status, label) => {
    setup({ ...baseRequest, status });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  test('hides the status badge on the completed tab', () => {
    setup({ ...baseRequest, status: 'completed' }, undefined, 'completed');
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  test('shows the pending vendor status when the extension is present', () => {
    setup({ ...baseRequest, extension: [{ url: extensions.pendingOrderStatusUrl, valueString: 'Pending signature' }] });
    expect(screen.getByText('ScriptSure: Pending signature')).toBeInTheDocument();
  });

  test('includes the requester name and dosage once the requester resolves', async () => {
    setup({ ...baseRequest, requester: createReference(DrAliceSmith), dosageInstruction: [{ text: 'Take 1 daily' }] });
    expect(await screen.findByText('1/15/2024 · Alice Smith · Take 1 daily')).toBeInTheDocument();
  });
});
