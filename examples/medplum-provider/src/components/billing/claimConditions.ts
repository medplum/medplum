// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, ProfileResource, WithId } from '@medplum/core';
import {
  addProfileToResource,
  createReference,
  getReferenceString,
  HTTP_HL7_ORG,
  HTTP_TERMINOLOGY_HL7_ORG,
} from '@medplum/core';
import type { Claim, Coding, Condition, Encounter, EncounterDiagnosis, Reference } from '@medplum/fhirtypes';

export const CLINICAL_STATUS_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/condition-clinical`;

/** The clinical statuses a diagnosis can have, as the visit's Add diagnosis modal offers them. */
export const CLINICAL_STATUSES: readonly Coding[] = [
  { system: CLINICAL_STATUS_SYSTEM, code: 'active', display: 'Active' },
  { system: CLINICAL_STATUS_SYSTEM, code: 'recurrence', display: 'Recurrence' },
  { system: CLINICAL_STATUS_SYSTEM, code: 'relapse', display: 'Relapse' },
  { system: CLINICAL_STATUS_SYSTEM, code: 'inactive', display: 'Inactive' },
  { system: CLINICAL_STATUS_SYSTEM, code: 'remission', display: 'Remission' },
  { system: CLINICAL_STATUS_SYSTEM, code: 'resolved', display: 'Resolved' },
];

const ICD10_CM_SYSTEM = `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`;

/** A claim's diagnoses mapped to the visit's Conditions, by ICD-10 code. */
export type ConditionsByCode = ReadonlyMap<string, WithId<Condition>>;

/** Pins a claim to the visit it bills, so the link survives the claim having no service lines. */
export const CLAIM_ENCOUNTER_EXTENSION_URL = 'https://medplum.com/fhir/StructureDefinition/claim-encounter';

/**
 * The encounter a claim bills: the visit it's pinned to, else the first one its service lines point to.
 * @param claim - The claim.
 * @returns The encounter reference, if the claim has one.
 */
export function getClaimEncounter(claim: Claim): Reference<Encounter> | undefined {
  const pinned = claim.extension?.find((e) => e.url === CLAIM_ENCOUNTER_EXTENSION_URL)?.valueReference;
  return (
    (pinned?.reference ? (pinned as Reference<Encounter>) : undefined) ??
    claim.item?.find((item) => item.encounter?.length)?.encounter?.[0]
  );
}

/**
 * Pins a claim to the visit it bills. A claim made from a visit stays with that visit.
 * @param claim - The claim.
 * @param encounter - The visit's encounter; defaults to the one the claim already bills.
 * @returns The claim, pinned to the encounter if it has one.
 */
export function pinClaimEncounter(claim: Claim, encounter = getClaimEncounter(claim)): Claim {
  if (!encounter?.reference) {
    return claim;
  }
  const others = (claim.extension ?? []).filter((e) => e.url !== CLAIM_ENCOUNTER_EXTENSION_URL);
  return {
    ...claim,
    extension: [...others, { url: CLAIM_ENCOUNTER_EXTENSION_URL, valueReference: { reference: encounter.reference } }],
  };
}

/**
 * The ICD-10 code of a Condition.
 * @param condition - The condition.
 * @returns Its code, if it has one.
 */
export function getConditionCode(condition: Condition): string | undefined {
  return condition.code?.coding?.find((c) => c.code)?.code;
}

/**
 * The status a Condition is in, as one of `CLINICAL_STATUSES`.
 * @param condition - The condition.
 * @returns The status, if it has one.
 */
export function getClinicalStatus(condition: Condition | undefined): Coding | undefined {
  const code = condition?.clinicalStatus?.coding?.[0]?.code;
  return CLINICAL_STATUSES.find((s) => s.code === code);
}

/**
 * Loads the Conditions the visit lists as its diagnoses, keyed by ICD-10 code.
 * @param medplum - The Medplum client.
 * @param encounterRef - The visit's encounter.
 * @returns The visit's Conditions by code.
 */
export async function loadEncounterConditions(
  medplum: MedplumClient,
  encounterRef: Reference<Encounter>
): Promise<Map<string, WithId<Condition>>> {
  const encounter = await medplum.readReference(encounterRef);
  const refs = (encounter.diagnosis ?? [])
    .map((d) => d.condition)
    .filter((r) => r?.reference) as Reference<Condition>[];
  const conditions = await Promise.all(refs.map((ref) => medplum.readReference(ref).catch(() => undefined)));
  return toConditionsByCode(conditions.filter((c): c is WithId<Condition> => !!c));
}

function toConditionsByCode(conditions: WithId<Condition>[]): Map<string, WithId<Condition>> {
  const result = new Map<string, WithId<Condition>>();
  for (const condition of conditions) {
    const code = getConditionCode(condition);
    if (code && !result.has(code)) {
      result.set(code, condition);
    }
  }
  return result;
}

/**
 * Brings the visit's diagnoses in line with the claim's: a Condition for each claim diagnosis (created, as active, if
 * the visit doesn't have one for that code). The visit's own claim sets the encounter's list and order; Conditions it
 * drops come off the list but are kept. A related claim only adds to the visit's list, after what's there.
 * @param medplum - The Medplum client.
 * @param claim - The claim, with its diagnoses as edited.
 * @param encounterRef - The visit's encounter.
 * @param known - The Conditions already loaded for the visit, by code.
 * @returns The visit's Conditions by code, including any just created.
 */
export async function syncEncounterDiagnoses(
  medplum: MedplumClient,
  claim: Claim,
  encounterRef: Reference<Encounter>,
  known: ConditionsByCode
): Promise<Map<string, WithId<Condition>>> {
  const encounterId = encounterRef.reference?.split('/')[1] ?? '';
  const encounter = await medplum.readResource('Encounter', encounterId, { cache: 'no-cache' });
  const byCode = new Map(known);
  const diagnosis: EncounterDiagnosis[] = [];
  for (const d of claim.diagnosis ?? []) {
    const coding = d.diagnosisCodeableConcept?.coding?.[0];
    if (!coding?.code) {
      continue;
    }
    let condition = byCode.get(coding.code);
    if (!condition) {
      condition = await medplum.createResource(newDiagnosisCondition(claim, encounter, coding, medplum.getProfile()));
      byCode.set(coding.code, condition);
    }
    const reference = getReferenceString(condition);
    const existing = encounter.diagnosis?.find((e) => e.condition?.reference === reference);
    diagnosis.push({ ...existing, condition: { reference }, rank: diagnosis.length + 1 });
  }
  if (claim.related?.length) {
    const listed = new Set(encounter.diagnosis?.map((e) => e.condition?.reference));
    const added = diagnosis.filter((d) => !listed.has(d.condition?.reference));
    if (added.length) {
      const merged = [...(encounter.diagnosis ?? []), ...added].map((d, i) => ({ ...d, rank: i + 1 }));
      await medplum.patchResource('Encounter', encounter.id, [{ op: 'add', path: '/diagnosis', value: merged }]);
    }
  } else if (diagnosis.length) {
    await medplum.patchResource('Encounter', encounter.id, [{ op: 'add', path: '/diagnosis', value: diagnosis }]);
  } else if (encounter.diagnosis) {
    await medplum.patchResource('Encounter', encounter.id, [{ op: 'remove', path: '/diagnosis' }]);
  }
  return byCode;
}

/**
 * A new Condition for a diagnosis added on the claim, shaped like the ones the visit's Add diagnosis modal creates.
 * @param claim - The claim.
 * @param encounter - The visit's encounter.
 * @param coding - The diagnosis's ICD-10 coding.
 * @param author - Who is adding it, recorded on the Condition when it's a practitioner.
 * @returns The Condition to create, as active.
 */
function newDiagnosisCondition(
  claim: Claim,
  encounter: WithId<Encounter>,
  coding: Coding,
  author: ProfileResource | undefined
): Condition {
  return addProfileToResource(
    {
      resourceType: 'Condition',
      category: [
        {
          coding: [
            {
              system: `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/condition-category`,
              code: 'problem-list-item',
              display: 'Problem List Item',
            },
          ],
          text: 'Problem List Item',
        },
      ],
      subject: claim.patient,
      encounter: { reference: getReferenceString(encounter) },
      code: { coding: [{ system: ICD10_CM_SYSTEM, code: coding.code, display: coding.display }] },
      clinicalStatus: { coding: [CLINICAL_STATUSES[0]] },
      recordedDate: new Date().toISOString(),
      ...(author?.resourceType === 'Practitioner' ? { recorder: createReference(author) } : {}),
    },
    `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns`
  );
}

/**
 * Sets a Condition's clinical status.
 * @param medplum - The Medplum client.
 * @param condition - The condition.
 * @param status - The new status, one of `CLINICAL_STATUSES`.
 * @returns The updated condition.
 */
export async function setClinicalStatus(
  medplum: MedplumClient,
  condition: WithId<Condition>,
  status: Coding
): Promise<WithId<Condition>> {
  return medplum.updateResource({ ...condition, clinicalStatus: { coding: [status] } });
}
