// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EIN_SYSTEM, NPI_SYSTEM, ORGANIZATION_TYPE_SYSTEM, PROVIDER_ORGANIZATION_TYPE } from '../../utils/billing';
import { BillingOrganizationModal } from './BillingOrganizationModal';

describe('BillingOrganizationModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    notifications.clean();
  });

  const setup = (props: Partial<Parameters<typeof BillingOrganizationModal>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <BillingOrganizationModal opened={true} onClose={vi.fn()} onSaved={vi.fn()} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('creates a billing organization with prov type and normalized identifiers', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    setup({ onSaved });

    await user.type(screen.getByLabelText(/^Name/), 'Test Medical Practice LLC');
    await user.type(screen.getByLabelText(/NPI/), '3564119220');
    await user.type(screen.getByLabelText(/Tax ID/), '12-3456789');
    await user.type(screen.getByLabelText(/Phone/), '(617) 555-0142');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const saved = onSaved.mock.calls[0][0] as WithId<Organization>;
    expect(saved.name).toBe('Test Medical Practice LLC');
    expect(saved.identifier).toEqual(
      expect.arrayContaining([
        { system: NPI_SYSTEM, value: '3564119220' },
        { system: EIN_SYSTEM, value: '123456789' },
      ])
    );
    expect(
      saved.type?.some((t) =>
        t.coding?.some((c) => c.system === ORGANIZATION_TYPE_SYSTEM && c.code === PROVIDER_ORGANIZATION_TYPE)
      )
    ).toBe(true);
    expect(saved.telecom).toEqual([{ system: 'phone', value: '(617) 555-0142' }]);
  });

  test('blocks save with field errors on invalid NPI and missing EIN', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const createSpy = vi.spyOn(medplum, 'createResource');
    setup({ onSaved });

    await user.type(screen.getByLabelText(/^Name/), 'Bad Org');
    await user.type(screen.getByLabelText(/NPI/), '1234567890');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('NPI must be 10 digits with a valid check digit')).toBeInTheDocument();
    expect(screen.getByText('Tax ID (EIN) must be 9 digits, e.g. 12-3456789')).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  test('rejects a phone starting with 0 or 1', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/^Name/), 'Org');
    await user.type(screen.getByLabelText(/NPI/), '3564119220');
    await user.type(screen.getByLabelText(/Tax ID/), '123456789');
    await user.type(screen.getByLabelText(/Phone/), '1234567890');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Phone must be 10 digits and not start with 0 or 1')).toBeInTheDocument();
  });

  test('edits an organization preserving unrelated identifiers', async () => {
    const user = userEvent.setup();
    const existing = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Old Name',
      identifier: [
        { system: 'https://example.com/legacy-id', value: 'legacy' },
        { system: NPI_SYSTEM, value: '1234567893' },
        { system: EIN_SYSTEM, value: '987654321' },
      ],
    });
    const onSaved = vi.fn();
    setup({ organization: existing, onSaved });

    const nameInput = screen.getByLabelText(/^Name/);
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const saved = onSaved.mock.calls[0][0] as WithId<Organization>;
    expect(saved.id).toBe(existing.id);
    expect(saved.name).toBe('New Name');
    expect(saved.identifier).toEqual(
      expect.arrayContaining([
        { system: 'https://example.com/legacy-id', value: 'legacy' },
        { system: NPI_SYSTEM, value: '1234567893' },
        { system: EIN_SYSTEM, value: '987654321' },
      ])
    );
  });
});
