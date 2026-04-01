// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CoverageEligibilityRequest } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test } from 'vitest';
import { render, screen } from '../../test-utils/render';
import { EligibilityListItem } from './EligibilityListItem';

const medplum = new MockClient();

function setup(request: CoverageEligibilityRequest, isSelected = false, href = '/test-href'): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <EligibilityListItem request={request} isSelected={isSelected} href={href} />
      </MedplumProvider>
    </MemoryRouter>
  );
}

const baseRequest: CoverageEligibilityRequest = {
  resourceType: 'CoverageEligibilityRequest',
  id: 'req-1',
  status: 'active',
  purpose: ['benefits'],
  created: '2026-01-15T10:00:00Z',
  patient: { reference: 'Patient/123' },
  insurer: { reference: 'Organization/456', display: 'Aetna' },
};

describe('EligibilityListItem', () => {
  test('renders "Auth Requirements" for purpose auth-requirements', () => {
    setup({ ...baseRequest, purpose: ['auth-requirements'] });
    expect(screen.getByText('Auth Requirements')).toBeInTheDocument();
  });

  test('renders "Discovery" for purpose discovery', () => {
    setup({ ...baseRequest, purpose: ['discovery'] });
    expect(screen.getByText('Discovery')).toBeInTheDocument();
  });

  test('renders "Validation" for purpose validation', () => {
    setup({ ...baseRequest, purpose: ['validation'] });
    expect(screen.getByText('Validation')).toBeInTheDocument();
  });

  test('renders multiple purposes joined by comma', () => {
    setup({ ...baseRequest, purpose: ['benefits', 'discovery'] });
    expect(screen.getByText('Benefits, Discovery')).toBeInTheDocument();
  });

  test('falls back to "Eligibility Check" when no purpose provided', () => {
    // purpose is required by the type but may be absent in real-world data — cast intentionally
    setup({ ...baseRequest, purpose: undefined } as unknown as CoverageEligibilityRequest);
    expect(screen.getByText('Eligibility Check')).toBeInTheDocument();
  });

  test('renders the formatted created date', () => {
    setup(baseRequest);
    expect(screen.getByText(/Jan|1\/15|2026/)).toBeInTheDocument();
  });

  test('renders as a link with the correct href', () => {
    setup(baseRequest, false, '/Patient/123/Coverage/456/CoverageEligibilityRequest/req-1');
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/Patient/123/Coverage/456/CoverageEligibilityRequest/req-1');
  });
});
