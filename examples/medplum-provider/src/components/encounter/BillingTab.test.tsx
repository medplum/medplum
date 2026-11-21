// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { CPT } from '@medplum/core';
import type {
  Bot,
  ChargeItem,
  Claim,
  ClaimItem,
  ClaimResponse,
  Coverage,
  Encounter,
  Location,
  Organization,
  Patient,
  PaymentReconciliation,
  Practitioner,
  Resource,
} from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CPT_COPYRIGHT_NOTICE, SAVE_TIMEOUT_MS } from '../../config/constants';
import { render } from '../../test-utils/render';
import { ChartNoteStatus } from '../../types/encounter';
import * as chargeItemsUtils from '../../utils/chargeitems';
import { LINE_CHARGE_ITEM_URL } from '../../utils/claims';
import * as operationsUtils from '../../utils/operations';
import { pinClaimEncounter } from '../billing/claimConditions';
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
  status: 'draft',
  type: { coding: [{ code: 'professional' }] },
  use: 'claim',
  created: new Date().toISOString(),
  priority: { coding: [{ code: 'normal' }] },
  insurance: [],
  patient: { reference: 'Patient/patient-123' },
  provider: { reference: 'Practitioner/practitioner-123' },
  diagnosis: [{ sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'R51' }] } }],
};

// A claim line billing a charge item.
const lineFor = (chargeItemId: string, code: string, sequence = 1): ClaimItem => ({
  sequence,
  productOrService: { coding: [{ system: CPT, code }] },
  extension: [{ url: LINE_CHARGE_ITEM_URL, valueReference: { reference: `ChargeItem/${chargeItemId}` } }],
});

describe('BillingTab', () => {
  let medplum: MockClient;
  // The claims generating the visit's claim finds: those the test seeds with mockSearchOne, unless it lists its own.
  let openClaims: unknown[] = [];

  beforeEach(async () => {
    openClaims = [];
    medplum = new MockClient();
    vi.clearAllMocks();
    // The diagnoses section reads the visit to find its Conditions.
    await medplum.createResource(mockEncounter);
    // BillingTab fetches its own charge items; default to a single CPT charge item.
    vi.spyOn(chargeItemsUtils, 'getChargeItemsForEncounter').mockResolvedValue([mockChargeItem]);
    // Both claim submission operations are deployed unless a test says otherwise.
    vi.spyOn(operationsUtils, 'isCustomOperationAvailable').mockResolvedValue(true);
  });

  type TabProps = Partial<Parameters<typeof BillingTab>[0]>;
  const tree = (props: TabProps): JSX.Element => (
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
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
      </MedplumProvider>
    </MemoryRouter>
  );

  // Renders the tab, and returns a function that re-renders the same tab with other props, e.g. another section.
  const setup = async (props: TabProps = {}): Promise<(next: TabProps) => Promise<void>> => {
    let rerender: ((ui: JSX.Element) => void) | undefined;
    await act(async () => {
      rerender = render(tree(props)).rerender;
    });
    return (next) =>
      act(async () => {
        rerender?.(tree({ ...props, ...next }));
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
      Promise.resolve(resources[resourceType] ?? (resourceType === 'Claim' ? openClaims : []))) as any);
  };

  const mockSearchOne = (resources: { Claim?: WithId<Claim>; ClaimResponse?: WithId<ClaimResponse> } = {}): void => {
    vi.spyOn(medplum, 'searchOne').mockImplementation(((resourceType: string) =>
      Promise.resolve(resources[resourceType as 'Claim' | 'ClaimResponse'])) as any);
    openClaims = resources.Claim ? [resources.Claim] : [];
    mockClaimSearch(() => [
      ...(resources.Claim ? [resources.Claim] : []),
      ...(resources.ClaimResponse ? [resources.ClaimResponse] : []),
    ]);
  };

  // The claims section finds the visit's claims, with their responses, through Claim searches. Claims are pinned to
  // the visit and responses point at the first claim, so they count as the visit's.
  const mockClaimSearch = (get: () => Resource[]): void => {
    const search = medplum.search.bind(medplum);
    vi.spyOn(medplum, 'search').mockImplementation((async (resourceType: string, ...rest: unknown[]) => {
      if (resourceType !== 'Claim') {
        return (search as any)(resourceType, ...rest);
      }
      const resources = get();
      const firstClaim = resources.find((r) => r.resourceType === 'Claim');
      return {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: resources.map((r) => ({
          resource:
            r.resourceType === 'Claim'
              ? pinClaimEncounter(r, { reference: 'Encounter/encounter-123' })
              : { ...r, request: { reference: `Claim/${firstClaim?.id}` } },
        })),
      };
    }) as any);
  };

  // Opens a claim's menu in the Claims section: the first row's unless another is given.
  const openClaimMenu = async (user: ReturnType<typeof userEvent.setup>, index = 0): Promise<void> => {
    await user.click((await screen.findAllByRole('button', { name: 'Claim actions' }))[index]);
  };

  const clickSubmitClaim = async (user: ReturnType<typeof userEvent.setup>, index = 0): Promise<void> => {
    await openClaimMenu(user, index);
    await user.click(await screen.findByRole('menuitem', { name: 'Submit Claim' }));
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
      chartNoteStatus: ChartNoteStatus.Signed,
      encounter: {
        ...mockEncounter,
        diagnosis: [
          {
            condition: { reference: 'Condition/condition-1' },
          },
        ],
      },
    });

    expect(screen.getByText('Diagnoses')).toBeInTheDocument();
    expect(screen.getByText('Add a Diagnosis')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Headache/)).toBeInTheDocument();
    });
  });

  test('renders condition list when there are NO conditions', async () => {
    await setup({
      chartNoteStatus: ChartNoteStatus.Signed,
      encounter: {
        ...mockEncounter,
        diagnosis: [],
      },
    });

    expect(screen.getByText('Diagnoses')).toBeInTheDocument();
    expect(screen.getByText('Add a Diagnosis')).toBeInTheDocument();
    expect(screen.queryByText(/Headache/)).not.toBeInTheDocument();
  });

  test('locks the diagnoses with the signed note', async () => {
    await setup({ encounter: { ...mockEncounter, diagnosis: [] } });

    expect(screen.getByText('Diagnoses')).toBeInTheDocument();
    expect(screen.getByText('No diagnoses were added before the note was locked.')).toBeInTheDocument();
    expect(screen.queryByText('Add a Diagnosis')).not.toBeInTheDocument();
  });

  test('renders the AMA CPT copyright notice', async () => {
    mockChargeItems([mockChargeItem]);
    await setup();

    expect(screen.getByText(CPT_COPYRIGHT_NOTICE)).toBeInTheDocument();
  });

  test('renders charge item list when charge items are provided', async () => {
    mockChargeItems([mockChargeItem]);
    await setup();

    expect(await screen.findByText('Charge Items')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a Charge Item' })).toBeInTheDocument();
  });

  test('hides the claims section until the visit is signed and locked', async () => {
    await setup({ chartNoteStatus: ChartNoteStatus.Signed });

    expect(screen.queryByText('Claims')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim actions' })).not.toBeInTheDocument();
  });

  test('makes a new claim from picked charge items, moving them off the open claim they were on', async () => {
    const user = userEvent.setup();
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({
      Claim: { ...mockClaim, item: [lineFor('charge-123', '99214'), lineFor('charge-456', '36415', 2)] },
    });
    const labLine: WithId<ChargeItem> = {
      ...mockChargeItem,
      id: 'charge-456',
      code: { coding: [{ system: CPT, code: '36415', display: 'Venipuncture' }] },
    };
    mockChargeItems([mockChargeItem, labLine]);
    const create = medplum.createResource.bind(medplum);
    const createSpy = vi.spyOn(medplum, 'createResource').mockImplementation((async (resource: Resource) => {
      const created = await create(resource);
      openClaims.push(created);
      return created;
    }));
    const updateSpy = vi.spyOn(medplum, 'updateResource');

    await setup();
    await user.click(await screen.findByRole('button', { name: 'New Claim' }));
    expect((await screen.findAllByText(/Moves from Claim/, {}, { timeout: 3000 })).length).toBe(2);
    await user.click(await screen.findByRole('checkbox', { name: /36415/ }));
    await user.click(screen.getByRole('button', { name: /^Create Claim/ }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Claim',
          item: [
            expect.objectContaining({
              productOrService: expect.objectContaining({ coding: [expect.objectContaining({ code: '36415' })] }),
            }),
          ],
        })
      );
    });
    // The claim it was on keeps only the charge item that wasn't picked.
    await waitFor(() => {
      const from = updateSpy.mock.calls.map(([r]) => r as Claim).find((r) => r.id === 'claim-123');
      expect(from?.item?.map((i) => i.productOrService.coding?.[0]?.code)).toEqual(['99214']);
    });
    // The new claim opens in the drawer over the visit.
    expect(await screen.findByRole('dialog', { name: 'Claim' })).toBeInTheDocument();
  });

  test("calls out charge items that aren't on a claim, and adds them to an open one", async () => {
    const user = userEvent.setup();
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: { ...mockClaim, item: [] } });
    mockChargeItems([mockChargeItem]);
    const updateSpy = vi.spyOn(medplum, 'updateResource').mockImplementation(async (r) => r as any);

    await setup();
    expect(await screen.findByText("1 charge item isn't on a claim: 99214")).toBeInTheDocument();
    expect(screen.getByText('Not on a claim')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add to Claim' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Claim/ }));

    await waitFor(() => {
      const target = updateSpy.mock.calls.map(([r]) => r as Claim).find((r) => r.id === 'claim-123');
      expect(target?.item?.map((i) => i.productOrService.coding?.[0]?.code)).toEqual(['99214']);
    });
  });

  test("shows the visit's claim before it is made, with its actions", async () => {
    await setup();

    expect(
      await screen.findByText("Made from the visit's charge items and diagnoses when you export or submit it")
    ).toBeInTheDocument();
    expect(screen.getByText('Claim')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claim actions' })).toBeInTheDocument();
  });

  test('shows export menu options when export button is clicked', async () => {
    const user = userEvent.setup();
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    await setup();

    await openClaimMenu(user);

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

    await openClaimMenu(user);

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

  test('disables Submit Claim when no claim submission operation is deployed', async () => {
    vi.spyOn(operationsUtils, 'isCustomOperationAvailable').mockResolvedValue(false);
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    await setup();

    const user = userEvent.setup();
    await openClaimMenu(user);

    expect(await screen.findByRole('menuitem', { name: 'Submit Claim' })).toBeDisabled();
    expect(screen.getByText('Claim submission is not enabled for this project')).toBeInTheDocument();
  });

  test('only offers the deployed claim submission operations', async () => {
    vi.spyOn(operationsUtils, 'isCustomOperationAvailable').mockImplementation(
      async (_medplum, code) => code === operationsUtils.CANDID_SUBMIT_CLAIM_OPERATION
    );
    vi.spyOn(medplum, 'readReference').mockResolvedValue({
      resourceType: 'Condition',
      id: 'condition-1',
      code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'R51', display: 'Headache' }] },
    } as any);
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    await setup({
      encounter: { ...mockEncounter, diagnosis: [{ condition: { reference: 'Condition/condition-1' } }] },
    });
    await screen.findByText(/Headache/);

    const user = userEvent.setup();
    await clickSubmitClaim(user);

    expect(await screen.findByRole('button', { name: /Submit to Candid/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit to Stedi/i })).not.toBeInTheDocument();
  });

  test('shows missing diagnosis notification when submitting a claim without diagnoses', async () => {
    const user = userEvent.setup();

    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: { ...mockClaim, diagnosis: undefined } });
    await setup();

    await clickSubmitClaim(user);

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
      expect(screen.getByText(/Headache/)).toBeInTheDocument();
    });

    await clickSubmitClaim(user);

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
        expect.objectContaining({ patient: 'Patient/patient-123', status: 'active' })
      );
    });
  });

  test('shows notification when EDI X12 menu item is clicked', async () => {
    const user = userEvent.setup();
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne({ Claim: mockClaim });
    await setup();

    await openClaimMenu(user);

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

    await openClaimMenu(user);

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

  test("saves the visit's service lines as its charge items", async () => {
    const user = userEvent.setup();
    mockSearchResources({ Coverage: [mockCoverage] });
    const createSpy = vi
      .spyOn(medplum, 'createResource')
      .mockImplementation(async (r: any) => ({ ...r, id: r.resourceType === 'ChargeItem' ? 'charge-new' : 'x' }));
    const updateSpy = vi.spyOn(medplum, 'updateResource').mockImplementation(async (r: any) => r);
    const deleteSpy = vi.spyOn(medplum, 'deleteResource').mockResolvedValue(undefined as any);

    await setup();
    expect(await screen.findByText('Charge Items')).toBeInTheDocument();

    // A new line is saved as a charge item once it has a code.
    await user.click(screen.getByRole('button', { name: 'Add a Charge Item' }));
    await user.type(screen.getByPlaceholderText('Search CPT codes'), 'Test');
    await user.click(await screen.findByText('Test Display 2'));
    await waitFor(
      () =>
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'ChargeItem',
            context: { reference: 'Encounter/encounter-123' },
            code: expect.objectContaining({ coding: [expect.objectContaining({ code: 'test-code-2' })] }),
            quantity: { value: 1 },
          })
        ),
      { timeout: SAVE_TIMEOUT_MS + 2000 }
    );

    // Removing the first line deletes its charge item; the existing one is renumbered, not recreated.
    await user.click(screen.getByRole('button', { name: 'Move line 1' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('ChargeItem', 'charge-123'), {
      timeout: SAVE_TIMEOUT_MS + 2000,
    });
    expect(createSpy.mock.calls.filter(([r]) => r.resourceType === 'ChargeItem')).toHaveLength(1);
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'charge-new' }));
  }, 15000);

  test('updates the encounter and resolves the practitioner when the practitioner is changed', async () => {
    const setEncounter = vi.fn();
    const setPractitioner = vi.fn();
    const onEncounterSaved = vi.fn();

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
    vi.spyOn(medplum, 'patchResource').mockResolvedValue(updatedEncounter as any);
    vi.spyOn(medplum, 'readReference').mockResolvedValue(mockPractitioner2 as any);

    // Setup with charge items but no claim initially, before the note is locked
    await setup({
      chartNoteStatus: ChartNoteStatus.Signed,
      setEncounter,
      setPractitioner,
      onEncounterSaved,
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

    // Also change the check-in time inside the same debounce window; both field edits must
    // survive into the persisted patch ops (the debounce must not drop the earlier one).
    const checkinInput = screen.getByLabelText(/Check in/i);
    await act(async () => {
      fireEvent.change(checkinInput, { target: { value: '2024-01-02T09:30' } });
    });

    await waitFor(
      () => {
        const encounterPatchOps = vi
          .mocked(medplum.patchResource)
          .mock.calls.filter((call) => call[0] === 'Encounter')
          .flatMap((call) => call[2]);
        expect(encounterPatchOps).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ op: 'add', path: '/participant' }),
            expect.objectContaining({ op: 'add', path: '/period/start' }),
          ])
        );
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

    // The persisted-save notification fires with the saved encounter.
    expect(onEncounterSaved).toHaveBeenCalledWith(updatedEncounter);
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

    await openClaimMenu(user);

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

  test('defaults the claim billing provider from the practitioner PractitionerRole organization', async () => {
    const user = userEvent.setup();

    mockSearchResources({ Coverage: [mockCoverage] });
    await medplum.createResource<Organization>({
      resourceType: 'Organization',
      id: 'billing-org-123',
      name: 'Test Medical Practice',
    });

    // No persisted Claim; the practitioner bills under an organization via PractitionerRole.
    vi.spyOn(medplum, 'searchOne').mockImplementation(((resourceType: string) => {
      if (resourceType === 'PractitionerRole') {
        return Promise.resolve({
          resourceType: 'PractitionerRole',
          id: 'role-1',
          practitioner: { reference: 'Practitioner/practitioner-123' },
          organization: { reference: 'Organization/billing-org-123', display: 'Test Medical Practice' },
        });
      }
      return Promise.resolve(undefined);
    }) as any);

    const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({ ...mockClaim, id: 'created-claim' });
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Media',
      content: { url: 'https://example.com/claim.pdf' },
    });
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await setup();

    await waitFor(() => {
      expect(medplum.searchOne).toHaveBeenCalledWith('PractitionerRole', {
        practitioner: 'Practitioner/practitioner-123',
        active: 'true',
        'organization.identifier': 'https://www.medplum.com/provider|billing-organization',
      });
    });

    // The role's organization is preselected in the picker, which stays editable.
    expect(await screen.findByText('Test Medical Practice')).toBeInTheDocument();
    expect(document.querySelector('.mantine-Pill-remove')).toBeInTheDocument();

    await openClaimMenu(user);
    await user.click(await screen.findByText('CMS 1500 Form'));

    // The generated claim bills through the role's organization instead of the practitioner.
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Claim',
          provider: expect.objectContaining({ reference: 'Organization/billing-org-123' }),
        })
      );
    });

    windowOpenSpy.mockRestore();
  });

  test('drops a service facility removal when the encounter has no location', async () => {
    const patchSpy = vi.spyOn(medplum, 'patchResource');
    mockSearchResources({ Coverage: [mockCoverage] });
    mockSearchOne();
    // Select then clear within one debounce: the pending add is replaced by a remove, which is dropped.
    await medplum.createResource<Location>({ resourceType: 'Location', id: 'loc-1', name: 'Main Clinic' });
    vi.spyOn(medplum, 'searchResources').mockImplementation(((resourceType: string) =>
      Promise.resolve(
        resourceType === 'Location' ? [{ resourceType: 'Location', id: 'loc-1', name: 'Main Clinic' }] : []
      )) as any);

    await setup();
    const facilityInput = await screen.findByPlaceholderText('Search for location');
    await act(async () => {
      fireEvent.change(facilityInput, { target: { value: 'Main' } });
    });
    await waitFor(
      () => {
        expect(medplum.searchResources).toHaveBeenCalledWith(
          'Location',
          expect.any(URLSearchParams),
          expect.any(Object)
        );
        expect(screen.getByText('Main Clinic')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Main Clinic'));
    });
    // The practitioner picker has a clear button too; the service facility picker is rendered last
    const clearButtons = screen.getAllByTitle('Clear all');
    await act(async () => {
      fireEvent.click(clearButtons[clearButtons.length - 1]);
    });

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, SAVE_TIMEOUT_MS + 50);
      });
    });
    expect(patchSpy).not.toHaveBeenCalled();
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

    await openClaimMenu(user);

    await waitFor(() => {
      expect(screen.getByText('CMS 1500 Form')).toBeInTheDocument();
    });

    await user.click(screen.getByText('CMS 1500 Form'));

    expect(await screen.findByText('Failed to download PDF', {}, { timeout: 3000 })).toBeInTheDocument();
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

    await openClaimMenu(user);

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

    vi.spyOn(medplum, 'patchResource').mockRejectedValue(new Error('Update failed'));

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

      await screen.findByText(/Headache/);
      await clickSubmitClaim(user);

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
        code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'R51', display: 'Headache' }] },
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

      await clickSubmitClaim(user);

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

    const getEncountersBot: WithId<Bot> = {
      resourceType: 'Bot',
      id: 'get-encounter-bot',
      identifier: [{ system: 'https://medplum.com/integrations/candid-health', value: 'get-encounter' }],
    };

    // A claim that has been submitted to Candid: the submit operation writes the Candid encounter
    // id back onto the Claim, which is what triggers the refresh on load.
    const submittedClaim: WithId<Claim> = { ...mockClaim, status: 'active' };
    const candidClaim: WithId<Claim> = {
      ...submittedClaim,
      identifier: [{ system: 'https://candidhealth.com/encounter-id', value: 'candid-encounter-123' }],
    };

    // The claims section finds the claim and its ClaimResponse through Claim searches, and the get-encounter bot through
    // searchOne on Bot. BillingTab runs get-encounter with the claim's Candid encounter id, then searches again.
    const mockClaimWithResponse = (
      claimResponse: WithId<ClaimResponse>,
      options?: {
        claim?: WithId<Claim>;
        getEncounterDeployed?: boolean;
        refreshedClaimResponse?: WithId<ClaimResponse>;
      }
    ): void => {
      let currentClaimResponse = claimResponse;
      vi.spyOn(medplum, 'searchOne').mockImplementation(((resourceType: string, query?: Record<string, string>) => {
        if (resourceType === 'Bot' && String(query?.identifier ?? '').endsWith('get-encounter')) {
          return Promise.resolve(options?.getEncounterDeployed ? getEncountersBot : undefined);
        }
        return Promise.resolve(resourceType === 'Claim' ? (options?.claim ?? submittedClaim) : undefined);
      }) as any);
      mockClaimSearch(() => [options?.claim ?? submittedClaim, currentClaimResponse]);
      vi.spyOn(medplum, 'executeBot').mockImplementation((async () => {
        currentClaimResponse = options?.refreshedClaimResponse ?? currentClaimResponse;
        return {};
      }) as typeof medplum.executeBot);
    };

    test('shows the claim with the status from its ClaimResponse', async () => {
      mockSearchResources({ Coverage: [mockCoverage] });
      mockClaimWithResponse({
        ...candidClaimResponse,
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/source-claim-status',
            valueCodeableConcept: {
              coding: [{ system: 'https://candidhealth.com/claim-status', code: 'waiting_for_provider' }],
            },
          },
        ],
      });

      await setup();

      expect((await screen.findByText('Awaiting payer')).closest('[title]')).toHaveAttribute(
        'title',
        'Waiting For Provider'
      );
      expect(screen.getByText(/^Claim ·/)).toBeInTheDocument();
    });

    test('executes the get-encounter bot to refresh a Candid ClaimResponse on load', async () => {
      const refreshedClaimResponse: WithId<ClaimResponse> = {
        ...candidClaimResponse,
        total: [{ category: { coding: [{ code: 'submitted' }] }, amount: { value: 150 } }],
      };

      mockSearchResources({ Coverage: [mockCoverage] });
      mockClaimWithResponse(candidClaimResponse, {
        claim: candidClaim,
        getEncounterDeployed: true,
        refreshedClaimResponse,
      });

      await setup();

      // The bot ran with the claim's Candid encounter ID as input, then the claims were searched again.
      await waitFor(() => {
        expect(medplum.executeBot).toHaveBeenCalledWith(
          'get-encounter-bot',
          { encounterId: 'candid-encounter-123' },
          'application/json'
        );
      });
      await screen.findAllByText(/^Claim ·/);
      const claimSearches = vi.mocked(medplum.search).mock.calls.filter((c) => c[0] === 'Claim');
      expect(claimSearches.length).toBeGreaterThan(2);
    });

    test('does not run get-encounter when the claim was not submitted to Candid', async () => {
      const nonCandidClaimResponse: WithId<ClaimResponse> = { ...candidClaimResponse, identifier: [] };

      mockSearchResources({ Coverage: [mockCoverage] });
      // The claim (default mockClaim) has no Candid encounter id, so there is nothing to refresh.
      mockClaimWithResponse(nonCandidClaimResponse, { getEncounterDeployed: true });

      await setup();

      await screen.findAllByText(/^Claim ·/);
      // The refresh bot doesn't run for a non-Candid claim.
      expect(medplum.executeBot).not.toHaveBeenCalled();
    });

    test('skips the refresh when the get-encounter bot is not deployed', async () => {
      mockSearchResources({ Coverage: [mockCoverage] });
      mockClaimWithResponse(candidClaimResponse, { claim: candidClaim });

      await setup();

      await screen.findAllByText(/^Claim ·/);
      expect(medplum.executeBot).not.toHaveBeenCalledWith('get-encounter-bot', expect.anything(), expect.anything());
    });
  });

  describe('related claims', () => {
    const relatedClaim: WithId<Claim> = {
      ...mockClaim,
      id: 'related-123',
      created: new Date(Date.now() + 1000).toISOString(),
      related: [{ claim: { reference: 'Claim/claim-123' } }],
      diagnosis: [
        {
          sequence: 1,
          diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'R51' }] },
        },
      ],
      item: [{ sequence: 1, productOrService: { coding: [{ code: '99214' }] }, net: { value: 80 } }],
      total: { value: 80, currency: 'USD' },
    };
    const remit: WithId<PaymentReconciliation> = {
      resourceType: 'PaymentReconciliation',
      id: 'remit-1',
      status: 'active',
      created: '2026-11-01',
      paymentDate: '2026-11-01',
      paymentAmount: { value: 60, currency: 'USD' },
      detail: [
        { type: { coding: [{ code: 'payment' }] }, request: { reference: 'Claim/related-123' }, amount: { value: 60 } },
      ],
    };

    test('lists the visit claim and its related claims, with links to each claim and its remittances', async () => {
      mockSearchResources({ Coverage: [mockCoverage], PaymentReconciliation: [remit] });
      mockClaimSearch(() => [mockClaim, relatedClaim]);

      await setup();

      const [visitLink, relatedLink] = await screen.findAllByText(/^Claim ·/);
      expect(visitLink.closest('a')).toHaveAttribute(
        'href',
        '/Billing/Claims/all/claim-123'
      );
      expect(relatedLink.closest('a')).toHaveAttribute(
        'href',
        '/Billing/Claims/all/related-123'
      );
      expect(screen.getByText('99214 · $80.00')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Remit · .* · \$60\.00/ })).toHaveAttribute(
        'href',
        '/Billing/Remits/all/remit-1'
      );

      // Claims open in a drawer over the visit, from the row or its menu, rather than in Billing.
      const user = userEvent.setup();
      await user.click(relatedLink);
      expect(await screen.findByRole('dialog', { name: 'Claim' })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Claim' })).not.toBeInTheDocument());

      await openClaimMenu(user, 1);
      const items = await screen.findAllByRole('menuitem');
      expect(items.find((i) => i.textContent === 'Open in Billing')).toHaveAttribute(
        'href',
        '/Billing/Claims/all/related-123'
      );
      await user.click(items.find((i) => i.textContent === 'Open Claim') as HTMLElement);
      expect(await screen.findByRole('dialog', { name: 'Claim' })).toBeInTheDocument();
    });

    test('discards a claim that was never submitted, after confirming', async () => {
      const picked = relatedClaim;
      mockSearchResources({ Coverage: [mockCoverage] });
      mockClaimSearch(() => [mockClaim, picked]);
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockImplementation(async (r) => r as any);

      await setup();
      const user = userEvent.setup();
      await openClaimMenu(user, 1);
      await user.click(await screen.findByRole('menuitem', { name: 'Discard Claim' }));
      await user.click(await screen.findByRole('button', { name: 'Discard Claim' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'related-123', status: 'entered-in-error' }))
      );
    });

    test('exports a related claim as it is, without rebuilding it from the visit', async () => {
      mockSearchResources({ Coverage: [mockCoverage] });
      mockClaimSearch(() => [mockClaim, relatedClaim]);
      const updateSpy = vi.spyOn(medplum, 'updateResource');
      const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue({
        resourceType: 'Media',
        content: { url: 'https://example.com/related.pdf' },
      });
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      await setup();
      const user = userEvent.setup();
      await openClaimMenu(user, 1);
      await user.click(await screen.findByText('CMS 1500 Form'));

      await waitFor(() => expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/related.pdf', '_blank'));
      expect(postSpy.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          parameter: [{ name: 'resource', resource: expect.objectContaining({ id: 'related-123' }) }],
        })
      );
      expect(updateSpy).not.toHaveBeenCalled();
      windowOpenSpy.mockRestore();
    });

    test('submits a related claim with the chosen coverage', async () => {
      mockSearchResources({ Coverage: [mockCoverage] });
      mockClaimSearch(() => [mockClaim, relatedClaim]);
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockImplementation(async (r) => r as any);
      const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue({ resourceType: 'ClaimResponse', id: 'cr-2' });

      await setup();
      const user = userEvent.setup();
      // The related claim has its own diagnoses, so the visit having none doesn't stop it.
      await clickSubmitClaim(user, 1);
      await user.click(await screen.findByRole('button', { name: /Submit to Candid/i }));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'related-123',
            insurance: [
              expect.objectContaining({
                sequence: 1,
                focal: true,
                coverage: expect.objectContaining({ reference: 'Coverage/coverage-123' }),
              }),
            ],
          })
        );
        expect(
          postSpy.mock.calls.find((c) => c[0]?.toString().includes('/Claim/related-123/$candid-submit-claim'))
        ).toBeDefined();
      });
    });

    test("won't submit a related claim with no diagnoses", async () => {
      mockSearchResources({ Coverage: [mockCoverage] });
      mockClaimSearch(() => [mockClaim, { ...relatedClaim, diagnosis: undefined }]);

      await setup();
      await clickSubmitClaim(userEvent.setup(), 1);

      await waitFor(() =>
        expect(vi.mocked(showNotification)).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Missing Diagnosis' })
        )
      );
    });

    test("won't submit a claim that has already gone out", async () => {
      mockSearchResources({ Coverage: [mockCoverage] });
      mockClaimSearch(() => [{ ...mockClaim, status: 'active' }]);

      await setup();
      await openClaimMenu(userEvent.setup());

      expect(await screen.findByRole('menuitem', { name: 'Submit Claim' })).toBeDisabled();
      expect(screen.getByText('This claim has already been submitted')).toBeInTheDocument();
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
      expect(screen.getByText(/Headache/)).toBeInTheDocument();
    });

    await openClaimMenu(user);

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
