// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Bot, Claim, ClaimResponse, Coverage, PaymentReconciliation } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
      diagnosis: [
        { sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'E11.9', display: 'Type 2 diabetes' }] } },
        { sequence: 2, diagnosisCodeableConcept: { coding: [{ code: 'I10', display: 'Hypertension' }] } },
      ],
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

  const openLines = async (): Promise<void> =>
    userEvent.setup().click(await screen.findByRole('tab', { name: 'Lines & Details' }));

  const openOverview = async (): Promise<void> =>
    userEvent.setup().click(await screen.findByRole('tab', { name: 'Overview' }));

  const actions = (): HTMLElement => screen.getByRole('group', { name: 'Claim actions' });

  const subtitle = (text: RegExp): HTMLElement =>
    screen.getByText((_, el) => el?.tagName === 'P' && text.test(el.textContent ?? ''));

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

  test('submits a ready claim and links to its encounter', async () => {
    const claim = await createClaim({ status: 'draft' });
    const post = vi.spyOn(medplum, 'post').mockResolvedValue({});
    const user = userEvent.setup();
    const { onChanged } = setup(claim.id);

    const nextStep = await screen.findByRole('region', { name: 'Ready to submit' });
    expect(within(nextStep).getByText('Next Steps')).toBeInTheDocument();
    expect(subtitle(/^DOS /)).toBeInTheDocument();
    expect(screen.getByText('Ready', { selector: '.mantine-Button-label' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect((await screen.findByText('Open Encounter')).closest('a')).toHaveAttribute(
      'href',
      `/Patient/${HomerSimpson.id}/Encounter/e1`
    );
    await user.keyboard('{Escape}');
    await user.click(within(actions()).getByRole('button', { name: 'Submit to Candid' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(String(post.mock.calls[0][0])).toContain(`Claim/${claim.id}/$candid-submit-claim`);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test('shows an open claim as editable cards that save as you edit', async () => {
    const claim = await createClaim({ status: 'draft' });
    const user = userEvent.setup();
    const { onChanged } = setup(claim.id);

    await screen.findByRole('region', { name: 'Ready to submit' });
    await openLines();
    expect(screen.getByRole('region', { name: 'Visit Details' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Visit Details' })).getByRole('link')).toHaveAttribute(
      'href',
      `/Patient/${HomerSimpson.id}/Encounter/e1`
    );
    expect(screen.getByRole('button', { name: 'Add a Diagnosis' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Service Lines' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit|Save changes/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add a Service Line' }));
    await user.click(screen.getByRole('button', { name: 'Move line 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    const price = screen.getByRole('textbox', { name: 'Unit Price' });
    await user.clear(price);
    await user.type(price, '100');
    const units = screen.getByRole('textbox', { name: 'Units' });
    await user.clear(units);
    await user.type(units, '2');
    expect(within(screen.getByRole('region', { name: 'Service Lines' })).getByText('$200.00')).toBeInTheDocument();

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(async () => expect((await medplum.readResource('Claim', claim.id)).total?.value).toBe(200));
    const saved = await medplum.readResource('Claim', claim.id);
    expect(saved.item).toHaveLength(1);
    expect(saved.item?.[0].quantity?.value).toBe(2);
    expect(saved.item?.[0].unitPrice?.value).toBe(100);
    expect(saved.item?.[0].net?.value).toBe(200);
  });

  test('shows a submitted claim read-only', async () => {
    const claim = await createClaim({});
    await createResponse(claim, {});
    setup(claim.id);

    await openLines();
    expect(await screen.findByText('Hypertension')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a Diagnosis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a Service Line' })).not.toBeInTheDocument();
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

    const nextStep = await screen.findByRole('region', { name: 'Patient balance' });
    expect(nextStep).toHaveTextContent('The patient owes $20.00');
    expect(screen.getByText('Patient').nextElementSibling).toHaveTextContent('$20.00');
    await openLines();
    const row = screen.getByText('99214').closest('tr') as HTMLElement;
    expect(within(row).getByText('A, B')).toBeInTheDocument();
    expect(within(row).getByText('$245.00')).toBeInTheDocument();
    expect(within(row).getByText('$196.40')).toBeInTheDocument();
    expect(within(row).getByText(/PR-3/)).toBeInTheDocument();
    await openOverview();
    expect(screen.getByText('Amount Paid').nextElementSibling).toHaveTextContent('$176.40');
    expect(screen.getByText('Payment Date').nextElementSibling).toHaveTextContent('10/6/2026');
    expect(screen.queryByRole('link', { name: 'Edit claim' })).not.toBeInTheDocument();
    expect(within(actions()).getByRole('button', { name: 'Send statement' })).toBeDisabled();

    await userEvent.setup().click(within(actions()).getByRole('button', { name: 'Mark collected' }));
    expect(await screen.findByRole('region', { name: 'Paid' })).toBeInTheDocument();
  });

  test('lists what to fix on a draft claim before it can be submitted', async () => {
    const claim = await createClaim({
      status: 'draft',
      insurance: [],
      diagnosis: [
        { sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'E11.9' }] } },
        { sequence: 3, diagnosisCodeableConcept: { coding: [{ code: 'R51' }] } },
      ],
      item: [
        {
          sequence: 1,
          productOrService: { coding: [{ code: '99214' }] },
          diagnosisSequence: [1],
          encounter: [{ reference: 'Encounter/e1' }],
        },
        { sequence: 2, productOrService: { coding: [{ code: '36415' }] } },
      ],
    });
    setup(claim.id);

    const nextStep = await screen.findByRole('region', { name: 'Needs fixing' });
    expect(screen.getByText('Needs Fixing', { selector: '.mantine-Button-label' })).toBeInTheDocument();
    expect(nextStep).toHaveTextContent("Add the patient's coverage to the claim.");
    expect(nextStep).toHaveTextContent('1 line has no diagnosis pointer: 36415.');
    expect(nextStep).toHaveTextContent('1 diagnosis is on no line: R51.');
    expect(within(actions()).getByRole('button', { name: 'Submit to Candid' })).toBeDisabled();
    await openLines();
    expect(screen.getByRole('button', { name: 'Add a Diagnosis' })).toBeInTheDocument();
  });

  test('links to the remittances that pay the claim', async () => {
    const claim = await createClaim({});
    await createResponse(claim, {
      outcome: 'complete',
      payment: { type: { text: 'Complete' }, amount: { value: 194.4, currency: 'USD' }, date: '2026-10-11' },
    });
    const remit = await medplum.createResource<PaymentReconciliation>({
      resourceType: 'PaymentReconciliation',
      status: 'active',
      created: '2026-10-11',
      paymentDate: '2026-10-11',
      paymentIssuer: { display: 'Aetna' },
      paymentIdentifier: { value: 'EFT 1AET928451' },
      paymentAmount: { value: 297.6, currency: 'USD' },
      detail: [
        {
          type: { coding: [{ code: 'payment' }] },
          request: { reference: `Claim/${claim.id}` },
          amount: { value: 194.4, currency: 'USD' },
        },
        {
          type: { coding: [{ code: 'payment' }] },
          request: { reference: 'Claim/other' },
          amount: { value: 103.2, currency: 'USD' },
        },
      ],
    });
    setup(claim.id);

    expect(await screen.findByRole('link', { name: /Open remittance/ })).toHaveAttribute(
      'href',
      `/Billing/Remits/all/${remit.id}`
    );
    expect(screen.getByText('Aetna · EFT 1AET928451')).toBeInTheDocument();
    expect(screen.getByText('Paid on This Claim').nextElementSibling).toHaveTextContent('$194.40');
    expect(screen.getByText('Payment ID').nextElementSibling).toHaveTextContent('EFT 1AET928451');
  });

  test('flags diagnosis pointer problems', async () => {
    const claim = await createClaim({
      diagnosis: [
        { sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'E11.9', display: 'Type 2 diabetes' }] } },
        { sequence: 2, diagnosisCodeableConcept: { coding: [{ code: 'I10', display: 'Hypertension' }] } },
      ],
      item: [
        {
          sequence: 1,
          productOrService: { coding: [{ code: '99214', display: 'Office visit' }] },
          diagnosisSequence: [1],
          net: { value: 245, currency: 'USD' },
        },
        {
          sequence: 2,
          productOrService: { coding: [{ code: '36415', display: 'Venipuncture' }] },
          net: { value: 25, currency: 'USD' },
        },
      ],
    });
    const noDiagnoses = await createClaim({ diagnosis: undefined });
    setup(claim.id);

    await openLines();
    const diagnoses = await screen.findByRole('region', { name: 'Diagnoses' });
    const unpointed = within(diagnoses).getByText('I10').closest('div') as HTMLElement;
    expect(within(unpointed).getByText('Not on any line')).toBeInTheDocument();
    expect(
      within(within(diagnoses).getByText('E11.9').closest('div') as HTMLElement).queryByText('Not on any line')
    ).toBeNull();
    const line = screen.getByText('36415').closest('tr') as HTMLElement;
    expect(within(line).getByRole('img', { name: 'No diagnosis pointer' })).toBeInTheDocument();

    cleanup();
    setup(noDiagnoses.id);
    await openLines();
    expect(await screen.findByText(/No diagnoses on this claim/)).toBeInTheDocument();
  });

  test('keeps the remit when the status tracker is updated after it', async () => {
    const claim = await createClaim({
      identifier: [
        { system: 'https://www.stedi.com/patient-control-number', value: 'PCN123' },
        { system: CANDID_ENCOUNTER_ID_SYSTEM, value: 'enc-1' },
      ],
      diagnosis: [
        { sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'E11.9', display: 'Type 2 diabetes' }] } },
        { sequence: 2, diagnosisCodeableConcept: { coding: [{ code: 'I10', display: 'Hypertension' }] } },
      ],
    });
    const adjudicated = (benefit: number): Partial<ClaimResponse> => ({
      outcome: 'complete',
      payment: { type: { text: 'Complete' }, amount: { value: benefit, currency: 'USD' }, date: '2026-10-06' },
      item: [
        {
          itemSequence: 1,
          adjudication: [
            { category: { coding: [{ code: 'eligible' }] }, amount: { value: 196.4, currency: 'USD' } },
            { category: { coding: [{ code: 'benefit' }] }, amount: { value: benefit, currency: 'USD' } },
          ],
        },
      ],
    });
    await createResponse(claim, adjudicated(176.4));
    await createResponse(claim, adjudicated(-176.4));
    await createResponse(claim, adjudicated(150));
    await createResponse(claim, candidStatus('submitted_to_payer'));
    const user = userEvent.setup();
    setup(claim.id);

    expect(await screen.findByRole('region', { name: 'Paid' })).toBeInTheDocument();
    expect(subtitle(/^Aetna • DOS 9\/4\/2026$/)).toBeInTheDocument();
    await openLines();
    const row = screen.getByText('99214').closest('tr') as HTMLElement;
    expect(within(row).getByText('$589.20')).toBeInTheDocument();
    expect(within(row).getByText('$150.00')).toBeInTheDocument();
    const diagnoses = screen.getByRole('region', { name: 'Diagnoses' });
    expect(within(diagnoses).getByText('E11.9')).toBeInTheDocument();
    expect(within(diagnoses).getByText('Hypertension')).toBeInTheDocument();
    expect(within(diagnoses).queryByText('Not on any line')).not.toBeInTheDocument();
    await openOverview();
    expect(screen.getAllByText('Amount Paid')).toHaveLength(3);
    expect(screen.getByText('PCN').nextElementSibling).toHaveTextContent('PCN123');
    expect(screen.getByText('Candid Encounter ID').nextElementSibling).toHaveTextContent('enc-1');

    await user.click(screen.getByRole('tab', { name: 'Notes & Activity' }));
    expect(screen.getByText('Remittance: $150.00 paid')).toBeInTheDocument();
    expect(screen.getByText('Status: Submitted To Payer')).toBeInTheDocument();
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

    const alert = await screen.findByRole('region', { name: 'With the payer' });
    expect(alert).toHaveTextContent('Clearinghouse status: Submitted To Payer.');
    await user.click(within(actions()).getByRole('button', { name: 'Refresh Status' }));
    await waitFor(() =>
      expect(executeBot).toHaveBeenCalledWith(expect.any(String), { encounterId: 'enc-1' }, 'application/json')
    );
  });

  test('reports a refresh when the status bot is missing', async () => {
    const claim = await createClaim({ identifier: [{ system: CANDID_ENCOUNTER_ID_SYSTEM, value: 'enc-1' }] });
    await createResponse(claim, candidStatus('rejected'));
    const user = userEvent.setup();
    setup(claim.id);

    expect(await screen.findByRole('region', { name: 'Rejected before adjudication' })).toBeInTheDocument();
    await openLines();
    expect(screen.getByRole('region', { name: 'Service Lines' })).toBeInTheDocument();
    await user.click(within(actions()).getByRole('button', { name: 'Refresh Status' }));
    expect(await screen.findByText('The Candid status bot is not deployed in this project')).toBeInTheDocument();
  });

  test('sets a follow-up from the payer callout', async () => {
    const claim = await createClaim({});
    await createResponse(claim, {});
    const user = userEvent.setup();
    setup(claim.id);

    expect(await screen.findByRole('region', { name: 'With the payer' })).toBeInTheDocument();
    await user.click(within(actions()).getByRole('button', { name: 'Set Follow-Up' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set Follow-Up' });
    const save = within(dialog).getByRole('button', { name: 'Set Follow-Up' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Note/), 'Appeal sent');
    await user.click(save);

    expect(await screen.findByText(/Appeal sent/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Follow-Up' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Notes & Activity' }));
    expect(screen.getByText(/Follow-up set for/)).toBeInTheDocument();
    expect(screen.getByText('Submitted to the clearinghouse')).toBeInTheDocument();
  });

  test.each([
    ['paid_incorrectly', 'Paid incorrectly', 'Appeal underpayment'],
    ['denied', 'Denied', 'Corrected Claim'],
  ])('shows %s actions as coming soon', async (code, title, action) => {
    const claim = await createClaim({});
    await createResponse(claim, {
      outcome: 'complete',
      payment: { type: { text: 'Complete' }, amount: { value: 100, currency: 'USD' } },
    });
    await createResponse(claim, candidStatus(code));
    setup(claim.id);

    expect(await screen.findByRole('region', { name: title })).toBeInTheDocument();
    expect(within(actions()).getByRole('button', { name: action })).toBeDisabled();
  });

  test('shows a voided claim', async () => {
    const claim = await createClaim({ status: 'cancelled' });
    setup(claim.id);

    expect(await screen.findByRole('region', { name: 'Voided' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh Status' })).not.toBeInTheDocument();
  });

  test('has Overview, Lines & Details, Insurance and Notes & Activity tabs, with notes in the activity timeline', async () => {
    const claim = await createClaim({});
    const user = userEvent.setup();
    setup(claim.id);

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Lines & Details', 'Insurance', 'Notes & Activity']);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Remittance')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add a note...')).not.toBeInTheDocument();

    await user.click(screen.getByText('Notes & Activity'));
    expect(screen.getByPlaceholderText('Add a note...')).toHaveFocus();
    await user.type(screen.getByPlaceholderText('Add a note...'), 'Line 1{Shift>}{Enter}{/Shift}Line 2{Enter}');
    expect(screen.getByPlaceholderText('Add a note...')).toHaveValue('');
    expect(screen.getByText(/^Note from /)).toBeInTheDocument();
    expect(screen.getByText(/Line 1\s+Line 2/)).toBeInTheDocument();
    expect(screen.getAllByText(/^\d+\/\d+\/\d{4} · \d+:\d{2}\s?[AP]M$/).length).toBeGreaterThan(0);
    const titles = screen.getAllByText(/^(Note from |Claim created)/).map((el) => el.textContent);
    expect(titles[0]).toMatch(/^Note from /);
    expect(titles[titles.length - 1]).toBe('Claim created');
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

    await screen.findByRole('region', { name: 'Waiting for the remit' });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect((await screen.findByText('Void Claim')).closest('button')).toBeDisabled();
    await user.click(screen.getByText('View on Candid'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://app.joincandidhealth.com/claims/1', '_blank'));

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
