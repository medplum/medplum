// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Claim, Coverage } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test } from 'vitest';
import { ClaimInsurance } from './ClaimInsurance';
import { FEE_SCHEDULE_TAG, PAYER_USAGE_CONTEXT } from './feeSchedules';

describe('ClaimInsurance', () => {
  let medplum: MockClient;
  let coverage: WithId<Coverage>;

  beforeEach(async () => {
    medplum = new MockClient();
    coverage = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      order: 1,
      beneficiary: { reference: `Patient/${HomerSimpson.id}` },
      payor: [{ reference: 'Organization/aetna', display: 'Aetna' }],
      subscriberId: 'W123',
      relationship: { coding: [{ code: 'self', display: 'Self' }] },
      class: [{ type: { coding: [{ code: 'group' }] }, value: 'G-77', name: 'Springfield Nuclear' }],
    });
  });

  const claim = (fields: Partial<Claim> = {}): Claim => ({
    resourceType: 'Claim',
    status: 'draft',
    use: 'claim',
    created: '2026-09-04',
    type: { coding: [{ code: 'professional' }] },
    priority: { coding: [{ code: 'normal' }] },
    provider: { reference: 'Practitioner/123' },
    patient: { reference: `Patient/${HomerSimpson.id}` },
    insurance: [{ sequence: 1, focal: true, coverage: { reference: `Coverage/${coverage.id}` } }],
    item: [
      { sequence: 1, productOrService: { coding: [{ code: '99214' }] }, net: { value: 245, currency: 'USD' } },
      { sequence: 2, productOrService: { coding: [{ code: '36415' }] }, net: { value: 20, currency: 'USD' } },
    ],
    ...fields,
  });

  const setup = (value: Claim): void => {
    render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <MemoryRouter>
            <ClaimInsurance claim={value} />
          </MemoryRouter>
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('shows the coverage, the latest eligibility response and the payer fee schedule rates', async () => {
    await medplum.createResource({
      resourceType: 'CoverageEligibilityResponse',
      status: 'active',
      purpose: ['benefits'],
      patient: { reference: `Patient/${HomerSimpson.id}` },
      created: '2026-09-01T10:00:00Z',
      request: { reference: 'CoverageEligibilityRequest/r1' },
      outcome: 'complete',
      disposition: 'Policy is active',
      insurer: { display: 'Aetna' },
      insurance: [{ coverage: { reference: `Coverage/${coverage.id}` }, inforce: true }],
    });
    await medplum.createResource({
      resourceType: 'ChargeItemDefinition',
      url: 'https://example.com/fee-schedules/aetna',
      title: 'Aetna 2026',
      status: 'active',
      meta: { tag: [FEE_SCHEDULE_TAG] },
      useContext: [{ code: PAYER_USAGE_CONTEXT, valueReference: { reference: 'Organization/aetna' } }],
      propertyGroup: [
        {
          priceComponent: [
            { type: 'base', code: { coding: [{ code: '99214' }] }, amount: { value: 180, currency: 'USD' } },
          ],
        },
      ],
    });
    setup(claim());

    expect(await screen.findByText('W123')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Self')).toBeInTheDocument();
    expect(screen.getByText('Springfield Nuclear')).toBeInTheDocument();

    expect(await screen.findByText('Policy is active')).toBeInTheDocument();
    expect(screen.getByText('complete')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();

    const link = await screen.findByRole('link', { name: 'Aetna 2026' });
    const rows = within(link.closest('div')?.parentElement?.parentElement as HTMLElement).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('99214$245.00$180.00');
    expect(rows[2]).toHaveTextContent('36415$20.00—');
  });

  test('says when the patient has no eligibility check or the payer has no fee schedule', async () => {
    setup(claim());

    expect(await screen.findByText('No eligibility check for this patient yet.')).toBeInTheDocument();
    expect(await screen.findByText(/No fee schedule for Aetna/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage fee schedules' })).toHaveAttribute(
      'href',
      '/settings/billing/fee-schedules'
    );
  });

  test("says when the claim's coverage can't be loaded, and still shows the rest", async () => {
    setup(claim({ insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/missing' } }] }));

    expect(await screen.findByText(/Couldn't load Coverage\/missing/)).toBeInTheDocument();
    expect(await screen.findByText('No eligibility check for this patient yet.')).toBeInTheDocument();
    expect(await screen.findByText(/No fee schedule for this payer/)).toBeInTheDocument();
  });

  test('says when the claim names a coverage without linking to it', async () => {
    setup(claim({ insurance: [{ sequence: 1, focal: true, coverage: { display: 'Aetna PPO' } }] }));
    expect(await screen.findByText(/names Aetna PPO but doesn't link to it/)).toBeInTheDocument();
  });

  test('says when the claim has no insurance', () => {
    setup(claim({ insurance: undefined }));
    expect(screen.getByText(/This claim has no insurance/)).toBeInTheDocument();
  });
});
