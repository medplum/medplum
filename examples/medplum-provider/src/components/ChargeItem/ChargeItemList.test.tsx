// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { ChargeItem, ChargeItemDefinition, CodeableConcept, Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as chargeItemsUtils from '../../utils/chargeitems';
import { ChargeItemList } from './ChargeItemList';

const mockPatient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    code: 'AMB',
  },
  subject: { reference: 'Patient/patient-123' },
};

const mockChargeItem: WithId<ChargeItem> = {
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

vi.mock('../../utils/chargeitems', () => ({
  applyChargeItemDefinition: vi.fn(),
  calculateTotalPrice: vi.fn(),
}));

describe('ChargeItemList', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    vi.spyOn(chargeItemsUtils, 'calculateTotalPrice').mockImplementation((items) => {
      return items.reduce((sum, item) => sum + (item.priceOverride?.value || 0), 0);
    });
    vi.spyOn(chargeItemsUtils, 'applyChargeItemDefinition').mockImplementation(async (_, item) => item);
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

  test('adds charge item successfully with CPT code and definition', async () => {
    const user = userEvent.setup();
    const updateChargeItems = vi.fn();
    const mockCptCode: CodeableConcept = {
      coding: [
        {
          system: 'http://www.ama-assn.org/go/cpt',
          code: '99214',
          display: 'Office Visit Level 4',
        },
      ],
    };
    const mockDefinition: ChargeItemDefinition & { id: string } = {
      resourceType: 'ChargeItemDefinition',
      id: 'def-123',
      status: 'active',
      url: 'http://example.com/charge-item-def',
      title: 'Test Definition',
    };
    const newChargeItem: ChargeItem & { id: string } = {
      resourceType: 'ChargeItem',
      id: 'charge-new',
      status: 'planned',
      subject: { reference: 'Patient/patient-123' },
      code: mockCptCode,
    };
    const appliedChargeItem: ChargeItem & { id: string } = {
      ...newChargeItem,
      priceOverride: { value: 200, currency: 'USD' },
    };

    // Mock valueSetExpand for CPT code search
    medplum.valueSetExpand = vi.fn().mockResolvedValue({
      resourceType: 'ValueSet',
      expansion: {
        contains: [
          {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '99214',
            display: 'Office Visit Level 4',
          },
        ],
      },
    });

    // Mock searchResources for ChargeItemDefinition search
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockDefinition] as any);
    vi.spyOn(medplum, 'createResource').mockResolvedValue(newChargeItem);
    vi.spyOn(chargeItemsUtils, 'applyChargeItemDefinition').mockResolvedValue(appliedChargeItem);

    setup({ updateChargeItems });

    // Open modal
    await user.click(screen.getByText('Add Charge Item'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Find CPT Code input
    const cptInputs = screen.getAllByRole('searchbox');
    const cptInput = cptInputs.find((input) => {
      const label = input.closest('.mantine-InputWrapper-root')?.querySelector('label');
      return label?.textContent?.includes('CPT Code');
    }) as HTMLInputElement;

    expect(cptInput).toBeDefined();

    // Type in CPT code input
    await act(async () => {
      await user.type(cptInput, '99214');
    });

    // Wait for valueSetExpand to be called
    await waitFor(
      () => {
        expect(medplum.valueSetExpand).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Select the CPT code option
    await act(async () => {
      fireEvent.keyDown(cptInput, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyDown(cptInput, { key: 'Enter', code: 'Enter' });
    });

    // Wait for CPT code to be selected (check for selected items or code display)
    await waitFor(
      () => {
        // Check if the code appears in selected items or if the input value changed
        const selectedItems = document.querySelector('[data-testid="selected-items"]');
        const hasCode =
          selectedItems?.textContent?.includes('99214') || selectedItems?.textContent?.includes('Office Visit Level 4');
        return hasCode === true;
      },
      { timeout: 3000 }
    );

    // Find Charge Item Definition input
    const definitionInputs = screen.getAllByRole('searchbox');
    const definitionInput = definitionInputs.find((input) => {
      const placeholder = (input as HTMLInputElement).placeholder;
      return placeholder?.toLowerCase().includes('charge item definition');
    }) as HTMLInputElement;

    expect(definitionInput).toBeDefined();

    // Type in definition input
    await act(async () => {
      await user.type(definitionInput, 'Test');
    });

    // Wait for searchResources to be called
    await waitFor(
      () => {
        expect(medplum.searchResources).toHaveBeenCalledWith(
          'ChargeItemDefinition',
          expect.any(URLSearchParams),
          expect.any(Object)
        );
      },
      { timeout: 3000 }
    );

    // Select the definition option
    await act(async () => {
      fireEvent.keyDown(definitionInput, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyDown(definitionInput, { key: 'Enter', code: 'Enter' });
    });

    // Wait for definition to be selected and button to be enabled
    await waitFor(
      () => {
        const addButtons = screen.getAllByRole('button', { name: 'Add Charge Item' });
        const submitButton = addButtons.find((btn) => {
          const htmlBtn = btn as HTMLButtonElement;
          return htmlBtn.type === 'button' && !htmlBtn.disabled;
        });
        return submitButton !== undefined;
      },
      { timeout: 5000 }
    );

    // Submit the form
    const addButtons = screen.getAllByRole('button', { name: 'Add Charge Item' });
    const submitButton = addButtons.find((btn) => {
      const htmlBtn = btn as HTMLButtonElement;
      return htmlBtn.type === 'button' && !htmlBtn.disabled;
    });

    expect(submitButton).toBeDefined();
    if (submitButton) {
      await user.click(submitButton);

      // Verify charge item was created
      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'ChargeItem',
            status: 'planned',
            code: mockCptCode,
            definitionCanonical: ['http://example.com/charge-item-def'],
          })
        );
        expect(chargeItemsUtils.applyChargeItemDefinition).toHaveBeenCalled();
        expect(updateChargeItems).toHaveBeenCalledWith([appliedChargeItem]);
      });

      // Verify modal closed
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    }
  });
});
