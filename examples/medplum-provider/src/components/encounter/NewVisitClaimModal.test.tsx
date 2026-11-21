// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT } from '@medplum/core';
import type { ChargeItem, Condition, Coverage } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { render } from '../../test-utils/render';
import { NewVisitClaimModal } from './NewVisitClaimModal';

const condition = (code: string): Condition => ({
  resourceType: 'Condition',
  subject: { reference: 'Patient/p1' },
  code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code }] },
});
const chargeItem = (id: string, code: string, price: number, dx: string[] = []): WithId<ChargeItem> => ({
  resourceType: 'ChargeItem',
  id,
  status: 'planned',
  subject: { reference: 'Patient/p1' },
  code: { coding: [{ system: CPT, code, display: `Service ${code}` }] },
  priceOverride: { value: price, currency: 'USD' },
  reason: dx.map((c) => ({ coding: [{ code: c }] })),
});
const coverage: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: 'cov-1',
  status: 'active',
  beneficiary: { reference: 'Patient/p1' },
  payor: [{ display: 'Acme Health' }],
};

describe('NewVisitClaimModal', () => {
  test('creates a claim from the picked lines, with the diagnoses they point to', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const items = [
      chargeItem('a', '99213', 120, ['E11.9']),
      chargeItem('b', '36415', 20, ['I10']),
      chargeItem('c', '90471', 30),
    ];
    render(
      <MedplumProvider medplum={new MockClient()}>
        <NewVisitClaimModal
          opened
          onClose={onClose}
          chargeItems={items}
          conditions={[condition('I10'), condition('E11.9')]}
          coverages={[coverage]}
          defaultCoverage={coverage}
          unavailable={new Map([['c', 'On another claim']])}
          onCreate={onCreate}
        />
      </MedplumProvider>
    );

    expect(screen.getByRole('button', { name: 'Create Claim' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /90471/ })).toBeDisabled();
    expect(screen.getByText(/On another claim/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /99213/ }));
    // Only the picked line's diagnosis comes along, lettered for the new claim.
    expect(screen.getByText('A · E11.9')).toBeInTheDocument();
    expect(screen.queryByText(/· I10/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Claim · $120.00' }));
    expect(onCreate).toHaveBeenCalledWith([items[0]], coverage);
    expect(onClose).toHaveBeenCalled();
  });
});
