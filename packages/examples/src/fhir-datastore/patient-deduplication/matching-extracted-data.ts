// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block setup
import type { BotEvent, MedplumClient, WithId } from '@medplum/core';
import { createReference, getExtensionValue } from '@medplum/core';
import type { Bundle, DocumentReference, Patient, Task, TaskInput } from '@medplum/fhirtypes';

// The parts of the Textract blocks this bot reads
interface TextractBlock {
  Id?: string;
  BlockType?: string;
  Text?: string;
  Confidence?: number;
  Query?: { Text?: string; Alias?: string };
  Relationships?: { Type?: string; Ids?: string[] }[];
}
interface TextractResult {
  Blocks?: TextractBlock[];
}

type Field = 'firstName' | 'lastName' | 'dob' | 'phone' | 'mrn';
type Extracted = Partial<Record<Field, { value: string; confidence: number }>>;

const QUERIES: { alias: Field; text: string; pages: string[] }[] = [
  { alias: 'firstName', text: "What is the patient's first name?", pages: ['*'] },
  { alias: 'lastName', text: "What is the patient's last name?", pages: ['*'] },
  { alias: 'dob', text: "What is the patient's date of birth?", pages: ['*'] },
  { alias: 'phone', text: "What is the patient's phone number?", pages: ['*'] },
  { alias: 'mrn', text: "What is the patient's medical record number?", pages: ['*'] },
];

// Placeholders: replace with cutoffs chosen from testing on your own documents.
// `use`: below this, the value is not sent to $match. `auto`: below this, a match that relies on it needs review.
const CUTOFFS: Record<Field, { use: number; auto: number }> = {
  firstName: { use: 80, auto: 95 },
  lastName: { use: 80, auto: 95 },
  dob: { use: 80, auto: 95 },
  phone: { use: 80, auto: 95 },
  mrn: { use: 95, auto: 99 }, // can match on its own (combination 22)
};

// The CMS combinations these fields can satisfy, and the fields each one relies on
const COMBINATION_FIELDS: Record<string, Field[]> = {
  '02': ['firstName', 'lastName', 'dob', 'phone'],
  '11': ['firstName', 'dob', 'phone'],
  '22': ['mrn'],
  '30': ['lastName', 'dob', 'phone'],
};

const MRN_SYSTEM = 'https://example.com/mrn'; // the system your own MRNs use
const CMS_COMBINATION_URL = 'https://medplum.com/fhir/StructureDefinition/cms-match-combination';
// end-block setup

// start-block handler
export async function handler(medplum: MedplumClient, event: BotEvent<WithId<DocumentReference>>): Promise<string> {
  const docRef = event.input;
  if (docRef.subject) {
    return 'already-filed';
  }

  // 1. Extract
  const textract = await medplum.post<TextractResult>(
    medplum.fhirUrl('DocumentReference', docRef.id, '$aws-textract'),
    {
      queries: QUERIES,
    }
  );
  const extracted = readAnswers(textract);

  // 2. Match, sending only the values above their `use` cutoff
  const query = buildMatchQuery(extracted);
  if (!query) {
    await createTask(medplum, docRef, 'triage', extracted);
    return 'triage';
  }
  const bundle = await medplum.post<Bundle<WithId<Patient>>>(medplum.fhirUrl('Patient', '$match'), {
    resourceType: 'Parameters',
    parameter: [
      { name: 'resource', resource: query },
      { name: 'onlyCertainMatches', valueBoolean: true },
    ],
  });
  const entry = bundle.entry?.[0];
  if (!entry?.resource) {
    await createTask(medplum, docRef, 'triage', extracted);
    return 'triage';
  }

  // 3. Decide
  const patient = entry.resource;
  const combination = getExtensionValue(entry.search, CMS_COMBINATION_URL) as string;
  const reliedOn = COMBINATION_FIELDS[combination];
  const confident = reliedOn?.every((field) => (extracted[field]?.confidence ?? 0) >= CUTOFFS[field].auto);
  if (!confident || !crossCheck(patient, extracted, reliedOn)) {
    await createTask(medplum, docRef, 'suggest', extracted, patient, combination);
    return 'suggest';
  }

  await medplum.updateResource<DocumentReference>({ ...docRef, subject: createReference(patient) });
  await createTask(medplum, docRef, 'auto-file', extracted, patient, combination);
  // Notify the patient's care team here, for example with a Communication
  return 'auto-file';
}
// end-block handler

// start-block extract
function readAnswers(textract: TextractResult): Extracted {
  const blocks = textract.Blocks ?? [];
  const byId = new Map(blocks.map((b) => [b.Id, b]));
  const extracted: Extracted = {};
  for (const query of blocks.filter((b) => b.BlockType === 'QUERY')) {
    const field = query.Query?.Alias as Field;
    // Each QUERY block links to its QUERY_RESULT answers. Use the highest-confidence one.
    const best = (query.Relationships ?? [])
      .filter((r) => r.Type === 'ANSWER')
      .flatMap((r) => r.Ids ?? [])
      .map((id) => byId.get(id))
      .filter((b) => b?.BlockType === 'QUERY_RESULT' && b.Text)
      .sort((a, b) => (b?.Confidence ?? 0) - (a?.Confidence ?? 0))[0];
    const value = best?.Text && normalize(field, best.Text);
    if (value) {
      extracted[field] = { value, confidence: best.Confidence ?? 0 };
    }
  }
  return extracted;
}

function normalize(field: Field, text: string): string | undefined {
  const value = text.trim();
  if (!value || /^(n\/?a|none|unknown)$/i.test(value)) {
    return undefined; // $match does not filter out placeholder values, so do it here
  }
  if (field === 'dob') {
    // $match needs YYYY-MM-DD. This assumes U.S. MM/DD/YYYY dates.
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
    return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : undefined;
  }
  if (field === 'phone') {
    const digits = value.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11 ? digits : undefined;
  }
  return value;
}

function buildMatchQuery(extracted: Extracted): Patient | undefined {
  const accepted = (field: Field): string | undefined => {
    const e = extracted[field];
    return e && e.confidence >= CUTOFFS[field].use ? e.value : undefined;
  };
  const given = accepted('firstName');
  const family = accepted('lastName');
  const birthDate = accepted('dob');
  const phone = accepted('phone');
  const mrn = accepted('mrn');
  const query: Patient = { resourceType: 'Patient' };
  if (given || family) {
    query.name = [{ given: given ? [given] : undefined, family }];
  }
  if (birthDate) {
    query.birthDate = birthDate;
  }
  if (phone) {
    query.telecom = [{ system: 'phone', value: phone }];
  }
  if (mrn) {
    query.identifier = [{ system: MRN_SYSTEM, value: mrn }];
  }
  return Object.keys(query).length > 1 ? query : undefined;
}
// end-block extract

// start-block crossCheck
// A match on an identifier alone must agree with the name and birth date on the document
function crossCheck(patient: Patient, extracted: Extracted, reliedOn: Field[]): boolean {
  if (!reliedOn.every((field) => field === 'mrn')) {
    return true;
  }
  const fold = (s: string | undefined): string => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const checks: boolean[] = [];
  if (extracted.lastName) {
    checks.push(patient.name?.some((n) => fold(n.family) === fold(extracted.lastName?.value)) ?? false);
  }
  if (extracted.dob) {
    checks.push(patient.birthDate === extracted.dob.value);
  }
  return checks.length > 0 && checks.every(Boolean);
}
// end-block crossCheck

// start-block createTask
async function createTask(
  medplum: MedplumClient,
  docRef: WithId<DocumentReference>,
  outcome: 'auto-file' | 'suggest' | 'triage',
  extracted: Extracted,
  patient?: WithId<Patient>,
  combination?: string
): Promise<Task> {
  // Record what was extracted, and how confidently, for review, audit and tuning
  const input: TaskInput[] = Object.entries(extracted).flatMap(([field, e]) => [
    { type: { text: field }, valueString: e.value },
    { type: { text: `${field}-confidence` }, valueDecimal: e.confidence },
  ]);
  if (combination) {
    input.push({ type: { text: 'cms-match-combination' }, valueString: combination });
  }
  return medplum.createResource<Task>({
    resourceType: 'Task',
    // Auto-filed documents get a completed Task, so every document has the same record
    status: outcome === 'auto-file' ? 'completed' : 'requested',
    intent: 'order',
    code: { text: outcome === 'triage' ? 'File document' : 'Confirm document patient' },
    businessStatus: { text: outcome },
    focus: createReference(docRef),
    for: patient ? createReference(patient) : undefined,
    input,
  });
}
// end-block createTask
