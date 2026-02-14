// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type {
  ChargeItem,
  ChargeItemDefinition,
  Claim,
  CodeableConcept,
  Coverage,
  Encounter,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import * as useDebouncedUpdateResourceModule from '../../hooks/useDebouncedUpdateResource';
import * as chargeItemsUtils from '../../utils/chargeitems';
import * as claimsUtils from '../../utils/claims';
import { BillingTab } from './BillingTab';

vi.mock('@mantine/notifications', async () => {
  const actual = await vi.importActual('@mantine/notifications');
  return {
    ...actual,
    showNotification: vi.fn(),
  };
});

const { showNotification } = await import('@mantine/notifications');

const mockPatient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'finished',
  class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
  subject: { reference: `Patient/${HomerSimpson.id}` },
  participant: [
    {
      individual: { reference: 'Practitioner/practitioner-123' },
    },
  ],
};

const mockCoverage: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: 'coverage-123',
  status: 'active',
  beneficiary: { reference: 'Patient/patient-123' },
  payor: [{ reference: 'Organization/organization-123' }],
};

const mockPractitioner: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr.'], family: 'Test' }],
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
        code: '99214',
        display: 'Office Visit Level 4',
      },
    ],
    text: 'Test Charge',
  },
  priceOverride: {
    value: 100,
    currency: 'USD',
  },
};

const mockClaim: WithId<Claim> = {
  resourceType: 'Claim',
  id: 'claim-123',
  status: 'active',
  type: { coding: [{ code: 'professional' }] },
  use: 'claim',
  created: new Date().toISOString(),
  priority: { coding: [{ code: 'normal' }] },
  insurance: [],
  patient: { reference: 'Patient/patient-123' },
  provider: { reference: 'Practitioner/practitioner-123' },
};

describe('BillingTab', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    // Mock useDebouncedUpdateResource to return a function that resolves immediately
    vi.spyOn(useDebouncedUpdateResourceModule, 'useDebouncedUpdateResource').mockReturnValue(
      vi.fn().mockResolvedValue(undefined)
    );
  });

  const setup = async (props: Partial<Parameters<typeof BillingTab>[0]> = {}): Promise<void> => {
    return act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              <BillingTab
                patient={mockPatient}
                encounter={mockEncounter}
                setEncounter={vi.fn()}
                practitioner={mockPractitioner}
                setPractitioner={vi.fn()}
                chargeItems={[]}
                setChargeItems={vi.fn()}
                claim={undefined}
                setClaim={vi.fn()}
                {...props}
              />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  test('renders visit details panel', async () => {
    await setup();
    expect(screen.getByText('Visit Details')).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Test/i)).toBeInTheDocument();
  });

  test('renders condition list when there are conditions', async () => {
    const mockCondition = {
      resourceType: 'Condition' as const,
      id: 'condition-1',
      code: {
        coding: [{ code: 'R51', display: 'Headache' }],
        text: 'Headache',
      },
    };

    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockCondition as any);

    await setup({
      encounter: {
        ...mockEncounter,
        diagnosis: [
          {
            condition: { reference: 'Condition/condition-1' },
          },
        ],
      },
    });

    expect(screen.getByText('Diagnosis')).toBeInTheDocument();
    expect(screen.getByText('Add Diagnosis')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Headache')).toBeInTheDocument();
    });
  });

  test('renders condition list when there are NO conditions', async () => {
    await setup({
      encounter: {
        ...mockEncounter,
        diagnosis: [],
      },
    });

    expect(screen.getByText('Diagnosis')).toBeInTheDocument();
    expect(screen.getByText('Add Diagnosis')).toBeInTheDocument();
    expect(screen.queryByText('Headache')).not.toBeInTheDocument();
  });

  test('renders charge item list when charge items are provided', async () => {
    await setup({ chargeItems: [mockChargeItem] });

    expect(screen.getByText('Charge Items')).toBeInTheDocument();
    expect(screen.getByText('Add Charge Item')).toBeInTheDocument();
  });

  test('does not render export claim button when no claim', async () => {
    await setup({ claim: undefined });

    expect(screen.queryByText('Export Claim')).not.toBeInTheDocument();
  });

  test('renders export claim button when claim exists', async () => {
    await setup({ claim: mockClaim });

    expect(screen.getByText('Export Claim')).toBeInTheDocument();
  });

  test('shows export menu options when export button is clicked', async () => {
    const user = userEvent.setup();
    await setup({ claim: mockClaim });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
      expect(screen.getByText('EDI X12')).toBeInTheDocument();
      expect(screen.getByText('NUCC Crosswalk CSV')).toBeInTheDocument();
    });
  });

  test('exports claim as CMS 1500 when option is selected', async () => {
    const user = userEvent.setup();

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockCoverage] as any);
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    } as any);

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await setup({ claim: mockClaim });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
    });

    await user.click(screen.getByText('CMS 1500 Form'));

    await waitFor(() => {
      expect(medplum.post).toHaveBeenCalled();
      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/claim.pdf', '_blank');
    });

    windowOpenSpy.mockRestore();
  });

  test('renders request billing service button when bot is not found', async () => {
    await setup({ claim: mockClaim });

    await waitFor(() => {
      expect(screen.getByText('Request to connect a billing service')).toBeInTheDocument();
    });
    expect(screen.queryByText('Submit Claim')).not.toBeInTheDocument();
  });

  test('renders submit claim button when billing bot exists', async () => {
    const mockBot = { resourceType: 'Bot', id: 'bot-123', name: 'Candid Health Bot' };
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(mockBot as any);

    await setup({ claim: mockClaim });

    await waitFor(() => {
      expect(screen.getByText('Submit Claim')).toBeInTheDocument();
    });
    expect(screen.queryByText('Request to connect a billing service')).not.toBeInTheDocument();
  });

  test('request billing service button opens contact page', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();

    await setup({ claim: mockClaim });

    await waitFor(() => {
      expect(screen.getByText('Request to connect a billing service')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Request to connect a billing service'));

    expect(windowOpenSpy).toHaveBeenCalledWith('https://www.medplum.com/contact', '_blank');
    windowOpenSpy.mockRestore();
  });

  test('shows missing diagnosis notification when submitting without conditions', async () => {
    const mockBot = { resourceType: 'Bot', id: 'bot-123', name: 'Candid Health Bot' };
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(mockBot as any);

    const user = userEvent.setup();

    await setup({ claim: mockClaim });

    await waitFor(() => {
      expect(screen.getByText('Submit Claim')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Submit Claim'));

    await waitFor(() => {
      expect(vi.mocked(showNotification)).toHaveBeenCalledWith({
        title: 'Missing Diagnosis',
        message: 'Please add at least one diagnosis before submitting a claim',
        color: 'red',
      });
    });
  });

  test('submits claim successfully when bot and conditions exist', async () => {
    const mockBot = { resourceType: 'Bot', id: 'bot-123', name: 'Candid Health Bot' };
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(mockBot as any);

    const mockCondition = {
      resourceType: 'Condition' as const,
      id: 'condition-1',
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'R51',
            display: 'Headache',
          },
        ],
        text: 'Headache',
      },
    };

    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockCondition as any);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockCoverage] as any);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ message: 'Claim submitted successfully' });

    const user = userEvent.setup();

    await setup({
      claim: mockClaim,
      encounter: {
        ...mockEncounter,
        diagnosis: [{ condition: { reference: 'Condition/condition-1' } }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Headache')).toBeInTheDocument();
      expect(screen.getByText('Submit Claim')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Submit Claim'));

    await waitFor(() => {
      expect(medplum.executeBot).toHaveBeenCalledWith(
        'bot-123',
        expect.objectContaining({ resourceType: 'Claim' }),
        'application/fhir+json'
      );
      expect(vi.mocked(showNotification)).toHaveBeenCalledWith({
        title: 'Claim Submitted',
        message: 'Claim submitted successfully',
        color: 'green',
      });
    });
  });

  test('fetches coverage on mount', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockCoverage] as any);
    await act(async () => {
      await setup();
    });

    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'Coverage',
        expect.stringContaining('patient=Patient/patient-123')
      );
    });
  });

  test('shows notification when EDI X12 menu item is clicked', async () => {
    const user = userEvent.setup();
    await setup({ claim: mockClaim });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('EDI X12')).toBeInTheDocument();
    });

    await user.click(screen.getByText('EDI X12'));

    await waitFor(() => {
      expect(vi.mocked(showNotification)).toHaveBeenCalledWith({
        title: 'EDI X12',
        message: 'Please contact sales to enable EDI X12 export',
        color: 'blue',
      });
    });
  });

  test('shows notification when NUCC Crosswalk CSV menu item is clicked', async () => {
    const user = userEvent.setup();
    await setup({ claim: mockClaim });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('NUCC Crosswalk CSV')).toBeInTheDocument();
    });

    await user.click(screen.getByText('NUCC Crosswalk CSV'));

    await waitFor(() => {
      expect(vi.mocked(showNotification)).toHaveBeenCalledWith({
        title: 'NUCC Crosswalk',
        message: 'Please contact sales to enable NUCC Crosswalk export',
        color: 'blue',
      });
    });
  });

  test('updates claim when charge item is added', async () => {
    const user = userEvent.setup();
    const setChargeItems = vi.fn();
    const setClaim = vi.fn();
    const debouncedUpdateResource = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(useDebouncedUpdateResourceModule, 'useDebouncedUpdateResource').mockReturnValue(debouncedUpdateResource);

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

    const mockClaimItems = [
      {
        sequence: 1,
        productOrService: {
          coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '99214' }],
        },
      },
    ];

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
    vi.spyOn(claimsUtils, 'getCptChargeItems').mockReturnValue(mockClaimItems);
    vi.spyOn(chargeItemsUtils, 'calculateTotalPrice').mockReturnValue(200);

    await setup({
      claim: mockClaim,
      chargeItems: [],
      setChargeItems,
      setClaim,
      encounter: mockEncounter,
    });

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

    // Wait for CPT code to be selected
    await waitFor(
      () => {
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

      // Verify charge item was created and updateChargeItems was called
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
        expect(setChargeItems).toHaveBeenCalledWith([appliedChargeItem]);
      });

      // Verify claim was updated
      await waitFor(
        () => {
          expect(claimsUtils.getCptChargeItems).toHaveBeenCalledWith([appliedChargeItem], {
            reference: 'Encounter/encounter-123',
          });
          expect(chargeItemsUtils.calculateTotalPrice).toHaveBeenCalledWith([appliedChargeItem]);
          expect(setClaim).toHaveBeenCalledWith(
            expect.objectContaining({
              ...mockClaim,
              item: mockClaimItems,
              total: { value: 200 },
            })
          );
          expect(debouncedUpdateResource).toHaveBeenCalledWith(
            expect.objectContaining({
              ...mockClaim,
              item: mockClaimItems,
              total: { value: 200 },
            })
          );
        },
        { timeout: 5000 }
      );
    }
  });

  test('creates claim when practitioner is changed and charge items exist', async () => {
    const setEncounter = vi.fn();
    const setClaim = vi.fn();
    const debouncedUpdateResource = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(useDebouncedUpdateResourceModule, 'useDebouncedUpdateResource').mockReturnValue(debouncedUpdateResource);

    const mockPractitioner1: Practitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-1',
      name: [{ given: ['Dr.'], family: 'Test' }],
    };

    const mockPractitioner2: Practitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-2',
      name: [{ given: ['Dr.'], family: 'Smith' }],
    };

    const appliedChargeItem: ChargeItem & { id: string } = {
      resourceType: 'ChargeItem',
      id: 'charge-new',
      status: 'planned',
      subject: { reference: 'Patient/patient-123' },
      code: {
        coding: [
          {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '99214',
            display: 'Office Visit Level 4',
          },
        ],
      },
      priceOverride: { value: 200, currency: 'USD' },
    };

    const newClaim: Claim & { id: string } = {
      resourceType: 'Claim',
      id: 'claim-new',
      status: 'active',
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      created: new Date().toISOString(),
      priority: { coding: [{ code: 'normal' }] },
      insurance: [],
      patient: { reference: 'Patient/patient-123' },
      provider: { reference: 'Practitioner/practitioner-2' },
    };

    const updatedEncounter: Encounter = {
      ...mockEncounter,
      participant: [
        {
          individual: { reference: 'Practitioner/practitioner-2' },
        },
      ],
    };

    await medplum.createResource(mockPractitioner1);
    await medplum.createResource(mockPractitioner2);

    // Mock searchResources to return different results based on resource type
    // Use mockResolvedValue for Coverage (called on mount) and mockImplementation for Practitioner
    vi.spyOn(medplum, 'searchResources')
      .mockResolvedValueOnce([mockCoverage] as any) // Coverage search on mount
      .mockResolvedValue([mockPractitioner1, mockPractitioner2] as any); // Practitioner searches
    vi.spyOn(claimsUtils, 'createClaimFromEncounter').mockResolvedValue(newClaim);
    vi.spyOn(medplum, 'updateResource').mockResolvedValue(updatedEncounter as any);
    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockPractitioner2 as any);

    // Setup with charge items but no claim initially
    await setup({
      claim: undefined, // No claim initially
      chargeItems: [appliedChargeItem], // Charge items already present
      setChargeItems: vi.fn(),
      setClaim,
      setEncounter,
      encounter: {
        resourceType: 'Encounter',
        id: 'encounter-123',
        status: 'finished',
        class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
        subject: { reference: `Patient/${HomerSimpson.id}` },
      },
      practitioner: undefined,
    });

    await waitFor(() => {
      expect(screen.getByText('Practitioner')).toBeInTheDocument();
    });

    const practitionerInput = screen.getByPlaceholderText('Search for practitioner');
    expect(practitionerInput).toBeDefined();

    await act(async () => {
      fireEvent.change(practitionerInput, { target: { value: 'Smith' } });
    });

    await waitFor(
      () => {
        const smithOption = screen.queryByText(/Smith/i);
        expect(smithOption).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await act(async () => {
      const smithOption = screen.getByText(/Smith/i);
      fireEvent.click(smithOption);
    });

    await waitFor(
      () => {
        expect(medplum.updateResource).toHaveBeenCalled();
      },
      { timeout: SAVE_TIMEOUT_MS + 2000 }
    );

    await waitFor(
      () => {
        expect(medplum.readReference).toHaveBeenCalledWith({ reference: 'Practitioner/practitioner-2' });
      },
      { timeout: 1000 }
    );

    await waitFor(
      () => {
        expect(claimsUtils.createClaimFromEncounter).toHaveBeenCalledWith(
          medplum,
          mockPatient,
          updatedEncounter,
          mockPractitioner2,
          [appliedChargeItem]
        );
        expect(setClaim).toHaveBeenCalledWith(newClaim);
      },
      { timeout: 5000 }
    );
  }, 15000);

  test('updates claim when practitioner is changed and claim already exists', async () => {
    const setEncounter = vi.fn();
    const setClaim = vi.fn();
    const debouncedUpdateResource = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(useDebouncedUpdateResourceModule, 'useDebouncedUpdateResource').mockReturnValue(debouncedUpdateResource);

    const mockPractitioner1: WithId<Practitioner> = {
      resourceType: 'Practitioner',
      id: 'practitioner-1',
      name: [{ given: ['Dr.'], family: 'Test' }],
    };

    const mockPractitioner2: WithId<Practitioner> = {
      resourceType: 'Practitioner',
      id: 'practitioner-2',
      name: [{ given: ['Dr.'], family: 'Smith' }],
    };

    const appliedChargeItem: WithId<ChargeItem> = {
      resourceType: 'ChargeItem',
      id: 'charge-new',
      status: 'planned',
      subject: { reference: 'Patient/patient-123' },
      code: {
        coding: [
          {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '99214',
            display: 'Office Visit Level 4',
          },
        ],
      },
      priceOverride: { value: 200, currency: 'USD' },
    };

    const existingClaim: Claim & { id: string } = {
      resourceType: 'Claim',
      id: 'claim-existing',
      status: 'active',
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      created: new Date().toISOString(),
      priority: { coding: [{ code: 'normal' }] },
      insurance: [],
      patient: { reference: 'Patient/patient-123' },
      provider: { reference: 'Practitioner/practitioner-1' }, // Original practitioner
    };

    const updatedClaim: Claim & { id: string } = {
      ...existingClaim,
      provider: { reference: 'Practitioner/practitioner-2' }, // Updated practitioner
    };

    const updatedEncounter: Encounter = {
      ...mockEncounter,
      participant: [
        {
          individual: { reference: 'Practitioner/practitioner-2' },
        },
      ],
    };

    await medplum.createResource(mockPractitioner1);
    await medplum.createResource(mockPractitioner2);

    // Mock searchResources to return different results based on resource type
    vi.spyOn(medplum, 'searchResources')
      .mockResolvedValueOnce([mockCoverage] as any) // Coverage search on mount
      .mockResolvedValue([mockPractitioner1, mockPractitioner2] as any); // Practitioner searches
    vi.spyOn(medplum, 'updateResource').mockImplementation(async (resource: any) => {
      // Return updated encounter when updating encounter, updated claim when updating claim
      if (resource.resourceType === 'Encounter') {
        return updatedEncounter as any;
      }
      if (resource.resourceType === 'Claim') {
        return updatedClaim as any;
      }
      return resource;
    });
    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockPractitioner2 as any);

    await setup({
      claim: existingClaim,
      chargeItems: [appliedChargeItem],
      setChargeItems: vi.fn(),
      setClaim,
      setEncounter,
      encounter: {
        resourceType: 'Encounter',
        id: 'encounter-123',
        status: 'finished',
        class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
        subject: { reference: `Patient/${HomerSimpson.id}` },
        participant: [
          {
            individual: { reference: 'Practitioner/practitioner-1' }, // Original practitioner
          },
        ],
      },
      practitioner: mockPractitioner1, // Start with practitioner-1
    });

    await waitFor(() => {
      expect(screen.getByText('Practitioner')).toBeInTheDocument();
      expect(screen.getByText(/Dr\. Test/i)).toBeInTheDocument();
    });

    const practitionerText = screen.getByText(/Dr\. Test/i);
    const practitionerContainer = practitionerText.closest('[data-testid]') || practitionerText.closest('div');
    const clickableElement =
      practitionerContainer?.querySelector('button') || practitionerText.closest('button') || practitionerText;

    // Click to open the dropdown
    await act(async () => {
      fireEvent.click(clickableElement);
    });

    await waitFor(
      () => {
        const practitionerInput = screen.queryByPlaceholderText('Search for practitioner') as HTMLInputElement;
        expect(practitionerInput).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const practitionerInput = screen.getByPlaceholderText('Search for practitioner');

    await act(async () => {
      fireEvent.change(practitionerInput, { target: { value: 'Smith' } });
    });

    await waitFor(
      () => {
        const smithOption = screen.queryByText(/Smith/i);
        expect(smithOption).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await act(async () => {
      const smithOption = screen.getByText(/Smith/i);
      fireEvent.click(smithOption);
    });

    await waitFor(
      () => {
        expect(medplum.updateResource).toHaveBeenCalled();
      },
      { timeout: SAVE_TIMEOUT_MS + 2000 }
    );

    await waitFor(
      () => {
        expect(medplum.readReference).toHaveBeenCalledWith({ reference: 'Practitioner/practitioner-2' });
      },
      { timeout: 1000 }
    );

    await waitFor(
      () => {
        const updateCalls = vi.mocked(medplum.updateResource).mock.calls;
        const claimUpdateCall = updateCalls.find((call) => {
          const resource = call[0] as Claim;
          return resource.resourceType === 'Claim' && resource.provider?.reference === 'Practitioner/practitioner-2';
        });
        expect(claimUpdateCall).toBeDefined();
        expect(setClaim).toHaveBeenCalledWith(updatedClaim);
      },
      { timeout: 5000 }
    );
  }, 15000);

  test('handles export when claim id is missing', async () => {
    const user = userEvent.setup();

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockCoverage] as any);
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    } as any);

    // Setup with a claim but with undefined id
    await setup({ claim: { ...mockClaim, id: undefined as unknown as string } });

    // Export button is visible but clicking it should be a no-op
    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
    });

    await user.click(screen.getByText('CMS 1500 Form'));

    // Post should NOT be called due to early return
    await waitFor(() => {
      expect(medplum.post).not.toHaveBeenCalled();
    });
  });

  test('shows error when export fails to return Media', async () => {
    const user = userEvent.setup();

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockCoverage] as any);
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid' }],
    } as any);

    await setup({ claim: mockClaim });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
    });

    await user.click(screen.getByText('CMS 1500 Form'));

    await waitFor(() => {
      expect(screen.getByText('Failed to download PDF')).toBeInTheDocument();
    });
  });

  test('creates self-pay coverage when no coverage exists', async () => {
    const user = userEvent.setup();

    // Return empty coverage array first, then return self-pay coverage for the claim
    const selfPayCoverage: Coverage = {
      resourceType: 'Coverage',
      id: 'self-pay-123',
      status: 'active',
      beneficiary: { reference: 'Patient/patient-123' },
      payor: [{ reference: 'Patient/patient-123' }],
    };

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'createResource').mockResolvedValue(selfPayCoverage as any);
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    } as any);

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await setup({ claim: mockClaim });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
    });

    await user.click(screen.getByText('CMS 1500 Form'));

    await waitFor(() => {
      expect(medplum.post).toHaveBeenCalled();
    });

    windowOpenSpy.mockRestore();
  });

  test('handles error in encounter change', async () => {
    const setEncounter = vi.fn();
    const debouncedUpdateResource = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(useDebouncedUpdateResourceModule, 'useDebouncedUpdateResource').mockReturnValue(debouncedUpdateResource);
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Update failed'));

    await setup({
      setEncounter,
      practitioner: undefined,
      encounter: mockEncounter,
    });

    await waitFor(() => {
      expect(screen.getByText('Visit Details')).toBeInTheDocument();
    });
  });

  test('exports claim with conditions that have ICD-10 coding', async () => {
    const user = userEvent.setup();

    const mockCondition = {
      resourceType: 'Condition' as const,
      id: 'condition-1',
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'R51',
            display: 'Headache',
          },
        ],
        text: 'Headache',
      },
    };

    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockCondition as any);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockCoverage] as any);
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    } as any);

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await setup({
      claim: mockClaim,
      encounter: {
        ...mockEncounter,
        diagnosis: [
          {
            condition: { reference: 'Condition/condition-1' },
          },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Headache')).toBeInTheDocument();
    });

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
    });

    await user.click(screen.getByText('CMS 1500 Form'));

    await waitFor(() => {
      expect(medplum.post).toHaveBeenCalled();
    });

    windowOpenSpy.mockRestore();
  });
});
