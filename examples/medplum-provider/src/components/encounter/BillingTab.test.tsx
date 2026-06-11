// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { ReadablePromise, WithId } from '@medplum/core';
import type {
  ChargeItem,
  ChargeItemDefinition,
  Claim,
  ClaimResponse,
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
import { ChartNoteStatus } from '../../types/encounter';
import * as chargeItemsUtils from '../../utils/chargeitems';
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

const mockDebouncedUpdate = (): ReturnType<typeof useDebouncedUpdateResourceModule.useDebouncedUpdateResource> => {
  const fn = vi.fn().mockResolvedValue(undefined) as unknown as ReturnType<
    typeof useDebouncedUpdateResourceModule.useDebouncedUpdateResource
  >;
  fn.cancel = vi.fn();
  return fn;
};

describe('BillingTab', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    // Mock useDebouncedUpdateResource to return a function that resolves immediately
    vi.spyOn(useDebouncedUpdateResourceModule, 'useDebouncedUpdateResource').mockReturnValue(mockDebouncedUpdate());
    // BillingTab fetches its own charge items; default to a single CPT charge item.
    vi.spyOn(chargeItemsUtils, 'getChargeItemsForEncounter').mockResolvedValue([mockChargeItem]);
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
                chartNoteStatus={ChartNoteStatus.SignedAndLocked}
                {...props}
              />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  // Override the charge items BillingTab loads for the encounter.
  const mockChargeItems = (items: WithId<ChargeItem>[]): void => {
    vi.spyOn(chargeItemsUtils, 'getChargeItemsForEncounter').mockResolvedValue(items);
  };

  // BillingTab now fetches its own data. List fetches (Coverage, Practitioner, ChargeItemDefinition)
  // go through searchResources; single-resource fetches (the existing Claim and its ClaimResponse)
  // go through searchOne. Dispatch by resource type so tests can seed each independently.
  const mockSearchResources = (resources: Record<string, unknown[]> = {}): void => {
    vi.spyOn(medplum, 'searchResources').mockImplementation(((resourceType: string) =>
      Promise.resolve(resources[resourceType] ?? [])) as any);
  };

  const mockSearchOne = (resources: { Claim?: WithId<Claim>; ClaimResponse?: WithId<ClaimResponse> } = {}): void => {
    vi.spyOn(medplum, 'searchOne').mockImplementation(((resourceType: string) =>
      Promise.resolve(resources[resourceType as 'Claim' | 'ClaimResponse'])) as any);
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
    mockChargeItems([mockChargeItem]);
    await setup();

    expect(screen.getByText('Charge Items')).toBeInTheDocument();
    expect(screen.getByText('Add Charge Item')).toBeInTheDocument();
  });

  test('does not render export claim button when there are no CPT charge items', async () => {
    mockChargeItems([]);
    await setup();

    expect(screen.queryByText('Export Claim')).not.toBeInTheDocument();
  });

  test('renders export claim button when CPT charge items exist', async () => {
    // The card is now gated on billable (CPT) charge items, not on a persisted claim.
    await setup();

    await waitFor(() => {
      expect(screen.getByText('Export Claim')).toBeInTheDocument();
    });
  });

  test('shows export menu options when export button is clicked', async () => {
    const user = userEvent.setup();
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    await setup();

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

    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await setup();

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

  test('shows missing diagnosis notification when submitting without conditions', async () => {
    const user = userEvent.setup();

    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    await setup();

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

  test('submits claim when conditions exist', async () => {
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
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    const postSpy = vi.spyOn(medplum, 'post').mockImplementation(async (url: any) => {
      if (url?.toString().includes('$candid-submit-claim')) {
        return { resourceType: 'ClaimResponse', id: 'cr-1' };
      }
      return { resourceType: 'Coverage', id: 'new-coverage' };
    });

    const user = userEvent.setup();

    await setup({
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
      expect(screen.getByRole('button', { name: /Submit to Candid/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Submit to Candid/i }));

    await waitFor(() => {
      const candidCall = postSpy.mock.calls.find((c) => c[0]?.toString().includes('$candid-submit-claim'));
      expect(candidCall).toBeDefined();
      expect(candidCall?.[0]?.toString()).toContain('/Claim/claim-123/$candid-submit-claim');
      expect(candidCall?.[1]).toEqual(expect.objectContaining({ resourceType: 'Parameters' }));
      expect(vi.mocked(showNotification)).toHaveBeenCalledWith({
        title: 'Claim Submitted',
        message: 'Claim successfully submitted to Candid Health',
        color: 'green',
      });
    });
  });

  test('fetches coverage on mount', async () => {
    mockSearchResources({ Coverage: [mockCoverage] });
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
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    await setup();

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
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    await setup();

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

  test('creates a charge item and updates the charge items list when added', async () => {
    const user = userEvent.setup();

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

    // Mock searchResources for ChargeItemDefinition search (Claim/Coverage fetches return empty)
    mockSearchResources({ ChargeItemDefinition: [mockDefinition], Coverage: [mockCoverage] });
    mockChargeItems([]);
    vi.spyOn(medplum, 'createResource').mockResolvedValue(newChargeItem);
    vi.spyOn(chargeItemsUtils, 'applyChargeItemDefinition').mockResolvedValue(appliedChargeItem);

    await setup({
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
    await user.type(cptInput, '99214');

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
    await user.type(definitionInput, 'Test');

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

      // Verify charge item was created and the list (now BillingTab-local state) was updated.
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
      });

      // The added charge item appears in the list, so the totals card renders (it only shows when
      // there is at least one charge item).
      await waitFor(() => {
        expect(screen.getByText('Total Calculated Price to Bill')).toBeInTheDocument();
      });

      // The claim is no longer created or updated when a charge item is added; it is only
      // persisted at export/submit time.
    }
  });

  test('updates the encounter and resolves the practitioner when the practitioner is changed', async () => {
    const setEncounter = vi.fn();
    const setPractitioner = vi.fn();

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

    // Mock searchResources to return different results based on resource type:
    // Coverage on mount, Practitioner for the practitioner search, and no existing Claim.
    mockSearchResources({ Coverage: [mockCoverage], Practitioner: [mockPractitioner1, mockPractitioner2] });
    mockChargeItems([appliedChargeItem]); // Charge items already present
    vi.spyOn(medplum, 'updateResource').mockResolvedValue(updatedEncounter as any);
    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockPractitioner2 as any);

    // Setup with charge items but no claim initially
    await setup({
      setEncounter,
      setPractitioner,
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

    // The encounter is saved and the new practitioner resolved; no claim is created or updated.
    await waitFor(
      () => {
        expect(setPractitioner).toHaveBeenCalledWith(mockPractitioner2);
      },
      { timeout: 5000 }
    );
  }, 15000);

  test('creates the claim before exporting when none is persisted yet', async () => {
    const user = userEvent.setup();

    // No existing Claim for the encounter; coverage is present.
    mockSearchResources({ Coverage: [mockCoverage] });
    const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({ ...mockClaim, id: 'created-claim' });
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    });
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    // No persisted claim yet; CPT charge items (default) drive the card.
    await setup();

    const exportButton = screen.getByText('Export Claim');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
    });

    await user.click(screen.getByText('CMS 1500 Form'));

    // The claim is created on demand, then exported.
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'Claim' }));
      const exportCall = postSpy.mock.calls.find((c) => c[0]?.toString().includes('$export'));
      expect(exportCall).toBeDefined();
      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/claim.pdf', '_blank');
    });

    windowOpenSpy.mockRestore();
  });

  test('re-fetches the existing claim at persist time and updates it instead of creating a duplicate', async () => {
    const user = userEvent.setup();

    mockSearchResources({ Coverage: [mockCoverage] });

    // No claim is in local state on mount (first lookup returns nothing), but one already exists by
    // the time we export (second lookup), so generateClaim must update it rather than create another.
    let claimLookups = 0;
    vi.spyOn(medplum, 'searchOne').mockImplementation(((resourceType: string) => {
      if (resourceType === 'Claim') {
        claimLookups += 1;
        return Promise.resolve(claimLookups === 1 ? undefined : mockClaim);
      }
      return Promise.resolve(undefined);
    }) as any);

    const updateSpy = vi.spyOn(medplum, 'updateResource');
    const createSpy = vi.spyOn(medplum, 'createResource');
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    });
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await setup();

    await user.click(await screen.findByText('Export Claim'));
    await user.click(await screen.findByText('CMS 1500 Form'));

    await waitFor(() => {
      // Pulled the existing claim and updated it (matched by its id), with no duplicate create.
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'Claim', id: 'claim-123' }));
    });
    expect(createSpy).not.toHaveBeenCalled();

    windowOpenSpy.mockRestore();
  });

  test('shows error when export fails to return Media', async () => {
    const user = userEvent.setup();

    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid' }],
    });

    await setup();

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

    mockSearchResources();
    vi.spyOn(medplum, 'createResource').mockResolvedValue(selfPayCoverage as any);
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await setup();

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
    const debouncedUpdateResource = mockDebouncedUpdate();

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

  describe('claim submission with coverage references', () => {
    test('sends claimToSubmit with updated insurance references to the bot', async () => {
      const user = userEvent.setup();
      const mockCondition = {
        resourceType: 'Condition' as const,
        id: 'condition-1',
        code: {
          coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'R51', display: 'Headache' }],
          text: 'Headache',
        },
      };
      const updatedClaim: WithId<Claim> = {
        ...mockClaim,
        insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/coverage-123' } }],
      };

      mockSearchResources({ Coverage: [mockCoverage] });
      mockSearchOne({ Claim: mockClaim });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(mockCondition as any);
      vi.spyOn(medplum, 'updateResource').mockResolvedValue(updatedClaim);
      const postSpy = vi.spyOn(medplum, 'post').mockImplementation(async (url: any) => {
        if (url?.toString().includes('$candid-submit-claim')) {
          return { resourceType: 'ClaimResponse', id: 'cr-1' };
        }
        return { resourceType: 'Coverage', id: 'new-coverage' };
      });

      await setup({
        encounter: { ...mockEncounter, diagnosis: [{ condition: { reference: 'Condition/condition-1' } }] },
      });

      await waitFor(() => expect(screen.getByText('Submit Claim')).toBeInTheDocument());

      await user.click(screen.getByText('Submit Claim'));

      await waitFor(() => expect(screen.getByRole('button', { name: /Submit to Candid/i })).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /Submit to Candid/i }));

      await waitFor(() => {
        expect(medplum.updateResource).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'Claim',
            insurance: [
              expect.objectContaining({
                sequence: 1,
                focal: true,
                coverage: expect.objectContaining({ reference: 'Coverage/coverage-123' }),
              }),
            ],
          })
        );
        const candidCall = postSpy.mock.calls.find((c) => c[0]?.toString().includes('$candid-submit-claim'));
        expect(candidCall).toBeDefined();
        expect(candidCall?.[0]?.toString()).toContain('/Claim/claim-123/$candid-submit-claim');
        expect(candidCall?.[1]).toEqual(expect.objectContaining({ resourceType: 'Parameters' }));
      });
    });

    test('creates self-pay coverage before opening modal when patient has only insurance', async () => {
      const user = userEvent.setup();
      const mockCondition = {
        resourceType: 'Condition' as const,
        id: 'condition-1',
        code: { text: 'Headache' },
      };

      mockSearchResources({ Coverage: [mockCoverage] });
      mockSearchOne({ Claim: mockClaim });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(mockCondition as any);
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({
        resourceType: 'Coverage',
        id: 'new-self-pay',
        status: 'active',
        beneficiary: { reference: 'Patient/patient-123' },
        type: { coding: [{ code: 'SELFPAY' }] },
      } as any);

      await setup({
        encounter: { ...mockEncounter, diagnosis: [{ condition: { reference: 'Condition/condition-1' } }] },
      });

      await waitFor(() => expect(screen.getByText('Submit Claim')).toBeInTheDocument());

      await user.click(screen.getByText('Submit Claim'));

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'Coverage',
            type: expect.objectContaining({
              coding: expect.arrayContaining([expect.objectContaining({ code: 'SELFPAY' })]),
            }),
          })
        );
        expect(screen.getByText('Review before submitting claim')).toBeInTheDocument();
      });
    });
  });

  describe('Candid Health integration', () => {
    const candidClaimResponse: WithId<ClaimResponse> = {
      resourceType: 'ClaimResponse',
      id: 'claim-response-123',
      status: 'active',
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      patient: { reference: 'Patient/patient-123' },
      created: '2026-03-02T21:32:57.748Z',
      insurer: { reference: 'Organization/insurer-1' },
      outcome: 'complete',
      identifier: [{ system: 'https://candidhealth.com/encounter-id', value: 'candid-encounter-123' }],
      total: [{ category: { coding: [{ code: 'submitted' }] }, amount: { value: 100 } }],
    };

    // The Candid card requires BillingTab to find an existing Claim (searchOne) and then its
    // ClaimResponse (searchOne). Seed both: mockClaim for the Claim lookup, claimResponse for the rest.
    const mockSearchOneWithClaimResponse = (claimResponse: WithId<ClaimResponse>): void => {
      vi.spyOn(medplum, 'searchOne').mockImplementation(((resourceType: string) =>
        Promise.resolve(resourceType === 'Claim' ? mockClaim : claimResponse)) as (
        resourceType: string
      ) => ReadablePromise<WithId<Claim> | WithId<ClaimResponse> | undefined>);
    };

    test('shows Candid claim card when a ClaimResponse exists', async () => {
      mockSearchResources({ Coverage: [mockCoverage] });
      mockSearchOneWithClaimResponse(candidClaimResponse);

      await setup();

      await waitFor(() => {
        expect(screen.getByText('Claim Status:')).toBeInTheDocument();
        expect(screen.getByText('View Claim on Candid')).toBeInTheDocument();
      });
    });

    test('displays status badge and submission date from ClaimResponse', async () => {
      mockSearchOneWithClaimResponse(candidClaimResponse);

      await setup();

      await waitFor(() => {
        expect(screen.getByText('Submitted')).toBeInTheDocument();
        expect(screen.getByText(/Submitted on/)).toBeInTheDocument();
      });
    });

    test('hides submission date when ClaimResponse has no created', async () => {
      mockSearchOneWithClaimResponse({ ...candidClaimResponse, created: '' });

      await setup();

      await waitFor(() => {
        expect(screen.getByText('Claim Status:')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Submitted on/)).not.toBeInTheDocument();
    });

    test('View Claim on Candid button opens the correct Candid URL', async () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const user = userEvent.setup();

      mockSearchOneWithClaimResponse(candidClaimResponse);

      await setup();

      await waitFor(() => {
        expect(screen.getByText('View Claim on Candid')).toBeInTheDocument();
      });

      await user.click(screen.getByText('View Claim on Candid'));

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://app-staging.joincandidhealth.com/claims/candid-encounter-123',
        '_blank'
      );

      windowOpenSpy.mockRestore();
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
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

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
