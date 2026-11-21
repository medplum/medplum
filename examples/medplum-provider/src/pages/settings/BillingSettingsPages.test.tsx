// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, userEvent, waitFor } from '../../test-utils/render';
import { CANDID_CREATE_PROVIDER_BOT_IDENTIFIER } from '../../utils/candid';
import {
  BillingOrganizationsSettingsPage,
  BillingPayersSettingsPage,
  BillingPractitionersSettingsPage,
  ChargeItemsSettingsPage,
} from './BillingSettingsPages';
import { renderSettingsPage } from './settingsTestUtils';

const createProviderBot: Bot = {
  resourceType: 'Bot',
  id: 'bot-create-provider',
  name: 'Candid Create Provider',
  identifier: [CANDID_CREATE_PROVIDER_BOT_IDENTIFIER],
};

describe('BillingSettingsPages', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'search').mockResolvedValue({ resourceType: 'Bundle', type: 'searchset', total: 0, entry: [] });
    vi.spyOn(medplum, 'searchOne').mockImplementation((async (resourceType: string, query: any) =>
      resourceType === 'Bot' && String(query?.identifier).endsWith(CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.value)
        ? createProviderBot
        : undefined) as any);
  });

  test('opens the organization in the id search param and clears it on close', async () => {
    const user = userEvent.setup();
    const { router } = await renderSettingsPage(medplum, <BillingOrganizationsSettingsPage />, '/settings/page?id=new');

    expect(screen.getByRole('heading', { name: 'Billing Organizations' })).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Add billing organization' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  test.each([
    ['Billing Practitioners', <BillingPractitionersSettingsPage key="practitioners" />],
    ['Payers', <BillingPayersSettingsPage key="payers" />],
    ['Charge Items', <ChargeItemsSettingsPage key="charge-items" />],
  ])('renders the %s page', async (title, element) => {
    await renderSettingsPage(medplum, element);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  });
});
