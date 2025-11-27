// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { ChargeItem } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import ChargeItemPanel from './ChargeItemPanel';

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

describe('ChargeItemPanel', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof ChargeItemPanel>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ChargeItemPanel chargeItem={mockChargeItem} onChange={vi.fn()} onDelete={vi.fn()} {...props} />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('renders charge item details', () => {
    setup();
    expect(screen.getByText('CPT Code')).toBeInTheDocument();
    expect(screen.getByDisplayValue('$100.00')).toBeInTheDocument();
    expect(screen.getByText('Calculated Price')).toBeInTheDocument();
  });

  test('renders modifiers input', () => {
    setup();
    expect(screen.getByText('Modifiers')).toBeInTheDocument();
  });

  test('handles delete charge item', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();

    vi.spyOn(medplum, 'deleteResource').mockResolvedValue({ resourceType: 'ChargeItem' } as ChargeItem);

    setup({ onDelete });

    const buttons = screen.getAllByRole('button', { hidden: true });
    const deleteMenuButton = buttons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');

    if (!deleteMenuButton) {
      throw new Error('Delete menu button not found');
    }

    await user.click(deleteMenuButton);

    const deleteButton = await screen.findByText('Delete');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(medplum.deleteResource).toHaveBeenCalledWith('ChargeItem', 'charge-123');
      expect(onDelete).toHaveBeenCalledWith(mockChargeItem);
    });
  });

  test('displays updated price', () => {
    const itemWithPrice: ChargeItem = {
      ...mockChargeItem,
      priceOverride: { value: 150.5, currency: 'USD' },
    };
    setup({ chargeItem: itemWithPrice });

    expect(screen.getByDisplayValue('$150.50')).toBeInTheDocument();
  });

  test('displays price as N/A when no price override', () => {
    const itemWithoutPrice: ChargeItem = {
      ...mockChargeItem,
      priceOverride: undefined,
    };
    setup({ chargeItem: itemWithoutPrice });

    expect(screen.getByDisplayValue('N/A')).toBeInTheDocument();
  });

  test('displays modifier when present', () => {
    const itemWithModifier: ChargeItem = {
      ...mockChargeItem,
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/chargeitem-modifier',
          valueCodeableConcept: {
            coding: [{ code: '26', display: 'Professional Component' }],
          },
        },
      ],
    };

    setup({ chargeItem: itemWithModifier });

    expect(screen.getByText('Modifiers')).toBeInTheDocument();
  });

  test('renders price calculation explanation', () => {
    setup();

    expect(
      screen.getByText(/Price calculated from Price chart, taking into account applied modifiers/)
    ).toBeInTheDocument();
  });
});
