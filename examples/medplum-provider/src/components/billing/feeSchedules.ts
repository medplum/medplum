// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { ChargeItemDefinition, Coding } from '@medplum/fhirtypes';

/**
 * Marks a ChargeItemDefinition as a payer's fee schedule (the rates the payer agreed to pay), as distinct from the
 * chargemaster (what the practice bills).
 */
export const FEE_SCHEDULE_TAG: Coding = {
  system: 'https://medplum.com/billing',
  code: 'fee-schedule',
  display: 'Fee schedule',
};

/** The `useContext` type that names the payer a fee schedule applies to, with a reference to its Organization. */
export const PAYER_USAGE_CONTEXT: Coding = { system: 'https://medplum.com/billing/usage-context', code: 'payer' };

export const FEE_SCHEDULE_TAG_VALUE = `${FEE_SCHEDULE_TAG.system}|${FEE_SCHEDULE_TAG.code}`;

/** Keeps fee schedules out of a chargemaster search. */
export const NOT_FEE_SCHEDULE_FILTER: Filter = { code: '_tag', operator: Operator.NOT, value: FEE_SCHEDULE_TAG_VALUE };

/**
 * The payer a fee schedule applies to.
 * @param schedule - The fee schedule.
 * @returns The payer's name, if the schedule names one.
 */
export function getFeeSchedulePayer(schedule: ChargeItemDefinition): string | undefined {
  const context = schedule.useContext?.find(
    (c) => c.code.system === PAYER_USAGE_CONTEXT.system && c.code.code === PAYER_USAGE_CONTEXT.code
  );
  return context?.valueReference?.display ?? context?.valueCodeableConcept?.text;
}
