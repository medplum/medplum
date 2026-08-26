// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Bot, Organization, Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CANDID_PAYER_CATEGORY_SYSTEM,
  CANDID_PAYER_UUID_SYSTEM,
  CHC_PAYER_ID_SYSTEM,
  ORGANIZATION_TYPE_SYSTEM,
  PAYER_ORGANIZATION_TYPE,
} from '../../utils/billing';
import { CANDID_GET_PAYERS_BOT_IDENTIFIER } from '../../utils/candid';
import { PayerList } from './PayerList';

const payersBot: WithId<Bot> = { resourceType: 'Bot', id: 'bot-payers', name: 'Candid Get Payers' };

// A payer Organization as the candid-get-payers bot builds it from Candid's payers.v4 API.
function makeDirectoryPayer(uuid: string, payerId: string, name: string, extras?: Partial<Organization>): Organization {
  return {
    resourceType: 'Organization',
    active: true,
    name,
    type: [{ coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PAYER_ORGANIZATION_TYPE, display: 'Payer' }] }],
    identifier: [
      { system: CANDID_PAYER_UUID_SYSTEM, value: uuid },
      { system: CHC_PAYER_ID_SYSTEM, value: payerId },
    ],
    ...extras,
  };
}

// A search result page as the bot returns it: a Parameters resource of Organizations.
function makeSearchResult(orgs: Organization[], nextPageToken?: string): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      ...orgs.map((org) => ({ name: 'organization', resource: org })),
      ...(nextPageToken ? [{ name: 'nextPageToken', valueString: nextPageToken }] : []),
    ],
  };
}

const importedPayerOrg: Organization = { ...makeDirectoryPayer('uuid-aetna', '60054', 'AETNA'), id: 'org-aetna' };

describe('PayerList', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    notifications.clean();
  });

  const setup = (): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <PayerList />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('lists imported payers, filtering on the Candid payer UUID identifier', async () => {
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockResolvedValue([importedPayerOrg] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);

    setup();

    expect(await screen.findByText('AETNA')).toBeInTheDocument();
    expect(screen.getByText('Imported payers')).toBeInTheDocument();
    expect(screen.getByText('Payer ID 60054')).toBeInTheDocument();
    expect(searchSpy).toHaveBeenCalledWith(
      'Organization',
      expect.objectContaining({ identifier: `${CANDID_PAYER_UUID_SYSTEM}|` })
    );
  });

  test('opens a details modal when an imported payer is tapped', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([importedPayerOrg] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);

    setup();

    await user.click(await screen.findByRole('button', { name: 'View AETNA' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'AETNA' })).toBeInTheDocument();
    // ResourceTable details render inside the modal
    expect(await within(dialog).findByText(/60054/)).toBeInTheDocument();
  });

  test('shows a notice and no search box when the payers bot is not deployed', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    const searchOneSpy = vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);

    setup();

    expect(await screen.findByText(/payer directory bot is not deployed/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Search the payer directory')).not.toBeInTheDocument();
    expect(searchOneSpy).toHaveBeenCalledWith(
      'Bot',
      expect.objectContaining({
        identifier: `${CANDID_GET_PAYERS_BOT_IDENTIFIER.system}|${CANDID_GET_PAYERS_BOT_IDENTIFIER.value}`,
      })
    );
  });

  test('searches the directory and imports selected payers', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);
    const executeSpy = vi
      .spyOn(medplum, 'executeBot')
      .mockResolvedValue(
        makeSearchResult([
          makeDirectoryPayer('uuid-cigna', '62308', 'CIGNA'),
          makeDirectoryPayer('uuid-uhc', '87726', 'UNITED HEALTHCARE'),
        ])
      );
    const createSpy = vi.spyOn(medplum, 'createResource');

    setup();

    await user.type(await screen.findByLabelText('Search the payer directory'), 'cigna');
    await user.click(screen.getByRole('button', { name: /Search/ }));

    expect(await screen.findByText('CIGNA')).toBeInTheDocument();
    expect(executeSpy).toHaveBeenCalledWith(
      'bot-payers',
      expect.objectContaining({ searchTerm: 'cigna' }),
      'application/json'
    );

    await user.click(screen.getByRole('checkbox', { name: /CIGNA/ }));
    await user.click(screen.getByRole('button', { name: /Import selected \(1\)/ }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
    // The bot's Organization is persisted as-is
    expect(createSpy).toHaveBeenCalledWith(makeDirectoryPayer('uuid-cigna', '62308', 'CIGNA'));
  });

  test('marks already-imported payers in search results and blocks re-import', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([importedPayerOrg] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(
      makeSearchResult([makeDirectoryPayer('uuid-aetna', '60054', 'AETNA')])
    );

    setup();

    await user.click(await screen.findByRole('button', { name: /Search/ }));

    expect(await screen.findByLabelText('Imported')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: /AETNA/ });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toBeChecked();
    expect(screen.getByRole('button', { name: /Import selected \(0\)/ })).toBeDisabled();
  });

  test('shows the payer category from the directory entry', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(
      makeSearchResult([
        makeDirectoryPayer('uuid-medicare', '00123', 'MEDICARE OF TEXAS', {
          type: [
            { coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PAYER_ORGANIZATION_TYPE, display: 'Payer' }] },
            { coding: [{ system: CANDID_PAYER_CATEGORY_SYSTEM, code: 'MEDICARE' }] },
          ],
        }),
      ])
    );

    setup();

    await user.click(await screen.findByRole('button', { name: /Search/ }));

    expect(await screen.findByText('MEDICARE OF TEXAS')).toBeInTheDocument();
    expect(screen.getByText('Medicare')).toBeInTheDocument();
  });

  test('opens a details modal with directory metadata when a search result is tapped', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(
      makeSearchResult([
        makeDirectoryPayer('uuid-aetna', '60054', 'AETNA', {
          type: [
            { coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PAYER_ORGANIZATION_TYPE, display: 'Payer' }] },
            { coding: [{ system: CANDID_PAYER_CATEGORY_SYSTEM, code: 'AETNA_AFFILIATED' }] },
          ],
          alias: ['AETNA - PPO', 'AETNA - HMO'],
          address: [{ line: ['PO BOX 981106'], city: 'EL PASO', state: 'TX', postalCode: '79998-1106' }],
          extension: [
            {
              url: 'https://candidhealth.com/fhir/StructureDefinition/eligibility-support',
              valueCode: 'SUPPORTED_ENROLLMENT_NOT_REQUIRED',
            },
            {
              url: 'https://candidhealth.com/fhir/StructureDefinition/remittance-support',
              valueCode: 'SUPPORTED_ENROLLMENT_REQUIRED',
            },
          ],
        }),
      ])
    );

    setup();

    await user.click(await screen.findByRole('button', { name: /Search/ }));
    await user.click(await screen.findByText('AETNA'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('60054')).toBeInTheDocument();
    expect(within(dialog).getByText('Aetna Affiliated')).toBeInTheDocument();
    expect(within(dialog).getByText('PO BOX 981106, EL PASO, TX 79998-1106')).toBeInTheDocument();
    expect(within(dialog).getByText('Eligibility: Supported')).toBeInTheDocument();
    expect(within(dialog).getByText('Remittance: Enrollment required')).toBeInTheDocument();
    expect(within(dialog).getByText(/AETNA - PPO · AETNA - HMO/)).toBeInTheDocument();
    // A search result is not yet imported, so there is nothing to refresh
    expect(within(dialog).queryByRole('button', { name: /Refresh from directory/ })).not.toBeInTheDocument();
  });

  test('clears the search input, results, and selection with the in-field clear button', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(
      makeSearchResult([makeDirectoryPayer('uuid-cigna', '62308', 'CIGNA')])
    );

    setup();

    const input = await screen.findByLabelText('Search the payer directory');
    // No clear button until there is something to clear
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    await user.type(input, 'cigna');
    await user.click(screen.getByRole('button', { name: /Search/ }));
    await user.click(await screen.findByRole('checkbox', { name: /CIGNA/ }));

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(input).toHaveValue('');
    expect(screen.queryByText('CIGNA')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import selected/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  test('refreshes a payer from the details modal, patching directory changes', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([importedPayerOrg] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(makeDirectoryPayer('uuid-aetna', '60054', 'AETNA HEALTH'));
    const patchSpy = vi
      .spyOn(medplum, 'patchResource')
      .mockResolvedValue({ ...importedPayerOrg, name: 'AETNA HEALTH' } as any);

    setup();

    await user.click(await screen.findByRole('button', { name: 'View AETNA' }));
    await user.click(await screen.findByRole('button', { name: /Refresh from directory/ }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('Organization', 'org-aetna', [
        { op: 'add', path: '/name', value: 'AETNA HEALTH' },
      ]);
    });
    // The modal reflects the patched resource
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'AETNA HEALTH' })).toBeInTheDocument();
  });

  test('deactivates a payer missing from the directory when refreshed', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([importedPayerOrg] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(
      new Error('Candid payer fetch (uuid-aetna) failed (EntityNotFoundError): {}')
    );
    const patchSpy = vi
      .spyOn(medplum, 'patchResource')
      .mockResolvedValue({ ...importedPayerOrg, active: false } as any);

    setup();

    await user.click(await screen.findByRole('button', { name: 'View AETNA' }));
    await user.click(await screen.findByRole('button', { name: /Refresh from directory/ }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('Organization', 'org-aetna', [
        { op: 'add', path: '/active', value: false },
      ]);
    });
  });

  test('shows an inactive badge on payers no longer in the directory', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([{ ...importedPayerOrg, active: false }] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);

    setup();

    expect(await screen.findByText('Inactive — not in payer directory')).toBeInTheDocument();
  });

  test('navigates result pages with the pagination control, refetching only uncached pages', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(payersBot);
    const executeSpy = vi
      .spyOn(medplum, 'executeBot')
      .mockResolvedValueOnce(makeSearchResult([makeDirectoryPayer('uuid-1', '1', 'PAYER ONE')], 'tok-2'))
      .mockResolvedValueOnce(makeSearchResult([makeDirectoryPayer('uuid-2', '2', 'PAYER TWO')]));

    setup();

    await user.click(await screen.findByRole('button', { name: /Search/ }));
    expect(await screen.findByText('PAYER ONE')).toBeInTheDocument();
    // One cached page plus one reachable via the next-page token
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));

    expect(await screen.findByText('PAYER TWO')).toBeInTheDocument();
    // The table shows one page at a time
    expect(screen.queryByText('PAYER ONE')).not.toBeInTheDocument();
    expect(executeSpy).toHaveBeenLastCalledWith(
      'bot-payers',
      expect.objectContaining({ pageToken: 'tok-2' }),
      'application/json'
    );
    // No further pages beyond the two cached ones
    expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '1' }));
    expect(await screen.findByText('PAYER ONE')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));
    expect(await screen.findByText('PAYER TWO')).toBeInTheDocument();
    // Cached pages are not refetched: one search call + one page fetch total
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });
});
