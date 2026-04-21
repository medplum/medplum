// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Condition, Coverage, Encounter, Patient } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson } from '@medplum/mock';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SubmitClaimModal } from './SubmitClaimModal';

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-1',
  status: 'finished',
  class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
};

const mockCondition: Condition = {
  resourceType: 'Condition',
  subject: { reference: 'Patient/patient-1' },
  code: {
    text: 'Headache',
    coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'R51', display: 'Headache' }],
  },
};

const mockInsurance1: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: 'coverage-1',
  status: 'active',
  beneficiary: { reference: 'Patient/patient-1' },
  payor: [{ display: 'Blue Cross' }],
  subscriberId: 'MEM001',
};

const mockInsurance2: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: 'coverage-2',
  status: 'active',
  beneficiary: { reference: 'Patient/patient-1' },
  payor: [{ display: 'Aetna' }],
  subscriberId: 'MEM002',
};

const mockSelfPay: WithId<Coverage> = {
  resourceType: 'Coverage',
  id: 'self-pay-1',
  status: 'active',
  beneficiary: { reference: 'Patient/patient-1' },
  payor: [{ reference: 'Patient/patient-1' }],
  type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'SELFPAY' }] },
};

const defaultProps = {
  opened: true,
  submitting: false,
  patient: HomerSimpson as WithId<Patient>,
  encounter: mockEncounter,
  coverages: [mockInsurance1, mockSelfPay],
  selectedCoverage: mockInsurance1 as WithId<Coverage> | undefined,
  conditions: [mockCondition],
  chargeItems: undefined,
  practitioner: DrAliceSmith,
  onClose: vi.fn(),
  onSubmitClaim: vi.fn(),
};

function setup(overrides: Partial<React.ComponentProps<typeof SubmitClaimModal>> = {}): void {
  act(() => {
    render(
      <MantineProvider>
        <SubmitClaimModal {...defaultProps} {...overrides} />
      </MantineProvider>
    );
  });
}

describe('SubmitClaimModal', () => {

  test('review information is displayed', () => {
    setup({ coverages: [mockInsurance1, mockSelfPay], selectedCoverage: mockInsurance1 });
    expect(screen.getByText('Blue Cross')).toBeInTheDocument();
    expect(screen.getByText('MEM001')).toBeInTheDocument();
    expect(screen.getByText('Headache (R51)')).toBeInTheDocument();
    expect(screen.getByText(/Smith/)).toBeInTheDocument();
  });

  test('insurance pay button is disabled when no insurance coverages exist', () => {
    setup({ coverages: [mockSelfPay], selectedCoverage: mockSelfPay });
    expect(screen.getByRole('button', { name: 'Insurance pay' })).toBeDisabled();
  });

  describe('coverage pre-selection', () => {
    test('pre-selects only selectedCoverage when multiple insurance coverages exist', async () => {
      setup({
        coverages: [mockInsurance1, mockInsurance2, mockSelfPay],
        selectedCoverage: mockInsurance1,
      });

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes[0]).toBeChecked();
        expect(checkboxes[1]).not.toBeChecked();
      });
    });

    test('pre-selects coverage2 when it is the selectedCoverage', async () => {
      setup({
        coverages: [mockInsurance1, mockInsurance2, mockSelfPay],
        selectedCoverage: mockInsurance2,
      });

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes[0]).not.toBeChecked();
        expect(checkboxes[1]).toBeChecked();
      });
    });
  });

  describe('insurance submission', () => {
    test('submits only the pre-selected coverage as a Reference', async () => {
      const onSubmitClaim = vi.fn();
      const user = userEvent.setup();

      setup({
        coverages: [mockInsurance1, mockInsurance2, mockSelfPay],
        selectedCoverage: mockInsurance1,
        onSubmitClaim,
      });

      await user.click(screen.getByRole('button', { name: 'Submit claim' }));

      expect(onSubmitClaim).toHaveBeenCalledWith([createReference(mockInsurance1)]);
    });

    test('submit button is disabled when no insurance coverage is selected', async () => {
      const user = userEvent.setup();

      setup({ coverages: [mockInsurance1, mockSelfPay], selectedCoverage: mockInsurance1 });

      const [checkbox] = screen.getAllByRole('checkbox');
      await user.click(checkbox);

      expect(screen.getByRole('button', { name: 'Submit claim' })).toBeDisabled();
    });

    test('submits deselected-then-reselected coverage correctly', async () => {
      const onSubmitClaim = vi.fn();
      const user = userEvent.setup();

      setup({
        coverages: [mockInsurance1, mockInsurance2, mockSelfPay],
        selectedCoverage: mockInsurance1,
        onSubmitClaim,
      });

      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]); // deselect coverage1
      await user.click(checkboxes[1]); // select coverage2

      await user.click(screen.getByRole('button', { name: 'Submit claim' }));

      expect(onSubmitClaim).toHaveBeenCalledWith([createReference(mockInsurance2)]);
    });

    test('"Select all" submits all insurance coverage references', async () => {
      const onSubmitClaim = vi.fn();
      const user = userEvent.setup();

      setup({
        coverages: [mockInsurance1, mockInsurance2, mockSelfPay],
        selectedCoverage: mockInsurance1,
        onSubmitClaim,
      });

      await user.click(screen.getByText('Select all'));
      await user.click(screen.getByRole('button', { name: 'Submit claim' }));

      expect(onSubmitClaim).toHaveBeenCalledWith([
        createReference(mockInsurance1),
        createReference(mockInsurance2),
      ]);
    });

    test('"Deselect all" clears all selections and disables submit', async () => {
      const user = userEvent.setup();

      setup({
        coverages: [mockInsurance1, mockInsurance2, mockSelfPay],
        selectedCoverage: mockInsurance1,
      });

      await user.click(screen.getByText('Select all'));
      await user.click(screen.getByText('Deselect all'));

      for (const checkbox of screen.getAllByRole('checkbox')) {
        expect(checkbox).not.toBeChecked();
      }
      expect(screen.getByRole('button', { name: 'Submit claim' })).toBeDisabled();
    });
  });

  describe('self-pay submission', () => {
    test('submits self-pay coverage reference when self-pay billing type is selected', async () => {
      const onSubmitClaim = vi.fn();
      const user = userEvent.setup();

      setup({
        coverages: [mockInsurance1, mockSelfPay],
        selectedCoverage: mockInsurance1,
        onSubmitClaim,
      });

      await user.click(screen.getByRole('button', { name: 'Self-pay' }));
      await user.click(screen.getByRole('button', { name: 'Submit claim' }));

      expect(onSubmitClaim).toHaveBeenCalledWith([createReference(mockSelfPay)]);
    });

    test('submits empty array when self-pay selected but no self-pay coverage exists', async () => {
      const onSubmitClaim = vi.fn();
      const user = userEvent.setup();

      setup({
        coverages: [mockInsurance1],
        selectedCoverage: mockInsurance1,
        onSubmitClaim,
      });

      await user.click(screen.getByRole('button', { name: 'Self-pay' }));
      await user.click(screen.getByRole('button', { name: 'Submit claim' }));

      expect(onSubmitClaim).toHaveBeenCalledWith([]);
    });

    test('self-pay submit button is always enabled', async () => {
      const user = userEvent.setup();

      setup({ coverages: [mockSelfPay], selectedCoverage: mockSelfPay });

      await user.click(screen.getByRole('button', { name: 'Self-pay' }));

      expect(screen.getByRole('button', { name: 'Submit claim' })).not.toBeDisabled();
    });
  });
});
