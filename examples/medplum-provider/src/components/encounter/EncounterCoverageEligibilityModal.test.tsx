// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type {
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  Organization,
  PractitionerRole,
  Reference,
} from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient, TestOrganization } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BILLING_ORGANIZATION_IDENTIFIER_VALUE, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM } from '../../utils/billing';
import { EncounterCoverageEligibilityModal } from './EncounterCoverageEligibilityModal';

const mockCoverage: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: 'coverage-123',
  status: 'active',
  order: 1,
  payor: [{ display: 'Aetna' }],
  beneficiary: { reference: `Patient/${HomerSimpson.id}` },
  subscriber: { display: 'Homer Simpson' },
  relationship: { coding: [{ display: 'Self' }] },
  subscriberId: 'SUB-001',
  period: { start: '2024-01-01', end: '2024-12-31' },
  class: [
    { type: { coding: [{ code: 'plan' }] }, name: 'Gold Plan', value: 'GROUP-001' },
    { type: { coding: [{ code: 'group' }] }, value: 'GRP-999' },
  ],
  type: { text: 'Medical' },
};

const mockPractitionerRole: WithId<PractitionerRole> = {
  resourceType: 'PractitionerRole',
  id: 'role-123',
  active: true,
  practitioner: { reference: `Practitioner/${DrAliceSmith.id}` },
  organization: { reference: `Organization/${TestOrganization.id}` },
};

const mockBillingOrganization: WithId<Organization> = {
  resourceType: 'Organization',
  id: 'billing-org-123',
  name: 'Springfield Billing Group',
  identifier: [{ system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE }],
};

const mockEligibilityRequest: WithId<CoverageEligibilityRequest> = {
  resourceType: 'CoverageEligibilityRequest',
  id: 'req-123',
  status: 'active',
  purpose: ['benefits'],
  created: '2024-03-01T10:00:00Z',
  patient: { reference: `Patient/${HomerSimpson.id}` },
  insurer: { reference: `Organization/${TestOrganization.id}`, display: 'Aetna' },
  insurance: [{ focal: true, coverage: { reference: `Coverage/${mockCoverage.id}` } }],
};

const mockEligibilityResponse: WithId<CoverageEligibilityResponse> = {
  resourceType: 'CoverageEligibilityResponse',
  id: 'resp-123',
  status: 'active',
  purpose: ['benefits'],
  outcome: 'complete',
  created: '2024-03-01T10:05:00Z',
  patient: { reference: `Patient/${HomerSimpson.id}` },
  insurer: { reference: `Organization/${TestOrganization.id}` },
  request: { reference: `CoverageEligibilityRequest/${mockEligibilityRequest.id}` },
};

/**
 * Stubs medplum.searchOne, which backs useSearchOne for the PractitionerRole lookup. Coverage, CoverageEligibilityRequest, CoverageEligibilityResponse and the billing organization
 * autocomplete go through medplum.searchResources instead, stubbed by mockSearchResources.
 * @param medplum - The mock client to stub.
 * @param opts - What the stub returns.
 * @param opts.practitionerRole - The signed-in practitioner's active role at a billing organization, if any.
 */
function mockSearchOne(medplum: MockClient, opts: { practitionerRole?: PractitionerRole | undefined } = {}): void {
  vi.spyOn(medplum, 'searchOne').mockImplementation((async (resourceType: string) => {
    if (resourceType === 'PractitionerRole') {
      return opts.practitionerRole ?? undefined;
    }
    return undefined;
  }) as any);
}

/**
 * Removes the preselected organization pill from the billing organization picker.
 * @param user - The user-event instance driving the test.
 */
async function clearPickedOrganization(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(within(screen.getByTestId('selected-items')).getByRole('button', { hidden: true }));
}

function mockSearchResources(
  medplum: MockClient,
  opts: {
    coverages?: Coverage[];
    eligibilityRequests?: CoverageEligibilityRequest[];
    eligibilityResponses?: CoverageEligibilityResponse[];
    organizations?: Organization[];
  } = {}
): void {
  vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
    if (resourceType === 'Coverage') {
      return opts.coverages ?? [];
    }
    if (resourceType === 'Organization') {
      return opts.organizations ?? [];
    }
    if (resourceType === 'CoverageEligibilityRequest') {
      return opts.eligibilityRequests ?? [];
    }
    if (resourceType === 'CoverageEligibilityResponse') {
      return opts.eligibilityResponses ?? [];
    }
    return [];
  }) as any);
}

describe('EncounterCoverageEligibilityModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  type ModalProps = Parameters<typeof EncounterCoverageEligibilityModal>[0];

  const renderModal = (props: Partial<ModalProps>): JSX.Element => (
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <EncounterCoverageEligibilityModal patient={HomerSimpson} opened={true} onClose={vi.fn()} {...props} />
      </MantineProvider>
    </MedplumProvider>
  );

  const setup = async (props: Partial<ModalProps> = {}): Promise<(next: Partial<ModalProps>) => Promise<void>> => {
    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      rerender = render(renderModal(props)).rerender;
    });
    return async (next) => {
      await act(async () => {
        rerender(renderModal({ ...props, ...next }));
      });
    };
  };

  describe('modal visibility', () => {
    test('renders modal when opened is true', async () => {
      mockSearchResources(medplum);
      mockSearchOne(medplum);
      await setup();
      expect(screen.getByText('Insurance')).toBeInTheDocument();
    });

    test('calls onClose when close button is clicked', async () => {
      mockSearchResources(medplum);
      mockSearchOne(medplum);
      const onClose = vi.fn();
      await setup({ onClose });
      const closeButton = document.querySelector('button.mantine-Modal-close') as HTMLElement;
      expect(closeButton).toBeTruthy();
      await userEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    test('shows skeleton while loading coverages', async () => {
      let resolve!: (value: Coverage[]) => void;
      vi.spyOn(medplum, 'searchResources').mockReturnValue(
        new Promise((res) => {
          resolve = res;
        }) as any
      );
      mockSearchOne(medplum);
      await setup();
      expect(document.querySelectorAll('.mantine-Skeleton-root').length).toBeGreaterThan(0);
      await act(async () => {
        resolve([]);
      });
    });
  });

  describe('no coverages', () => {
    test('shows no coverage message when patient has no active coverage', async () => {
      mockSearchResources(medplum, { coverages: [] });
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText('No active coverage found for this patient.')).toBeInTheDocument();
      });
    });
  });

  describe('single coverage', () => {
    beforeEach(() => {
      mockSearchResources(medplum, { coverages: [mockCoverage] });
    });

    test('shows payer name', async () => {
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText('Aetna')).toBeInTheDocument();
      });
    });

    test('shows subscriber info', async () => {
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText(/Homer Simpson/)).toBeInTheDocument();
      });
    });

    test('shows subscriber ID', async () => {
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText('SUB-001')).toBeInTheDocument();
        expect(screen.getByText('GRP-999')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Plan Benefits')).toBeInTheDocument();
      });
    });

    test('does not show a Select dropdown for a single coverage', async () => {
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText('Aetna')).toBeInTheDocument();
      });
      expect(document.querySelector('.mantine-Select-root')).not.toBeInTheDocument();
    });

    test('shows Check Eligibility button', async () => {
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeInTheDocument();
      });
    });

    test('shows last checked date when a prior eligibility request exists', async () => {
      mockSearchResources(medplum, {
        coverages: [mockCoverage],
        eligibilityRequests: [mockEligibilityRequest],
        eligibilityResponses: [mockEligibilityResponse],
      });
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText(/Last checked/)).toBeInTheDocument();
      });
    });
  });

  describe('multiple coverages', () => {
    const secondaryCoverage: WithId<Coverage> = {
      ...mockCoverage,
      id: 'coverage-456',
      order: 2,
      payor: [{ display: 'BlueCross' }],
    };

    beforeEach(() => {
      mockSearchOne(medplum);
    });

    test('shows Select dropdown when multiple coverages exist', async () => {
      mockSearchResources(medplum, { coverages: [mockCoverage, secondaryCoverage] });
      await setup();
      await waitFor(() => {
        expect(document.querySelector('.mantine-Select-root')).toBeInTheDocument();
      });
    });

    test('defaults to first (primary) coverage', async () => {
      mockSearchResources(medplum, { coverages: [mockCoverage, secondaryCoverage] });
      await setup();
      await waitFor(() => {
        expect(screen.getByText('Aetna')).toBeInTheDocument();
      });
    });
  });

  describe('check eligibility', () => {
    beforeEach(() => {
      mockSearchResources(medplum, { coverages: [mockCoverage] });
      mockSearchOne(medplum, { practitionerRole: mockPractitionerRole });
      vi.spyOn(medplum, 'createResource').mockResolvedValue(mockEligibilityRequest);
      vi.spyOn(medplum, 'post').mockResolvedValue(mockEligibilityResponse);
    });

    test('looks up only the active PractitionerRole at a billing organization', async () => {
      await setup();

      await waitFor(() => {
        expect(medplum.searchOne).toHaveBeenCalledWith('PractitionerRole', {
          practitioner: `Practitioner/${DrAliceSmith.id}`,
          active: 'true',
          'organization.identifier': `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
        });
      });
    });

    test('creates the request under the role organization and posts $submit', async () => {
      const user = userEvent.setup();
      await setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));
      expect(await screen.findByText(`The check runs under ${TestOrganization.name}.`)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Run as Organization', hidden: true }));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'CoverageEligibilityRequest',
            provider: expect.objectContaining({ reference: `Organization/${TestOrganization.id}` }),
          })
        );
        expect(medplum.post).toHaveBeenCalledWith(
          medplum.fhirUrl('CoverageEligibilityRequest', mockEligibilityRequest.id, '$submit')
        );
        expect(screen.queryByText('Billing organization')).not.toBeInTheDocument();
      });
    });

    test('opens the picker empty and runs as the practitioner when there is no PractitionerRole', async () => {
      mockSearchOne(medplum);
      const user = userEvent.setup();
      await setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));
      expect(await screen.findByText('Leave empty to run the check as Alice Smith.')).toBeInTheDocument();
      expect(medplum.createResource).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Run as Practitioner', hidden: true }));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({ provider: createReference(DrAliceSmith) })
        );
      });
    });
  });

  describe('billing organization picker', () => {
    beforeEach(() => {
      mockSearchResources(medplum, { coverages: [mockCoverage], organizations: [mockBillingOrganization] });
      vi.spyOn(medplum, 'createResource').mockResolvedValue(mockEligibilityRequest);
      vi.spyOn(medplum, 'post').mockResolvedValue(mockEligibilityResponse);
    });

    test('runs as the practitioner after the default organization is removed', async () => {
      const user = userEvent.setup();
      mockSearchOne(medplum, { practitionerRole: mockPractitionerRole });
      await setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));
      expect(await screen.findByText(`The check runs under ${TestOrganization.name}.`)).toBeInTheDocument();
      await clearPickedOrganization(user);
      expect(await screen.findByText('Leave empty to run the check as Alice Smith.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Run as Practitioner', hidden: true }));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({ provider: createReference(DrAliceSmith) })
        );
      });
    });

    test('keeps the button disabled until the default organization has loaded', async () => {
      const user = userEvent.setup();
      mockSearchOne(medplum, { practitionerRole: mockPractitionerRole });
      let resolveOrganization: (organization: Organization) => void = () => undefined;
      const originalRead = medplum.readReference.bind(medplum);
      vi.spyOn(medplum, 'readReference').mockImplementation(((reference: Reference) =>
        reference.reference === `Organization/${TestOrganization.id}`
          ? new Promise((resolve) => {
              resolveOrganization = resolve;
            })
          : originalRead(reference)) as any);
      await setup();

      await waitFor(() => {
        expect(medplum.readReference).toHaveBeenCalledWith({ reference: `Organization/${TestOrganization.id}` });
      });
      expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeDisabled();

      await act(async () => resolveOrganization(TestOrganization as Organization));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeEnabled();
      });
      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));
      expect(await screen.findByText(`The check runs under ${TestOrganization.name}.`)).toBeInTheDocument();
    });

    test('opens the picker empty when the default organization fails to load', async () => {
      const user = userEvent.setup();
      mockSearchOne(medplum, { practitionerRole: mockPractitionerRole });
      const originalRead = medplum.readReference.bind(medplum);
      vi.spyOn(medplum, 'readReference').mockImplementation(((reference: Reference) =>
        reference.reference === `Organization/${TestOrganization.id}`
          ? Promise.reject(new Error('Not found'))
          : originalRead(reference)) as any);
      await setup();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeEnabled();
      });
      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));
      expect(await screen.findByText('Leave empty to run the check as Alice Smith.')).toBeInTheDocument();
    });

    test('uses the picked billing organization as provider', async () => {
      const user = userEvent.setup();
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));
      await user.type(await screen.findByRole('searchbox'), 'Springfield');
      await user.click(await screen.findByText('Springfield Billing Group'));
      expect(screen.getByText('The check runs under Springfield Billing Group.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Run as Organization', hidden: true }));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({ provider: createReference(mockBillingOrganization) })
        );
      });
    });

    test('restores the default organization after a pick was abandoned', async () => {
      const user = userEvent.setup();
      mockSearchOne(medplum, { practitionerRole: mockPractitionerRole });
      await setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));
      expect(await screen.findByText(`The check runs under ${TestOrganization.name}.`)).toBeInTheDocument();
      await clearPickedOrganization(user);
      await user.type(await screen.findByRole('searchbox', { hidden: true }), 'Springfield');
      await user.click(await screen.findByText('Springfield Billing Group'));
      expect(screen.getByText('The check runs under Springfield Billing Group.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel', hidden: true }));
      await waitFor(() => {
        expect(screen.queryByText('Billing organization')).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));
      expect(await screen.findByText(`The check runs under ${TestOrganization.name}.`)).toBeInTheDocument();
      expect(screen.queryByText('Springfield Billing Group')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Run as Organization', hidden: true }));
      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: expect.objectContaining({ reference: `Organization/${TestOrganization.id}` }),
          })
        );
      });
    });
  });

  describe('benefits section', () => {
    test('shows prompt to check eligibility when no prior response', async () => {
      mockSearchResources(medplum, { coverages: [mockCoverage] });
      mockSearchOne(medplum);
      const user = userEvent.setup();
      await setup();
      await waitFor(() => {
        expect(screen.getByText('Plan Benefits')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Plan Benefits'));
      await waitFor(() => {
        expect(
          screen.getByText('No eligibility check found. Click "Check Eligibility" to run a check.')
        ).toBeInTheDocument();
      });
    });
  });

  describe('coverage type display', () => {
    test('shows "Primary" for order 1', async () => {
      mockSearchResources(medplum, { coverages: [{ ...mockCoverage, order: 1 }] });
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText('Primary')).toBeInTheDocument();
      });
    });

    test('shows "Secondary" for order 2', async () => {
      mockSearchResources(medplum, { coverages: [{ ...mockCoverage, id: 'coverage-sec', order: 2 }] });
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText('Secondary')).toBeInTheDocument();
      });
    });
  });

  describe('self-pay filtering', () => {
    const selfPayCoverage: WithId<Coverage> = {
      resourceType: 'Coverage',
      id: 'coverage-selfpay',
      status: 'active',
      payor: [{ display: 'Self' }],
      beneficiary: { reference: `Patient/${HomerSimpson.id}` },
      type: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'SELFPAY', display: 'Self Pay' }],
        text: 'Self Pay',
      },
    };

    test('filters out self-pay coverages', async () => {
      mockSearchResources(medplum, { coverages: [selfPayCoverage, mockCoverage] });
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText('Aetna')).toBeInTheDocument();
      });
      expect(screen.queryByText('Self')).not.toBeInTheDocument();
      expect(document.querySelector('.mantine-Select-root')).not.toBeInTheDocument();
    });

    test('shows no coverage message when only self-pay coverage exists', async () => {
      mockSearchResources(medplum, { coverages: [selfPayCoverage] });
      mockSearchOne(medplum);
      await setup();
      await waitFor(() => {
        expect(screen.getByText('No active coverage found for this patient.')).toBeInTheDocument();
      });
    });
  });

  describe('patient as reference', () => {
    test('accepts patient as a Reference and resolves coverage', async () => {
      mockSearchResources(medplum, { coverages: [mockCoverage] });
      mockSearchOne(medplum);
      vi.spyOn(medplum, 'readReference').mockResolvedValue(HomerSimpson as any);
      await setup({ patient: { reference: `Patient/${HomerSimpson.id}` } });
      await waitFor(() => {
        expect(screen.getByText('Aetna')).toBeInTheDocument();
      });
    });
  });
});
