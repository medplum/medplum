// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type {
  Bot,
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  PractitionerRole,
} from '@medplum/fhirtypes';
import { DrAliceSmith, ExampleBot, HomerSimpson, MockClient, TestOrganization } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
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
  practitioner: { reference: `Practitioner/${DrAliceSmith.id}` },
  organization: { reference: `Organization/${TestOrganization.id}` },
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

// useSearchOne calls medplum.searchOne; direct medplum.searchResources calls cover
// Coverage, CoverageEligibilityRequest, and CoverageEligibilityResponse.
function mockSearchOne(
  medplum: MockClient,
  opts: { bot?: Bot | undefined; practitionerRole?: PractitionerRole | undefined } = {}
): void {
  vi.spyOn(medplum, 'searchOne').mockImplementation((async (resourceType: string) => {
    if (resourceType === 'Bot') {
      return opts.bot ?? undefined;
    }
    if (resourceType === 'PractitionerRole') {
      return opts.practitionerRole ?? undefined;
    }
    return undefined;
  }) as any);
}

function mockSearchResources(
  medplum: MockClient,
  opts: {
    coverages?: Coverage[];
    eligibilityRequests?: CoverageEligibilityRequest[];
    eligibilityResponses?: CoverageEligibilityResponse[];
  } = {}
): void {
  vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
    if (resourceType === 'Coverage') {
      return opts.coverages ?? [];
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

  const setup = async (props: Partial<Parameters<typeof EncounterCoverageEligibilityModal>[0]> = {}): Promise<void> => {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <EncounterCoverageEligibilityModal patient={HomerSimpson} opened={true} onClose={vi.fn()} {...props} />
          </MantineProvider>
        </MedplumProvider>
      );
    });
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

    test('shows Check Eligibility button when eligibility bot is found', async () => {
      mockSearchOne(medplum, { bot: ExampleBot });
      await setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeInTheDocument();
      });
    });

    test('shows Contact Support button when no eligibility bot', async () => {
      mockSearchOne(medplum, { bot: undefined });
      await setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Contact Support' })).toBeInTheDocument();
      });
    });

    test('shows last checked date when a prior eligibility request exists', async () => {
      mockSearchResources(medplum, {
        coverages: [mockCoverage],
        eligibilityRequests: [mockEligibilityRequest],
        eligibilityResponses: [mockEligibilityResponse],
      });
      mockSearchOne(medplum, { bot: ExampleBot });
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
      mockSearchOne(medplum, { bot: ExampleBot, practitionerRole: mockPractitionerRole });
      vi.spyOn(medplum, 'createResource').mockResolvedValue(mockEligibilityRequest);
      vi.spyOn(medplum, 'executeBot').mockResolvedValue({} as any);
    });

    test('calls createResource and executeBot when Check Eligibility is clicked', async () => {
      const user = userEvent.setup();
      await setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({ resourceType: 'CoverageEligibilityRequest' })
        );
        expect(medplum.executeBot).toHaveBeenCalledWith(ExampleBot.id, mockEligibilityRequest, 'application/fhir+json');
      });
    });
  });

  describe('benefits section', () => {
    test('shows contact support prompt when benefits expanded and no bot', async () => {
      mockSearchResources(medplum, { coverages: [mockCoverage] });
      mockSearchOne(medplum, { bot: undefined });
      const user = userEvent.setup();
      await setup();
      await waitFor(() => {
        expect(screen.getByText('Plan Benefits')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Plan Benefits'));
      await waitFor(() => {
        expect(
          screen.getByText('No eligibility check found. Contact support to enable eligibility checks.')
        ).toBeInTheDocument();
      });
    });

    test('shows prompt to check eligibility when bot exists but no prior response', async () => {
      mockSearchResources(medplum, { coverages: [mockCoverage] });
      mockSearchOne(medplum, { bot: ExampleBot, practitionerRole: mockPractitionerRole });
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
