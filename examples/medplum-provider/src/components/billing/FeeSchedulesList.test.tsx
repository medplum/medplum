// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ChargeItemDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, test } from 'vitest';
import { render } from '../../test-utils/render';
import { FEE_SCHEDULE_TAG, PAYER_USAGE_CONTEXT } from './feeSchedules';
import { FeeSchedulesList } from './FeeSchedulesList';

describe('FeeSchedulesList', () => {
  test("lists the payers' fee schedules and opens one", async () => {
    const medplum = new MockClient();
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
    const router = createMemoryRouter([{ path: '*', element: <FeeSchedulesList /> }]);
    render(
      <MedplumProvider medplum={medplum}>
        <RouterProvider router={router} />
      </MedplumProvider>
    );

    const row = (await screen.findByText('Aetna 2026')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Aetna')).toBeInTheDocument();
    expect(within(row).getByText('active')).toBeInTheDocument();
    expect(within(row).getByText('1/1/2026 – 12/31/2026')).toBeInTheDocument();

    await userEvent.setup().click(within(row).getByText('Aetna 2026'));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ChargeItemDefinition/${schedule.id}`));
  });
});
