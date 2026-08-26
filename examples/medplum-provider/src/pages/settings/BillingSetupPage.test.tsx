// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { BillingSetupPage } from './BillingSetupPage';

describe('BillingSetupPage', () => {
  test('renders payers and billing providers as tabs, payers first', async () => {
    const user = userEvent.setup();
    const medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <BillingSetupPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Billing Setup')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Payers' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/No payers imported yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Billing Providers' }));

    expect(await screen.findByRole('button', { name: /New organization/ })).toBeInTheDocument();
    expect(screen.getByText(/No billing providers yet/)).toBeInTheDocument();
  });
});
