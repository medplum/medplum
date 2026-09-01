// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Bot, Organization, Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  EIN_SYSTEM,
  MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
  NPI_SYSTEM,
  ORGANIZATION_TYPE_SYSTEM,
  PAYER_ORGANIZATION_TYPE,
  PROVIDER_ORGANIZATION_TYPE,
} from '../../utils/billing';
import {
  CANDID_BILLING_ORGANIZATION_PROFILE,
  CANDID_CREATE_PROVIDER_BOT_IDENTIFIER,
  CANDID_GET_PAYERS_BOT_IDENTIFIER,
  CANDID_IS_BILLING_PROVIDER_EXTENSION,
  CANDID_IS_RENDERING_PROVIDER_EXTENSION,
  CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM,
  CANDID_PAYER_CATEGORY_SYSTEM,
  CANDID_PAYER_UUID_SYSTEM,
  CHC_PAYER_ID_SYSTEM,
} from '../../utils/candid';
import { BillingSetupPage } from './BillingSetupPage';

const payersBot: WithId<Bot> = { resourceType: 'Bot', id: 'bot-payers', name: 'Candid Get Payers' };
const createProviderBot: WithId<Bot> = {
  resourceType: 'Bot',
  id: 'bot-create-provider',
  name: 'Candid Create Provider',
};

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

// A billing organization as the modal saves it.
const billingOrg: WithId<Organization> = {
  resourceType: 'Organization',
  id: 'org-practice',
  name: 'Test Medical Practice LLC',
  type: [{ coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PROVIDER_ORGANIZATION_TYPE }] }],
  identifier: [
    { system: NPI_SYSTEM, value: '3564119220' },
    { system: EIN_SYSTEM, value: '123456789' },
    { system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE },
  ],
  telecom: [{ system: 'phone', value: '6175550142' }],
  address: [{ line: ['456 Medical Center Drive'], city: 'Boston', state: 'MA', postalCode: '02101' }],
};

// More billing organizations than fit on one page.
function manyOrganizations(): WithId<Organization>[] {
  return Array.from({ length: 12 }, (_, i) => ({
    ...billingOrg,
    id: `org-${i}`,
    name: `PRACTICE ${String(i).padStart(2, '0')}`,
  }));
}

// Both lists are search controls over Organization and pass their search as a query string; pick
// out the queries the list filtering on the given identifier system sent.
function searchQueries(searchSpy: ReturnType<typeof vi.spyOn>, identifierSystem: string): URLSearchParams[] {
  return (searchSpy.mock.calls as unknown[][])
    .map((call) => new URLSearchParams(call[1] as string))
    .filter((params: URLSearchParams) => (params.get('identifier') ?? '').startsWith(identifierSystem));
}

describe('BillingSetupPage', () => {
  let medplum: MockClient;

  // Both lists are search controls over Organization, and the payer directory reads its imported
  // payers through searchResources; route every search by the identifier it filters on so a tab
  // only ever sees its own resources. Search controls page server-side, so serve the requested
  // window and report the full count on the bundle.
  const mockSearches = (
    resources: { organizations?: Organization[]; payers?: Organization[] } = {}
  ): ReturnType<typeof vi.spyOn> => {
    vi.spyOn(medplum, 'searchResources').mockImplementation((async () => resources.payers ?? []) as any);
    return vi.spyOn(medplum, 'search').mockImplementation((async (_resourceType: string, query: string) => {
      const params = new URLSearchParams(query);
      const all = (params.get('identifier') ?? '').startsWith(MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM)
        ? (resources.organizations ?? [])
        : (resources.payers ?? []);
      const offset = Number(params.get('_offset') ?? 0);
      const count = Number(params.get('_count') ?? all.length);
      return {
        resourceType: 'Bundle',
        type: 'searchset',
        total: all.length,
        entry: all.slice(offset, offset + count).map((resource) => ({ resource })),
      };
    }) as any);
  };

  // Each tab looks up its own Candid bot by identifier, so a project can have the payer directory
  // deployed without the provider registration bot, and vice versa.
  const mockBots = (bots: { payers?: boolean; createProvider?: boolean } = {}): ReturnType<typeof vi.spyOn> =>
    vi.spyOn(medplum, 'searchOne').mockImplementation((async (_resourceType: string, query: any) => {
      const identifier = ((query?.identifier as string) ?? '').split('|')[1];
      if (identifier === CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.value) {
        return bots.createProvider ? createProviderBot : undefined;
      }
      return bots.payers ? payersBot : undefined;
    }) as any);

  beforeEach(() => {
    medplum = new MockClient();
    notifications.clean();
    // Every tab issues its search on each render of the page, whichever tab is open.
    mockSearches();
  });

  // Phone and address are required, so every save has to fill them in. AddressInput labels its
  // fields with placeholders, not labels.
  const fillPhoneAndAddress = async (user: UserEvent, dialog: HTMLElement, phone = '6175550142'): Promise<void> => {
    await user.type(within(dialog).getByLabelText(/Phone/), phone);
    await user.type(within(dialog).getByPlaceholderText('Line 1'), '456 Medical Center Drive');
    await user.type(within(dialog).getByPlaceholderText('City'), 'Boston');
    await user.type(within(dialog).getByPlaceholderText('State'), 'MA');
    await user.type(within(dialog).getByPlaceholderText('Postal Code'), '02101');
  };

  // LinkTabs reads the initial tab from the URL, so a test can open the page straight on the tab
  // it exercises: Mantine keeps inactive panels in the DOM, but hidden from role queries.
  const setup = (tab = 'Organizations'): ReturnType<typeof render> => {
    window.history.pushState({}, '', `/Settings/Billing/${tab}`);
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum} navigate={() => {}}>
          <MantineProvider>
            <BillingSetupPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders the three billing tabs, billing organizations first', async () => {
    const user = userEvent.setup();
    mockBots();

    setup();

    expect(screen.getByText('Billing Settings')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Billing Organizations' })).toHaveAttribute('aria-selected', 'true');
    // Both lists render an empty search control, so look only at the open tab's panel
    expect(await within(screen.getByRole('tabpanel')).findByText('No results')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Enrolled Payers' }));
    expect(await within(screen.getByRole('tabpanel')).findByText('No results')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
    expect(await screen.findByText(/payer directory bot is not deployed/)).toBeInTheDocument();
  });

  test('lists billing organizations, filtering on the provider-app marker identifier', async () => {
    const searchSpy = mockSearches({ organizations: [billingOrg] });
    mockBots({ payers: true });

    setup();

    expect(await screen.findByText('Test Medical Practice LLC')).toBeInTheDocument();
    expect(screen.getByText('3564119220')).toBeInTheDocument();
    expect(screen.getByText('123456789')).toBeInTheDocument();
    // The address and telecom columns render off datatypes the client loads separately, so they can
    // land a tick after the row itself
    expect(await screen.findByText(/456 Medical Center Drive/)).toBeInTheDocument();
    expect(await screen.findByText(/6175550142/)).toBeInTheDocument();
    // Filters on the marker identifier, not on organization type or NPI, so unrelated
    // Organizations never appear and a misconfigured billing organization stays visible
    expect(searchQueries(searchSpy, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM)[0]?.get('identifier')).toBe(
      `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`
    );
  });

  test('pages billing organizations server-side, 10 per page', async () => {
    const user = userEvent.setup();
    const searchSpy = mockSearches({ organizations: manyOrganizations() });
    mockBots({ payers: true });

    setup();

    expect(await screen.findByText('PRACTICE 00')).toBeInTheDocument();
    expect(screen.getByText('PRACTICE 09')).toBeInTheDocument();
    expect(screen.queryByText('PRACTICE 10')).not.toBeInTheDocument();
    const firstQuery = searchQueries(searchSpy, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM)[0];
    expect(firstQuery?.get('_count')).toBe('10');
    expect(firstQuery?.get('_total')).toBe('accurate');

    await user.click(screen.getByRole('button', { name: '2' }));

    // The second page is fetched, not sliced out of the first
    expect(await screen.findByText('PRACTICE 10')).toBeInTheDocument();
    expect(screen.getByText('PRACTICE 11')).toBeInTheDocument();
    expect(screen.queryByText('PRACTICE 00')).not.toBeInTheDocument();
    expect(searchQueries(searchSpy, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM).at(-1)?.get('_offset')).toBe('10');
  });

  test('refetches the list after a save so the new organization appears', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    vi.spyOn(medplum, 'createResource').mockResolvedValue(billingOrg);

    setup();

    expect(await within(screen.getByRole('tabpanel')).findByText('No results')).toBeInTheDocument();

    // The saved organization is only visible to the next search
    mockSearches({ organizations: [billingOrg] });
    await user.click(screen.getByRole('button', { name: 'New...' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Test Medical Practice LLC');
    await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
    await user.type(within(dialog).getByLabelText(/Tax ID/), '123456789');
    await fillPhoneAndAddress(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Test Medical Practice LLC')).toBeInTheDocument();
  });

  test('flags a billing organization missing its NPI', async () => {
    mockSearches({ organizations: [{ ...billingOrg, identifier: [] }] });
    mockBots({ payers: true });

    setup();

    expect(await screen.findByText(/Missing NPI/)).toBeInTheDocument();
  });

  test('creates a billing organization with the prov type and normalized identifiers', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(billingOrg);

    setup();

    await user.click(await screen.findByRole('button', { name: 'New...' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Test Medical Practice LLC');
    await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
    await user.type(within(dialog).getByLabelText(/Tax ID/), '12-3456789');
    await fillPhoneAndAddress(user, dialog, '(617) 555-0142');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
    const created = createSpy.mock.calls[0][0] as Organization;
    expect(created.name).toBe('Test Medical Practice LLC');
    expect(created.identifier).toEqual([
      { system: NPI_SYSTEM, value: '3564119220' },
      { system: EIN_SYSTEM, value: '123456789' },
      { system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE },
    ]);
    expect(created.type?.[0]?.coding?.[0]?.code).toBe(PROVIDER_ORGANIZATION_TYPE);
    expect(created.meta?.profile).toEqual([CANDID_BILLING_ORGANIZATION_PROFILE]);
    expect(created.telecom).toEqual([{ system: 'phone', value: '(617) 555-0142' }]);
    // The modal closes on a successful save
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('blocks save on a malformed NPI, missing Tax ID, and an unusable phone', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    const createSpy = vi.spyOn(medplum, 'createResource');

    setup();

    await user.click(await screen.findByRole('button', { name: 'New...' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Bad Org');
    await user.type(within(dialog).getByLabelText(/NPI/), '12345');
    await user.type(within(dialog).getByLabelText(/Phone/), '1234567890');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('NPI must be 10 digits')).toBeInTheDocument();
    expect(screen.getByText('Tax ID (EIN) must be 9 digits, e.g. 12-3456789')).toBeInTheDocument();
    expect(screen.getByText('Phone must be 10 digits and not start with 0 or 1')).toBeInTheDocument();
    expect(screen.getByText('Address needs a street, city, two-letter state, and ZIP')).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('edits a billing organization, preserving identifiers from other systems', async () => {
    const user = userEvent.setup();
    const existing: WithId<Organization> = {
      ...billingOrg,
      identifier: [{ system: 'https://example.com/legacy-id', value: 'legacy' }, ...(billingOrg.identifier ?? [])],
    };
    mockSearches({ organizations: [existing] });
    mockBots({ payers: true });
    const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(existing);

    setup();

    await user.click(await screen.findByText('Test Medical Practice LLC'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit billing organization' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/NPI/)).toHaveValue('3564119220');

    const nameInput = within(dialog).getByLabelText(/^Name/);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Practice LLC');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });
    const updated = updateSpy.mock.calls[0][0] as Organization;
    expect(updated.id).toBe('org-practice');
    expect(updated.name).toBe('Renamed Practice LLC');
    expect(updated.identifier).toEqual(
      expect.arrayContaining([{ system: 'https://example.com/legacy-id', value: 'legacy' }])
    );
  });

  test('lists imported payers, filtering on the Candid payer UUID identifier', async () => {
    const searchSpy = mockSearches({ payers: [importedPayerOrg] });
    mockBots({ payers: true });

    setup('Payers');

    expect(await screen.findByText('AETNA')).toBeInTheDocument();
    expect(screen.getByText('60054')).toBeInTheDocument();
    expect(searchQueries(searchSpy, CANDID_PAYER_UUID_SYSTEM)[0]?.get('identifier')).toBe(
      `${CANDID_PAYER_UUID_SYSTEM}|`
    );
  });

  test('opens a details modal when an imported payer is tapped', async () => {
    const user = userEvent.setup();
    mockSearches({ payers: [importedPayerOrg] });
    mockBots({ payers: true });

    setup('Payers');

    await user.click(await screen.findByText('AETNA'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'AETNA' })).toBeInTheDocument();
    expect(await within(dialog).findByText(/60054/)).toBeInTheDocument();
  });

  test('registers a new organization with Candid when the create-provider bot is deployed', async () => {
    const user = userEvent.setup();
    mockBots({ createProvider: true });
    const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(billingOrg);
    const executeSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue({});

    setup();

    await user.click(await screen.findByRole('button', { name: 'New...' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Saving registers this organization with Candid/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Name/), 'Test Medical Practice LLC');
    await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
    await user.type(within(dialog).getByLabelText(/Tax ID/), '123456789');
    await fillPhoneAndAddress(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled();
    });
    // Candid requires the billing/rendering flags, so they are persisted before registering
    const created = createSpy.mock.calls[0][0] as Organization;
    expect(created.extension).toEqual([
      { url: CANDID_IS_BILLING_PROVIDER_EXTENSION, valueBoolean: true },
      { url: CANDID_IS_RENDERING_PROVIDER_EXTENSION, valueBoolean: false },
    ]);
    // The bot registers the stored resource: it stamps the Candid provider ID back onto it
    expect(executeSpy).toHaveBeenCalledWith(
      'bot-create-provider',
      expect.objectContaining({ resourceType: 'Organization', id: 'org-practice' }),
      'application/fhir+json'
    );
  });

  test('does not touch Candid when the create-provider bot is not deployed', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(billingOrg);
    const executeSpy = vi.spyOn(medplum, 'executeBot');

    setup();

    await user.click(await screen.findByRole('button', { name: 'New...' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/Saving registers this organization with Candid/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Name/), 'Test Medical Practice LLC');
    await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
    await user.type(within(dialog).getByLabelText(/Tax ID/), '123456789');
    await fillPhoneAndAddress(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
    expect((createSpy.mock.calls[0][0] as Organization).extension).toBeUndefined();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test('keeps the organization when Candid registration fails, and flags it as unregistered', async () => {
    const user = userEvent.setup();
    mockSearches({ organizations: [billingOrg] });
    mockBots({ createProvider: true });
    const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(billingOrg);
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(new Error('NPI already registered'));

    setup();

    await user.click(await screen.findByRole('button', { name: 'New...' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Test Medical Practice LLC');
    await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
    await user.type(within(dialog).getByLabelText(/Tax ID/), '123456789');
    await fillPhoneAndAddress(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // The Organization is kept and marked so the failed registration can be retried by saving again
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
    expect(await screen.findByText(/Not registered with Candid/)).toBeInTheDocument();
  });

  test('does not re-register an organization that already has a Candid provider ID', async () => {
    const user = userEvent.setup();
    const registered: WithId<Organization> = {
      ...billingOrg,
      identifier: [
        ...(billingOrg.identifier ?? []),
        { system: CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM, value: 'candid-provider-1' },
      ],
    };
    mockSearches({ organizations: [registered] });
    mockBots({ createProvider: true });
    const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(registered);
    const executeSpy = vi.spyOn(medplum, 'executeBot');

    setup();

    await user.click(await screen.findByText('Test Medical Practice LLC'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/Saving registers this organization with Candid/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not registered with Candid/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test('blocks save on an address Candid would reject', async () => {
    const user = userEvent.setup();
    mockSearches({ organizations: [{ ...billingOrg, address: [{ city: 'Boston' }] }] });
    mockBots({ createProvider: true });
    const updateSpy = vi.spyOn(medplum, 'updateResource');

    setup();

    await user.click(await screen.findByText('Test Medical Practice LLC'));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Address needs a street, city, two-letter state, and ZIP')).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('shows a notice and no search box when the payers bot is not deployed', async () => {
    const user = userEvent.setup();
    const searchOneSpy = mockBots();

    setup();

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));

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
    mockBots({ payers: true });
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

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
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
    mockSearches({ payers: [importedPayerOrg] });
    mockBots({ payers: true });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(
      makeSearchResult([makeDirectoryPayer('uuid-aetna', '60054', 'AETNA')])
    );

    setup();

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
    await user.click(await screen.findByRole('button', { name: /Search/ }));

    expect(await screen.findByLabelText('Imported')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: /AETNA/ });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toBeChecked();
    expect(screen.getByRole('button', { name: /Import selected \(0\)/ })).toBeDisabled();
  });

  test('shows the payer category from the directory entry', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
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

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
    await user.click(await screen.findByRole('button', { name: /Search/ }));

    expect(await screen.findByText('MEDICARE OF TEXAS')).toBeInTheDocument();
    expect(screen.getByText('Medicare')).toBeInTheDocument();
  });

  test('opens a details modal with directory metadata when a search result is tapped', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
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

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
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

  test('shows a loader on the search button while a search is in flight, including re-searches', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    let resolveSearch: (result: Parameters) => void = () => {};
    vi.spyOn(medplum, 'executeBot').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }) as any
    );

    setup();

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
    const searchButton = await screen.findByRole('button', { name: /Search/ });

    await user.click(searchButton);
    expect(searchButton).toHaveAttribute('data-loading');

    resolveSearch(makeSearchResult([makeDirectoryPayer('uuid-cigna', '62308', 'CIGNA')]));
    expect(await screen.findByText('CIGNA')).toBeInTheDocument();
    expect(searchButton).not.toHaveAttribute('data-loading');

    // Searching again with results on screen still shows the loader
    await user.click(searchButton);
    expect(searchButton).toHaveAttribute('data-loading');
  });

  test('does not start a second search when Enter is pressed while one is in flight', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    const executeSpy = vi.spyOn(medplum, 'executeBot').mockImplementation(() => new Promise(() => {}) as any);

    setup();

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
    const input = await screen.findByLabelText('Search the payer directory');

    await user.type(input, 'cigna{Enter}');
    await user.type(input, '{Enter}');

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  test('retires the extra page when the directory has no further results', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    const firstBatch = Array.from({ length: 20 }, (_, i) =>
      makeDirectoryPayer(`uuid-${i}`, `${i}`, `PAYER ${String(i).padStart(2, '0')}`)
    );
    vi.spyOn(medplum, 'executeBot')
      .mockResolvedValueOnce(makeSearchResult(firstBatch, 'tok-2'))
      .mockResolvedValue(makeSearchResult([], 'tok-3'));

    setup();

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
    await user.click(await screen.findByRole('button', { name: /Search/ }));
    expect(await screen.findByText('PAYER 00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));

    // Nothing came back, so the page-2 button is gone instead of repeating the empty fetch
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('PAYER 00')).toBeInTheDocument();
  });

  test('clears the search input, results, and selection with the in-field clear button', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(
      makeSearchResult([makeDirectoryPayer('uuid-cigna', '62308', 'CIGNA')])
    );

    setup();

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
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
    mockSearches({ payers: [importedPayerOrg] });
    mockBots({ payers: true });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(makeDirectoryPayer('uuid-aetna', '60054', 'AETNA HEALTH'));
    const patchSpy = vi
      .spyOn(medplum, 'patchResource')
      .mockResolvedValue({ ...importedPayerOrg, name: 'AETNA HEALTH' } as any);

    setup('Payers');

    await user.click(await screen.findByText('AETNA'));
    // The patched payer is only visible to the next search
    mockSearches({ payers: [{ ...importedPayerOrg, name: 'AETNA HEALTH' }] });
    await user.click(await screen.findByRole('button', { name: /Refresh from directory/ }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('Organization', 'org-aetna', [
        { op: 'add', path: '/name', value: 'AETNA HEALTH' },
      ]);
    });
    // The modal reflects the patched resource
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'AETNA HEALTH' })).toBeInTheDocument();
    // ...and so does the list, refetched under the patched name
    await waitFor(() => {
      expect(screen.queryByText('AETNA')).not.toBeInTheDocument();
    });
  });

  test('deactivates a payer missing from the directory when refreshed', async () => {
    const user = userEvent.setup();
    mockSearches({ payers: [importedPayerOrg] });
    mockBots({ payers: true });
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(
      new Error('Candid payer fetch (uuid-aetna) failed (EntityNotFoundError): {}')
    );
    const patchSpy = vi
      .spyOn(medplum, 'patchResource')
      .mockResolvedValue({ ...importedPayerOrg, active: false } as any);

    setup('Payers');

    await user.click(await screen.findByText('AETNA'));
    await user.click(await screen.findByRole('button', { name: /Refresh from directory/ }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('Organization', 'org-aetna', [
        { op: 'add', path: '/active', value: false },
      ]);
    });
  });

  test('shows an inactive badge on payers no longer in the directory', async () => {
    mockSearches({ payers: [{ ...importedPayerOrg, active: false }] });
    mockBots({ payers: true });

    setup('Payers');

    expect(await screen.findByText('Inactive — not in payer directory')).toBeInTheDocument();
  });

  test('paginates imported payers, 10 per page', async () => {
    const user = userEvent.setup();
    const manyPayers = Array.from({ length: 12 }, (_, i) => ({
      ...makeDirectoryPayer(`uuid-${i}`, `id-${i}`, `PAYER ${String(i).padStart(2, '0')}`),
      id: `org-${i}`,
    }));
    mockSearches({ payers: manyPayers });
    mockBots({ payers: true });

    setup('Payers');

    expect(await screen.findByText('PAYER 00')).toBeInTheDocument();
    expect(screen.getByText('PAYER 09')).toBeInTheDocument();
    expect(screen.queryByText('PAYER 10')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));

    expect(await screen.findByText('PAYER 10')).toBeInTheDocument();
    expect(screen.getByText('PAYER 11')).toBeInTheDocument();
    expect(screen.queryByText('PAYER 00')).not.toBeInTheDocument();
  });

  test('navigates result pages with the pagination control, fetching new batches only when needed', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    // 20 results fill display page 1; the next-page token makes page 2 reachable
    const firstBatch = Array.from({ length: 20 }, (_, i) =>
      makeDirectoryPayer(`uuid-${i}`, `${i}`, `PAYER ${String(i).padStart(2, '0')}`)
    );
    const executeSpy = vi
      .spyOn(medplum, 'executeBot')
      .mockResolvedValueOnce(makeSearchResult(firstBatch, 'tok-2'))
      .mockResolvedValueOnce(makeSearchResult([makeDirectoryPayer('uuid-20', '20', 'PAYER 20')]));

    setup();

    await user.click(screen.getByRole('tab', { name: 'Candid Payer Directory' }));
    await user.click(await screen.findByRole('button', { name: /Search/ }));
    expect(await screen.findByText('PAYER 00')).toBeInTheDocument();
    // One loaded page plus one reachable via the next-page token
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));

    expect(await screen.findByText('PAYER 20')).toBeInTheDocument();
    // The table shows one page at a time
    expect(screen.queryByText('PAYER 00')).not.toBeInTheDocument();
    expect(executeSpy).toHaveBeenLastCalledWith(
      'bot-payers',
      expect.objectContaining({ pageToken: 'tok-2' }),
      'application/json'
    );
    // No further pages beyond the loaded ones
    expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '1' }));
    expect(await screen.findByText('PAYER 00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));
    expect(await screen.findByText('PAYER 20')).toBeInTheDocument();
    // Loaded pages are not refetched: one search call + one batch fetch total
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });
});
