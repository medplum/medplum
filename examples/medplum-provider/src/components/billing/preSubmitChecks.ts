// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim } from '@medplum/fhirtypes';

export type ClaimIssueCode =
  | 'no-insurance'
  | 'no-diagnosis'
  | 'no-pointer'
  | 'unused-diagnosis'
  | 'rejected'
  | 'denied'
  | 'paid-incorrectly'
  | 'patient-balance';

/** Why a claim needs someone's attention. */
export interface ClaimIssue {
  readonly code: ClaimIssueCode;
  /** A short badge label. */
  readonly label: string;
  readonly color: string;
  /** What exactly is wrong, for a tooltip or the claim's Next Steps. */
  readonly detail: string;
}

/**
 * The problems that would get a draft claim rejected: no coverage, no diagnoses, lines with no diagnosis pointer,
 * and diagnoses no line points to.
 * @param claim - The claim.
 * @returns The pre-submit issues, empty when the claim looks ready.
 */
export function getPreSubmitIssues(claim: Claim): ClaimIssue[] {
  const issues: ClaimIssue[] = [];
  const diagnoses = claim.diagnosis ?? [];
  const lines = claim.item ?? [];
  if (!claim.insurance?.length) {
    issues.push({
      code: 'no-insurance',
      label: 'No coverage',
      color: 'orange',
      detail: "Add the patient's coverage to the claim.",
    });
  }
  if (!diagnoses.length) {
    issues.push({
      code: 'no-diagnosis',
      label: 'No diagnoses',
      color: 'orange',
      detail: 'Add at least one diagnosis. Payers reject a claim without one.',
    });
  }
  const unpointed = lines.filter((item) => !item.diagnosisSequence?.length);
  if (unpointed.length) {
    issues.push({
      code: 'no-pointer',
      label: 'Missing Dx pointer',
      color: 'orange',
      detail: `${plural(unpointed.length, 'line has', 'lines have')} no diagnosis pointer: ${unpointed
        .map((item) => item.productOrService?.coding?.[0]?.code ?? `line ${item.sequence}`)
        .join(', ')}.`,
    });
  }
  const pointed = new Set(lines.flatMap((item) => item.diagnosisSequence ?? []));
  const unused = diagnoses.filter((d) => !pointed.has(d.sequence));
  if (diagnoses.length && unused.length) {
    issues.push({
      code: 'unused-diagnosis',
      label: 'Unused diagnosis',
      color: 'yellow',
      detail: `${plural(unused.length, 'diagnosis is', 'diagnoses are')} on no line: ${unused
        .map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code ?? `#${d.sequence}`)
        .join(', ')}.`,
    });
  }
  return issues;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
