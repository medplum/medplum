// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Bundle, Claim, ClaimResponse, Coverage } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient, TestOrganization } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { RenderResult } from '../../test-utils/render';
import { act, render, screen, userEvent, waitFor } from '../../test-utils/render';
import { ClaimBoard } from './ClaimBoard';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLAIM_ID = 'claim-1';
const COVERAGE_ID = 'coverage-1';

const mockCoverage: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: COVERAGE_ID,
  status: 'active',
  beneficiary: createReference(HomerSimpson),
  payor: [{ display: 'Aetna' }],
};

const baseClaim: WithId<Claim> = {
  resourceType: 'Claim',
  id: CLAIM_ID,
  status: 'draft',
  type: { coding: [{ code: 'professional' }] },
  use: 'claim',
  created: '2026-05-21T10:00:00Z',
  patient: createReference(HomerSimpson),
  provider: createReference(DrAliceSmith),
  priority: { coding: [{ code: 'normal' }] },
  insurance: [{ sequence: 1, focal: true, coverage: { reference: `Coverage/${COVERAGE_ID}` } }],
  total: { value: 400, currency: 'USD' },
};

const mockClaimResponse: WithId<ClaimResponse> = {
  resourceType: 'ClaimResponse',
  id: 'claim-response-1',
  status: 'active',
  type: { coding: [{ code: 'professional' }] },
  use: 'claim',
  patient: createReference(HomerSimpson),
  created: '2026-05-22T10:00:00Z',
  insurer: createReference(TestOrganization),
  outcome: 'complete',
  disposition: 'Claim settled in full',
  request: { reference: `Claim/${CLAIM_ID}` },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClaimBundle(claims: WithId<Claim>[], total?: number): Bundle<WithId<Claim>> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: total ?? claims.length,
    entry: claims.map((resource) => ({ resource })),
  };
}

const defaultProps = {
  patientId: HomerSimpson.id ?? '',
  claimId: undefined as string | undefined,
  query: '_count=20&_sort=-_lastUpdated',
  getClaimUri: (claim: Claim) => `/Patient/${HomerSimpson.id}/Claim/${claim.id}`,
  onChange: vi.fn(),
};

async function setup(medplum: MockClient, overrides: Partial<typeof defaultProps> = {}): Promise<RenderResult> {
  let result!: RenderResult;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <Notifications />
          <ClaimBoard {...defaultProps} {...overrides} />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClaimBoard', () => {
  let medplum: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    medplum = new MockClient();
    medplum.search = vi.fn().mockResolvedValue(makeClaimBundle([]));
    medplum.searchResources = vi.fn().mockResolvedValue([]);
  });

  describe('list', () => {
    test('shows the empty state when the patient has no claims', async () => {
      await setup(medplum);
      await waitFor(() => expect(screen.getByText('No claims for this patient.')).toBeInTheDocument());
    });

    test('renders a claim row with patient name, total, and status', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeClaimBundle([baseClaim]));
      await setup(medplum);
      await waitFor(() => expect(screen.getByText('Homer Simpson')).toBeInTheDocument());
      expect(screen.getByText(/\$400\.00/)).toBeInTheDocument();
      // StatusBadge renders the raw (lowercased) status text.
      expect(screen.getByText('draft')).toBeInTheDocument();
    });

    test('resolves and renders the payer organization from the coverage', async () => {
      await medplum.createResource(mockCoverage);
      medplum.search = vi.fn().mockResolvedValue(makeClaimBundle([baseClaim]));
      await setup(medplum);
      await waitFor(() => expect(screen.getByText('Aetna')).toBeInTheDocument());
    });

    test('passes the patient filter and sort/count through to the search', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeClaimBundle([baseClaim]));
      await setup(medplum);
      await waitFor(() => expect(medplum.search).toHaveBeenCalled());
      expect(medplum.search).toHaveBeenCalledWith(
        'Claim',
        expect.stringContaining(`patient=${HomerSimpson.id}`),
        expect.anything()
      );
      expect(medplum.search).toHaveBeenCalledWith('Claim', expect.stringContaining('_count=20'), expect.anything());
    });
  });

  describe('pagination', () => {
    test('does not show pagination when results fit on one page', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeClaimBundle([baseClaim], 1));
      await setup(medplum);
      await waitFor(() => expect(screen.getByText('Homer Simpson')).toBeInTheDocument());
      expect(document.querySelector('.mantine-Pagination-root')).not.toBeInTheDocument();
    });

    test('shows pagination and calls onChange with the new offset', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      medplum.search = vi.fn().mockResolvedValue(makeClaimBundle([baseClaim], 50));
      await setup(medplum, { onChange });
      await waitFor(() => expect(document.querySelector('.mantine-Pagination-root')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: '2' }));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }));
    });
  });

  describe('detail', () => {
    test('shows the select-a-claim prompt when nothing is selected', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeClaimBundle([]));
      await setup(medplum);
      await waitFor(() => expect(screen.getByText('No claim selected')).toBeInTheDocument());
    });

    test('shows the claim detail with a no-response message when a claim is selected', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeClaimBundle([baseClaim]));
      await setup(medplum, { claimId: CLAIM_ID });
      await waitFor(() => expect(screen.getByText('Claim Response')).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText(/No claim response has been received/)).toBeInTheDocument());
    });

    test('shows the claim response outcome and disposition when a response exists', async () => {
      medplum.search = vi.fn().mockResolvedValue(makeClaimBundle([baseClaim]));
      medplum.searchResources = vi.fn().mockResolvedValue([mockClaimResponse]);
      await setup(medplum, { claimId: CLAIM_ID });
      // Disposition and outcome each render twice: once in the panel summary and again
      // in the ResourceTable below it.
      await waitFor(() => expect(screen.getAllByText('Claim settled in full').length).toBeGreaterThan(0));
      expect(screen.queryByText(/No claim response has been received/)).not.toBeInTheDocument();
      expect(screen.getAllByText('complete').length).toBeGreaterThan(0);
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'ClaimResponse',
        expect.objectContaining({ request: `Claim/${CLAIM_ID}` }),
        expect.anything()
      );
    });
  });
});
