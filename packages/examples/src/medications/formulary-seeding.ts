// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import type {
  Bundle,
  BundleEntry,
  Coding,
  MedicationKnowledge,
  MedicationRequest,
  Parameters,
  ValueSet,
} from '@medplum/fhirtypes';

const medplum = new MedplumClient();

// start-block prescribableValueSet
// RxNorm codes at the four prescribable term types.
// On Medplum's hosted service the property code is lowercase `tty`.
const prescribable: ValueSet = {
  resourceType: 'ValueSet',
  url: 'https://example.com/fhir/ValueSet/formulary-prescribable',
  name: 'FormularyPrescribable',
  status: 'active',
  compose: {
    include: [
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        filter: [{ property: 'tty', op: 'in', value: 'SCD,SBD,GPCK,BPCK' }],
      },
    ],
  },
};
await medplum.upsertResource(prescribable, { url: 'https://example.com/fhir/ValueSet/formulary-prescribable' });
// end-block prescribableValueSet

// start-block findCandidates
// Candidate codes for a row that has only a drug name. A person picks the right one.
const candidates = await medplum.valueSetExpand({
  url: 'https://example.com/fhir/ValueSet/formulary-prescribable',
  filter: 'lisinopril 10 MG Oral Tablet',
  count: 10,
});
console.log(candidates.expansion?.contains?.map((c) => `${c.code} ${c.display}`));
// end-block findCandidates

// start-block validateMapping
// The RxNorm code mapped for one row. The checks and the entry below all use this one value.
const rxnormCoding = { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '209387' } satisfies Coding;

// `result` is false for an ingredient, brand name, or other non-prescribable code
const validation: Parameters = await medplum.post(medplum.fhirUrl('ValueSet', '$validate-code').toString(), {
  resourceType: 'Parameters',
  parameter: [
    { name: 'url', valueUri: 'https://example.com/fhir/ValueSet/formulary-prescribable' },
    { name: 'coding', valueCoding: rxnormCoding },
  ],
});
const isPrescribable = validation.parameter?.find((p) => p.name === 'result')?.valueBoolean === true;
if (!isPrescribable) {
  throw new Error('Hold this row for review: the code is not at a prescribable level');
}
// end-block validateMapping

// start-block formularyEntry
const ndcCoding = { system: 'http://hl7.org/fhir/sid/ndc', code: '50580045850' } satisfies Coding;

const entry: MedicationKnowledge = {
  resourceType: 'MedicationKnowledge',
  status: 'active',
  code: {
    // The name clinicians see and search for
    text: 'Tylenol 325 MG Oral Tablet',
    coding: [rxnormCoding, ndcCoding],
  },
};
// end-block formularyEntry

// start-block checkNdc
// RxNorm lists the NDCs of each drug as `NDC` properties, as 11 digits without hyphens
const lookupUrl = medplum.fhirUrl('CodeSystem', '$lookup');
lookupUrl.searchParams.set('system', rxnormCoding.system);
lookupUrl.searchParams.set('code', rxnormCoding.code);
const lookup: Parameters = await medplum.get(lookupUrl.toString());
const ndcs = (lookup.parameter ?? [])
  .filter((p) => p.name === 'property' && p.part?.some((part) => part.name === 'code' && part.valueCode === 'NDC'))
  .map((p) => p.part?.find((part) => part.name === 'value')?.valueCode);
if (!ndcs.includes(ndcCoding.code)) {
  throw new Error('Hold this row for review: this RxNorm release does not link the NDC to the code');
}
// end-block checkNdc

// start-block upsertEntry
// Build the key from a coding on the entry itself, so the key and the entry cannot disagree.
// This assumes the entry has one coding in the key system.
function formularyKey(item: MedicationKnowledge, keySystem: string): string {
  const key = item.code?.coding?.find((coding) => coding.system === keySystem);
  if (!key?.code) {
    throw new Error(`${item.code?.text} has no ${keySystem} coding to key on`);
  }
  return `${key.system}|${key.code}`;
}

// Creates the entry on the first run and updates it on every later run.
// The query must match at most one entry in the project.
const saved = await medplum.upsertResource(entry, {
  code: formularyKey(entry, 'http://www.nlm.nih.gov/research/umls/rxnorm'),
});
// end-block upsertEntry

// start-block upsertBundle
function formularyRow(item: MedicationKnowledge, keySystem: string): BundleEntry {
  return {
    request: { method: 'PUT', url: `MedicationKnowledge?code=${formularyKey(item, keySystem)}` },
    resource: item,
  };
}

const formularyBundle: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  // One row per formulary entry
  entry: [formularyRow(entry, 'http://www.nlm.nih.gov/research/umls/rxnorm')],
};
// end-block upsertBundle

// start-block loadBundle
const response = await medplum.executeBatch(formularyBundle);
for (const [index, result] of (response.entry ?? []).entries()) {
  const status = result.response?.status ?? '';
  if (!status.startsWith('2')) {
    console.log(`Row ${index} failed: ${status}`, result.response?.outcome);
  }
}
// end-block loadBundle

// start-block searchEntries
// Matches `code.text` and the `display` of each coding, ignoring case
const matches = await medplum.searchResources('MedicationKnowledge', {
  'code:text': 'tylenol',
  status: 'active',
  _count: '10',
});
// end-block searchEntries

// start-block requestFromEntry
// `selected` is the entry the clinician chose from the search results
function draftRequest(selected: MedicationKnowledge): MedicationRequest {
  if (!selected.code) {
    throw new Error('The formulary entry has no code');
  }
  return {
    resourceType: 'MedicationRequest',
    status: 'draft',
    intent: 'order',
    subject: { reference: 'Patient/homer-simpson' },
    // Copy the codings and text from the formulary entry
    medicationCodeableConcept: selected.code,
  };
}
// end-block requestFromEntry

console.log(matches, draftRequest(saved));
