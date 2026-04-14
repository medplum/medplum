// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { ResourceArray, WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type {
  Bot,
  Bundle,
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  PractitionerRole,
  Resource,
} from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient, TestOrganization } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { RenderResult } from '../../test-utils/render';
import { act, render, screen, userEvent, waitFor } from '../../test-utils/render';
import { CoverageRequestInbox } from './CoverageRequestInbox';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COVERAGE_ID = 'coverage-uhc';
const COVERAGE_ID_2 = 'coverage-bcbs';
const REQUEST_ID = 'req-1';

const mockUHCCoverage: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: COVERAGE_ID,
  status: 'active',
  beneficiary: createReference(HomerSimpson),
  payor: [createReference(TestOrganization)],
  class: [{ type: { coding: [{ code: 'plan' }] }, name: 'Gold Plan', value: 'GOLD' }],
  subscriberId: 'UHC-SUB-001',
  period: { start: '2026-01-01', end: '2026-12-31' },
};

const mockBCBSCoverage: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: COVERAGE_ID_2,
  status: 'cancelled',
  beneficiary: createReference(HomerSimpson),
  payor: [{ display: 'Blue Cross Blue Shield' }],
};

const mockPractitionerRole: WithId<PractitionerRole> = {
  resourceType: 'PractitionerRole',
  id: 'role-alice',
  practitioner: createReference(DrAliceSmith),
  organization: createReference(TestOrganization),
};

const mockBot: WithId<Bot> = {
  resourceType: 'Bot',
  id: 'eligibility-bot',
  name: 'Eligibility Bot',
};

const mockRequest: WithId<CoverageEligibilityRequest> = {
  resourceType: 'CoverageEligibilityRequest',
  id: REQUEST_ID,
  status: 'active',
  purpose: ['benefits'],
  created: '2026-01-15T10:00:00Z',
  patient: createReference(HomerSimpson),
  insurer: createReference(TestOrganization),
  insurance: [{ focal: true, coverage: { reference: `Coverage/${COVERAGE_ID}` } }],
};

const mockResponse: WithId<CoverageEligibilityResponse> = {
  resourceType: 'CoverageEligibilityResponse',
  id: 'resp-1',
  status: 'active',
  purpose: ['benefits'],
  patient: createReference(HomerSimpson),
  created: '2026-01-15T10:05:00Z',
  insurer: createReference(TestOrganization),
  outcome: 'complete',
  request: createReference(mockRequest),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequestBundle(
  requests: WithId<CoverageEligibilityRequest>[],
  total?: number
): Bundle<WithId<CoverageEligibilityRequest>> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: total ?? requests.length,
    entry: requests.map((resource) => ({ resource })),
  };
}

function makeResourceArray<T extends Resource>(resources: WithId<T>[]): ResourceArray<WithId<T>> {
  const bundle: Bundle<WithId<T>> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: resources.map((resource) => ({ resource })),
  };
  return Object.assign([...resources], { bundle }) as ResourceArray<WithId<T>>;
}

// ── Test setup ────────────────────────────────────────────────────────────────

const defaultProps = {
  query: `_sort=-_lastUpdated&_count=20`,
  patientId: HomerSimpson.id ?? '',
  onChange: vi.fn(),
  getRequestHref: (c: Coverage, r: CoverageEligibilityRequest) =>
    `/Patient/${HomerSimpson.id}/Coverage/${c.id}/CoverageEligibilityRequest/${r.id}`,
};

async function setup(
  medplum: MockClient,
  overrides: Partial<typeof defaultProps> & { coverageId?: string; requestId?: string } = {}
): Promise<RenderResult> {
  let result!: RenderResult;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <Notifications />
          <CoverageRequestInbox {...defaultProps} {...overrides} />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CoverageRequestInbox', () => {
  let medplum: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    medplum = new MockClient();
    // medplum.search is used for CoverageEligibilityRequest (returns Bundle with total for pagination)
    medplum.search = vi.fn().mockResolvedValue(makeRequestBundle([]));
    // medplum.searchResources is used for CoverageEligibilityResponse
    medplum.searchResources = vi.fn().mockResolvedValue(makeResourceArray([]));
    medplum.readResource = vi.fn().mockResolvedValue(mockUHCCoverage) as typeof medplum.readResource;
    medplum.searchOne = vi.fn().mockResolvedValue(undefined) as typeof medplum.searchOne;
  });

  // ── No coverage selected ────────────────────────────────────────────────────

  describe('no coverage selected', () => {
    test('shows select-coverage prompt when no coverageId is provided', async () => {
      await setup(medplum);
      expect(screen.getByText('Select a coverage to view details.')).toBeInTheDocument();
    });
  });

  // ── Coverage detail panel ───────────────────────────────────────────────────

  describe('coverage detail', () => {
    test('shows coverage summary with subscriber ID when a coverage is selected', async () => {
      await setup(medplum, { coverageId: COVERAGE_ID });
      expect(screen.getByText(/UHC-SUB-001/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Check Eligibility' })).toBeInTheDocument();
    });

    test('shows status badge in coverage summary', async () => {
      await setup(medplum, { coverageId: COVERAGE_ID });
      const activeBadges = screen.getAllByText('active');
      expect(activeBadges.length).toBeGreaterThanOrEqual(1);
    });

    test('shows loading skeleton while coverage is loading', async () => {
      medplum.readResource = vi.fn().mockImplementation(() => new Promise(() => {})) as typeof medplum.readResource;
      const { container } = await setup(medplum, { coverageId: COVERAGE_ID });
      expect(container.querySelectorAll('.mantine-Skeleton-root').length).toBeGreaterThan(0);
    });

    test('shows empty eligibility message when no requests exist for this coverage', async () => {
      await setup(medplum, { coverageId: COVERAGE_ID });
      expect(screen.getByText('No eligibility checks found for this coverage.')).toBeInTheDocument();
    });

    test('renders eligibility request items matching this coverage', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeRequestBundle([mockRequest]));
      await setup(medplum, { coverageId: COVERAGE_ID });
      expect(screen.getByText('Benefits')).toBeInTheDocument();
    });

    test('passes _sort and _count from query through to the search request', async () => {
      await setup(medplum, {
        query: '_sort=-_lastUpdated&_count=10',
        coverageId: COVERAGE_ID,
      });
      expect(medplum.search).toHaveBeenCalledWith(
        'CoverageEligibilityRequest',
        expect.stringContaining('_count=10'),
        expect.anything()
      );
      expect(medplum.search).toHaveBeenCalledWith(
        'CoverageEligibilityRequest',
        expect.stringContaining('_sort=-_lastUpdated'),
        expect.anything()
      );
    });

    test('does not show pagination when total fits on one page', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeRequestBundle([mockRequest], 1));
      await setup(medplum, { coverageId: COVERAGE_ID });
      expect(document.querySelector('.mantine-Pagination-root')).not.toBeInTheDocument();
    });

    test('shows pagination when total exceeds page size', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeRequestBundle([mockRequest], 50));
      await setup(medplum, { coverageId: COVERAGE_ID });
      expect(document.querySelector('.mantine-Pagination-root')).toBeInTheDocument();
    });

    test('calls onChange with updated offset when a page is clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      medplum.search = vi.fn().mockResolvedValue(makeRequestBundle([mockRequest], 50));
      await setup(medplum, { coverageId: COVERAGE_ID, onChange });
      await user.click(screen.getByRole('button', { name: '2' }));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }));
    });

    test('shows select-request prompt when a coverage is selected but no request is chosen', async () => {
      await setup(medplum, { coverageId: COVERAGE_ID });
      expect(screen.getByText('Select an eligibility check to view details.')).toBeInTheDocument();
    });

    test('shows eligibility response details when a request is selected', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeRequestBundle([mockRequest]));
      medplum.searchResources = vi.fn().mockResolvedValue(makeResourceArray([mockResponse]));
      await setup(medplum, { coverageId: COVERAGE_ID, requestId: REQUEST_ID });
      expect(screen.getByText('Eligibility Request')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText('Complete')).toBeInTheDocument());
    });

    test('resets detail state when a different coverage is selected', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeRequestBundle([mockRequest]));
      const { rerender } = await setup(medplum, { coverageId: COVERAGE_ID, requestId: REQUEST_ID });
      expect(screen.getByText('Eligibility Request')).toBeInTheDocument();

      medplum.readResource = vi.fn().mockResolvedValue(mockBCBSCoverage) as typeof medplum.readResource;
      medplum.search = vi.fn().mockResolvedValue(makeRequestBundle([]));
      await act(async () => {
        rerender(
          <MemoryRouter>
            <MedplumProvider medplum={medplum}>
              <Notifications />
              <CoverageRequestInbox {...defaultProps} coverageId={COVERAGE_ID_2} />
            </MedplumProvider>
          </MemoryRouter>
        );
      });

      await waitFor(() =>
        expect(screen.getByText('No eligibility checks found for this coverage.')).toBeInTheDocument()
      );
      expect(screen.queryByText('Eligibility Request')).not.toBeInTheDocument();
    });
  });

  // ── Check Eligibility button ────────────────────────────────────────────────

  describe('Check Eligibility button', () => {
    test('shows error notification when the eligibility bot is not configured', async () => {
      medplum.searchOne = vi.fn().mockResolvedValue(undefined) as typeof medplum.searchOne;
      await setup(medplum, { coverageId: COVERAGE_ID });

      screen.getByRole('button', { name: 'Check Eligibility' }).click();

      await waitFor(() =>
        expect(screen.getByText(/To enable Insurance Eligibility please contact support/)).toBeInTheDocument()
      );
    });

    test('shows error notification when no PractitionerRole is found for the current user', async () => {
      medplum.searchOne = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Bot') {
          return Promise.resolve(mockBot);
        }
        return Promise.resolve(undefined);
      }) as typeof medplum.searchOne;
      await setup(medplum, { coverageId: COVERAGE_ID });

      screen.getByRole('button', { name: 'Check Eligibility' }).click();

      await waitFor(() =>
        expect(screen.getByText(/No PractitionerRole found for the assigned practitioner/)).toBeInTheDocument()
      );
    });

    test('creates eligibility request and refreshes the list on success', async () => {
      const user = userEvent.setup();
      const savedRequest: WithId<CoverageEligibilityRequest> = { ...mockRequest, id: 'req-new' };

      medplum.searchOne = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Bot') {
          return Promise.resolve(mockBot);
        }
        if (resourceType === 'PractitionerRole') {
          return Promise.resolve(mockPractitionerRole);
        }
        return Promise.resolve(undefined);
      }) as typeof medplum.searchOne;
      medplum.createResource = vi.fn().mockResolvedValue(savedRequest) as typeof medplum.createResource;
      medplum.executeBot = vi.fn().mockResolvedValue({}) as typeof medplum.executeBot;
      medplum.search = vi
        .fn()
        .mockResolvedValueOnce(makeRequestBundle([]))
        .mockResolvedValueOnce(makeRequestBundle([savedRequest]));

      await setup(medplum, { coverageId: COVERAGE_ID });
      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'CoverageEligibilityRequest',
            purpose: ['benefits'],
          })
        );
      });

      await waitFor(() => {
        expect(medplum.executeBot).toHaveBeenCalledWith(
          mockBot.id,
          expect.objectContaining({ resourceType: 'CoverageEligibilityRequest' }),
          'application/fhir+json'
        );
      });
    });

    test('still refreshes requests when the bot execution fails with a parseable error', async () => {
      const user = userEvent.setup();
      const savedRequest: WithId<CoverageEligibilityRequest> = { ...mockRequest, id: 'req-bot-err' };

      medplum.searchOne = vi.fn().mockImplementation((resourceType: string) => {
        if (resourceType === 'Bot') {
          return Promise.resolve(mockBot);
        }
        if (resourceType === 'PractitionerRole') {
          return Promise.resolve(mockPractitionerRole);
        }
        return Promise.resolve(undefined);
      }) as typeof medplum.searchOne;
      medplum.createResource = vi.fn().mockResolvedValue(savedRequest) as typeof medplum.createResource;
      medplum.executeBot = vi
        .fn()
        .mockRejectedValue(
          new Error(JSON.stringify({ errorMessage: 'Payer unavailable' }))
        ) as typeof medplum.executeBot;
      medplum.search = vi.fn().mockResolvedValue(makeRequestBundle([savedRequest]));

      await setup(medplum, { coverageId: COVERAGE_ID });
      await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

      await waitFor(() => expect(screen.getByText(/Payer unavailable/)).toBeInTheDocument(), { timeout: 3000 });
      expect(medplum.search).toHaveBeenCalled();
    });
  });
});
