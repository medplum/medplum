// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, HTTP_HL7_ORG } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  ClaimDiagnosis,
  ClaimItem,
  CodeableConcept,
  Condition,
  Encounter,
  Extension,
  Patient,
} from '@medplum/fhirtypes';
import {
  CHARGE_ITEM_MODIFIER_URL,
  CHARGE_ITEM_SEQUENCE_URL,
  getChargeItemModifiers,
  sortChargeItems,
} from '../../utils/chargeitems';
import { getLineAuthor, withLineAuthor } from '../../utils/claims';
import { pinClaimEncounter } from '../billing/claimConditions';
import { getLineCharge } from '../billing/claimEditing';

const SERVICE_BILLING_CODE_URL = `${HTTP_HL7_ORG}/fhir/uv/order-catalog/StructureDefinition/ServiceBillingCode`;
const ICD10_SYSTEM = `${HTTP_HL7_ORG}/fhir/sid/icd-10`;
const ICD10_CM_SYSTEM = `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`;

/**
 * The visit's diagnoses and charge items as a claim, so the visit can be edited with the claim editor's diagnosis and
 * service line sections. Each line's `id` is its charge item's id; its diagnosis pointers come from the charge item's
 * `reason` codes. Never saved as a Claim.
 * @param patient - The visit's patient.
 * @param encounter - The visit's encounter.
 * @param conditions - The visit's diagnoses, in order.
 * @param chargeItems - The visit's charge items.
 * @returns The claim to edit.
 */
export function buildVisitSheet(
  patient: WithId<Patient>,
  encounter: WithId<Encounter>,
  conditions: Condition[],
  chargeItems: WithId<ChargeItem>[]
): Claim {
  const diagnosis: ClaimDiagnosis[] = conditions
    .map((c) => c.code?.coding?.find((coding) => coding.system === ICD10_CM_SYSTEM) ?? c.code?.coding?.[0])
    .filter((coding) => !!coding?.code)
    .map((coding, i) => ({
      sequence: i + 1,
      diagnosisCodeableConcept: { coding: [{ ...coding, system: ICD10_SYSTEM }] },
      type: [{ coding: [{ code: i === 0 ? 'principal' : 'secondary' }] }],
    }));
  const sequenceByCode = new Map(diagnosis.map((d) => [d.diagnosisCodeableConcept?.coding?.[0]?.code, d.sequence]));
  return pinClaimEncounter(
    {
      resourceType: 'Claim',
      status: 'draft',
      use: 'claim',
      type: { coding: [{ code: 'professional' }] },
      priority: { coding: [{ code: 'normal' }] },
      created: encounter.period?.start ?? new Date().toISOString(),
      patient: createReference(patient),
      provider: { display: 'Visit' },
      insurance: [],
      diagnosis,
      item: sortChargeItems(chargeItems).map((chargeItem, i) =>
        chargeItemToLine(chargeItem, i + 1, sequenceByCode, encounter)
      ),
    },
    createReference(encounter)
  );
}

function chargeItemToLine(
  chargeItem: WithId<ChargeItem>,
  sequence: number,
  sequenceByCode: Map<string | undefined, number>,
  encounter: WithId<Encounter>
): ClaimItem {
  const units = chargeItem.quantity?.value ?? 1;
  const net = chargeItem.priceOverride;
  const pointers = (chargeItem.reason ?? [])
    .map((r) => sequenceByCode.get(r.coding?.[0]?.code))
    .filter((s): s is number => s !== undefined);
  return withLineAuthor(
    {
      id: chargeItem.id,
      sequence,
      encounter: [createReference(encounter)],
      productOrService: { coding: chargeItem.code.coding, text: chargeItem.code.text },
      modifier: getChargeItemModifiers(chargeItem),
      quantity: { value: units },
      ...(net?.value === undefined
        ? {}
        : { net, unitPrice: { value: net.value / (units || 1), currency: net.currency ?? 'USD' } }),
      ...(pointers.length ? { diagnosisSequence: pointers } : {}),
    },
    chargeItem.enterer ?? chargeItem.meta?.author,
    chargeItem.enteredDate
  );
}

/**
 * The charge item for a service line: the line's code, modifiers, units, charge, diagnoses and position written over
 * the charge item it came from. A charge item priced by its definition keeps the definition until its code or price
 * is changed here, so the price typed in isn't replaced the next time the visit loads.
 * @param line - The service line.
 * @param diagnosis - The visit's diagnoses, for the line's pointers.
 * @param existing - The charge item the line came from, if it has been saved.
 * @param patient - The visit's patient.
 * @param encounter - The visit's encounter.
 * @returns The charge item to save.
 */
export function lineToChargeItem(
  line: ClaimItem,
  diagnosis: ClaimDiagnosis[],
  existing: ChargeItem | undefined,
  patient: WithId<Patient>,
  encounter: WithId<Encounter>
): ChargeItem {
  const code: CodeableConcept = { coding: line.productOrService?.coding, text: line.productOrService?.text };
  const net = line.net ?? (line.unitPrice ? { value: getLineCharge(line), currency: 'USD' } : undefined);
  const reason = (line.diagnosisSequence ?? [])
    .map((s) => diagnosis.find((d) => d.sequence === s)?.diagnosisCodeableConcept?.coding?.[0])
    .filter((coding) => !!coding?.code)
    .map((coding) => ({ coding: [{ ...coding, system: ICD10_CM_SYSTEM }] }));
  const codeChanged = !!existing && existing.code.coding?.[0]?.code !== code.coding?.[0]?.code;
  const priceChanged = !!existing && existing.priceOverride?.value !== net?.value;
  const keepDefinition = existing?.definitionCanonical?.length && !codeChanged && !priceChanged;
  const otherExtensions = (existing?.extension ?? []).filter(
    (e) => ![CHARGE_ITEM_MODIFIER_URL, CHARGE_ITEM_SEQUENCE_URL, SERVICE_BILLING_CODE_URL].includes(e.url)
  );
  const extension: Extension[] = [
    ...otherExtensions,
    { url: SERVICE_BILLING_CODE_URL, valueCodeableConcept: code },
    ...(line.modifier?.length
      ? [
          {
            url: CHARGE_ITEM_MODIFIER_URL,
            valueCodeableConcept: { coding: line.modifier.flatMap((m) => m.coding ?? []) },
          },
        ]
      : []),
    { url: CHARGE_ITEM_SEQUENCE_URL, valueInteger: line.sequence },
  ];
  const { author, added } = getLineAuthor(line);
  return {
    ...(existing ?? {
      resourceType: 'ChargeItem',
      status: 'planned',
      subject: createReference(patient),
      context: createReference(encounter),
      occurrenceDateTime: new Date().toISOString(),
      ...(author ? { enterer: author as ChargeItem['enterer'], enteredDate: added ?? new Date().toISOString() } : {}),
    }),
    code,
    extension,
    quantity: { value: line.quantity?.value ?? 1 },
    priceOverride: net,
    reason: reason.length ? reason : undefined,
    definitionCanonical: keepDefinition ? existing?.definitionCanonical : undefined,
  };
}

/**
 * Saves the visit's service lines as its charge items: creates a charge item for each new line with a code, updates
 * the ones that changed, and deletes the ones whose lines were removed. Lines with no code yet aren't saved.
 * @param medplum - The Medplum client.
 * @param sheet - The visit, as edited.
 * @param saved - The visit's charge items as last saved, by id.
 * @param patient - The visit's patient.
 * @param encounter - The visit's encounter.
 * @returns The visit's charge items, in line order, and the id each new line's charge item got.
 */
export async function saveVisitLines(
  medplum: MedplumClient,
  sheet: Claim,
  saved: ReadonlyMap<string, WithId<ChargeItem>>,
  patient: WithId<Patient>,
  encounter: WithId<Encounter>
): Promise<{ chargeItems: WithId<ChargeItem>[]; createdIds: Map<string, string> }> {
  const createdIds = new Map<string, string>();
  const kept = new Set<string>();
  const chargeItems: WithId<ChargeItem>[] = [];
  for (const line of sheet.item ?? []) {
    if (!line.productOrService?.coding?.[0]?.code) {
      continue;
    }
    const existing = line.id ? saved.get(line.id) : undefined;
    const next = lineToChargeItem(line, sheet.diagnosis ?? [], existing, patient, encounter);
    if (existing) {
      kept.add(existing.id);
      chargeItems.push(
        JSON.stringify(next) === JSON.stringify(existing)
          ? existing
          : await medplum.updateResource(next as WithId<ChargeItem>)
      );
    } else {
      const created = await medplum.createResource(next);
      if (line.id) {
        createdIds.set(line.id, created.id);
      }
      chargeItems.push(created);
    }
  }
  for (const id of saved.keys()) {
    if (!kept.has(id)) {
      await medplum.deleteResource('ChargeItem', id);
    }
  }
  return { chargeItems, createdIds };
}
