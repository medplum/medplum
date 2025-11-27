// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { ChargeItem, Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { ChargeItemList } from './ChargeItemList';

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockEncounter: Encounter = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    code: 'AMB',
  },
  subject: { reference: 'Patient/patient-123' },
};

const mockChargeItem: ChargeItem = {
  resourceType: 'ChargeItem',
  id: 'charge-123',
  status: 'billable',
  subject: { reference: 'Patient/patient-123' },
  code: {
    coding: [
      {
        system: 'http://www.ama-assn.org/go/cpt',
        code: '99213',
        display: 'Office Visit',
      },
    ],
  },
  priceOverride: {
    value: 100,
    currency: 'USD',
  },
};

describe('ChargeItemList', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof ChargeItemList>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ChargeItemList
            patient={mockPatient}
            encounter={mockEncounter}
            chargeItems={[]}
            updateChargeItems={vi.fn()}
            {...props}
          />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('renders empty state', () => {
    setup({ chargeItems: [] });
    expect(screen.getByText('No charge items available')).toBeInTheDocument();
    expect(screen.getByText('Add Charge Item')).toBeInTheDocument();
  });

  test('renders charge items list', () => {
    setup({ chargeItems: [mockChargeItem] });

    expect(screen.getByText('Charge Items')).toBeInTheDocument();
    expect(screen.getByText('CPT Code')).toBeInTheDocument();
    expect(screen.getByDisplayValue('$100.00')).toBeInTheDocument();
  });

  test('calculates total price', () => {
    const item2 = { ...mockChargeItem, id: 'charge-456', priceOverride: { value: 50 } };
    setup({ chargeItems: [mockChargeItem, item2] });

    expect(screen.getByDisplayValue('$150')).toBeInTheDocument();
  });

  test('deletes charge item', async () => {
    const updateChargeItems = vi.fn();
    const user = userEvent.setup();

    vi.spyOn(medplum, 'deleteResource').mockResolvedValue({} as any);

    setup({ chargeItems: [mockChargeItem], updateChargeItems });

    const buttons = screen.getAllByRole('button', { hidden: true });
    const deleteButton = buttons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');

    if (!deleteButton) {
      throw new Error('Delete button not found');
    }

    await user.click(deleteButton);

    const deleteMenuItem = await screen.findByText('Delete');
    await user.click(deleteMenuItem);

    await waitFor(() => {
      expect(medplum.deleteResource).toHaveBeenCalledWith('ChargeItem', 'charge-123');
      expect(updateChargeItems).toHaveBeenCalledWith([]);
    });
  });

  test('opens add charge item modal', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByText('Add Charge Item'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('Add Charge Item', { selector: '.mantine-Modal-title' })).toBeInTheDocument();

    expect(screen.getByText('CPT Code')).toBeInTheDocument();
    expect(screen.getByText('Charge Item Definition')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const addButtons = screen.getAllByRole('button', { name: 'Add Charge Item' });
    expect(addButtons.length).toBeGreaterThan(1);
  });

  test('closes modal on cancel', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByText('Add Charge Item'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('displays total calculated price', () => {
    setup({ chargeItems: [mockChargeItem] });

    expect(screen.getByText('Total Calculated Price to Bill')).toBeInTheDocument();
    expect(screen.getByDisplayValue('$100')).toBeInTheDocument();
  });
});
