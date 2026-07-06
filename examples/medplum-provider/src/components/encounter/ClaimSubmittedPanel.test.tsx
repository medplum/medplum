// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Bot, ClaimResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ClaimSubmittedPanel } from './ClaimSubmittedPanel';

const CANDID_BOT_IDENTIFIER = {
  system: 'https://medplum.com/integrations/candid-health',
  value: 'get-candid-claim-portal-url',
};
const CANDID_ENCOUNTER_ID_SYSTEM = 'https://candidhealth.com/encounter-id';
const CANDID_CLAIM_URL = 'https://app-staging.joincandidhealth.com/claims/enc-123';

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
  identifier: [{ system: CANDID_ENCOUNTER_ID_SYSTEM, value: 'enc-123' }],
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

  // Register the deployed Candid URL bot and stub its execution to return a URL.
  const deployCandidBot = async (url: string | undefined = CANDID_CLAIM_URL): Promise<void> => {
    await medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Candid Claim URL',
      identifier: [CANDID_BOT_IDENTIFIER],
    });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(url ? { encounterId: 'enc-123', url } : {});
  };

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

  test('shows View Claim on Candid button when bot is deployed and returns a URL', async () => {
    await deployCandidBot();
    setup();
    expect(await screen.findByText('View Claim on Candid')).toBeInTheDocument();
  });

  test('hides View Claim on Candid button when the bot is not deployed', () => {
    setup();
    expect(screen.queryByText('View Claim on Candid')).not.toBeInTheDocument();
  });

  test('does not execute the bot for a non-Candid ClaimResponse', async () => {
    await deployCandidBot();
    const { identifier: _identifier, ...nonCandid } = baseClaimResponse;
    setup(nonCandid);
    await waitFor(() => expect(screen.getByText('Submitted')).toBeInTheDocument());
    expect(medplum.executeBot).not.toHaveBeenCalled();
    expect(screen.queryByText('View Claim on Candid')).not.toBeInTheDocument();
  });

  test('hides View Claim on Candid button when the bot returns no URL', async () => {
    await deployCandidBot(undefined);
    setup();
    // Give the bot lookup/execution a chance to resolve before asserting absence.
    await waitFor(() => expect(screen.getByText('Submitted')).toBeInTheDocument());
    expect(screen.queryByText('View Claim on Candid')).not.toBeInTheDocument();
  });

  test('View Claim on Candid button opens the URL returned by the bot', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    await deployCandidBot();
    setup();
    await userEvent.click(await screen.findByText('View Claim on Candid'));
    expect(windowOpenSpy).toHaveBeenCalledWith(CANDID_CLAIM_URL, '_blank');
    windowOpenSpy.mockRestore();
  });
});
