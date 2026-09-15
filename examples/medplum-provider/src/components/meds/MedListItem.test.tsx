// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { MedicationOrderExtensions } from '@medplum/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';
import { MedListItem } from './MedListItem';

const extensions = { pendingOrderStatusUrl: 'https://example.com/pending-order-status' } as MedicationOrderExtensions;
const STATUSES = ['draft', 'on-hold', 'cancelled', 'completed', 'stopped', 'unknown'] as const;
const baseRequest: MedicationRequest = {
  resourceType: 'MedicationRequest',
  id: 'rx-1',
  status: 'active',
  intent: 'order',
  subject: { reference: 'Patient/patient-1' },
  medicationCodeableConcept: { text: 'Alinia 500 mg tablet' },
  meta: { lastUpdated: '2024-02-20T10:00:00Z' },
};

function setup(item: MedicationRequest, completed = false, selectedItem?: MedicationRequest): HTMLElement {
  return render(
    <MemoryRouter>
      <MedplumProvider medplum={new MockClient()}>
        <MantineProvider>
          <MedListItem
            item={item}
            selectedItem={selectedItem}
            activeTab={completed ? 'completed' : 'active'}
            getItemUrl={(mr) => `/meds/${mr.id}`}
            medicationOrderExtensions={extensions}
          />
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  ).container;
}

test('renders the title, requester, dosage, and link, and marks only the selected item', async () => {
  const item = { ...baseRequest, authoredOn: '2024-01-15T10:00:00Z', dosageInstruction: [{ text: 'Take 1 daily' }] };
  const selected = setup({ ...item, requester: { reference: `Practitioner/${DrAliceSmith.id}` } }, false, baseRequest);
  expect(await screen.findByText('1/15/2024 · Alice Smith · Take 1 daily')).toBeInTheDocument();
  expect(screen.getByText('Alinia 500 mg tablet')).toBeInTheDocument();
  expect(screen.getByRole('link')).toHaveAttribute('href', '/meds/rx-1');
  expect(selected.querySelector('[class*="selected"]')).toBeInTheDocument();
  const unselected = setup({ ...baseRequest, id: 'rx-2', medicationCodeableConcept: undefined }, false, baseRequest);
  expect(screen.getByText('Medication order')).toBeInTheDocument();
  expect(screen.getByText('2/20/2024')).toBeInTheDocument();
  expect(unselected.querySelector('[class*="selected"]')).not.toBeInTheDocument();
});

test.each(STATUSES)('shows the %s status badge', (status) => {
  setup({ ...baseRequest, status });
  expect(screen.getByText(new RegExp(status.replace('-', ' '), 'i'))).toBeInTheDocument();
});

test('hides the status badge on the completed tab but still shows the pending vendor status', () => {
  setup({ ...baseRequest, extension: [{ url: extensions.pendingOrderStatusUrl, valueString: 'Pending' }] }, true);
  expect(screen.queryByText('Active')).not.toBeInTheDocument();
  expect(screen.getByText('ScriptSure: Pending')).toBeInTheDocument();
});
