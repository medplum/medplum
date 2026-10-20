// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Bot, Claim, ClaimResponse, Coverage } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CANDID_CLAIM_STATUS_SYSTEM,
  CANDID_CLAIM_URL_BOT_IDENTIFIER,
  CANDID_ENCOUNTER_ID_SYSTEM,
  CANDID_GET_ENCOUNTER_BOT_IDENTIFIER,
  SOURCE_CLAIM_STATUS_EXTENSION_URL,
} from '../../utils/candid';
import { ClaimDetailPane } from './ClaimDetailPane';

describe('ClaimDetailPane', () => {
  let medplum: MockClient;
  let coverage: WithId<Coverage>;

  beforeEach(async () => {
    medplum = new MockClient();
    notifications.clean();
    coverage = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: { reference: `Patient/${HomerSimpson.id}` },
      payor: [{ display: 'Aetna' }],
      subscriberId: 'W123',
    });
  });

  const createClaim = (fields: Partial<Claim>): Promise<WithId<Claim>> =>
    medplum.createResource<Claim>({
      resourceType: 'Claim',
      status: 'active',
      use: 'claim',
      created: '2026-09-04',
      type: { coding: [{ code: 'professional' }] },
      priority: { coding: [{ code: 'normal' }] },
      provider: { reference: 'Practitioner/123' },
      patient: { reference: `Patient/${HomerSimpson.id}`, display: 'Homer Simpson' },
      insurance: [{ sequence: 1, focal: true, coverage: { reference: `Coverage/${coverage.id}` } }],
      total: { value: 310, currency: 'USD' },
      item: [
        {
          sequence: 1,
          productOrService: { coding: [{ code: '99214', display: 'Office visit' }] },
          diagnosisSequence: [1, 2],
          net: { value: 245, currency: 'USD' },
          encounter: [{ reference: 'Encounter/e1' }],
        },
      ],
      ...fields,
    });

  const createResponse = (claim: Claim, fields: Partial<ClaimResponse>): Promise<WithId<ClaimResponse>> =>
    medplum.createResource<ClaimResponse>({
      resourceType: 'ClaimResponse',
      status: 'active',
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      patient: claim.patient,
      created: '2026-09-06',
      insurer: { display: 'Aetna' },
      outcome: 'queued',
      request: { reference: `Claim/${claim.id}` },
      ...fields,
    });

  const candidStatus = (code: string): Partial<ClaimResponse> => ({
    identifier: [{ system: CANDID_ENCOUNTER_ID_SYSTEM, value: 'enc-1' }],
    extension: [
      {
        url: SOURCE_CLAIM_STATUS_EXTENSION_URL,
        valueCodeableConcept: { coding: [{ system: CANDID_CLAIM_STATUS_SYSTEM, code }] },
      },
    ],
  });

  const setup = (claimId: string): { onClose: ReturnType<typeof vi.fn>; onChanged: ReturnType<typeof vi.fn> } => {
    const onClose = vi.fn();
    const onChanged = vi.fn();
    render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Notifications />
          <MemoryRouter>
            <ClaimDetailPane claimId={claimId} onClose={onClose} onChanged={onChanged} />
          </MemoryRouter>
        </MantineProvider>
      </MedplumProvider>
    );
    return { onClose, onChanged };
  };

  test('submits a ready claim and links to its encounter for edits', async () => {
    const claim = await createClaim({ status: 'draft' });
    const post = vi.spyOn(medplum, 'post').mockResolvedValue({});
    const user = userEvent.setup();
    const { onChanged } = setup(claim.id);

    const alert = await screen.findByRole('alert', { name: 'Ready to submit' });
    expect(within(alert).getByRole('link', { name: 'Edit claim' })).toHaveAttribute(
      'href',
      `/Patient/${HomerSimpson.id}/Encounter/e1`
    );
    expect(screen.getAllByRole('link', { name: 'Edit claim' })).toHaveLength(2);
    await user.click(within(alert).getByRole('button', { name: 'Submit to Candid' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(String(post.mock.calls[0][0])).toContain(`Claim/${claim.id}/$candid-submit-claim`);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test('shows the lines with what the payer allowed and paid', async () => {
    const claim = await createClaim({});
    await createResponse(claim, {
      ...candidStatus('paid'),
      payment: { type: { text: 'Complete' }, amount: { value: 176.4, currency: 'USD' }, date: '2026-10-06' },
      item: [
        {
          itemSequence: 1,
          adjudication: [
            { category: { coding: [{ code: 'eligible' }] }, amount: { value: 196.4, currency: 'USD' } },
            { category: { coding: [{ code: 'benefit' }] }, amount: { value: 176.4, currency: 'USD' } },
            {
              category: { coding: [{ code: 'copay' }] },
              amount: { value: 20, currency: 'USD' },
              reason: { coding: [{ code: 'PR-3' }] },
            },
          ],
        },
      ],
    });
    setup(claim.id);

    expect(await screen.findByRole('alert', { name: 'Paid' })).toBeInTheDocument();
    const row = screen.getByText('99214').closest('tr') as HTMLElement;
    expect(within(row).getByText('A, B')).toBeInTheDocument();
    expect(within(row).getByText('$245.00')).toBeInTheDocument();
    expect(within(row).getByText('$196.40')).toBeInTheDocument();
    expect(within(row).getByText(/PR-3/)).toBeInTheDocument();
    expect(screen.getByText(/\$176.40 paid on/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit claim' })).not.toBeInTheDocument();
  });

  test('refreshes the status from Candid', async () => {
    const claim = await createClaim({ identifier: [{ system: CANDID_ENCOUNTER_ID_SYSTEM, value: 'enc-1' }] });
    await createResponse(claim, candidStatus('submitted_to_payer'));
    await medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'get encounter',
      identifier: [CANDID_GET_ENCOUNTER_BOT_IDENTIFIER],
    });
    const executeBot = vi.spyOn(medplum, 'executeBot').mockResolvedValue({});
    const user = userEvent.setup();
    setup(claim.id);

    const alert = await screen.findByRole('alert', { name: 'With the payer' });
    expect(alert).toHaveTextContent('Clearinghouse status: Submitted To Payer.');
    await user.click(within(alert).getByRole('button', { name: 'Refresh status' }));
    await waitFor(() =>
      expect(executeBot).toHaveBeenCalledWith(expect.any(String), { encounterId: 'enc-1' }, 'application/json')
    );
  });

  test('reports a refresh when the status bot is missing', async () => {
    const claim = await createClaim({ identifier: [{ system: CANDID_ENCOUNTER_ID_SYSTEM, value: 'enc-1' }] });
    await createResponse(claim, candidStatus('rejected'));
    const user = userEvent.setup();
    setup(claim.id);

    const alert = await screen.findByRole('alert', { name: 'Rejected before adjudication' });
    expect(within(alert).getByRole('link', { name: 'Fix claim' })).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Refresh status' }));
    expect(await screen.findByText('The Candid status bot is not deployed in this project')).toBeInTheDocument();
  });

  test('sets a follow-up from the payer callout', async () => {
    const claim = await createClaim({});
    await createResponse(claim, {});
    const user = userEvent.setup();
    setup(claim.id);

    const alert = await screen.findByRole('alert', { name: 'With the payer' });
    await user.click(within(alert).getByRole('button', { name: 'Set follow-up' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set follow-up' });
    const save = within(dialog).getByRole('button', { name: 'Set follow-up' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Note/), 'Appeal sent');
    await user.click(save);

    expect(await screen.findByText(/Appeal sent/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change follow-up' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Activity' }));
    expect(screen.getByText(/Follow-up set for/)).toBeInTheDocument();
    expect(screen.getByText('Submitted to the clearinghouse')).toBeInTheDocument();
  });

  test.each([
    ['paid_incorrectly', 'Paid incorrectly', 'Appeal underpayment'],
    ['denied', 'Denied', 'Corrected claim'],
  ])('shows %s actions as coming soon', async (code, title, action) => {
    const claim = await createClaim({});
    await createResponse(claim, candidStatus(code));
    setup(claim.id);

    const alert = await screen.findByRole('alert', { name: title });
    expect(within(alert).getByRole('button', { name: action })).toBeDisabled();
  });

  test('shows a voided claim', async () => {
    const claim = await createClaim({ status: 'cancelled' });
    setup(claim.id);

    expect(await screen.findByRole('alert', { name: 'Voided' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh status' })).not.toBeInTheDocument();
  });

  test('lists the claim coverage on the Patient tab', async () => {
    const claim = await createClaim({});
    const user = userEvent.setup();
    setup(claim.id);

    await user.click(await screen.findByRole('radio', { name: 'Patient' }));
    expect(await screen.findByText('Primary coverage')).toBeInTheDocument();
    expect(screen.getByText('Aetna')).toBeInTheDocument();
    expect(screen.getByText('Member W123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open patient chart' })).toHaveAttribute(
      'href',
      `/Patient/${HomerSimpson.id}`
    );
  });

  test('opens the claim in Candid from the more menu', async () => {
    const claim = await createClaim({});
    await createResponse(claim, candidStatus('paid'));
    await medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'claim url',
      identifier: [CANDID_CLAIM_URL_BOT_IDENTIFIER],
    });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ url: 'https://app.joincandidhealth.com/claims/1' });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    const { onClose } = setup(claim.id);

    await screen.findByRole('alert', { name: 'Paid' });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect((await screen.findByText('Void claim')).closest('button')).toBeDisabled();
    await user.click(screen.getByText('View on Candid'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://app.joincandidhealth.com/claims/1', '_blank'));

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
