// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { ClaimResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ClaimSubmittedPanel } from './ClaimSubmittedPanel';

const CANDID_IDENTIFIER_SYSTEM = 'https://candidhealth.com/encounter-id';

const baseClaimResponse: WithId<ClaimResponse> = {
  resourceType: 'ClaimResponse',
  id: 'claim-response-1',
  status: 'active',
  type: { coding: [{ code: 'professional' }] },
  use: 'claim',
  patient: { reference: 'Patient/patient-1' },
  created: '',
  insurer: { reference: 'Organization/insurer-1' },
  outcome: 'complete',
  total: [
    {
      category: { coding: [{ code: 'submitted' }] },
      amount: { value: 400 },
    },
  ],
};

describe('ClaimSubmittedPanel', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  const setup = (claimResponse: WithId<ClaimResponse> = baseClaimResponse): void => {
    render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ClaimSubmittedPanel claimResponse={claimResponse} exportMenu={<button>Export</button>} />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('renders claim amount from total', () => {
    setup({
      ...baseClaimResponse,
      total: [{ category: { coding: [{ code: 'submitted' }] }, amount: { value: 399.5 } }],
    });
    expect(screen.getByText('$399.5')).toBeInTheDocument();
  });

  test('sums multiple totals', () => {
    setup({
      ...baseClaimResponse,
      total: [
        { category: { coding: [{ code: 'submitted' }] }, amount: { value: 100 } },
        { category: { coding: [{ code: 'benefit' }] }, amount: { value: 50 } },
      ],
    });
    expect(screen.getByText('$150')).toBeInTheDocument();
  });

  test('renders export menu', () => {
    setup();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  test('shows Submitted status badge', () => {
    setup();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  test('shows submission date when created is provided', () => {
    setup({ ...baseClaimResponse, created: '2026-03-02T21:32:57.748Z' });
    expect(screen.getByText(/Submitted on/)).toBeInTheDocument();
  });

  test('hides submission date when created is empty', () => {
    setup({ ...baseClaimResponse, created: '' });
    expect(screen.queryByText(/Submitted on/)).not.toBeInTheDocument();
  });

  test('shows View Claim on Candid button when candid identifier is present', () => {
    setup({
      ...baseClaimResponse,
      identifier: [{ system: CANDID_IDENTIFIER_SYSTEM, value: 'enc-123' }],
    });
    expect(screen.getByText('View Claim on Candid')).toBeInTheDocument();
  });

  test('hides View Claim on Candid button when candid identifier is missing', () => {
    setup();
    expect(screen.queryByText('View Claim on Candid')).not.toBeInTheDocument();
  });

  test('View Claim on Candid button opens correct URL', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    setup({
      ...baseClaimResponse,
      identifier: [{ system: CANDID_IDENTIFIER_SYSTEM, value: 'enc-123' }],
    });
    await userEvent.click(screen.getByText('View Claim on Candid'));
    expect(windowOpenSpy).toHaveBeenCalledWith('https://app-staging.joincandidhealth.com/claims/enc-123', '_blank');
    windowOpenSpy.mockRestore();
  });
});
