// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type {
  Bot,
  Contract,
  Organization,
  Parameters,
  Practitioner,
  PractitionerRole,
  Resource,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  BILLING_PRACTITIONER_IDENTIFIER_VALUE,
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
  CANDID_EDIT_PROVIDER_BOT_IDENTIFIER,
  CANDID_GET_CONTRACTS_BOT_IDENTIFIER,
  CANDID_GET_PAYERS_BOT_IDENTIFIER,
  CANDID_IS_BILLING_PROVIDER_EXTENSION,
  CANDID_IS_RENDERING_PROVIDER_EXTENSION,
  CANDID_LIST_PROVIDERS_BOT_IDENTIFIER,
  CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM,
  CANDID_PAYER_CATEGORY_SYSTEM,
  CANDID_PAYER_UUID_SYSTEM,
  CANDID_PRACTITIONER_PROFILE,
  CHC_PAYER_ID_SYSTEM,
} from '../../utils/candid';
import { BillingSetupPage } from './BillingSetupPage';

const payersBot: WithId<Bot> = { resourceType: 'Bot', id: 'bot-payers', name: 'Candid Get Payers' };
const createProviderBot: WithId<Bot> = {
  resourceType: 'Bot',
  id: 'bot-create-provider',
  name: 'Candid Create Provider',
};
const listProvidersBot: WithId<Bot> = { resourceType: 'Bot', id: 'bot-list-providers', name: 'Candid List Providers' };
const editProviderBot: WithId<Bot> = { resourceType: 'Bot', id: 'bot-edit-provider', name: 'Candid Edit Provider' };
const contractsBot: WithId<Bot> = { resourceType: 'Bot', id: 'bot-contracts', name: 'Candid Get Contracts' };

/**
 * What candid-list-providers returns: the providers Candid holds for an NPI, as FHIR resources.
 * @param providers - The providers Candid holds for the NPI.
 * @returns The bot's Parameters response.
 */
function makeProviderSearchResult(providers: (Organization | Practitioner)[]): Parameters {
  return { resourceType: 'Parameters', parameter: providers.map((resource) => ({ name: 'provider', resource })) };
}

/**
 * A payer contract as candid-get-contracts maps it: executed and open-ended unless told otherwise.
 * @param payerName - The payer the contract stands under.
 * @param overrides - Fields to change from an effective, open-ended contract that started this year.
 * @returns The Contract resource.
 */
function makeContract(payerName: string, overrides: Partial<Contract> = {}): Contract {
  return {
    resourceType: 'Contract',
    status: 'executed',
    applies: { start: '2026-01-01' },
    subject: [{ identifier: { system: CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM, value: 'cand-org-1' } }],
    authority: [
      { type: 'Organization', identifier: { system: CANDID_PAYER_UUID_SYSTEM, value: 'uuid' }, display: payerName },
    ],
    ...overrides,
  };
}

/**
 * What candid-get-contracts returns for a contract search.
 * @param contracts - The contracts Candid holds for the query.
 * @returns The bot's Parameters response.
 */
function makeContractsResult(contracts: Contract[]): Parameters {
  return { resourceType: 'Parameters', parameter: contracts.map((resource) => ({ name: 'contract', resource })) };
}

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

const importedPayerOrg: WithId<Organization> = {
  ...makeDirectoryPayer('uuid-aetna', '60054', 'AETNA'),
  id: 'org-aetna',
};

/** A billing organization as the modal saves it. */
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

/** An organization created outside billing settings: no billing marker, no NPI, no phone. */
const clinicOrg: WithId<Organization> = {
  resourceType: 'Organization',
  id: 'org-clinic',
  name: 'Downtown Clinic',
  identifier: [{ system: 'https://example.com/legacy-id', value: 'clinic-7' }],
  address: [{ line: ['9 Harbor St'], city: 'Boston', state: 'MA', postalCode: '02110' }],
};

const drSmith: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'prac-smith',
  name: [{ given: ['Alice'], family: 'Smith' }],
  identifier: [{ system: NPI_SYSTEM, value: '1234567893' }],
};

/** A practitioner nobody has set up for billing yet. */
const drJones: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'prac-jones',
  name: [{ given: ['Bob'], family: 'Jones' }],
};

/**
 * Billing individually: the practitioner is the billing provider, so they carry their own tax ID
 * and address rather than an organization's.
 */
const drDiaz: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'prac-diaz',
  name: [{ given: ['Cara'], family: 'Diaz' }],
  identifier: [
    { system: NPI_SYSTEM, value: '1987654321' },
    { system: EIN_SYSTEM, value: '123456789' },
  ],
  address: [{ line: ['1 Clinic Way'], city: 'Boston', state: 'MA', postalCode: '02101' }],
};

const smithBillsUnderPractice: WithId<PractitionerRole> = {
  resourceType: 'PractitionerRole',
  id: 'role-smith',
  active: true,
  practitioner: { reference: 'Practitioner/prac-smith' },
  organization: { reference: 'Organization/org-practice', display: 'Test Medical Practice LLC' },
};

/**
 * More billing organizations than fit on one page.
 * @returns Twelve billing organizations.
 */
function manyOrganizations(): WithId<Organization>[] {
  return Array.from({ length: 12 }, (_, i) => ({
    ...billingOrg,
    id: `org-${i}`,
    name: `PRACTICE ${String(i).padStart(2, '0')}`,
  }));
}

/**
 * Both lists are search controls over Organization and pass their search as a query string; pick
 * out the queries the list filtering on the given identifier system sent.
 * @param searchSpy - The spy on the client's search method.
 * @param identifierSystem - The identifier system the list filters on.
 * @returns The query strings that list sent.
 */
function searchQueries(searchSpy: ReturnType<typeof vi.spyOn>, identifierSystem: string): URLSearchParams[] {
  return (searchSpy.mock.calls as unknown[][])
    .map((call) => new URLSearchParams(call[1] as string))
    .filter((params: URLSearchParams) => (params.get('identifier') ?? '').startsWith(identifierSystem));
}

describe('BillingSetupPage', () => {
  let medplum: MockClient;

  const mockSearches = (
    resources: {
      organizations?: Organization[];
      /** Organizations without the billing marker, served to the existing organization picker. */
      otherOrganizations?: Organization[];
      payers?: Organization[];
      practitioners?: Practitioner[];
      roles?: PractitionerRole[];
    } = {}
  ): ReturnType<typeof vi.spyOn> => {
    const route = (resourceType: string, params: URLSearchParams): Resource[] => {
      if (resourceType === 'Practitioner') {
        return resources.practitioners ?? [];
      }
      if (resourceType === 'PractitionerRole') {
        return (resources.roles ?? []).filter((role) => params.get('active') !== 'true' || role.active === true);
      }
      if (params.has('identifier:not')) {
        return resources.otherOrganizations ?? [];
      }
      return (params.get('identifier') ?? '').startsWith(MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM)
        ? (resources.organizations ?? [])
        : (resources.payers ?? []);
    };
    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string, query: any) =>
      route(resourceType, new URLSearchParams(query))) as any);
    return vi.spyOn(medplum, 'search').mockImplementation((async (resourceType: string, query: string) => {
      const params = new URLSearchParams(query);
      const all = route(resourceType, params);
      const offset = Number(params.get('_offset') ?? 0);
      const count = Number(params.get('_count') ?? all.length);
      const nextParams = new URLSearchParams(params);
      nextParams.set('_offset', String(offset + count));
      return {
        resourceType: 'Bundle',
        type: 'searchset',
        total: all.length,
        entry: all.slice(offset, offset + count).map((resource) => ({ resource })),
        link:
          offset + count < all.length
            ? [{ relation: 'next', url: `${medplum.fhirUrl(resourceType)}?${nextParams}` }]
            : undefined,
      };
    }) as any);
  };

  const mockBots = (
    bots: {
      payers?: boolean;
      createProvider?: boolean;
      editProvider?: boolean;
      listProviders?: boolean;
      getContracts?: boolean;
    } = {}
  ): ReturnType<typeof vi.spyOn> =>
    vi.spyOn(medplum, 'searchOne').mockImplementation((async (resourceType: string, query: any) => {
      if (resourceType !== 'Bot') {
        return undefined;
      }
      const identifier = ((query?.identifier as string) ?? '').split('|')[1];
      if (identifier === CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.value) {
        return bots.createProvider ? createProviderBot : undefined;
      }
      if (identifier === CANDID_EDIT_PROVIDER_BOT_IDENTIFIER.value) {
        return bots.editProvider ? editProviderBot : undefined;
      }
      if (identifier === CANDID_LIST_PROVIDERS_BOT_IDENTIFIER.value) {
        return bots.listProviders ? listProvidersBot : undefined;
      }
      if (identifier === CANDID_GET_CONTRACTS_BOT_IDENTIFIER.value) {
        return bots.getContracts ? contractsBot : undefined;
      }
      return bots.payers ? payersBot : undefined;
    }) as any);

  beforeEach(() => {
    medplum = new MockClient();
    notifications.clean();
    mockSearches();
  });

  const fillPhoneAndAddress = async (user: UserEvent, dialog: HTMLElement, phone = '6175550142'): Promise<void> => {
    await user.type(within(dialog).getByLabelText(/Phone/), phone);
    await user.type(within(dialog).getByPlaceholderText('Line 1'), '456 Medical Center Drive');
    await user.type(within(dialog).getByPlaceholderText('City'), 'Boston');
    await user.type(within(dialog).getByPlaceholderText('State'), 'MA');
    await user.type(within(dialog).getByPlaceholderText('Postal Code'), '02101');
  };

  const fillPractitionerBillingIdentity = async (user: UserEvent, dialog: HTMLElement): Promise<void> => {
    await user.type(within(dialog).getByLabelText(/Tax ID/), '123456789');
    await user.type(within(dialog).getByPlaceholderText('Line 1'), '1 Clinic Way');
    await user.type(within(dialog).getByPlaceholderText('City'), 'Boston');
    await user.type(within(dialog).getByPlaceholderText('State'), 'MA');
    await user.type(within(dialog).getByPlaceholderText('Postal Code'), '02101');
  };

  const setup = (
    tab = 'Organizations'
  ): ReturnType<typeof render> & { router: ReturnType<typeof createMemoryRouter> } => {
    const router = createMemoryRouter([{ path: '/Settings/Billing/*', element: <BillingSetupPage /> }], {
      initialEntries: [`/Settings/Billing/${tab}`],
    });
    const result = render(
      <MedplumProvider medplum={medplum} navigate={router.navigate}>
        <MantineProvider>
          <RouterProvider router={router} />
        </MantineProvider>
      </MedplumProvider>
    );
    return { ...result, router };
  };

  test('renders the four billing tabs, billing organizations first', async () => {
    const user = userEvent.setup();
    mockBots();

    setup();

    expect(screen.getByText('Billing Settings')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Billing Organizations' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'Enrolled Payers' })).toHaveAttribute(
      'href',
      '/Settings/Billing/Payers/Organization'
    );
    expect(await within(screen.getByRole('tabpanel')).findByText('No results')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Enrolled Payers' }));
    expect(await within(screen.getByRole('tabpanel')).findByText('No results')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
    expect(await screen.findByText(/payer directory bot is not deployed/)).toBeInTheDocument();
  });

  test('syncs the selected tab with navigation and browser history', async () => {
    const user = userEvent.setup();
    mockBots();
    const { router } = setup('Practitioners');

    expect(screen.getByRole('tab', { name: 'Billing Practitioners' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Enrolled Payers' }));
    expect(router.state.location.pathname).toBe('/Settings/Billing/Payers/Organization');
    expect(screen.getByRole('tab', { name: 'Enrolled Payers' })).toHaveAttribute('aria-selected', 'true');

    await act(async () => router.navigate(-1));
    expect(screen.getByRole('tab', { name: 'Billing Practitioners' })).toHaveAttribute('aria-selected', 'true');

    await act(async () => router.navigate(1));
    expect(screen.getByRole('tab', { name: 'Enrolled Payers' })).toHaveAttribute('aria-selected', 'true');
  });

  test.each(['', 'unknown'])('defaults to organizations for tab "%s"', async (tab) => {
    mockBots();
    setup(tab);

    expect(screen.getByRole('tab', { name: 'Billing Organizations' })).toHaveAttribute('aria-selected', 'true');
    expect(await within(screen.getByRole('tabpanel')).findByText('No results')).toBeInTheDocument();
  });

  test('puts the open organization in the URL and closes it by leaving that URL', async () => {
    const user = userEvent.setup();
    mockSearches({ organizations: [billingOrg] });
    mockBots({ createProvider: true });
    const { router } = setup();

    await user.click(await screen.findByText('Test Medical Practice LLC'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit billing organization' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations/org-practice');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations');

    await act(async () => router.navigate(-1));
    expect(await screen.findByRole('heading', { name: 'Edit billing organization' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'New...' }));
    expect(await screen.findByRole('heading', { name: 'New billing organization' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations/new');
  });

  test('opens the organization from a direct link, reading it by ID', async () => {
    mockBots();
    const readSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(billingOrg);

    setup('Organizations/org-practice');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit billing organization' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/NPI/)).toHaveValue('3564119220');
    expect(readSpy).toHaveBeenCalledExactlyOnceWith('Organization', 'org-practice');
  });

  test('re-reads an organization opened again after it was saved', async () => {
    const user = userEvent.setup();
    const renamed: WithId<Organization> = { ...billingOrg, name: 'Renamed Practice LLC' };
    mockSearches({ organizations: [billingOrg] });
    mockBots({ createProvider: true });
    vi.spyOn(medplum, 'updateResource').mockResolvedValue(renamed);
    const readSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(renamed);
    const { router } = setup();

    await user.click(await screen.findByText('Test Medical Practice LLC'));
    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/^Name/);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Practice LLC');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations');

    await act(async () => router.navigate(-1));
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).getByLabelText(/^Name/)).toHaveValue('Renamed Practice LLC');
    expect(readSpy).toHaveBeenCalledWith('Organization', 'org-practice');
  });

  test('reports a link to an unreadable organization and returns to the tab', async () => {
    mockBots();
    vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('Not found'));
    const showSpy = vi.spyOn(notifications, 'show');
    const { router } = setup('Organizations/missing');

    await waitFor(() => expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations'));
    expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not found' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('opens a new organization from a direct link', async () => {
    mockBots({ createProvider: true });

    setup('Organizations/new');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New billing organization' })).toBeInTheDocument();
  });

  test('lists billing organizations, filtering on the provider-app marker identifier', async () => {
    const searchSpy = mockSearches({ organizations: [billingOrg] });
    mockBots({ payers: true });

    setup();

    expect(await screen.findByText('Test Medical Practice LLC')).toBeInTheDocument();
    expect(screen.getByText('3564119220')).toBeInTheDocument();
    expect(screen.getByText('123456789')).toBeInTheDocument();
    expect(await screen.findByText(/456 Medical Center Drive/)).toBeInTheDocument();
    expect(await screen.findByText(/6175550142/)).toBeInTheDocument();
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

    expect(await screen.findByText('PRACTICE 10')).toBeInTheDocument();
    expect(screen.getByText('PRACTICE 11')).toBeInTheDocument();
    expect(screen.queryByText('PRACTICE 00')).not.toBeInTheDocument();
    expect(searchQueries(searchSpy, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM).at(-1)?.get('_offset')).toBe('10');
  });

  test('refetches the list after a save so the new organization appears', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true, createProvider: true });
    vi.spyOn(medplum, 'createResource').mockResolvedValue(billingOrg);

    setup();

    expect(await within(screen.getByRole('tabpanel')).findByText('No results')).toBeInTheDocument();

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
    mockBots({ payers: true, createProvider: true });
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
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('blocks save on an unusable phone', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true, createProvider: true });
    const createSpy = vi.spyOn(medplum, 'createResource');

    setup();

    await user.click(await screen.findByRole('button', { name: 'New...' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Bad Org');
    await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
    await user.type(within(dialog).getByLabelText(/Tax ID/), '12-3456789');
    await fillPhoneAndAddress(user, dialog, '1234567890');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Phone must be 10 digits and not start with 0 or 1')).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('edits a billing organization, preserving identifiers from other systems', async () => {
    const user = userEvent.setup();
    const existing: WithId<Organization> = {
      ...billingOrg,
      identifier: [{ system: 'https://example.com/legacy-id', value: 'legacy' }, ...(billingOrg.identifier ?? [])],
    };
    mockSearches({ organizations: [existing] });
    mockBots({ payers: true, createProvider: true });
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

  test('resets the form when reopened for a different organization', async () => {
    const user = userEvent.setup();
    mockSearches({ organizations: [billingOrg] });
    mockBots({ payers: true, createProvider: true });

    setup();

    await user.click(await screen.findByText('Test Medical Practice LLC'));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit billing organization' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/NPI/)).toHaveValue('3564119220');
    expect(within(dialog).getByPlaceholderText('City')).toHaveValue('Boston');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'New...' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New billing organization' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('');
    expect(within(dialog).getByLabelText(/NPI/)).toHaveValue('');
    expect(within(dialog).getByPlaceholderText('City')).toHaveValue('');
  });

  describe('existing organizations', () => {
    /**
     * Opens the picker from the list, searches it and picks the clinic.
     * @param user - The user event instance.
     * @returns The picker dialog, with the clinic selected.
     */
    const pickClinic = async (user: UserEvent): Promise<HTMLElement> => {
      await user.click(await screen.findByRole('button', { name: 'Add existing...' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByRole('searchbox'), 'Down');
      await user.click(await screen.findByRole('option', { name: /Downtown Clinic/, hidden: true }));
      return dialog;
    };

    /**
     * The picker is still closing while the set-up modal opens, so two dialogs overlap for a moment; find the
     * set-up modal by its heading.
     * @returns The set-up dialog.
     */
    const findSetupDialog = async (): Promise<HTMLElement> => {
      const heading = await screen.findByRole('heading', { name: 'Set up billing organization' });
      return heading.closest('[role="dialog"]') as HTMLElement;
    };

    test('offers the organizations without the billing marker in a picker on its own URL', async () => {
      const user = userEvent.setup();
      const searchSpy = vi.spyOn(medplum, 'searchResources');
      mockSearches({ otherOrganizations: [clinicOrg] });
      mockBots({ createProvider: true });
      const { router } = setup();

      await user.click(await screen.findByRole('button', { name: 'Add existing...' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('heading', { name: 'Add existing organization' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations/existing');
      expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeDisabled();

      await user.type(within(dialog).getByRole('searchbox'), 'Down');
      const option = await screen.findByRole('option', { name: /Downtown Clinic/, hidden: true });
      expect(within(option).getByText(/9 Harbor St/)).toBeInTheDocument();

      const query = searchSpy.mock.calls
        .map((call) => new URLSearchParams(call[1] as string))
        .find((params) => params.has('identifier:not'));
      expect(query?.get('identifier:not')).toBe(
        `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`
      );
    });

    test('opens the picker from a direct link and closes it by leaving that URL', async () => {
      const user = userEvent.setup();
      mockBots({ createProvider: true });
      const { router } = setup('Organizations/existing');

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('heading', { name: 'Add existing organization' })).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations');
    });

    test('warns instead of opening the picker when the create-provider bot is not deployed', async () => {
      mockBots();
      const showSpy = vi.spyOn(notifications, 'show');
      const { router } = setup('Organizations/existing');

      await waitFor(() => expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations'));
      expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cannot set up a billing organization' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('opens the picked organization for set-up, prefilled and asking for what it lacks', async () => {
      const user = userEvent.setup();
      mockSearches({ otherOrganizations: [clinicOrg] });
      mockBots({ createProvider: true });
      const readSpy = vi.spyOn(medplum, 'readResource');
      const { router } = setup();

      const picker = await pickClinic(user);
      await user.click(within(picker).getByRole('button', { name: 'Continue' }));

      const dialog = await findSetupDialog();
      expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations/org-clinic');
      expect(readSpy).not.toHaveBeenCalled();
      expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Downtown Clinic');
      expect(within(dialog).getByPlaceholderText('City')).toHaveValue('Boston');
      expect(within(dialog).getByLabelText(/NPI/)).toHaveValue('');
      expect(within(dialog).getByLabelText(/Phone/)).toHaveValue('');
      expect(
        within(dialog).getByText(
          'This organization is not set up for billing yet. Enter its NPI, Tax ID and phone to make it available for billing.'
        )
      ).toBeInTheDocument();
    });

    test('makes a picked organization a billing organization on save, keeping what it had', async () => {
      const user = userEvent.setup();
      mockSearches({ otherOrganizations: [clinicOrg] });
      mockBots({ createProvider: true });
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(clinicOrg);
      const createSpy = vi.spyOn(medplum, 'createResource');
      const showSpy = vi.spyOn(notifications, 'show');

      setup();

      const picker = await pickClinic(user);
      await user.click(within(picker).getByRole('button', { name: 'Continue' }));
      const dialog = await findSetupDialog();
      await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
      await user.type(within(dialog).getByLabelText(/Tax ID/), '12-3456789');
      await user.type(within(dialog).getByLabelText(/Phone/), '6175550142');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(updateSpy).toHaveBeenCalled());
      const updated = updateSpy.mock.calls[0][0] as Organization;
      expect(updated.id).toBe('org-clinic');
      expect(updated.name).toBe('Downtown Clinic');
      expect(updated.identifier).toEqual([
        { system: 'https://example.com/legacy-id', value: 'clinic-7' },
        { system: NPI_SYSTEM, value: '3564119220' },
        { system: EIN_SYSTEM, value: '123456789' },
        { system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE },
      ]);
      expect(updated.address?.[0]?.city).toBe('Boston');
      expect(createSpy).not.toHaveBeenCalled();
      expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'Organization set up for billing' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('clears the selection with the in-field clear button, and forgets it when the picker is reopened', async () => {
      const user = userEvent.setup();
      mockSearches({ otherOrganizations: [clinicOrg] });
      mockBots({ createProvider: true });

      setup();

      const picker = await pickClinic(user);
      expect(within(picker).getByRole('button', { name: 'Continue' })).toBeEnabled();
      await user.click(within(picker).getByTitle('Clear all'));
      expect(within(picker).getByRole('button', { name: 'Continue' })).toBeDisabled();
      await user.type(within(picker).getByRole('searchbox'), 'Down');
      await user.click(await screen.findByRole('option', { name: /Downtown Clinic/, hidden: true }));
      expect(within(picker).getByRole('button', { name: 'Continue' })).toBeEnabled();
      await user.click(within(picker).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Add existing...' }));
      const reopened = await screen.findByRole('dialog');
      expect(within(reopened).queryByText('Downtown Clinic')).not.toBeInTheDocument();
      expect(within(reopened).getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    test('names a single missing field on its own', async () => {
      const noPhone: WithId<Organization> = {
        ...billingOrg,
        id: 'org-no-phone',
        identifier: billingOrg.identifier?.filter((id) => id.system !== MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM),
        telecom: undefined,
      };
      mockBots({ createProvider: true });
      vi.spyOn(medplum, 'readResource').mockResolvedValue(noPhone);

      setup('Organizations/org-no-phone');

      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText(
          'This organization is not set up for billing yet. Enter its phone to make it available for billing.'
        )
      ).toBeInTheDocument();
    });

    test('says an organization with everything only needs saving', async () => {
      const complete: WithId<Organization> = {
        ...billingOrg,
        id: 'org-complete',
        name: 'Complete Clinic',
        identifier: billingOrg.identifier?.filter((id) => id.system !== MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM),
      };
      mockBots({ createProvider: true });
      vi.spyOn(medplum, 'readResource').mockResolvedValue(complete);

      setup('Organizations/org-complete');

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('heading', { name: 'Set up billing organization' })).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          'This organization is not set up for billing yet. Check its details and save to make it available for billing.'
        )
      ).toBeInTheDocument();
    });
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

  test('puts the open payer in the URL and closes it by leaving that URL', async () => {
    const user = userEvent.setup();
    mockSearches({ payers: [importedPayerOrg] });
    mockBots({ payers: true });
    const { router } = setup('Payers');

    await user.click(await screen.findByText('AETNA'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'AETNA' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/Settings/Billing/Payers/Organization/org-aetna');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/Settings/Billing/Payers/Organization');
  });

  test.each(['Payers/Organization/org-aetna', 'Payers/org-aetna'])(
    'opens the imported payer from the direct link %s, reading it by ID',
    async (path) => {
      mockBots({ payers: true });
      const readSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(importedPayerOrg);

      setup(path);

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('heading', { name: 'AETNA' })).toBeInTheDocument();
      expect(await within(dialog).findByText(/60054/)).toBeInTheDocument();
      expect(readSpy).toHaveBeenCalledExactlyOnceWith('Organization', 'org-aetna');
    }
  );

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
    await user.type(within(dialog).getByLabelText(/^Name/), 'Test Medical Practice LLC');
    await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
    await user.type(within(dialog).getByLabelText(/Tax ID/), '123456789');
    await fillPhoneAndAddress(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled();
    });
    const created = createSpy.mock.calls[0][0] as Organization;
    expect(created.extension).toEqual([
      { url: CANDID_IS_BILLING_PROVIDER_EXTENSION, valueBoolean: true },
      { url: CANDID_IS_RENDERING_PROVIDER_EXTENSION, valueBoolean: false },
    ]);
    expect(executeSpy).toHaveBeenCalledWith(
      'bot-create-provider',
      expect.objectContaining({ resourceType: 'Organization', id: 'org-practice' }),
      'application/fhir+json'
    );
  });

  test('disables Save with a tooltip when the create-provider bot is not deployed', async () => {
    const user = userEvent.setup();
    mockSearches({ organizations: [billingOrg] });
    mockBots({ payers: true });
    const updateSpy = vi.spyOn(medplum, 'updateResource');

    setup();

    await user.click(await screen.findByText('Test Medical Practice LLC'));
    const dialog = await screen.findByRole('dialog');

    const saveButton = within(dialog).getByRole('button', { name: 'Save' });
    expect(saveButton).toHaveAttribute('data-disabled', 'true');
    await user.hover(saveButton);
    expect(await screen.findByText(/create-provider bot is not deployed/)).toBeInTheDocument();

    await user.click(saveButton);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('warns instead of opening the new organization modal when the create-provider bot is not deployed', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    const showSpy = vi.spyOn(notifications, 'show');
    const { router } = setup();

    await user.click(await screen.findByRole('button', { name: 'New...' }));

    await waitFor(() =>
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('create-provider bot is not deployed') })
      )
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/Settings/Billing/Organizations'));
  });

  test('keeps the organization when Candid registration fails', async () => {
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

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
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
    expect(screen.queryByText(/Not registered with Candid/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test('reports the server rejection and keeps the modal open', async () => {
    const user = userEvent.setup();
    mockSearches({ organizations: [{ ...billingOrg, address: [{ city: 'Boston' }] }] });
    mockBots({ createProvider: true });
    const showSpy = vi.spyOn(notifications, 'show');
    const updateSpy = vi
      .spyOn(medplum, 'updateResource')
      .mockRejectedValue(new Error('Missing required property (Organization.address.postalCode)'));

    setup();

    await user.click(await screen.findByText('Test Medical Practice LLC'));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });
    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error',
        message: expect.stringContaining('Organization.address.postalCode'),
      })
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('shows a notice and no search box when the payers bot is not deployed', async () => {
    const user = userEvent.setup();
    const searchOneSpy = mockBots();

    setup();

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));

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

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
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

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
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

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
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

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
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

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
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

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
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

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
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

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
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
      .mockResolvedValue({ ...importedPayerOrg, name: 'AETNA HEALTH' });

    setup('Payers');

    await user.click(await screen.findByText('AETNA'));
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
    const patchSpy = vi.spyOn(medplum, 'patchResource').mockResolvedValue({ ...importedPayerOrg, active: false });

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

    expect(await screen.findByText('Inactive')).toBeInTheDocument();
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

    await user.click(screen.getByRole('tab', { name: 'Payer Directory' }));
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

  describe('billing practitioners', () => {
    test('lists every practitioner with what Candid needs from them', async () => {
      mockSearches({ practitioners: [drSmith], roles: [smithBillsUnderPractice] });
      mockBots({ createProvider: true });

      setup('Practitioners');

      expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('1234567893')).toBeInTheDocument();
      expect(await screen.findByText('Test Medical Practice LLC')).toBeInTheDocument();
    });

    test('puts the open practitioner in the URL', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drSmith], roles: [smithBillsUnderPractice] });
      mockBots();
      const { router } = setup('Practitioners');

      await screen.findByText('Test Medical Practice LLC');
      await user.click(await screen.findByText('Alice Smith'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText(/NPI/)).toHaveValue('1234567893');
      expect(router.state.location.pathname).toBe('/Settings/Billing/Practitioners/prac-smith');

      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(router.state.location.pathname).toBe('/Settings/Billing/Practitioners');
    });

    test('opens the practitioner from a direct link, reading them and their active roles', async () => {
      mockSearches({
        practitioners: [drSmith],
        roles: [smithBillsUnderPractice, { ...smithBillsUnderPractice, id: 'role-inactive', active: false }],
      });
      mockBots();
      const readSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(drSmith);
      vi.spyOn(medplum, 'readReference').mockResolvedValue(billingOrg);

      setup('Practitioners/prac-smith');

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText(/NPI/)).toHaveValue('1234567893');
      expect(await within(dialog).findByText('Test Medical Practice LLC')).toBeInTheDocument();
      expect(readSpy).toHaveBeenCalledExactlyOnceWith('Practitioner', 'prac-smith');
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'PractitionerRole',
        expect.objectContaining({ practitioner: 'Practitioner/prac-smith', active: 'true' })
      );
    });

    test('loads the list once: the role lookup must not retrigger the search', async () => {
      const searchSpy = mockSearches({ practitioners: [drSmith], roles: [smithBillsUnderPractice] });
      mockBots({ payers: true });

      setup('Practitioners');

      expect(await screen.findByText('Test Medical Practice LLC')).toBeInTheDocument();
      const practitionerSearches = (searchSpy.mock.calls as unknown[][]).filter((call) => call[0] === 'Practitioner');
      expect(practitionerSearches).toHaveLength(1);
    });

    test('shows all distinct organizations across active role pages, including individual billing', async () => {
      const secondRole: WithId<PractitionerRole> = {
        ...smithBillsUnderPractice,
        id: 'role-second',
        organization: { reference: 'Organization/org-second', display: 'Second Practice' },
      };
      const searchSpy = mockSearches({
        practitioners: [drSmith],
        roles: [
          ...Array.from({ length: 100 }, (_, i) => ({ ...smithBillsUnderPractice, id: `role-${i}` })),
          secondRole,
          { ...smithBillsUnderPractice, id: 'role-individual', organization: undefined },
          {
            ...smithBillsUnderPractice,
            id: 'role-inactive',
            active: false,
            organization: { reference: 'Organization/org-inactive', display: 'Inactive Practice' },
          },
        ],
      });
      mockBots();

      setup('Practitioners');

      expect(await screen.findByText('Second Practice')).toBeInTheDocument();
      expect(screen.getAllByText('Test Medical Practice LLC')).toHaveLength(1);
      expect(await screen.findByText('Individually')).toBeInTheDocument();
      expect(await screen.findByText('Missing Tax ID')).toBeInTheDocument();
      expect(await screen.findByText('Incomplete address')).toBeInTheDocument();
      expect(screen.queryByText('Inactive Practice')).not.toBeInTheDocument();
      const roleQueries = (searchSpy.mock.calls as unknown[][])
        .filter((call) => call[0] === 'PractitionerRole')
        .map((call) => new URLSearchParams(call[1] as string));
      expect(roleQueries).toHaveLength(2);
      expect(roleQueries[0].get('active')).toBe('true');
      expect(roleQueries[1].get('_offset')).toBe('100');
    });

    test('edits the first active role with the organization input when a practitioner has multiple organizations', async () => {
      const user = userEvent.setup();
      const secondRole: WithId<PractitionerRole> = {
        ...smithBillsUnderPractice,
        id: 'role-second',
        organization: { reference: 'Organization/org-second', display: 'Second Practice' },
      };
      mockSearches({ practitioners: [drSmith], roles: [smithBillsUnderPractice, secondRole] });
      mockBots({ createProvider: true });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(billingOrg);
      vi.spyOn(medplum, 'updateResource').mockResolvedValue(drSmith);
      const patchSpy = vi.spyOn(medplum, 'patchResource').mockResolvedValue(smithBillsUnderPractice);

      setup('Practitioners');

      await screen.findByText('Second Practice');
      await user.click(await screen.findByText('Alice Smith'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByLabelText(/Practitioner role/)).not.toBeInTheDocument();
      expect(await within(dialog).findByText('Test Medical Practice LLC')).toBeInTheDocument();
      await user.click(within(dialog).getByTitle('Clear all'));
      await fillPractitionerBillingIdentity(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledExactlyOnceWith('PractitionerRole', 'role-smith', [
          { op: 'remove', path: '/organization' },
        ]);
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('flags what a practitioner is missing, and individual billing', async () => {
      mockSearches({ practitioners: [drJones] });
      mockBots({ createProvider: true });

      setup('Practitioners');

      expect(await screen.findByText(/Missing NPI/)).toBeInTheDocument();
      expect(screen.getByText('Individually')).toBeInTheDocument();
    });

    test('asks for a tax ID and address only from practitioners who bill individually', async () => {
      mockSearches({ practitioners: [drSmith, drDiaz, drJones], roles: [smithBillsUnderPractice] });
      mockBots({ payers: true });

      setup('Practitioners');

      expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
      expect(await screen.findByText('Cara Diaz')).toBeInTheDocument();
      expect(await screen.findAllByText('Missing Tax ID')).toHaveLength(1);
      expect(await screen.findAllByText('Incomplete address')).toHaveLength(1);
    });

    test('saves the billing details, and points a new role at the billing organization', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drJones], organizations: [billingOrg] });
      mockBots({ payers: true, createProvider: true });
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(drJones);
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(smithBillsUnderPractice);

      setup('Practitioners');

      await user.click(await screen.findByText('Bob Jones'));

      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
      await user.type(within(dialog).getByRole('searchbox'), 'Test');
      await user.click(await screen.findByRole('option', { name: /Test Medical Practice LLC/, hidden: true }));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalled();
      });
      const updated = updateSpy.mock.calls[0][0] as Practitioner;
      expect(updated.identifier).toEqual([
        { system: NPI_SYSTEM, value: '3564119220' },
        { system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_PRACTITIONER_IDENTIFIER_VALUE },
      ]);
      expect(updated.meta?.profile).toEqual([CANDID_PRACTITIONER_PROFILE]);
      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'PractitionerRole',
            active: true,
            practitioner: expect.objectContaining({ reference: 'Practitioner/prac-jones' }),
            organization: expect.objectContaining({ reference: 'Organization/org-practice' }),
          })
        );
      });
    });

    test.each([true, false])('patches the current role when changing organization (assigned: %s)', async (assigned) => {
      const user = userEvent.setup();
      const nextOrganization: WithId<Organization> = { ...billingOrg, id: 'org-next', name: 'Next Practice' };
      const currentRole = await medplum.createResource<PractitionerRole>({
        ...smithBillsUnderPractice,
        organization: assigned ? smithBillsUnderPractice.organization : undefined,
        code: [{ text: 'Primary care' }],
        telecom: [{ system: 'phone', value: '6175550123' }],
      });
      mockSearches({ practitioners: [drSmith], organizations: [nextOrganization], roles: [currentRole] });
      mockBots({ createProvider: true });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(billingOrg);
      vi.spyOn(medplum, 'updateResource').mockResolvedValue(drSmith);
      const patchSpy = vi.spyOn(medplum, 'patchResource');
      const createSpy = vi.spyOn(medplum, 'createResource');
      const deleteSpy = vi.spyOn(medplum, 'deleteResource');

      setup('Practitioners');

      await user.click(await screen.findByText('Alice Smith'));
      const dialog = await screen.findByRole('dialog');
      if (assigned) {
        await within(dialog).findByText('Test Medical Practice LLC');
        await user.click(within(dialog).getByTitle('Clear all'));
      }
      await user.type(within(dialog).getByRole('searchbox'), 'Next');
      const option = await screen.findByRole('option', { name: /Next Practice/, hidden: true });
      expect(within(option).getByText(/456 Medical Center Drive/)).toBeInTheDocument();
      await user.click(option);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(patchSpy).toHaveBeenCalledExactlyOnceWith('PractitionerRole', currentRole.id, [
        {
          op: assigned ? 'replace' : 'add',
          path: '/organization',
          value: expect.objectContaining({ reference: 'Organization/org-next' }),
        },
      ]);
      expect(createSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(await medplum.readResource('PractitionerRole', currentRole.id)).toEqual(
        expect.objectContaining({
          active: true,
          organization: expect.objectContaining({ reference: 'Organization/org-next' }),
          code: currentRole.code,
          telecom: currentRole.telecom,
        })
      );
    });

    test('clears the organization from the role when switching to individual billing', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drSmith], organizations: [billingOrg], roles: [smithBillsUnderPractice] });
      mockBots({ payers: true, createProvider: true });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(billingOrg);
      vi.spyOn(medplum, 'updateResource').mockResolvedValue(drSmith);
      const patchSpy = vi.spyOn(medplum, 'patchResource').mockResolvedValue(smithBillsUnderPractice);

      setup('Practitioners');

      await user.click(await screen.findByText('Alice Smith'));

      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findByText('Test Medical Practice LLC')).toBeInTheDocument();
      await user.click(within(dialog).getByTitle('Clear all'));
      await fillPractitionerBillingIdentity(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('PractitionerRole', 'role-smith', [
          { op: 'remove', path: '/organization' },
        ]);
      });
    });

    test('registers a practitioner with Candid as a rendering provider', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drJones], organizations: [billingOrg] });
      mockBots({ createProvider: true });
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(drJones);
      const executeSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue({});

      setup('Practitioners');

      await user.click(await screen.findByText('Bob Jones'));

      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');
      await fillPractitionerBillingIdentity(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(executeSpy).toHaveBeenCalled();
      });
      const updated = updateSpy.mock.calls[0][0] as Practitioner;
      expect(updated.extension).toEqual([
        { url: CANDID_IS_BILLING_PROVIDER_EXTENSION, valueBoolean: true },
        { url: CANDID_IS_RENDERING_PROVIDER_EXTENSION, valueBoolean: true },
      ]);
      expect(executeSpy).toHaveBeenCalledWith(
        'bot-create-provider',
        expect.objectContaining({ resourceType: 'Practitioner', id: 'prac-jones' }),
        'application/fhir+json'
      );
    });

    test('shows the practitioner name and saves changes to it, keeping other names', async () => {
      const user = userEvent.setup();
      const twoNames: WithId<Practitioner> = {
        ...drSmith,
        name: [
          { use: 'official', prefix: ['Dr.'], given: ['Alice'], family: 'Smith' },
          { use: 'maiden', family: 'Jones' },
        ],
      };
      mockSearches({ practitioners: [twoNames], roles: [smithBillsUnderPractice] });
      mockBots({ payers: true, createProvider: true });
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(twoNames);

      setup('Practitioners');

      await screen.findByText('Test Medical Practice LLC');
      await user.click(await screen.findByText(/Alice Smith/));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByPlaceholderText('Given')).toHaveValue('Alice');
      expect(within(dialog).getByPlaceholderText('Family')).toHaveValue('Smith');
      const familyInput = within(dialog).getByPlaceholderText('Family');
      await user.clear(familyInput);
      await user.type(familyInput, 'Smith-Lee');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalled();
      });
      const updated = updateSpy.mock.calls[0][0] as Practitioner;
      expect(updated.name).toEqual([
        { use: 'official', prefix: ['Dr.'], given: ['Alice'], family: 'Smith-Lee' },
        { use: 'maiden', family: 'Jones' },
      ]);
    });

    test('blocks save without a given and family name', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [{ ...drDiaz, name: [{ given: ['Cara'] }] }] });
      mockBots({ payers: true, createProvider: true });
      const updateSpy = vi.spyOn(medplum, 'updateResource');

      setup('Practitioners');

      await user.click(await screen.findByText('Cara'));

      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Name needs a given and family name')).toBeInTheDocument();
      expect(updateSpy).not.toHaveBeenCalled();

      await user.type(within(dialog).getByPlaceholderText('Family'), 'Diaz');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalled();
      });
      expect((updateSpy.mock.calls[0][0] as Practitioner).name).toEqual([{ given: ['Cara'], family: 'Diaz' }]);
    });

    test('blocks save on a malformed NPI', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drJones] });
      mockBots({ payers: true, createProvider: true });
      const updateSpy = vi.spyOn(medplum, 'updateResource');

      setup('Practitioners');

      await user.click(await screen.findByText('Bob Jones'));

      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/NPI/), '12345');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('NPI must be 10 digits')).toBeInTheDocument();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('Candid registration lookup', () => {
    const candidOrg: Organization = {
      resourceType: 'Organization',
      identifier: [
        { system: CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM, value: 'cand-org-1' },
        { system: NPI_SYSTEM, value: '3564119220' },
      ],
    };
    const candidPractitioner: Practitioner = {
      resourceType: 'Practitioner',
      identifier: [
        { system: CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM, value: 'cand-prac-1' },
        { system: NPI_SYSTEM, value: '1234567893' },
      ],
    };

    const unstamped: WithId<Organization> = {
      ...billingOrg,
      identifier: billingOrg.identifier?.filter((i) => i.system !== CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM),
    };

    test('reports what Candid says when a billing organization is opened', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [unstamped] });
      mockBots({ createProvider: true, listProviders: true });
      const executeSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue(makeProviderSearchResult([candidOrg]));

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));

      expect(await screen.findByText(/Registered with Candid under NPI 3564119220/)).toBeInTheDocument();
      expect(executeSpy).toHaveBeenCalledWith('bot-list-providers', { npi: '3564119220' }, 'application/json');
    });

    test('records the provider ID Candid returns instead of registering a duplicate', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [unstamped] });
      mockBots({ createProvider: true, editProvider: true, listProviders: true });
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(unstamped);
      const executeSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue(makeProviderSearchResult([candidOrg]));

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));
      const dialog = await screen.findByRole('dialog');
      await screen.findByText(/Registered with Candid/);
      await user.click(within(dialog).getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalled();
      });
      const updated = updateSpy.mock.calls[0][0] as Organization;
      expect(updated.identifier).toContainEqual({
        system: CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM,
        value: 'cand-org-1',
      });
      expect(executeSpy).not.toHaveBeenCalledWith('bot-create-provider', expect.anything(), expect.anything());
    });

    test('pushes the change to Candid when it already holds the provider', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [unstamped] });
      mockBots({ createProvider: true, editProvider: true, listProviders: true });
      vi.spyOn(medplum, 'updateResource').mockResolvedValue(unstamped);
      const executeSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue(makeProviderSearchResult([candidOrg]));

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));
      const dialog = await screen.findByRole('dialog');
      expect(await screen.findByText(/Registered with Candid/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        expect(executeSpy).toHaveBeenCalledWith(
          'bot-edit-provider',
          expect.objectContaining({ resourceType: 'Organization' }),
          'application/fhir+json'
        );
      });
      expect(executeSpy).not.toHaveBeenCalledWith('bot-create-provider', expect.anything(), expect.anything());
    });

    test('disables Edit with a tooltip when the edit-provider bot is not deployed', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [unstamped] });
      mockBots({ createProvider: true, listProviders: true });
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(unstamped);
      const executeSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue(makeProviderSearchResult([candidOrg]));

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));
      const dialog = await screen.findByRole('dialog');
      expect(await screen.findByText(/Registered with Candid/)).toBeInTheDocument();

      const editButton = within(dialog).getByRole('button', { name: 'Edit' });
      expect(editButton).toHaveAttribute('data-disabled', 'true');
      await user.hover(editButton);
      expect(await screen.findByText(/edit-provider bot is not deployed/)).toBeInTheDocument();

      await user.click(editButton);
      expect(updateSpy).not.toHaveBeenCalled();
      expect(executeSpy).not.toHaveBeenCalledWith('bot-edit-provider', expect.anything(), expect.anything());
    });

    test('holds the save while an edited NPI waits to be looked up', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [unstamped] });
      mockBots({ createProvider: true, editProvider: true, listProviders: true });
      const executeSpy = vi
        .spyOn(medplum, 'executeBot')
        .mockResolvedValueOnce(makeProviderSearchResult([candidOrg]))
        .mockResolvedValue(makeProviderSearchResult([]));

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));
      const dialog = await screen.findByRole('dialog');
      expect(await screen.findByText(/Registered with Candid/)).toBeInTheDocument();

      const npiInput = within(dialog).getByLabelText(/NPI/);
      await user.clear(npiInput);
      await user.type(npiInput, '1234567893');

      const saveButton = within(dialog).getByRole('button', { name: /Save|Edit/ });
      expect(saveButton).toHaveAttribute('data-loading');
      expect(screen.queryByText(/Registered with Candid/)).not.toBeInTheDocument();

      await waitFor(() => {
        expect(executeSpy).toHaveBeenCalledWith('bot-list-providers', { npi: '1234567893' }, 'application/json');
      });
      expect(await within(dialog).findByRole('button', { name: 'Save' })).not.toHaveAttribute('data-loading');
    });

    test('updates a practitioner in Candid, carrying the billing flags with it', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drSmith], organizations: [billingOrg] });
      mockBots({ createProvider: true, editProvider: true, listProviders: true });
      vi.spyOn(medplum, 'updateResource').mockImplementation((async (resource: Practitioner) => resource) as any);
      const executeSpy = vi
        .spyOn(medplum, 'executeBot')
        .mockResolvedValue(makeProviderSearchResult([candidPractitioner]));

      setup('Practitioners');

      await user.click(await screen.findByText('Alice Smith'));
      const dialog = await screen.findByRole('dialog');
      await screen.findByText(/Registered with Candid/);
      await fillPractitionerBillingIdentity(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Edit' }));

      await waitFor(() => {
        expect(executeSpy).toHaveBeenCalledWith(
          'bot-edit-provider',
          expect.objectContaining({
            extension: [
              { url: CANDID_IS_BILLING_PROVIDER_EXTENSION, valueBoolean: true },
              { url: CANDID_IS_RENDERING_PROVIDER_EXTENSION, valueBoolean: true },
            ],
          }),
          'application/fhir+json'
        );
      });
    });

    test('disables Save with a tooltip for a practitioner when the create-provider bot is not deployed', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drSmith], organizations: [billingOrg] });
      mockBots();
      const updateSpy = vi.spyOn(medplum, 'updateResource');

      setup('Practitioners');

      await user.click(await screen.findByText('Alice Smith'));
      const dialog = await screen.findByRole('dialog');

      const saveButton = within(dialog).getByRole('button', { name: 'Save' });
      expect(saveButton).toHaveAttribute('data-disabled', 'true');
      await user.hover(saveButton);
      expect(await screen.findByText(/create-provider bot is not deployed/)).toBeInTheDocument();

      await user.click(saveButton);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    test('disables Edit with a tooltip for a registered practitioner when the edit-provider bot is not deployed', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drSmith], organizations: [billingOrg] });
      mockBots({ createProvider: true, listProviders: true });
      const updateSpy = vi.spyOn(medplum, 'updateResource');
      const executeSpy = vi
        .spyOn(medplum, 'executeBot')
        .mockResolvedValue(makeProviderSearchResult([candidPractitioner]));

      setup('Practitioners');

      await user.click(await screen.findByText('Alice Smith'));
      const dialog = await screen.findByRole('dialog');
      await screen.findByText(/Registered with Candid/);

      const editButton = within(dialog).getByRole('button', { name: 'Edit' });
      expect(editButton).toHaveAttribute('data-disabled', 'true');
      await user.hover(editButton);
      expect(await screen.findByText(/edit-provider bot is not deployed/)).toBeInTheDocument();

      await user.click(editButton);
      expect(updateSpy).not.toHaveBeenCalled();
      expect(executeSpy).not.toHaveBeenCalledWith('bot-edit-provider', expect.anything(), expect.anything());
    });

    test('registers when Candid has no provider for the NPI', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [unstamped] });
      mockBots({ createProvider: true, listProviders: true });
      vi.spyOn(medplum, 'updateResource').mockResolvedValue(unstamped);
      const executeSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue(makeProviderSearchResult([]));

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));
      const dialog = await screen.findByRole('dialog');
      expect(await screen.findByText(/Not registered with Candid/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(executeSpy).toHaveBeenCalledWith(
          'bot-create-provider',
          expect.objectContaining({ resourceType: 'Organization' }),
          'application/fhir+json'
        );
      });
    });

    test('says so when the lookup itself fails', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [unstamped] });
      mockBots({ createProvider: true, listProviders: true });
      vi.spyOn(medplum, 'executeBot').mockRejectedValue(new Error('Candid credentials missing'));

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));

      expect(await screen.findByText(/Could not check Candid: Candid credentials missing/)).toBeInTheDocument();
    });

    test('checks a practitioner by NPI too, matching the individual provider', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drSmith] });
      mockBots({ createProvider: true, listProviders: true });
      const executeSpy = vi
        .spyOn(medplum, 'executeBot')
        .mockResolvedValue(makeProviderSearchResult([candidOrg, candidPractitioner]));

      setup('Practitioners');

      await user.click(await screen.findByText('Alice Smith'));

      expect(await screen.findByText(/Registered with Candid under NPI 1234567893/)).toBeInTheDocument();
      expect(executeSpy).toHaveBeenCalledWith('bot-list-providers', { npi: '1234567893' }, 'application/json');
    });

    test('checks the NPI as it is typed, before a first registration is attempted', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drJones] });
      mockBots({ createProvider: true, listProviders: true });
      const executeSpy = vi.spyOn(medplum, 'executeBot').mockResolvedValue(makeProviderSearchResult([candidOrg]));

      setup('Practitioners');

      await user.click(await screen.findByText('Bob Jones'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByText(/Candid/)).not.toBeInTheDocument();

      await user.type(within(dialog).getByLabelText(/NPI/), '3564119220');

      expect(await screen.findByText(/Not registered with Candid/)).toBeInTheDocument();
      expect(executeSpy).toHaveBeenCalledWith('bot-list-providers', { npi: '3564119220' }, 'application/json');
    });

    test('asks nothing of Candid when the lookup bot is not deployed', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [unstamped] });
      mockBots({ createProvider: true });
      const executeSpy = vi.spyOn(medplum, 'executeBot');

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByText(/Candid/)).not.toBeInTheDocument();
      expect(executeSpy).not.toHaveBeenCalled();
    });
  });

  describe('Candid contract lookup', () => {
    const candidOrg: Organization = {
      resourceType: 'Organization',
      identifier: [
        { system: CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM, value: 'cand-org-1' },
        { system: NPI_SYSTEM, value: '3564119220' },
      ],
    };
    const candidPractitioner: Practitioner = {
      resourceType: 'Practitioner',
      identifier: [
        { system: CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM, value: 'cand-prac-1' },
        { system: NPI_SYSTEM, value: '1987654321' },
      ],
    };
    /** The billing organization after a registration stamped Candid's provider ID on it. */
    const stampedOrg: WithId<Organization> = {
      ...billingOrg,
      identifier: [
        ...(billingOrg.identifier ?? []),
        { system: CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM, value: 'cand-org-1' },
      ],
    };
    const contractsCall = (contractingProviderId: string): unknown[] => [
      'bot-contracts',
      { contractingProviderId, contractStatus: 'effective', limit: 100 },
      'application/json',
    ];

    /**
     * Routes bot executions by bot: the provider lookup answers with `providers`, the contract lookup with
     * `contracts` (or rejects with it when given an Error).
     * @param providers - What candid-list-providers holds for any NPI.
     * @param contracts - What candid-get-contracts returns, or the error it fails with.
     * @returns The spy on executeBot.
     */
    const mockCandid = (
      providers: (Organization | Practitioner)[],
      contracts: Contract[] | Error
    ): ReturnType<typeof vi.spyOn> =>
      vi.spyOn(medplum, 'executeBot').mockImplementation((async (botId: string) => {
        if (botId !== 'bot-contracts') {
          return makeProviderSearchResult(providers);
        }
        if (contracts instanceof Error) {
          throw contracts;
        }
        return makeContractsResult(contracts);
      }) as any);

    test('lists the payers a registered organization holds effective contracts with', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [billingOrg] });
      mockBots({ createProvider: true, listProviders: true, getContracts: true });
      const executeSpy = mockCandid([candidOrg], [makeContract('AETNA'), makeContract('CIGNA'), makeContract('AETNA')]);

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));

      expect(
        await screen.findByText(/Active Candid contracts for this organization: AETNA, CIGNA/)
      ).toBeInTheDocument();
      expect(executeSpy).toHaveBeenCalledWith(...contractsCall('cand-org-1'));
    });

    test('warns when a registered organization has no contract', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [billingOrg] });
      mockBots({ createProvider: true, listProviders: true, getContracts: true });
      mockCandid([candidOrg], []);

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));

      expect(await screen.findByText(/No active Candid contract for this organization/)).toBeInTheDocument();
    });

    test('treats a contract outside its dates as no contract', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [billingOrg] });
      mockBots({ createProvider: true, listProviders: true, getContracts: true });
      mockCandid(
        [candidOrg],
        [
          makeContract('EXPIRED', { applies: { start: '2020-01-01', end: '2020-12-31' } }),
          makeContract('FUTURE', { applies: { start: '2999-01-01' } }),
          makeContract('PENDING', { status: 'offered' }),
        ]
      );

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));

      expect(await screen.findByText(/No active Candid contract for this organization/)).toBeInTheDocument();
    });

    test('says so when the contract lookup fails', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [billingOrg] });
      mockBots({ createProvider: true, listProviders: true, getContracts: true });
      mockCandid([candidOrg], new Error('Candid credentials missing'));

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));

      expect(
        await screen.findByText(/Could not check Candid contracts: Candid credentials missing/)
      ).toBeInTheDocument();
    });

    test('shows nothing about contracts when the contracts bot is not deployed', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [billingOrg] });
      mockBots({ createProvider: true, listProviders: true });
      const executeSpy = mockCandid([candidOrg], [makeContract('AETNA')]);

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));

      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByText(/Registered with Candid/);
      expect(within(dialog).queryByText(/contract/)).not.toBeInTheDocument();
      expect(executeSpy).not.toHaveBeenCalledWith('bot-contracts', expect.anything(), expect.anything());
    });

    test('looks up no contracts for a provider Candid does not know', async () => {
      const user = userEvent.setup();
      mockSearches({ organizations: [billingOrg] });
      mockBots({ createProvider: true, listProviders: true, getContracts: true });
      const executeSpy = mockCandid([], [makeContract('AETNA')]);

      setup();

      await user.click(await screen.findByText('Test Medical Practice LLC'));

      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByText(/Not registered with Candid/);
      expect(within(dialog).queryByText(/contract/)).not.toBeInTheDocument();
      expect(executeSpy).not.toHaveBeenCalledWith('bot-contracts', expect.anything(), expect.anything());
    });

    test("checks the billing organization's contracts for a practitioner billing under it", async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drSmith], organizations: [stampedOrg], roles: [smithBillsUnderPractice] });
      mockBots({ createProvider: true, listProviders: true, getContracts: true });
      vi.spyOn(medplum, 'readReference').mockResolvedValue(stampedOrg);
      const executeSpy = mockCandid([candidOrg], [makeContract('AETNA')]);

      setup('Practitioners');

      await user.click(await screen.findByText('Alice Smith'));

      expect(
        await screen.findByText(/Active Candid contracts for Test Medical Practice LLC: AETNA/)
      ).toBeInTheDocument();
      expect(executeSpy).toHaveBeenCalledWith(...contractsCall('cand-org-1'));
    });

    test('checks their own contracts for a practitioner billing individually', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drDiaz] });
      mockBots({ createProvider: true, listProviders: true, getContracts: true });
      const executeSpy = mockCandid([candidPractitioner], []);

      setup('Practitioners');

      await user.click(await screen.findByText('Cara Diaz'));

      expect(await screen.findByText(/No active Candid contract for this practitioner/)).toBeInTheDocument();
      expect(executeSpy).toHaveBeenCalledWith(...contractsCall('cand-prac-1'));
    });
  });
});
