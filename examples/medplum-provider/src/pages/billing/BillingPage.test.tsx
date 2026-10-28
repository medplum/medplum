// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { ChargeItemDefinition, Claim, ClaimResponse, PaymentReconciliation } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { FEE_SCHEDULE_TAG, PAYER_USAGE_CONTEXT } from '../../components/billing/feeSchedules';
import { CANDID_CLAIM_STATUS_SYSTEM, SOURCE_CLAIM_STATUS_EXTENSION_URL, toLocalCalendarDate } from '../../utils/candid';
import { BillingPage } from './BillingPage';

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toLocalCalendarDate(date);
}

function newClaim(overrides: Partial<Claim>): Claim {
  return {
    resourceType: 'Claim',
    status: 'active',
    use: 'claim',
    created: daysAgo(1),
    type: { coding: [{ code: 'professional' }] },
    priority: { coding: [{ code: 'normal' }] },
    insurance: [],
    provider: { reference: 'Practitioner/123' },
    patient: { reference: `Patient/${HomerSimpson.id}`, display: 'Homer Simpson' },
    total: { value: 125.5, currency: 'USD' },
    ...overrides,
  };
}

describe('BillingPage', () => {
  let medplum: MockClient;
  let claim: WithId<Claim>;

  beforeEach(async () => {
    medplum = new MockClient();
    notifications.clean();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    claim = await medplum.createResource(newClaim({}));
  });

  const setup = (url: string): { router: ReturnType<typeof createMemoryRouter> } => {
    const router = createMemoryRouter(
      [
        { path: '/Billing/*', element: <BillingPage /> },
        { path: '*', element: <div>Elsewhere</div> },
      ],
      { initialEntries: [url] }
    );
    render(
      <MedplumProvider medplum={medplum} navigate={router.navigate}>
        <MantineProvider>
          <Notifications />
          <RouterProvider router={router} />
        </MantineProvider>
      </MedplumProvider>
    );
    return { router };
  };

  const nav = (): HTMLElement => screen.getByRole('navigation', { name: 'Claim queues' });

  test('puts the tabs, configuration gear, and queues in one left column', async () => {
    setup('/Billing/Claims/all');

    expect(screen.getByRole('tab', { name: 'Claims' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'Remits' })).toHaveAttribute('href', '/Billing/Remits');
    expect(screen.getByRole('link', { name: 'Configuration' })).toHaveAttribute('href', '/settings/billing');
    for (const group of ['Aging', 'Pre-Submission', 'Submitted to Payer', 'After Payment']) {
      expect(within(nav()).getByText(group)).toBeInTheDocument();
    }
    const allOpen = within(nav()).getByRole('link', { name: /All Open/ });
    expect(allOpen).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(allOpen).toHaveTextContent('All Open1'));
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test.each(['/Billing', '/Billing/unknown', '/Billing/Claims/nope'])('defaults to All Open for %s', async (url) => {
    setup(url);

    expect(screen.getByRole('tab', { name: 'Claims' })).toHaveAttribute('aria-selected', 'true');
    expect(within(nav()).getByRole('link', { name: /All Open/ })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();
  });

  test('aging cards and aging links select the same bucket', async () => {
    await medplum.createResource(newClaim({ created: daysAgo(45), total: { value: 80, currency: 'USD' } }));
    const user = userEvent.setup();
    const { router } = setup('/Billing/Claims/all');

    const card = await screen.findByRole('button', { name: /31–60 Days/ });
    await waitFor(() => expect(card).toHaveTextContent('$80.00'));
    expect(card).toHaveTextContent('1 Claim');
    await user.click(card);
    expect(router.state.location.pathname).toBe('/Billing/Claims/aging-31-60');
    expect(within(nav()).getByRole('link', { name: /31–60 Days/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /31–60 Days/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /31–60 Days/ }));
    expect(router.state.location.pathname).toBe('/Billing/Claims/all');
  });

  test('hides the aging cards outside All Open and the aging queues', async () => {
    setup('/Billing/Claims/ready');

    expect(await screen.findByRole('heading', { name: 'Ready to Submit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /0–30 Days/ })).not.toBeInTheDocument();
  });

  test('shows queues without searchable data as coming soon', async () => {
    setup('/Billing/Claims/denied');

    expect(await screen.findByText('Denied is coming soon')).toBeInTheDocument();
    expect(screen.getByText(/needs a search parameter for the payer status/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('submits every draft claim from Ready to Submit', async () => {
    const draft = await medplum.createResource(
      newClaim({ status: 'draft', insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/1' } }] })
    );
    await medplum.createResource(
      newClaim({ status: 'draft', patient: { reference: 'Patient/2', display: 'Bart Simpson' } })
    );
    const post = vi.spyOn(medplum, 'post').mockResolvedValue({});
    const user = userEvent.setup();
    setup('/Billing/Claims/ready');

    await user.click(await screen.findByRole('button', { name: 'Submit all' }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit all ready claims' });
    expect(await within(dialog).findByText('No coverage on the claim')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Submit 1 claim' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(String(post.mock.calls[0][0])).toContain(`Claim/${draft.id}/$candid-submit-claim`);
    expect(await within(dialog).findByText('Submit: 1 of 1 claim done.')).toBeInTheDocument();
  });

  test('opens a claim in a drawer over the list and closes it', async () => {
    const user = userEvent.setup();
    const { router } = setup('/Billing/Claims/all');

    await user.click(await within(await screen.findByRole('table')).findByText('$125.50'));
    expect(router.state.location.pathname).toBe(`/Billing/Claims/all/${claim.id}`);
    const drawer = await screen.findByRole('dialog', { name: 'Claim' });
    expect(within(drawer).getByText('Lines & Remits')).toBeInTheDocument();
    const activeRows = screen.getAllByTestId('search-control-row').filter((row) => row.hasAttribute('data-active'));
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]).toHaveTextContent('$125.50');
    expect(screen.getByText('Submitted', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    expect(screen.getByText('Submitted', { selector: '.mantine-Button-label' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'With the payer' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit claim' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(router.state.location.pathname).toBe('/Billing/Claims/all');
  });

  test('closes the claim drawer on a click outside it, but not on another claim', async () => {
    const user = userEvent.setup();
    const { router } = setup(`/Billing/Claims/all/${claim.id}`);

    await screen.findByRole('dialog', { name: 'Claim' });
    await user.click(screen.getAllByTestId('search-control-row')[0]);
    expect(router.state.location.pathname).toMatch(/^\/Billing\/Claims\/all\/.+/);
    await user.click(screen.getByRole('button', { name: 'Fields' }));
    expect(router.state.location.pathname).toBe('/Billing/Claims/all');
  });

  test('adds a note to a claim', async () => {
    const user = userEvent.setup();
    setup(`/Billing/Claims/all/${claim.id}`);

    await user.click(await screen.findByText('Notes & Activity'));
    expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Note' })).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Add a note...'), 'Called Aetna, ref 4471');
    await user.click(screen.getByRole('button', { name: 'Add Note' }));
    expect(screen.getByText('Called Aetna, ref 4471')).toBeInTheDocument();
    expect(screen.getByText(/^Note from /)).toBeInTheDocument();
  });

  test('shows the payer status from the claim response', async () => {
    await medplum.createResource<ClaimResponse>({
      resourceType: 'ClaimResponse',
      status: 'active',
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      patient: claim.patient,
      created: daysAgo(1),
      insurer: { display: 'Aetna' },
      outcome: 'complete',
      request: { reference: `Claim/${claim.id}` },
      disposition: 'CO-50: not medically necessary',
      extension: [
        {
          url: SOURCE_CLAIM_STATUS_EXTENSION_URL,
          valueCodeableConcept: { coding: [{ system: CANDID_CLAIM_STATUS_SYSTEM, code: 'finalized_denied' }] },
        },
      ],
    });
    setup(`/Billing/Claims/all/${claim.id}`);

    expect(await screen.findByRole('region', { name: 'Denied' })).toHaveTextContent('CO-50: not medically necessary');
    expect(screen.getByRole('button', { name: 'Appeal' })).toBeDisabled();
  });

  test('runs a bulk action on the checked claims', async () => {
    const user = userEvent.setup();
    setup('/Billing/Claims/all');

    await user.click(await screen.findByLabelText(`Checkbox for ${claim.id}`));
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Bulk Apply' }));
    const dialog = await screen.findByRole('dialog', { name: 'Claim actions · 1 selected' });
    expect(within(dialog).getByRole('radio', { name: /Write off/ })).toBeDisabled();
    await user.click(within(dialog).getByRole('radio', { name: 'Refresh status' }));
    expect(await within(dialog).findByText('Not submitted to Candid')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Refresh status 0 claims' })).toBeDisabled();

    await user.click(within(dialog).getByRole('radio', { name: 'Set follow-up' }));
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('dialog', { name: 'Set follow-up' })).toBeInTheDocument();
  });

  test('loads the claims table once, not on every render', async () => {
    const search = vi.spyOn(medplum, 'search');
    setup('/Billing/Claims/all');

    expect(await within(await screen.findByRole('table')).findByText('Submitted')).toBeInTheDocument();
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    const tableLoads = search.mock.calls.filter(
      ([type, query]) => type === 'Claim' && typeof query === 'string' && query.includes('_sort=created')
    );
    expect(tableLoads).toHaveLength(1);
  });

  test('switches sections from anywhere on the pill tabs', async () => {
    const user = userEvent.setup();
    const { router } = setup('/Billing/Claims/ready');

    await user.click(screen.getByRole('tab', { name: 'Remits' }));
    expect(router.state.location.pathname).toBe('/Billing/Remits');
    expect(screen.getByRole('navigation', { name: 'Remittance views' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Claims' }));
    expect(router.state.location.pathname).toBe('/Billing/Claims');
    expect(within(nav()).getByRole('link', { name: /All Open/ })).toHaveAttribute('aria-current', 'page');
  });

  test('loads the selected queue from its link', async () => {
    await medplum.createResource(newClaim({ status: 'draft', total: { value: 77, currency: 'USD' } }));
    const user = userEvent.setup();
    const { router } = setup('/Billing/Claims/all');

    const table = await screen.findByRole('table');
    await waitFor(() => expect(table.querySelectorAll('tbody tr')).toHaveLength(2));
    await user.click(within(nav()).getByRole('link', { name: /Ready to Submit/ }));
    expect(router.state.location.pathname).toBe('/Billing/Claims/ready');
    await waitFor(() => expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(1));
    expect(within(screen.getByRole('table')).getByText('$77.00')).toBeInTheDocument();
  });

  describe('Remits', () => {
    let remit: WithId<PaymentReconciliation>;

    beforeEach(async () => {
      remit = await medplum.createResource<PaymentReconciliation>({
        resourceType: 'PaymentReconciliation',
        status: 'active',
        created: daysAgo(2),
        paymentDate: daysAgo(2),
        outcome: 'partial',
        paymentIssuer: { display: 'Aetna' },
        paymentIdentifier: { value: 'EFT 1AET928451' },
        paymentAmount: { value: 1240.18, currency: 'USD' },
        detail: [
          {
            type: { coding: [{ code: 'payment' }] },
            request: { reference: `Claim/${claim.id}`, display: 'Homer Simpson' },
            amount: { value: 1282.18, currency: 'USD' },
          },
          {
            type: { coding: [{ code: 'adjustment', display: 'Overpayment recovery' }] },
            identifier: { value: '2026-0812-4471' },
            amount: { value: -42, currency: 'USD' },
          },
        ],
      });
      await medplum.createResource<PaymentReconciliation>({
        resourceType: 'PaymentReconciliation',
        status: 'active',
        created: daysAgo(3),
        paymentDate: daysAgo(3),
        outcome: 'error',
        disposition: 'Duplicate of the Aetna remit posted Oct 6',
        paymentIssuer: { display: 'Cigna' },
        paymentAmount: { value: 50, currency: 'USD' },
      });
    });

    test('lists remittances with their posting status', async () => {
      setup('/Billing/Remits');

      const remitNav = screen.getByRole('navigation', { name: 'Remittance views' });
      expect(within(remitNav).getByText('By Status')).toBeInTheDocument();
      expect(within(remitNav).getByRole('link', { name: /All Remittances/ })).toHaveAttribute('aria-current', 'page');
      expect(await screen.findByText(/EFT 1AET928451/)).toBeInTheDocument();
      expect(screen.getByText('Partially posted', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
      expect(screen.getByText('Posting error', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
    });

    test('keeps voided remittances out of Posted', async () => {
      await medplum.createResource<PaymentReconciliation>({
        resourceType: 'PaymentReconciliation',
        status: 'cancelled',
        created: daysAgo(20),
        paymentDate: daysAgo(20),
        outcome: 'complete',
        paymentIssuer: { display: 'UnitedHealthcare' },
        paymentIdentifier: { value: 'EFT 1UHC329014' },
        paymentAmount: { value: 186.15, currency: 'USD' },
      });
      await medplum.createResource<PaymentReconciliation>({
        resourceType: 'PaymentReconciliation',
        status: 'active',
        created: daysAgo(9),
        paymentDate: daysAgo(9),
        outcome: 'complete',
        paymentIssuer: { display: 'Aetna' },
        paymentIdentifier: { value: 'EFT 1AET000001' },
        paymentAmount: { value: 300, currency: 'USD' },
      });
      setup('/Billing/Remits/posted');

      expect(await screen.findByText(/EFT 1AET000001/)).toBeInTheDocument();
      expect(screen.queryByText(/EFT 1UHC329014/)).not.toBeInTheDocument();
    });

    test('shows unmatched lines as callouts under Partially posted', async () => {
      setup('/Billing/Remits/partial');

      expect(
        await screen.findByText("-$42.00 overpayment recovery (2026-0812-4471) didn't match a claim.")
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Post as adjustment' })).toBeDisabled();
      expect(screen.queryByText('Cigna')).not.toBeInTheDocument();
    });

    test('shows the reason under Posting error', async () => {
      setup('/Billing/Remits/error');

      expect(await screen.findByText('Duplicate of the Aetna remit posted Oct 6')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    });

    test('opens a remittance and follows a line to its claim', async () => {
      const user = userEvent.setup();
      const { router } = setup(`/Billing/Remits/all/${remit.id}`);

      expect(await screen.findByText('Aetna', { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByText('Unmatched', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Homer Simpson' }));
      expect(router.state.location.pathname).toBe(`/Billing/Claims/all/${claim.id}`);
    });

    test('goes back to the remittance view it was opened from', async () => {
      const user = userEvent.setup();
      const { router } = setup(`/Billing/Remits/partial/${remit.id}`);

      expect(await screen.findByText('Aetna', { selector: 'p' })).toBeInTheDocument();
      expect(screen.queryByText('All Remittances', { selector: 'button *' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Back to partially posted' }));
      expect(router.state.location.pathname).toBe('/Billing/Remits/partial');
    });
  });

  test("lists the payers' fee schedules in a modal from the header", async () => {
    const schedule = await medplum.createResource<ChargeItemDefinition>({
      resourceType: 'ChargeItemDefinition',
      url: 'https://example.com/fee-schedules/aetna-2026',
      title: 'Aetna 2026',
      status: 'active',
      meta: { tag: [FEE_SCHEDULE_TAG] },
      useContext: [
        { code: PAYER_USAGE_CONTEXT, valueReference: { reference: 'Organization/aetna', display: 'Aetna' } },
      ],
      effectivePeriod: { start: '2026-01-01', end: '2026-12-31' },
    });
    const user = userEvent.setup();
    const { router } = setup('/Billing/Claims/all');

    await user.click(screen.getByRole('button', { name: 'Fee Schedules' }));
    const modal = await screen.findByRole('dialog', { name: 'Fee Schedules' });
    const row = (await within(modal).findByText('Aetna 2026')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Aetna')).toBeInTheDocument();
    expect(within(row).getByText('active')).toBeInTheDocument();
    expect(within(row).getByText('1/1/2026 – 12/31/2026')).toBeInTheDocument();

    await user.click(within(row).getByText('Aetna 2026'));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ChargeItemDefinition/${schedule.id}`));
  });

  test('sends the configuration gear and old settings links to the app settings', async () => {
    const user = userEvent.setup();
    const { router } = setup('/Billing/Claims/all');

    await user.click(screen.getByRole('link', { name: 'Configuration' }));
    expect(router.state.location.pathname).toBe('/settings/billing');

    await act(async () => {
      await router.navigate('/Billing/Settings/ChargeItems');
    });
    expect(router.state.location.pathname).toBe('/settings/billing');
  });
});
