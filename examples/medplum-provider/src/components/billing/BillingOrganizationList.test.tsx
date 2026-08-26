// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Organization } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  EIN_SYSTEM,
  MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
  NPI_SYSTEM,
  ORGANIZATION_TYPE_SYSTEM,
  PROVIDER_ORGANIZATION_TYPE,
} from '../../utils/billing';
import { BillingOrganizationList } from './BillingOrganizationList';

const completeOrg: Organization = {
  resourceType: 'Organization',
  id: 'org-complete',
  name: 'Test Medical Practice LLC',
  type: [{ coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PROVIDER_ORGANIZATION_TYPE }] }],
  identifier: [
    { system: NPI_SYSTEM, value: '3564119220' },
    { system: EIN_SYSTEM, value: '123456789' },
    { system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE },
  ],
  telecom: [{ system: 'phone', value: '6175550142' }],
  address: [{ city: 'Boston', state: 'MA' }],
};

const orgWithoutNpi: Organization = {
  resourceType: 'Organization',
  id: 'org-no-npi',
  name: 'Acme Clinic',
  type: [{ coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PROVIDER_ORGANIZATION_TYPE }] }],
  identifier: [{ system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE }],
};

describe('BillingOrganizationList', () => {
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
            <BillingOrganizationList />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('lists provider organizations with details and flags missing NPIs', async () => {
    const searchSpy = vi
      .spyOn(medplum, 'searchResources')
      .mockResolvedValue([completeOrg, orgWithoutNpi] as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Test Medical Practice LLC')).toBeInTheDocument();
      expect(screen.getByText('Acme Clinic')).toBeInTheDocument();
    });

    // Filters on the provider-app marker identifier (not org type or NPI), so unrelated
    // Organizations never appear and misconfigured billing orgs stay visible
    expect(searchSpy).toHaveBeenCalledWith(
      'Organization',
      expect.objectContaining({
        identifier: `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
      })
    );

    expect(screen.getByText(/NPI 3564119220 · EIN 123456789 · Boston, MA · 6175550142/)).toBeInTheDocument();
    expect(screen.getAllByText('Missing NPI — hidden from encounter billing picker')).toHaveLength(1);
    expect(screen.getByText(/Candid requires the NPI and Tax ID/)).toBeInTheDocument();
  });

  test('shows an empty state and opens the create modal', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);

    setup();

    expect(await screen.findByText(/No billing providers yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /New organization/ }));

    expect(await screen.findByText('New billing organization')).toBeInTheDocument();
  });

  test('opens the edit modal seeded with the organization', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([completeOrg] as any);

    setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(await screen.findByText('Edit billing organization')).toBeInTheDocument();
    expect(screen.getByLabelText(/NPI/)).toHaveValue('3564119220');
  });
});
