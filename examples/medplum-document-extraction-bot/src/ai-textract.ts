// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type {
  AsyncJob,
  Bundle,
  BundleEntry,
  DiagnosticReport,
  DocumentReference,
  Media,
  OperationOutcome,
  Organization,
} from '@medplum/fhirtypes';
import OpenAI from 'openai';

type TextractBlock = { BlockType?: string; Text?: string };
type TextractResponse = { Blocks?: TextractBlock[] };
interface TextractCallResult {
  textractData: TextractResponse;
  comprehendMediaRef?: string;
}
interface ResolvedPatient {
  reference: string;
  display?: string;
}
interface DiagnosticReportResultPatch {
  fullUrl: string;
  existingResults: any[];
  urnResults: any[];
}
interface DiagnosticReportPerformerPatch {
  fullUrl: string;
  existingPerformers: any[];
  urnPerformers: any[];
}

const TEXTRACT_POLL_INTERVAL_MS = 3000;
const EXTRACTED_TEXT_TITLE = 'Extracted Text (Textract)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Calls $aws-textract with Prefer: respond-async to avoid the API gateway 60s timeout.
 * The server creates an AsyncJob; this function polls until it completes and returns the result
 * along with an optional Comprehend Media reference (when the server supports it).
 * @param medplum - Medplum client for the current bot execution.
 * @param resourceType - Source resource type to process.
 * @param id - Source resource id to process.
 * @returns The Textract response and optional Comprehend Media reference.
 */
async function callTextractAsync(
  medplum: MedplumClient,
  resourceType: string,
  id: string
): Promise<TextractCallResult> {
  const url = medplum.fhirUrl(resourceType, id, '$aws-textract').toString();
  const token = medplum.getAccessToken();

  const initResp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Prefer: 'respond-async',
    },
    body: JSON.stringify({ comprehend: true }),
  });

  // If the server doesn't support async for this operation, it may respond synchronously (200).
  if (initResp.ok && initResp.status !== 202) {
    return { textractData: (await initResp.json()) as TextractResponse };
  }
  if (initResp.status !== 202) {
    const body = await initResp.text();
    throw new Error(`$aws-textract returned unexpected status ${initResp.status}: ${body.slice(0, 200)}`);
  }

  const contentLocation = initResp.headers.get('content-location');
  if (!contentLocation) {
    throw new Error('Missing content-location header from async $aws-textract response');
  }

  // Poll until the AsyncJob completes.
  while (true) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, TEXTRACT_POLL_INTERVAL_MS);
    });
    const pollResp = await fetch(contentLocation, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollResp.ok) {
      throw new Error(`$aws-textract AsyncJob poll failed with status ${pollResp.status}`);
    }
    const job = (await pollResp.json()) as AsyncJob;
    if (job.status === 'error') {
      throw new Error(`$aws-textract AsyncJob failed: ${JSON.stringify(job.output)}`);
    }
    if (job.status === 'completed') {
      const resultStr = job.output?.parameter?.find((p) => p.name === 'responseBody')?.valueString;
      if (!resultStr) {
        throw new Error('$aws-textract AsyncJob completed but no responseBody in output');
      }
      const comprehendMediaRef = job.output?.parameter?.find((p) => p.name === 'comprehendMediaRef')?.valueString;
      return { textractData: JSON.parse(resultStr) as TextractResponse, comprehendMediaRef };
    }
    // status === 'accepted' — keep polling
  }
}

/**
 * Builds a display name from an AI-generated or existing Patient resource.
 * @param patient - Patient-like FHIR resource.
 * @returns Human-readable patient name when available.
 */
function getPatientDisplay(patient: any): string | undefined {
  const name = patient?.name?.[0];
  const given = Array.isArray(name?.given) ? name.given.join(' ') : undefined;
  return [given, name?.family].filter(Boolean).join(' ') || undefined;
}

/**
 * Searches for an existing Patient that matches the AI-generated Patient.
 * @param medplum - Medplum client.
 * @param patient - AI-generated Patient resource.
 * @returns Existing patient reference, if found.
 */
async function findExistingPatient(medplum: MedplumClient, patient: any): Promise<ResolvedPatient | undefined> {
  for (const identifier of patient.identifier ?? []) {
    if (!identifier?.value) {
      continue;
    }
    const searches = [
      identifier.system ? `identifier=${encodeURIComponent(`${identifier.system}|${identifier.value}`)}` : undefined,
      `identifier=${encodeURIComponent(identifier.value)}`,
    ].filter((s): s is string => !!s);

    for (const search of searches) {
      const [existing] = await medplum.searchResources('Patient', `${search}&_count=1`);
      if (existing?.id) {
        return {
          reference: `Patient/${existing.id}`,
          display: getPatientDisplay(existing) ?? getPatientDisplay(patient),
        };
      }
    }
  }

  const name = patient.name?.[0];
  const family = name?.family;
  const given = Array.isArray(name?.given) ? name.given[0] : undefined;
  if (family && given && patient.birthDate) {
    const params = new URLSearchParams({ family, given, birthdate: patient.birthDate, _count: '1' });
    const [existing] = await medplum.searchResources('Patient', params);
    if (existing?.id) {
      return {
        reference: `Patient/${existing.id}`,
        display: getPatientDisplay(existing) ?? getPatientDisplay(patient),
      };
    }
  }

  return undefined;
}

/**
 * Replaces references to a bundle-local Patient fullUrl with a persisted Patient reference,
 * and ensures existing references to that persisted Patient include display.
 * @param value - Arbitrary FHIR JSON value.
 * @param patientFullUrl - Bundle-local Patient fullUrl to replace.
 * @param patientRef - Persisted Medplum Patient reference.
 */
function replacePatientReferences(value: any, patientFullUrl: string, patientRef: ResolvedPatient): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      replacePatientReferences(item, patientFullUrl, patientRef);
    }
    return;
  }
  if (value.reference === patientFullUrl || value.reference === patientRef.reference) {
    if (value.reference === patientFullUrl) {
      value.reference = patientRef.reference;
    }
    if (patientRef.display) {
      value.display = patientRef.display;
    }
  }
  for (const child of Object.values(value)) {
    replacePatientReferences(child, patientFullUrl, patientRef);
  }
}

function replaceUnresolvedPatientUrnReferences(value: any, patientRef: ResolvedPatient): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      replaceUnresolvedPatientUrnReferences(item, patientRef);
    }
    return;
  }
  if (typeof value.reference === 'string' && /^urn:uuid:patient/i.test(value.reference)) {
    value.reference = patientRef.reference;
    if (patientRef.display) {
      value.display = patientRef.display;
    }
  }
  for (const child of Object.values(value)) {
    replaceUnresolvedPatientUrnReferences(child, patientRef);
  }
}

function removeNullValues(value: any): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      removeNullValues(item);
    }
    return;
  }
  for (const key of Object.keys(value)) {
    if (value[key] === null) {
      delete value[key];
    } else {
      removeNullValues(value[key]);
    }
  }
}

function normalizeFhirInstant(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return `${value}:00Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    return `${value}Z`;
  }
  return value;
}

function normalizeAttachmentUrl(url: unknown): unknown {
  if (typeof url !== 'string') {
    return url;
  }
  const match = url.match(/\/binary\/([0-9a-f-]{36})(?:\/|$|\?)/i);
  return match?.[1] ? `Binary/${match[1]}` : url;
}

function normalizeAttachmentUrls(value: any): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeAttachmentUrls(item);
    }
    return;
  }
  if (typeof value.url === 'string') {
    value.url = normalizeAttachmentUrl(value.url);
  }
  for (const child of Object.values(value)) {
    normalizeAttachmentUrls(child);
  }
}

async function resolveDiagnosticReportPerformers(medplum: MedplumClient, bundle: Bundle): Promise<void> {
  for (const entry of bundle.entry ?? []) {
    const report = entry.resource as any;
    if (report?.resourceType !== 'DiagnosticReport' || !Array.isArray(report.performer)) {
      continue;
    }

    for (const performer of report.performer) {
      if (typeof performer === 'string') {
        report.performer[report.performer.indexOf(performer)] = { display: performer };
        continue;
      }
      const reference = performer?.reference;
      if (typeof reference !== 'string' || reference.startsWith('urn:uuid:')) {
        continue;
      }
      const match = reference.match(/^Organization\/(.+)$/);
      if (!match?.[1] || UUID_RE.test(match[1])) {
        continue;
      }

      const organizationName = performer.display || decodeURIComponent(match[1]).replace(/[-_]+/g, ' ');
      const [existing] = await medplum.searchResources(
        'Organization',
        new URLSearchParams({ name: organizationName, _count: '1' })
      );
      let organizationId = existing?.id;
      if (!organizationId) {
        const created = await medplum.createResource<Organization>({
          resourceType: 'Organization',
          active: true,
          name: organizationName,
        });
        organizationId = created.id;
      }
      if (organizationId) {
        performer.reference = `Organization/${organizationId}`;
        performer.display = organizationName;
      } else {
        delete performer.reference;
        performer.display = organizationName;
      }
    }
  }
}

/**
 * Ensures lab/clinical observation bundles include a DiagnosticReport with valid references.
 * @param bundle - AI-generated transaction bundle after Patient resolution.
 * @param patientRef - Persisted Patient reference.
 * @param sourceDocRef - Source DocumentReference/Media reference.
 * @param pdfAttachment - Source PDF attachment, if present.
 */
function ensureDiagnosticReport(
  bundle: Bundle,
  patientRef: ResolvedPatient | undefined,
  sourceDocRef: string,
  pdfAttachment: any
): void {
  if (!patientRef || bundle.entry?.some((entry) => entry.resource?.resourceType === 'DiagnosticReport')) {
    return;
  }

  const observationEntries = (bundle.entry ?? []).filter(
    (entry) => entry.fullUrl && entry.resource?.resourceType === 'Observation'
  );
  if (observationEntries.length === 0) {
    return;
  }

  const firstObservation = observationEntries[0].resource as any;
  bundle.entry?.push({
    fullUrl: 'urn:uuid:diagnostic-report-generated',
    resource: {
      resourceType: 'DiagnosticReport',
      meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab'] },
      identifier: [{ system: 'urn:medplum:document-import', value: `${sourceDocRef}/DiagnosticReport/0` }],
      status: 'final',
      category: [
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' }] },
        { coding: [{ system: 'http://loinc.org', code: '26436-6', display: 'Laboratory Studies' }] },
      ],
      code: {
        coding: [{ system: 'http://loinc.org', code: '11502-2', display: 'Laboratory report' }],
        text: pdfAttachment?.title ?? 'Laboratory report',
      },
      subject: patientRef,
      effectiveDateTime: firstObservation.effectiveDateTime,
      issued: normalizeFhirInstant(firstObservation.effectiveDateTime) ?? new Date().toISOString(),
      presentedForm: pdfAttachment
        ? [
            {
              contentType: pdfAttachment.contentType,
              url: normalizeAttachmentUrl(pdfAttachment.url) as string,
              title: pdfAttachment.title,
            },
          ]
        : undefined,
      result: observationEntries.map((entry) => {
        const observation = entry.resource as any;
        return {
          reference: entry.fullUrl as string,
          display: observation.code?.text ?? observation.code?.coding?.[0]?.display ?? 'Observation',
        };
      }),
    },
    request: {
      method: 'PUT',
      url: `DiagnosticReport?identifier=urn:medplum:document-import|${sourceDocRef}/DiagnosticReport/0`,
    },
  });
  console.log(`Added DiagnosticReport with ${observationEntries.length} Observation result reference(s)`);
}

/**
 * Removes intra-bundle urn:uuid DiagnosticReport.result references before validation/submission.
 * Medplum validates DiagnosticReport.result as Observation references before transaction fullUrls
 * are resolved, so these are patched back after Observations have real IDs.
 * @param bundle - Transaction bundle.
 * @returns Result patches to apply after the transaction.
 */
function stripDiagnosticReportUrnResults(bundle: Bundle): DiagnosticReportResultPatch[] {
  const fullUrls = new Set((bundle.entry ?? []).map((entry) => entry.fullUrl).filter(Boolean));
  const patches: DiagnosticReportResultPatch[] = [];

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource as any;
    if (resource?.resourceType !== 'DiagnosticReport' || !Array.isArray(resource.result)) {
      continue;
    }

    const existingResults = resource.result.filter((ref: any) => !ref?.reference?.startsWith('urn:uuid:'));
    const urnResults = resource.result.filter((ref: any) => {
      const refValue = ref?.reference;
      return refValue?.startsWith('urn:uuid:') && fullUrls.has(refValue);
    });
    const removed = resource.result.length - existingResults.length - urnResults.length;
    if (removed > 0) {
      console.log(`Removed ${removed} dangling DiagnosticReport.result reference(s)`);
    }
    if (urnResults.length === 0) {
      resource.result = existingResults;
      continue;
    }

    patches.push({ fullUrl: entry.fullUrl ?? '', existingResults, urnResults });
    if (existingResults.length > 0) {
      resource.result = existingResults;
    } else {
      delete resource.result;
    }
    console.log(`Deferred ${urnResults.length} DiagnosticReport.result reference(s) until after batch`);
  }

  return patches;
}

function stripDiagnosticReportUrnPerformers(bundle: Bundle): DiagnosticReportPerformerPatch[] {
  const entryByFullUrl = new Map((bundle.entry ?? []).map((entry) => [entry.fullUrl, entry]));
  const validPerformerTypes = new Set(['Practitioner', 'PractitionerRole', 'Organization', 'CareTeam']);
  const patches: DiagnosticReportPerformerPatch[] = [];

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource as any;
    if (resource?.resourceType !== 'DiagnosticReport' || !Array.isArray(resource.performer)) {
      continue;
    }

    const existingPerformers = resource.performer.filter((ref: any) => !ref?.reference?.startsWith('urn:uuid:'));
    const urnPerformers = resource.performer.filter((ref: any) => {
      const refValue = ref?.reference;
      const referencedEntry = refValue?.startsWith('urn:uuid:') ? entryByFullUrl.get(refValue) : undefined;
      return referencedEntry?.resource?.resourceType && validPerformerTypes.has(referencedEntry.resource.resourceType);
    });
    const displayOnlyPerformers = resource.performer
      .filter((ref: any) => ref?.reference?.startsWith('urn:uuid:') && !urnPerformers.includes(ref) && ref.display)
      .map((ref: any) => ({ display: ref.display }));

    const removed =
      resource.performer.length - existingPerformers.length - urnPerformers.length - displayOnlyPerformers.length;
    if (removed > 0) {
      console.log(`Removed ${removed} dangling DiagnosticReport.performer reference(s)`);
    }
    if (urnPerformers.length > 0) {
      patches.push({
        fullUrl: entry.fullUrl ?? '',
        existingPerformers: [...existingPerformers, ...displayOnlyPerformers],
        urnPerformers,
      });
      console.log(`Deferred ${urnPerformers.length} DiagnosticReport.performer reference(s) until after batch`);
    }

    const submittedPerformers = [...existingPerformers, ...displayOnlyPerformers];
    if (submittedPerformers.length > 0) {
      resource.performer = submittedPerformers;
    } else {
      delete resource.performer;
    }
  }

  return patches;
}

/**
 * Resolves the bundle Patient to an existing Patient or creates it before dependent resources.
 * @param medplum - Medplum client.
 * @param bundle - AI-generated transaction bundle.
 * @returns Persisted Patient reference, if the bundle had a Patient entry.
 */
async function resolveBundlePatient(medplum: MedplumClient, bundle: Bundle): Promise<ResolvedPatient | undefined> {
  const patientEntryIndex = bundle.entry?.findIndex((entry) => entry.resource?.resourceType === 'Patient') ?? -1;
  if (patientEntryIndex < 0 || !bundle.entry?.[patientEntryIndex]) {
    return undefined;
  }

  const patientEntry = bundle.entry[patientEntryIndex];
  const patient = patientEntry.resource as any;
  const patientFullUrl = patientEntry.fullUrl;
  const existingPatient = await findExistingPatient(medplum, patient);
  let resolvedPatient = existingPatient;

  if (!resolvedPatient) {
    console.log('No matching Patient found; creating Patient before dependent resources');
    const patientResult = await medplum.executeBatch({
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [patientEntry],
    });
    const patientLoc = patientResult.entry?.[0]?.response?.location?.replace(/\/_history\/.*$/, '');
    if (patientLoc?.startsWith('Patient/')) {
      resolvedPatient = {
        reference: patientLoc,
        display: getPatientDisplay(patient),
      };
    }
  }

  if (!resolvedPatient || !patientFullUrl) {
    return resolvedPatient;
  }

  bundle.entry.splice(patientEntryIndex, 1);
  for (const entry of bundle.entry ?? []) {
    replacePatientReferences(entry.resource, patientFullUrl, resolvedPatient);
  }
  console.log(`Resolved bundle Patient ${patientFullUrl} -> ${resolvedPatient.reference}`);
  return resolvedPatient;
}

const SYSTEM_PROMPT = `
You are a **FHIR Medical Document Parser**. You analyze extracted text from medical documents
and convert them into structured FHIR R4 resources that conform to US Core 6.1.0 / USCDI v3 profiles.

YOUR WORKFLOW:
1. Read ALL the extracted document text in one pass and identify every clinical entity.
2. Assemble the complete FHIR Transaction Bundle for ALL entities at once.
3. Call \`submit_bundle\` immediately with the complete bundle.

You have exactly ONE turn. Do not make any other tool calls — go straight to submit_bundle.
Idempotency is handled by conditional PUT on the server; you do not need to check for duplicates.

REFERENCES — always include a "display" string on EVERY reference field:
- subject / patient → patient's full name (e.g. "Frodo Baggins")
- performer / requester → practitioner or organization name (e.g. "Jay W Marks, MD")
- result entries on DiagnosticReport → the observation's test name (e.g. "Hemoglobin")
Example: { "reference": "urn:uuid:patient-1", "display": "Frodo Baggins" }

DOCUMENT TYPE CLASSIFICATION — always include a DocumentReference in the bundle to classify the source document:
- status: "current"
- type: choose the most applicable US Core type from the list below (or "other" if none fits)
- category: for clinical documents (lab reports, notes, radiology, pathology, etc.) include the clinical-note category; for administrative/insurance documents (insurance cards, EOBs) do NOT include clinical-note — use only the insurance card category
- subject: reference to the Patient in the bundle
- content: [{ attachment: { contentType: "application/pdf", url: "<sourcePdfUrl>" } }]
- identifier: { system: "urn:medplum:document-import", value: "<sourceDocRef>/<ResourceType>/0" }
- request: { method: "PUT", url: "DocumentReference?identifier=urn:medplum:document-import|<value>" }

US Core DocumentReference types (use code that best matches):
| Document kind              | type.coding system          | code      | display                        |
|----------------------------|-----------------------------|-----------|--------------------------------|
| Laboratory / lab results   | http://loinc.org            | 11502-2   | Laboratory report              |
| Consult / specialist note  | http://loinc.org            | 11488-4   | Consult note                   |
| Discharge summary          | http://loinc.org            | 18842-5   | Discharge summary              |
| Progress note              | http://loinc.org            | 11506-3   | Progress note                  |
| History & physical         | http://loinc.org            | 34117-2   | History and physical note      |
| Pathology report           | http://loinc.org            | 11526-1   | Pathology study                |
| Radiology report           | http://loinc.org            | 18748-4   | Diagnostic imaging study       |
| Operative note             | http://loinc.org            | 11504-8   | Surgical operation note        |
| Insurance card / EOB       | http://loinc.org            | 64290-0   | Health insurance card          |
| Other (no match above)     | http://loinc.org            | 34133-9   | Summary of episode note        |

DocumentReference category codes — choose based on document type:
- Clinical documents (lab reports, notes, radiology, pathology, operative, H&P, discharge, consult, progress):
  Use ONLY: { coding: [{ system: "http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category", code: "clinical-note", display: "Clinical Note" }] }
- Insurance / administrative documents (insurance cards, EOBs, coverage docs):
  Use ONLY: { coding: [{ system: "http://loinc.org", code: "64290-0", display: "Insurance Card" }] }
  Do NOT add clinical-note to insurance or administrative documents.

CRITICAL RULES:
- ALWAYS include an identifier on every resource for idempotency.
- ALWAYS use conditional PUT (not POST) in the Bundle.
- ALWAYS include "display" on every Reference field as described above.
- ALWAYS include a DiagnosticReport when parsing a lab report or clinical results document.
- For DiagnosticReport with status "final", ALWAYS include "issued". Use the report issue date/time when present;
  otherwise use the best available report/result date.
- ALWAYS include a DocumentReference in the bundle to classify the document type (see above).
- NEVER invent data not present in the document.
- NEVER omit clinical entities — include ALL observations, conditions, medications, etc.
- CROSS-REFERENCE CONSISTENCY: Every urn:uuid: used in a reference field (e.g. DiagnosticReport.result, subject)
  MUST exactly match the fullUrl of an entry in this same bundle. Never reference a urn:uuid: that does
  not appear as a fullUrl somewhere in the bundle — broken references cause the entire transaction to fail.

US CORE PROFILES — include meta.profile on every resource:
- Patient:           "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"
- Observation (lab): "http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab"
- Observation (vitals): "http://hl7.org/fhir/us/core/StructureDefinition/us-core-vital-signs"
- DiagnosticReport:  "http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab"
- Condition:         "http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns"
- MedicationRequest: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest"
- AllergyIntolerance:"http://hl7.org/fhir/us/core/StructureDefinition/us-core-allergyintolerance"
- Procedure:         "http://hl7.org/fhir/us/core/StructureDefinition/us-core-procedure"
- Immunization:      "http://hl7.org/fhir/us/core/StructureDefinition/us-core-immunization"
- DocumentReference: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference"

IDENTIFIERS (required on every resource):
Use clinical identifiers when present (MRN, accession number, etc.):
  { "system": "urn:oid:<lab-oid>", "value": "<value>" }
For Patient resources — use a STABLE cross-document identifier so the same patient is not duplicated:
  - If an MRN is present: { "system": "urn:medplum:document-import:mrn", "value": "<mrn>" }
  - Otherwise derive from demographics (normalize to lowercase):
    { "system": "urn:medplum:document-import:patient", "value": "<family>.<given[0]>.<birthDate|unknown>" }
    Example: { "system": "urn:medplum:document-import:patient", "value": "baggins.frodo.1990-01-01" }
  - Conditional PUT URL: Patient?identifier=urn:medplum:document-import:patient|<value>
For all other resources without a clinical identifier, derive from the source document:
  { "system": "urn:medplum:document-import", "value": "<docResourceType>/<docId>/<ResourceType>/<index>" }

BUNDLE FORMAT:
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [{
    "fullUrl": "urn:uuid:<uuid>",
    "resource": { "resourceType": "...", "meta": { "profile": ["<us-core-url>"] }, ... },
    "request": { "method": "PUT", "url": "<ResourceType>?identifier=<system>|<value>" }
  }]
}
Order: Patient first, then Observations, then DiagnosticReport (after observations so its result references resolve), then other resources.

US CORE REQUIRED FIELDS BY RESOURCE TYPE:

Patient (us-core-patient):
- meta.profile, identifier, name.family, name.given, birthDate, gender
- telecom (phone/email), address if present
- US Core extensions if present: race, ethnicity, birthsex

Observation — Lab (us-core-observation-lab):
- meta.profile, status: "final"
- category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }]
- code: { text: "<test name from document>" }  (include coding only if code is in the document)
- subject: { reference: "urn:uuid:<patient-fullUrl>", display: "<Patient full name>" }
- effectiveDateTime: REQUIRED for status='final'. Use the result date, collection date, or report date from the document. If no date is found anywhere in the document, omit effectiveDateTime (the server will apply a data-absent-reason).
- valueQuantity: { value: <num>, unit: "<unit>", system: "http://unitsofmeasure.org", code: "<unit>" }
  or valueString for text results
- referenceRange and interpretation (H/L/A flags) if present in document

DiagnosticReport — Lab (us-core-diagnosticreport-lab):
- meta.profile, status: "final"
- category: MUST include BOTH entries:
    [
      { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB" }] },
      { coding: [{ system: "http://loinc.org", code: "26436-6", display: "Laboratory Studies" }] }
    ]
  The v2-0074/LAB entry is required by the US Core LaboratorySlice — NEVER omit it.
- code: { text: "<report title from document>" }
- subject: { reference: "urn:uuid:<patient-fullUrl>", display: "<Patient full name>" }
- effectiveDateTime, issued if present
- issued is required when status is "final"; use the report issue date/time when present, otherwise use the best available report/result date
- performer: [{ reference: "<organization-or-practitioner-fullUrl>", display: "<name>" }] if found. Prefer an
  Organization performer for laboratories. If using a performer reference, include the referenced Organization or
  Practitioner entry in the same bundle. Do not put a bare string in performer.
- result: array of references to all Observation entries in this bundle, each with display set to the test name.
  CRITICAL: each reference value MUST be the exact urn:uuid: used as that Observation's fullUrl — never use
  a descriptive name like "urn:uuid:observation-hemoglobin" unless that exact string is the fullUrl.
- Do NOT use DiagnosticReport.basedOn for the source DocumentReference. Keep source linkage in identifier and presentedForm.
- presentedForm: [{ contentType: "application/pdf", url: "<sourcePdfUrl>", title: "<document title>" }] — use the source PDF URL passed in context

Condition (us-core-condition-problems-health-concerns):
- meta.profile
- clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] }
- verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed" }] }
- category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "problem-list-item" }] }]
- code: { text: "<condition name>" }
- subject: reference to Patient

MedicationRequest (us-core-medicationrequest):
- meta.profile, status: "active", intent: "order"
- medicationCodeableConcept: { text: "<medication name>" }
- subject: reference to Patient
- requester: reference to Practitioner if found

AllergyIntolerance (us-core-allergyintolerance):
- meta.profile
- clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }] }
- verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: "confirmed" }] }
- code: { text: "<substance name>" }
- patient: reference to Patient

Procedure (us-core-procedure):
- meta.profile, status: "completed"
- code: { text: "<procedure name>" }
- subject: reference to Patient
- performedDateTime if present

Immunization (us-core-immunization):
- meta.profile, status: "completed"
- vaccineCode: { text: "<vaccine name>" }
- patient: reference to Patient
- occurrenceDateTime

DocumentReference (us-core-documentreference) — classify the source document:
- meta.profile
- status: "current"
- type: { coding: [{ system: "http://loinc.org", code: "<code>", display: "<display>" }] } — see type table above
- category: array; see category rules above — clinical-note for clinical documents, insurance card category only for insurance/administrative documents
- subject: reference to Patient
- content: [{ attachment: { contentType: "application/pdf", url: "<sourcePdfUrl>", title: "<document title if known>" } }]
- author: [{ reference: "<org-or-practitioner-ref>", display: "<name>" }] if found in document

Coverage (for insurance card documents):
- meta.profile: "http://hl7.org/fhir/StructureDefinition/Coverage"
- status: "active"
- subscriber: reference to Patient
- beneficiary: reference to Patient
- payor: [{ display: "<insurance company name>" }]
- class: [{ type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/coverage-class", code: "plan" }] }, value: "<plan name>", name: "<plan display name>" }]
- subscriberId: member/subscriber ID from card
- identifier: { system: "urn:medplum:document-import", value: "<sourceDocRef>/Coverage/0" }
`;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'submit_bundle',
      description: 'Submit the complete FHIR Transaction Bundle containing all resources parsed from the document.',
      parameters: {
        type: 'object',
        properties: {
          bundle: {
            type: 'object',
            description:
              'A complete FHIR Transaction Bundle with resourceType="Bundle", type="transaction", ' +
              'and an entry array. Every entry must have a conditional PUT request for idempotency.',
          },
        },
        required: ['bundle'],
      },
    },
  },
];

export async function handler(medplum: MedplumClient, event: BotEvent<Media | DocumentReference>): Promise<Bundle> {
  const apiKey = event.secrets['OPENAI_API_KEY']?.valueString;
  if (!apiKey) {
    throw new Error('Missing secret: OPENAI_API_KEY');
  }
  const client = new OpenAI({ apiKey });

  const model = event.secrets['OPENAI_MODEL']?.valueString || 'gpt-5.2';
  const input = event.input;

  if (!input.id || !input.resourceType) {
    throw new Error('Input must be a Media or DocumentReference resource with an id');
  }

  const existingTextAttachment =
    input.resourceType === 'DocumentReference'
      ? input.content?.find(
          (c) => c.attachment?.contentType === 'text/plain' && c.attachment.title === EXTRACTED_TEXT_TITLE
        )?.attachment
      : undefined;

  let extractedText: string | undefined;
  let comprehendMediaRef: string | undefined;

  if (existingTextAttachment?.url) {
    const textBlob = await medplum.download(existingTextAttachment.url);
    extractedText = await textBlob.text();
    console.log(`Reusing existing extracted text on DocumentReference/${input.id}`);
  } else {
    // Step 1: Extract text via $aws-textract + ComprehendMedical.
    // Use Prefer: respond-async to avoid the 60s API gateway timeout for large documents.
    // The server creates an AsyncJob; we poll until it completes.
    const textractCall = await callTextractAsync(medplum, input.resourceType, input.id);
    comprehendMediaRef = textractCall.comprehendMediaRef;

    const textLines = (textractCall.textractData.Blocks ?? [])
      .filter((b: TextractBlock) => b.BlockType === 'LINE' && b.Text)
      .map((b: TextractBlock) => b.Text as string);

    if (textLines.length === 0) {
      throw new Error(
        'No text extracted from document — ensure the resource has a binary attachment processed by AWS Textract'
      );
    }

    extractedText = textLines.join('\n');
  }

  // Step 2: Store extracted text (and Comprehend media ref if available) on the DocumentReference.
  if (input.resourceType === 'DocumentReference' && !existingTextAttachment) {
    try {
      const textBinary = await medplum.createBinary(extractedText, undefined, 'text/plain');
      const docRef = input;
      const existingContent = docRef.content ?? [];
      const alreadyHasText = existingContent.some((c) => c.attachment?.contentType === 'text/plain');
      const patches: any[] = [];
      if (!alreadyHasText) {
        patches.push({
          op: 'add',
          path: '/content/-',
          value: {
            attachment: { contentType: 'text/plain', url: `Binary/${textBinary.id}`, title: EXTRACTED_TEXT_TITLE },
          },
        });
      }
      if (comprehendMediaRef) {
        patches.push({
          op: 'add',
          path: '/content/-',
          value: {
            attachment: {
              contentType: 'application/json',
              url: comprehendMediaRef,
              title: 'Comprehend Medical Entities',
            },
          },
        });
      }
      if (patches.length > 0) {
        await medplum.patchResource('DocumentReference', input.id, patches);
        console.log(
          `Patched DocumentReference/${input.id}: text=${!alreadyHasText}, comprehend=${!!comprehendMediaRef}`
        );
      }
    } catch (err) {
      console.log(`Warning: could not patch DocumentReference content: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Include subject/patient reference if available on the source resource
  const subjectRef = (input as DocumentReference).subject?.reference ?? (input as Media).subject?.reference;
  const subjectContext = subjectRef ? `\nKnown patient reference: ${subjectRef}` : '';

  // Include source PDF URL and DocumentReference reference for DiagnosticReport linkage
  const pdfAttachment = (input as DocumentReference).content?.[0]?.attachment;
  const sourceDocRef = `${input.resourceType}/${input.id}`;
  const pdfUrl = normalizeAttachmentUrl(pdfAttachment?.url);
  const pdfContext = pdfUrl ? `\nSource PDF URL: ${pdfUrl} (use this as DiagnosticReport.presentedForm[0].url)` : '';

  // Step 3: Single-shot extraction — AI reads all text and submits bundle in one call
  console.log(`Calling OpenAI (single-shot) for ${extractedText.split('\n').length} lines of extracted text...`);
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Parse ALL of the following extracted medical document text and convert EVERY clinical entity ` +
          `into FHIR R4 resources conforming to US Core profiles.\n\n` +
          `Source document: ${sourceDocRef}${subjectContext}${pdfContext}\n\n` +
          `Extracted text:\n---\n${extractedText}\n---\n\n` +
          `Call submit_bundle now with the complete bundle. Extract EVERY clinical entity from ALL ` +
          `pages and appendices — do not stop after the first patient or first page. ` +
          `Include every observation, condition, medication, allergy, procedure, and patient ` +
          `demographic found anywhere in the text. ` +
          `ALWAYS include a DiagnosticReport with presentedForm linking to the source PDF URL above. ` +
          `Do not use DiagnosticReport.basedOn for the source DocumentReference; keep the source linkage in identifier/presentedForm.`,
      },
    ],
    tools,
    tool_choice: { type: 'function', function: { name: 'submit_bundle' } },
  });

  const choice = response.choices[0];
  const message = choice.message;
  const toolCall = message.tool_calls?.[0];

  if (toolCall?.function.name !== 'submit_bundle') {
    throw new Error('AI did not submit a FHIR bundle');
  }

  const args =
    typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

  // GPT-4o can return the bundle in several shapes — be robust:
  // 1. { bundle: {...} }           — expected
  // 2. { resourceType: "Bundle" }  — bundle at top level
  // 3. { entry: [...] }            — bundle without resourceType
  console.log('Tool call args top-level keys:', JSON.stringify(Object.keys(args ?? {})));
  const bundle = ((args?.bundle && typeof args.bundle === 'object' ? args.bundle : null) ??
    (args?.resourceType === 'Bundle' ? args : null) ??
    (Array.isArray(args?.entry) ? args : null)) as Bundle;
  if (!bundle) {
    console.log('Unexpected args structure (first 500 chars):', JSON.stringify(args).slice(0, 500));
    throw new Error('AI tool call did not return a valid FHIR bundle');
  }
  // Post-process bundle entries before submission to enforce US Core required fields that the AI may omit.

  const LAB_SLICE = { system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' };
  // The AI-generated DocumentReference is classification metadata for the source document.
  // Do not submit it as a new DocumentReference, or the create-only subscription will process it again.
  const aiDocRef = bundle.entry?.find((e) => e.resource?.resourceType === 'DocumentReference')?.resource as
    | DocumentReference
    | undefined;
  // Track entries whose patient references were stripped for post-batch patching.
  // Keyed by fullUrl so validation filtering doesn't break the index mapping.
  const needsPatientRefPatch: { fullUrl: string; fields: string[] }[] = [];
  const entries = bundle.entry ?? [];
  for (const entry of entries) {
    const resource = entry.resource as any;
    if (!resource) {
      continue;
    }
    removeNullValues(resource);
    normalizeAttachmentUrls(resource);
    // Normalize identifier to always be an array (AI sometimes returns a plain object).
    if (resource.identifier !== undefined && !Array.isArray(resource.identifier)) {
      resource.identifier = [resource.identifier];
    }
    // Strip urn:uuid references from Coverage.beneficiary and Coverage.subscriber.
    // Medplum validates reference types before resolving intra-bundle urn:uuid references,
    // causing 400 errors. Strip them here and patch with the resolved Patient ID after the batch.
    if (resource.resourceType === 'Coverage') {
      const fields: string[] = [];
      if (resource.beneficiary?.reference?.startsWith('urn:uuid:')) {
        delete resource.beneficiary;
        fields.push('beneficiary');
      }
      if (resource.subscriber?.reference?.startsWith('urn:uuid:')) {
        delete resource.subscriber;
        fields.push('subscriber');
      }
      if (fields.length > 0) {
        needsPatientRefPatch.push({ fullUrl: entry.fullUrl ?? '', fields });
      }
    }
    if (resource.resourceType === 'DiagnosticReport') {
      resource.issued = normalizeFhirInstant(resource.issued);
      // US Core DiagnosticReport Lab requires the v2-0074/LAB category slice.
      const hasLabSlice = (resource as DiagnosticReport).category?.some((cat) =>
        cat.coding?.some((c) => c.system === LAB_SLICE.system && c.code === LAB_SLICE.code)
      );
      if (!hasLabSlice) {
        (resource as DiagnosticReport).category = [
          { coding: [LAB_SLICE] },
          ...((resource as DiagnosticReport).category ?? []),
        ];
      }
    }
    if (resource.resourceType === 'Patient' && !resource.gender) {
      // US Core Patient requires gender. De-identified documents often omit it — default to 'unknown'.
      resource.gender = 'unknown';
    }
    if (resource.resourceType === 'Observation' && Array.isArray(resource.referenceRange)) {
      // GPT-4o sometimes puts unit/system/code at the referenceRange level (Quantity properties).
      // These are only valid inside referenceRange.low and referenceRange.high (SimpleQuantity).
      const VALID_REFERENCE_RANGE_KEYS = new Set([
        'id',
        'extension',
        'modifierExtension',
        'low',
        'high',
        'type',
        'appliesTo',
        'age',
        'text',
      ]);
      resource.referenceRange = resource.referenceRange.map((rr: any) => {
        const cleaned: Record<string, any> = {};
        for (const key of Object.keys(rr)) {
          if (VALID_REFERENCE_RANGE_KEYS.has(key)) {
            cleaned[key] = rr[key];
          }
        }
        return cleaned;
      });
    }
    if (
      resource.resourceType === 'Observation' &&
      resource.status === 'final' &&
      !resource.effectiveDateTime &&
      !resource.effectivePeriod &&
      !resource.effectiveTiming &&
      !resource.effectiveInstant
    ) {
      // US Core constraint us-core-8: effective[x] required for status='final'.
      // When the date is absent from the document, mark it with a data-absent-reason extension.
      resource._effectiveDateTime = {
        extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'unknown' }],
      };
    }
  }
  const entriesBeforeDocRefRemoval = bundle.entry?.length ?? 0;
  bundle.entry = bundle.entry?.filter((e) => e.resource?.resourceType !== 'DocumentReference') ?? [];
  const removedDocRefCount = entriesBeforeDocRefRemoval - bundle.entry.length;
  if (removedDocRefCount > 0) {
    console.log(
      `Removed ${removedDocRefCount} generated DocumentReference entr${removedDocRefCount === 1 ? 'y' : 'ies'}`
    );
  }

  const resolvedPatientRef = await resolveBundlePatient(medplum, bundle);
  if (resolvedPatientRef) {
    replaceUnresolvedPatientUrnReferences(bundle, resolvedPatientRef);
  }
  await resolveDiagnosticReportPerformers(medplum, bundle);
  ensureDiagnosticReport(bundle, resolvedPatientRef, sourceDocRef, pdfAttachment);
  const diagnosticReportResultPatches = stripDiagnosticReportUrnResults(bundle);
  const diagnosticReportPerformerPatches = stripDiagnosticReportUrnPerformers(bundle);

  // Validate each entry against the FHIR server before submission to catch any remaining
  // schema or profile errors that would cause 400s in the batch transaction.
  const validEntries: BundleEntry[] = [];
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource;
    if (!resource) {
      validEntries.push(entry);
      continue;
    }
    try {
      const outcome = await medplum.post<OperationOutcome>(
        medplum.fhirUrl((resource as any).resourceType, '$validate'),
        resource
      );
      const errors = (outcome?.issue ?? []).filter((i) => i.severity === 'error' || i.severity === 'fatal');
      if (errors.length > 0) {
        console.log(
          `Skipping invalid ${(resource as any).resourceType} (${entry.fullUrl}): ` +
            errors.map((e) => e.details?.text ?? e.diagnostics).join('; ')
        );
      } else {
        validEntries.push(entry);
      }
    } catch (err) {
      // If $validate itself fails, include the entry rather than silently dropping data.
      console.log(
        `Warning: $validate failed for ${(resource as any).resourceType}: ${err instanceof Error ? err.message : err}`
      );
      validEntries.push(entry);
    }
  }
  bundle.entry = validEntries;

  // Re-run dangling ref cleanup after validation filtering — some referenced entries may
  // have been removed, which would cause the transaction to roll back entirely.
  const validFullUrls = new Set(validEntries.map((e) => e.fullUrl).filter(Boolean));
  for (const entry of validEntries) {
    const resource = entry.resource as any;
    if (resource?.resourceType === 'DiagnosticReport' && Array.isArray(resource.result)) {
      const before = resource.result.length;
      resource.result = resource.result.filter((ref: any) => {
        const refValue = ref?.reference;
        return !refValue?.startsWith('urn:uuid:') || validFullUrls.has(refValue);
      });
      if (resource.result.length !== before) {
        console.log(
          `Post-validation: removed ${before - resource.result.length} dangling DiagnosticReport.result reference(s)`
        );
      }
    }
  }

  console.log(`Submitting bundle with ${bundle.entry?.length ?? 0} entries`);
  const resultBundle = await medplum.executeBatch(bundle);
  console.log(`Bundle submitted successfully, ${resultBundle?.entry?.length ?? 0} entries processed`);

  const locationByFullUrl = new Map<string, string>();
  for (const [idx, entry] of (bundle.entry ?? []).entries()) {
    const loc = resultBundle.entry?.[idx]?.response?.location?.replace(/\/_history\/.*$/, '');
    if (entry.fullUrl && loc) {
      locationByFullUrl.set(entry.fullUrl, loc);
    }
  }

  if (diagnosticReportResultPatches.length > 0) {
    await Promise.all(
      diagnosticReportResultPatches.map(async ({ fullUrl, existingResults, urnResults }) => {
        const reportLoc = locationByFullUrl.get(fullUrl);
        if (!reportLoc) {
          return;
        }
        const [resourceType, id] = reportLoc.split('/');
        if (resourceType !== 'DiagnosticReport' || !id) {
          return;
        }

        const resolvedResults = urnResults
          .map((ref: any) => {
            const resolvedRef = locationByFullUrl.get(ref.reference);
            return resolvedRef ? { ...ref, reference: resolvedRef } : undefined;
          })
          .filter((ref: any): ref is any => !!ref);
        const result = [...existingResults, ...resolvedResults];
        if (result.length === 0) {
          return;
        }

        try {
          await medplum.patchResource('DiagnosticReport', id, [
            { op: existingResults.length > 0 ? 'replace' : 'add', path: '/result', value: result },
          ]);
          console.log(`Patched DiagnosticReport/${id}: result -> ${result.length} Observation reference(s)`);
        } catch (err) {
          console.log(`Warning: could not patch DiagnosticReport/${id}: ${err instanceof Error ? err.message : err}`);
        }
      })
    );
  }

  if (diagnosticReportPerformerPatches.length > 0) {
    await Promise.all(
      diagnosticReportPerformerPatches.map(async ({ fullUrl, existingPerformers, urnPerformers }) => {
        const reportLoc = locationByFullUrl.get(fullUrl);
        if (!reportLoc) {
          return;
        }
        const [resourceType, id] = reportLoc.split('/');
        if (resourceType !== 'DiagnosticReport' || !id) {
          return;
        }

        const resolvedPerformers = urnPerformers
          .map((ref: any) => {
            const resolvedRef = locationByFullUrl.get(ref.reference);
            return resolvedRef ? { ...ref, reference: resolvedRef } : undefined;
          })
          .filter((ref: any): ref is any => !!ref);
        const performer = [...existingPerformers, ...resolvedPerformers];
        if (performer.length === 0) {
          return;
        }

        try {
          await medplum.patchResource('DiagnosticReport', id, [
            { op: existingPerformers.length > 0 ? 'replace' : 'add', path: '/performer', value: performer },
          ]);
          console.log(`Patched DiagnosticReport/${id}: performer -> ${performer.length} reference(s)`);
        } catch (err) {
          console.log(`Warning: could not patch DiagnosticReport/${id}: ${err instanceof Error ? err.message : err}`);
        }
      })
    );
  }

  // Refresh display strings on all created/updated resources using $refresh-reference-display.
  // This authoritatively resolves Reference.display from the actual FHIR store after all resources exist.
  const refreshTargets = (resultBundle.entry ?? [])
    .map((e) => e.response?.location)
    .filter((loc): loc is string => typeof loc === 'string' && loc.includes('/'));

  // Patch the source DocumentReference: subject, type, and category from the AI-classified DocumentReference.
  if (input.resourceType === 'DocumentReference') {
    const patches: any[] = [];
    if (resolvedPatientRef) {
      patches.push({ op: 'add', path: '/subject', value: resolvedPatientRef });
    }
    if (aiDocRef?.type) {
      patches.push({ op: 'add', path: '/type', value: aiDocRef.type });
    }
    if (aiDocRef?.category) {
      patches.push({ op: 'add', path: '/category', value: aiDocRef.category });
    }
    if (patches.length > 0) {
      try {
        await medplum.patchResource('DocumentReference', input.id, patches);
        console.log(
          `Patched DocumentReference/${input.id}: subject=${!!resolvedPatientRef}, type=${!!aiDocRef?.type}, category=${!!aiDocRef?.category}`
        );
      } catch (err) {
        console.log(`Warning: could not patch DocumentReference: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Patch Coverage and AI-generated DocumentReference entries whose urn:uuid patient refs were stripped.
  // These were stripped pre-batch to avoid Medplum reference-type validation errors,
  // and are restored here with the actual resolved Patient ID.
  if (resolvedPatientRef && needsPatientRefPatch.length > 0) {
    await Promise.all(
      needsPatientRefPatch.map(async ({ fullUrl, fields }) => {
        // Find the entry's index in the submitted bundle (post-validation filtering).
        const idx = bundle.entry?.findIndex((e) => e.fullUrl === fullUrl) ?? -1;
        if (idx < 0) {
          return; // entry was removed during validation
        }
        const loc = resultBundle.entry?.[idx]?.response?.location;
        if (!loc) {
          return;
        }
        const [resourceType, id] = loc.replace(/\/_history\/.*$/, '').split('/');
        if (!resourceType || !id) {
          return;
        }
        const patches = fields.map((field) => ({ op: 'add' as const, path: `/${field}`, value: resolvedPatientRef }));
        try {
          await medplum.patchResource(resourceType as any, id, patches);
          console.log(`Patched ${resourceType}/${id}: ${fields.join(', ')} -> ${resolvedPatientRef.reference}`);
        } catch (err) {
          console.log(`Warning: could not patch ${resourceType}/${id}: ${err instanceof Error ? err.message : err}`);
        }
      })
    );
  }

  await Promise.all(
    refreshTargets.map(async (location) => {
      const [resourceType, id] = location.replace(/\/_history\/.*$/, '').split('/');
      if (!resourceType || !id) {
        return;
      }
      try {
        await medplum.post(medplum.fhirUrl(resourceType, id, '$refresh-reference-display'), {});
        console.log(`Refreshed display strings on ${resourceType}/${id}`);
      } catch (err) {
        console.log(
          `Warning: could not refresh display on ${resourceType}/${id}: ${err instanceof Error ? err.message : err}`
        );
      }
    })
  );

  return resultBundle;
}
