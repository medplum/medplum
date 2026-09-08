// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Bot, Organization, Parameters, Practitioner, PractitionerRole, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
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

/**
 * What candid-list-providers returns: the providers Candid holds for an NPI, as FHIR resources.
 * @param providers - The providers Candid holds for the NPI.
 * @returns The bot's Parameters response.
 */
function makeProviderSearchResult(providers: (Organization | Practitioner)[]): Parameters {
  return { resourceType: 'Parameters', parameter: providers.map((resource) => ({ name: 'provider', resource })) };
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

const importedPayerOrg: Organization = { ...makeDirectoryPayer('uuid-aetna', '60054', 'AETNA'), id: 'org-aetna' };

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
        return resources.roles ?? [];
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
      return {
        resourceType: 'Bundle',
        type: 'searchset',
        total: all.length,
        entry: all.slice(offset, offset + count).map((resource) => ({ resource })),
      };
    }) as any);
  };

  const mockBots = (
    bots: {
      payers?: boolean;
      createProvider?: boolean;
      editProvider?: boolean;
      listProviders?: boolean;
      practitionerRole?: PractitionerRole;
    } = {}
  ): ReturnType<typeof vi.spyOn> =>
    vi.spyOn(medplum, 'searchOne').mockImplementation((async (resourceType: string, query: any) => {
      if (resourceType !== 'Bot') {
        return resourceType === 'PractitionerRole' ? bots.practitionerRole : undefined;
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
    mockBots({ payers: true });
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
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('blocks save on an unusable phone', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
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

  test('resets the form when reopened for a different organization', async () => {
    const user = userEvent.setup();
    mockSearches({ organizations: [billingOrg] });
    mockBots({ payers: true });

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

  test('does not touch Candid when the create-provider bot is not deployed', async () => {
    const user = userEvent.setup();
    mockBots({ payers: true });
    const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(billingOrg);
    const executeSpy = vi.spyOn(medplum, 'executeBot');

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
    expect((createSpy.mock.calls[0][0] as Organization).extension).toBeUndefined();
    expect(executeSpy).not.toHaveBeenCalled();
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

  describe('billing practitioners', () => {
    test('lists every practitioner with what Candid needs from them', async () => {
      mockSearches({ practitioners: [drSmith], roles: [smithBillsUnderPractice] });
      mockBots({ createProvider: true });

      setup('Practitioners');

      expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('1234567893')).toBeInTheDocument();
      expect(await screen.findByText('Test Medical Practice LLC')).toBeInTheDocument();
    });

    test('loads the list once: the role lookup must not retrigger the search', async () => {
      const searchSpy = mockSearches({ practitioners: [drSmith], roles: [smithBillsUnderPractice] });
      mockBots({ payers: true });

      setup('Practitioners');

      expect(await screen.findByText('Test Medical Practice LLC')).toBeInTheDocument();
      const practitionerSearches = (searchSpy.mock.calls as unknown[][]).filter((call) => call[0] === 'Practitioner');
      expect(practitionerSearches).toHaveLength(1);
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
      expect(screen.getByText('Cara Diaz')).toBeInTheDocument();
      expect(screen.getAllByText('Missing Tax ID')).toHaveLength(1);
      expect(screen.getAllByText('Incomplete address')).toHaveLength(1);
    });

    test('saves the billing details, and points a new role at the billing organization', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drJones], organizations: [billingOrg] });
      mockBots({ payers: true });
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

    test('clears the organization from the role when switching to individual billing', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drSmith], organizations: [billingOrg], roles: [smithBillsUnderPractice] });
      mockBots({ payers: true, practitionerRole: smithBillsUnderPractice });
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

    test('blocks save on a malformed NPI', async () => {
      const user = userEvent.setup();
      mockSearches({ practitioners: [drJones] });
      mockBots({ payers: true });
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
      mockBots({ createProvider: true, listProviders: true });
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
});
