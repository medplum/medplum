// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { BillingSetupPage } from './BillingSetupPage';

describe('BillingSetupPage', () => {
  test('renders the Candid payer directory', async () => {
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

    expect(screen.getByText('Candid Payer Directory')).toBeInTheDocument();
    expect(await screen.findByText(/No payers imported yet/)).toBeInTheDocument();
  });
});
