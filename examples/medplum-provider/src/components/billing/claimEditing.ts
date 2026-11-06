// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HTTP_HL7_ORG } from '@medplum/core';
import type { Claim, ClaimDiagnosis, ClaimItem, Coding } from '@medplum/fhirtypes';

/** A CMS-1500 claim holds up to 12 diagnoses (box 21, A to L). */
export const MAX_CLAIM_DIAGNOSES = 12;

/** A service line points to up to 4 diagnoses (box 24E). */
export const MAX_DIAGNOSIS_POINTERS = 4;

const ICD10_SYSTEM = `${HTTP_HL7_ORG}/fhir/sid/icd-10`;

/**
 * Renumbers the diagnoses in their new order and moves each line's pointers with them, dropping pointers to removed
 * diagnoses. The first diagnosis is the principal one.
 * @param claim - The claim.
 * @param diagnoses - The diagnoses in their new order, still holding their old sequences.
 * @returns The claim with the diagnoses renumbered.
 */
function withDiagnoses(claim: Claim, diagnoses: ClaimDiagnosis[]): Claim {
  const newSequence = new Map(diagnoses.map((d, i) => [d.sequence, i + 1]));
  return {
    ...claim,
    diagnosis: diagnoses.map((d, i) => ({
      ...d,
      sequence: i + 1,
      type: [{ coding: [{ code: i === 0 ? 'principal' : 'secondary' }] }],
    })),
    item: claim.item?.map((item) => {
      const pointers = (item.diagnosisSequence ?? [])
        .map((s) => newSequence.get(s))
        .filter((s): s is number => s !== undefined);
      return { ...item, diagnosisSequence: pointers.length ? pointers : undefined };
    }),
  };
}

export function addDiagnosis(claim: Claim, coding: Coding): Claim {
  const diagnoses = claim.diagnosis ?? [];
  if (diagnoses.length >= MAX_CLAIM_DIAGNOSES) {
    return claim;
  }
  const added: ClaimDiagnosis = {
    sequence: diagnoses.length + 1,
    diagnosisCodeableConcept: { coding: [{ ...coding, system: ICD10_SYSTEM }] },
  };
  return withDiagnoses(claim, [...diagnoses, added]);
}

export function removeDiagnosis(claim: Claim, sequence: number): Claim {
  return withDiagnoses(
    claim,
    (claim.diagnosis ?? []).filter((d) => d.sequence !== sequence)
  );
}

/**
 * Moves a diagnosis to a new position, e.g. to make it the principal diagnosis.
 * @param claim - The claim.
 * @param sequence - The diagnosis to move.
 * @param position - Its new 1-based position.
 * @returns The claim with the diagnoses reordered.
 */
export function moveDiagnosis(claim: Claim, sequence: number, position: number): Claim {
  const diagnoses = [...(claim.diagnosis ?? [])];
  const from = diagnoses.findIndex((d) => d.sequence === sequence);
  if (from < 0) {
    return claim;
  }
  const [moved] = diagnoses.splice(from, 1);
  diagnoses.splice(Math.min(Math.max(position - 1, 0), diagnoses.length), 0, moved);
  return withDiagnoses(claim, diagnoses);
}

export function updateLine(claim: Claim, sequence: number, changes: Partial<ClaimItem>): Claim {
  return {
    ...claim,
    item: claim.item?.map((item) => (item.sequence === sequence ? { ...item, ...changes } : item)),
  };
}

/**
 * Adds an empty service line for the same encounter as the claim's other lines.
 * @param claim - The claim.
 * @returns The claim with the new line last.
 */
export function addLine(claim: Claim): Claim {
  const items = claim.item ?? [];
  const encounter = items.find((item) => item.encounter?.length)?.encounter;
  return {
    ...claim,
    item: [
      ...items,
      {
        sequence: items.length + 1,
        productOrService: {},
        quantity: { value: 1 },
        ...(encounter ? { encounter } : {}),
      },
    ],
  };
}

export function removeLine(claim: Claim, sequence: number): Claim {
  return {
    ...claim,
    item: (claim.item ?? [])
      .filter((item) => item.sequence !== sequence)
      .map((item, i) => ({ ...item, sequence: i + 1 })),
  };
}

export function getLineCharge(item: ClaimItem): number {
  return item.net?.value ?? (item.unitPrice?.value ?? 0) * (item.quantity?.value ?? 1);
}

/**
 * Readies an edited claim to save: drops lines with no code and sets the total to the sum of the lines.
 * @param claim - The edited claim.
 * @returns The claim to save.
 */
export function finishClaimEdit(claim: Claim): Claim {
  const items = (claim.item ?? [])
    .filter((item) => item.productOrService?.coding?.length)
    .map((item, i) => ({ ...item, sequence: i + 1 }));
  return {
    ...claim,
    item: items,
    total: { ...claim.total, value: items.reduce((sum, item) => sum + getLineCharge(item), 0) },
  };
}
