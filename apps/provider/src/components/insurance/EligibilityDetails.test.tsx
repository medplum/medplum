// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CoverageEligibilityRequest, CoverageEligibilityResponse } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { render, screen } from '../../test-utils/render';
import { EligibilityDetails } from './EligibilityDetails';

const baseRequest: CoverageEligibilityRequest = {
  resourceType: 'CoverageEligibilityRequest',
  id: 'req-1',
  status: 'active',
  purpose: ['benefits'],
  created: '2026-01-15T10:00:00Z',
  patient: { reference: 'Patient/123' },
  insurer: { reference: 'Organization/456', display: 'Aetna' },
};

const baseResponse: CoverageEligibilityResponse = {
  resourceType: 'CoverageEligibilityResponse',
  id: 'resp-1',
  status: 'active',
  purpose: ['benefits'],
  outcome: 'complete',
  created: '2026-01-15T10:05:00Z',
  patient: { reference: 'Patient/123' },
  insurer: { reference: 'Organization/456', display: 'Aetna' },
  request: { reference: 'CoverageEligibilityRequest/req-1' },
};

describe('EligibilityDetails', () => {
  describe('request section', () => {
    test('renders request title', () => {
      render(<EligibilityDetails request={baseRequest} response={undefined} loadingResponse={false} />);
      expect(screen.getByText('Eligibility Request')).toBeInTheDocument();
    });

    test('renders purpose', () => {
      render(<EligibilityDetails request={baseRequest} response={undefined} loadingResponse={false} />);
      expect(screen.getByText('Benefits')).toBeInTheDocument();
    });

    test('renders insurer display name', () => {
      render(<EligibilityDetails request={baseRequest} response={undefined} loadingResponse={false} />);
      expect(screen.getByText('Aetna')).toBeInTheDocument();
    });

    test('falls back to insurer reference when no display', () => {
      const req = { ...baseRequest, insurer: { reference: 'Organization/456' } };
      render(<EligibilityDetails request={req} response={undefined} loadingResponse={false} />);
      expect(screen.getByText('Organization/456')).toBeInTheDocument();
    });
  });

  describe('response section — loading', () => {
    test('shows loading skeleton when loadingResponse is true', () => {
      const { container } = render(
        <EligibilityDetails request={baseRequest} response={undefined} loadingResponse={true} />
      );
      expect(container.querySelectorAll('.mantine-Skeleton-root').length).toBeGreaterThan(0);
    });

    test('does not show "No response" text while loading', () => {
      render(<EligibilityDetails request={baseRequest} response={undefined} loadingResponse={true} />);
      expect(screen.queryByText(/No response received/)).not.toBeInTheDocument();
    });
  });

  describe('response section — no response', () => {
    test('shows "No response received yet" when response is undefined', () => {
      render(<EligibilityDetails request={baseRequest} response={undefined} loadingResponse={false} />);
      expect(screen.getByText('No response received yet.')).toBeInTheDocument();
    });
  });

  describe('response section — with response', () => {
    test('renders response title', () => {
      render(<EligibilityDetails request={baseRequest} response={baseResponse} loadingResponse={false} />);
      expect(screen.getByText('Eligibility Response')).toBeInTheDocument();
    });

    test('renders formatted outcome', () => {
      render(<EligibilityDetails request={baseRequest} response={baseResponse} loadingResponse={false} />);
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    test('renders "Error" outcome', () => {
      const resp = { ...baseResponse, outcome: 'error' as const };
      render(<EligibilityDetails request={baseRequest} response={resp} loadingResponse={false} />);
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    test('renders "Partial" outcome', () => {
      const resp = { ...baseResponse, outcome: 'partial' as const };
      render(<EligibilityDetails request={baseRequest} response={resp} loadingResponse={false} />);
      expect(screen.getByText('Partial')).toBeInTheDocument();
    });

    test('renders disposition when present', () => {
      const resp = { ...baseResponse, disposition: 'Coverage is active and in good standing.' };
      render(<EligibilityDetails request={baseRequest} response={resp} loadingResponse={false} />);
      expect(screen.getByText('Coverage is active and in good standing.')).toBeInTheDocument();
    });

    test('does not render disposition row when absent', () => {
      render(<EligibilityDetails request={baseRequest} response={baseResponse} loadingResponse={false} />);
      expect(screen.queryByText('Disposition')).not.toBeInTheDocument();
    });

    test('renders "Coverage In Force: Yes" when inforce is true', () => {
      const resp: CoverageEligibilityResponse = {
        ...baseResponse,
        insurance: [{ coverage: { reference: 'Coverage/1' }, inforce: true }],
      };
      render(<EligibilityDetails request={baseRequest} response={resp} loadingResponse={false} />);
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    test('renders "Coverage In Force: No" when inforce is false', () => {
      const resp: CoverageEligibilityResponse = {
        ...baseResponse,
        insurance: [{ coverage: { reference: 'Coverage/1' }, inforce: false }],
      };
      render(<EligibilityDetails request={baseRequest} response={resp} loadingResponse={false} />);
      expect(screen.getByText('No')).toBeInTheDocument();
    });
  });

  describe('benefits table', () => {
    test('renders benefits table when items are present', () => {
      const resp: CoverageEligibilityResponse = {
        ...baseResponse,
        insurance: [
          {
            coverage: { reference: 'Coverage/1' },
            item: [
              {
                category: { text: 'Medical' },
                benefit: [
                  {
                    type: { text: 'Deductible' },
                    allowedMoney: { value: 1500, currency: 'USD' },
                    usedMoney: { value: 250, currency: 'USD' },
                  },
                ],
              },
            ],
          },
        ],
      };
      render(<EligibilityDetails request={baseRequest} response={resp} loadingResponse={false} />);
      expect(screen.getByText('Medical')).toBeInTheDocument();
      expect(screen.getByText('Deductible')).toBeInTheDocument();
    });

    test('renders allowedUnsignedInt with toLocaleString', () => {
      const resp: CoverageEligibilityResponse = {
        ...baseResponse,
        insurance: [
          {
            coverage: { reference: 'Coverage/1' },
            item: [
              {
                benefit: [{ type: { text: 'Visits' }, allowedUnsignedInt: 10000, usedUnsignedInt: 3000 }],
              },
            ],
          },
        ],
      };
      render(<EligibilityDetails request={baseRequest} response={resp} loadingResponse={false} />);
      expect(screen.getByText((10000).toLocaleString())).toBeInTheDocument();
      expect(screen.getByText((3000).toLocaleString())).toBeInTheDocument();
    });
  });

  describe('multiple insurance entries', () => {
    test('shows "Coverage 1" and "Coverage 2" labels when multiple entries', () => {
      const resp: CoverageEligibilityResponse = {
        ...baseResponse,
        insurance: [
          { coverage: { reference: 'Coverage/1' }, inforce: true },
          { coverage: { reference: 'Coverage/2' }, inforce: false },
        ],
      };
      render(<EligibilityDetails request={baseRequest} response={resp} loadingResponse={false} />);
      expect(screen.getByText('Coverage 1')).toBeInTheDocument();
      expect(screen.getByText('Coverage 2')).toBeInTheDocument();
    });

    test('does not show "Coverage 1" label when only one entry', () => {
      const resp: CoverageEligibilityResponse = {
        ...baseResponse,
        insurance: [{ coverage: { reference: 'Coverage/1' }, inforce: true }],
      };
      render(<EligibilityDetails request={baseRequest} response={resp} loadingResponse={false} />);
      expect(screen.queryByText('Coverage 1')).not.toBeInTheDocument();
    });
  });
});
