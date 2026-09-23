// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Converts Practice Fusion CCDA XML exports to FHIR batch bundles ready to persist into a
 * Medplum project.
 *
 * Works around known convertCcdaToFhir issues at the script level (converter untouched):
 *  1. negationInd is ignored by the converter — "no known X" entries become fake positive
 *     resources. Stripped before conversion, including the nested NKA/NKDA pattern
 *     (act > entryRelationship[SUBJ] > observation@negationInd).
 *  2. AllergyIntolerance.category is hardcoded to ['food'] (ccda-to-fhir.ts processAllergyIntoleranceAct).
 *     Re-derived from the source observation.value allergy-type code.
 *  3. ICD-10-CM / ICD-9-CM OIDs are not mapped to canonical FHIR system URIs.
 *  4. Practitioners/Organizations are duplicated per author/performer reference. Deduped by
 *     NPI (practitioners) / normalized name (organizations), identifiers merged, references rewritten.
 *  5. The document-level authoring device becomes a nameless junk Practitioner. Dropped;
 *     Composition.author retargeted to the custodian Organization.
 *  6. Resource ids are regenerated on every run (mapId falls through to generateId for
 *     Practice Fusion root+extension ids). Remapped to deterministic ids so re-runs are
 *     idempotent, and Practitioners/Patients keyed by NPI/identifier dedupe across files.
 *     Plain `PUT Type/<new-id>` is super-admin-only on Medplum (Repository.canSetId,
 *     server/src/fhir/repo.ts), so each resource carries its deterministic id as an
 *     urn:ccda-import-id identifier and is upserted via conditional update on it;
 *     internal references use the same conditional-reference form.
 *  7. Every resource gets meta.tag batch + source markers so the import is identifiable
 *     and reversible via _tag search.
 *  8. The converter emits completely empty resources for some name-only representedOrganizations
 *     (e.g. {resourceType: 'Organization', id}). Dropped, with references to them stripped.
 *  9. The target project already has Organization resources per clinic — Organizations are
 *     NOT created. References to them are emitted as conditional references
 *     (Organization?name:exact=...), which Medplum resolves server-side at write time and
 *     rejects the transaction unless exactly one match exists (server/src/fhir/references.ts).
 *     To pin a specific resource instead, add its id to ORG_ID_OVERRIDES.
 * 10. Practitioners with an NPI: create-if-missing. The resource is emitted as a conditional
 *     create (POST + ifNoneExist identifier=<npi-system>|<npi>) — a no-op when the project
 *     already has that NPI — and all references to them are conditional references by the same
 *     NPI, resolving to the existing-or-just-created resource. No duplicates either way.
 *     Practitioners WITHOUT an NPI use the same conditional-update upsert as everything else
 *     (same name -> same import identifier across files and re-runs). Pin via
 *     PRACTITIONER_ID_OVERRIDES (NPI -> id) to skip creation.
 * 11. Medication sig lives only in the narrative (doseQuantity is nullFlavor NI in source) —
 *     recovered from the meds table row into dosageInstruction[0].text.
 * 12. Lab results delivered as PDF attachments produce valueQuantity with no value — stripped.
 * 13. Empty objects/arrays (e.g. timing: {}, referenceRange: []) are invalid FHIR JSON — scrubbed.
 * 14. Historical lab orders — Planned Act entries (2.16.840.1.113883.10.20.22.4.39) in Assessment
 *     and Plan sections, which the converter cannot handle — are extracted before conversion and
 *     mapped to ServiceRequest resources (status/intent from statusCode/moodCode, requester as
 *     NPI conditional reference).
 * 15. Patient contact cleanup: phones normalized to bare 10 digits (no +1 or
 *     punctuation); Practice Fusion's duplicate all-caps home address consolidated.
 *
 * Outputs per input file:
 *   <name>.fhir.json    — post-processed document bundle, pretty-printed (for review)
 *   <name>.batch*.json  — batch bundle(s) with idempotent conditional-update entries (for
 *                         persistence), compact, chunked under the server's 1MB maxJsonSize
 *                         default. Batch (not transaction) per the migration docs: Medplum
 *                         transactions require the transaction-bundles feature flag and cap
 *                         updates at 50 (fhir-router batch.ts maxUpdates — transaction-only;
 *                         batches have no cap). Idempotent upserts make retries safe without
 *                         transaction atomicity; check the batch response for per-entry errors.
 */
import {
  convertCcdaToFhir,
  convertXmlToCcda,
  mapCcdaCodeToCodeableConcept,
  mapCcdaToFhirDateTime,
} from '@medplum/ccda';
import type { Ccda, CcdaAct, CcdaAuthor, CcdaEntry } from '@medplum/ccda';
import { ContentType, MedplumClient } from '@medplum/core';
import type {
  Address,
  AllergyIntolerance,
  AsyncJob,
  Bundle,
  BundleEntry,
  HumanName,
  Identifier,
  Patient,
  Practitioner,
  PractitionerRole,
  Reference,
  Resource,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv();

// ---------------------------------------------------------------------------
// Configuration (CLI): --input <dir> --output <dir> --tag <code> [--seed]
//
//   --input   directory of Practice Fusion CCDA .xml exports
//             (required)
//   --output  directory for generated bundles (default: <input>/fhir-output)
//   --tag     meta.tag batch code for this migration (default: slug of the
//             input directory's parent folder, e.g. 'example-clinic')
//   --seed    after generating, execute the batch bundles against a Medplum
//             project via the FHIR async request pattern (Prefer: respond-async)
//             — entries run in a background job and skip the per-user FHIR
//             quota that 429s large synchronous batches. When --org-id is set,
//             every emitted resource carries meta.accounts = [Organization/<id>]
//             so the data is visible to org-restricted access policies as soon
//             as it is written (project-admin membership required to set
//             meta.accounts; Patient/$set-accounts with propagate is NOT used —
//             it charges 100 FHIR quota points per compartment resource even
//             when run async, and 429s on patients with >~500 resources).
//             Credentials: MEDPLUM_BASE_URL (default https://api.medplum.com/),
//             MEDPLUM_CLIENT_ID, MEDPLUM_CLIENT_SECRET env vars (or a .env file).
//             The ClientApplication must belong to the target project and its
//             membership must be a project admin (required to set meta.accounts).
// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const INPUT_DIR = argValue('--input') ?? '';
if (!INPUT_DIR) {
  console.error('--input <dir> is required (directory of Practice Fusion CCDA .xml exports)');
  process.exit(1);
}
const OUTPUT_DIR = argValue('--output') ?? join(INPUT_DIR, 'fhir-output');
const TAG_CODE =
  argValue('--tag') ??
  (INPUT_DIR.split('/').filter(Boolean).slice(-2, -1)[0] ?? 'pf-migration').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const SEED = process.argv.includes('--seed');

const BATCH_TAG = { system: 'urn:ccda-import', code: TAG_CODE };
const NPI_SYSTEM = 'http://hl7.org/fhir/sid/us-npi';
/** Identifier system carrying each resource's deterministic id; upserts and references key on it. */
const IMPORT_ID_SYSTEM = 'urn:ccda-import-id';

/** Map CCDA organization name -> existing Organization.id in the target project (optional pin). */
const ORG_ID_OVERRIDES: Record<string, string> = {};

/**
 * The existing Organization in the target project that all organization references point to,
 * and that every emitted resource (except Practitioners) is stamped with as meta.accounts.
 * Override per clinic with --org-id <uuid>. When set, references are direct (Organization/<id>)
 * instead of name-based conditional references — required when the project org's name does not
 * match the name in the CCDA (e.g. the project's org resource uses a legal name while the
 * CCDA carries the clinic's trade name).
 * ORG_ID_OVERRIDES (by CCDA org name) takes precedence for multi-organization sources.
 */
const ORG_ID = argValue('--org-id') ?? '';

/** Map NPI -> existing Practitioner.id in the target project (optional pin). */
const PRACTITIONER_ID_OVERRIDES: Record<string, string> = {};

// --seed credentials: a ClientApplication in the target project, read from the
// MEDPLUM_BASE_URL / MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET env vars (see .env.defaults).
const SEED_BASE_URL = process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com/';
const SEED_CLIENT_ID = process.env.MEDPLUM_CLIENT_ID ?? '';
const SEED_CLIENT_SECRET = process.env.MEDPLUM_CLIENT_SECRET ?? '';

// Sections the converter silently drops even when they contain entries (lenient mode).
const KNOWN_DROPPED_SECTION_OIDS: Record<string, string> = {
  '2.16.840.1.113883.10.20.22.2.18': 'Payers',
  '1.3.6.1.4.1.19376.1.5.3.1.3.1': 'Reason for Referral',
  '2.16.840.1.113883.10.20.22.2.65': 'Notes',
};

// ---------------------------------------------------------------------------
// 1. Negation stripping (incl. nested NKA/NKDA pattern)
// ---------------------------------------------------------------------------

type MaybeNegated = { '@_negationInd'?: string };

function hasNegated(arr: MaybeNegated[] | undefined): boolean {
  return arr?.some((item) => item['@_negationInd'] === 'true') ?? false;
}

function isNegated(entry: CcdaEntry): boolean {
  if (
    hasNegated(entry.substanceAdministration) ||
    hasNegated(entry.procedure as MaybeNegated[] | undefined) ||
    hasNegated(entry.observation) ||
    hasNegated(entry.act as MaybeNegated[] | undefined)
  ) {
    return true;
  }
  // Nested pattern: concern act wrapping a negated SUBJ statement (e.g. No Known Allergies)
  for (const act of entry.act ?? []) {
    for (const rel of act.entryRelationship ?? []) {
      if (rel['@_typeCode'] !== 'SUBJ') {
        continue;
      }
      if (
        hasNegated(rel.observation) ||
        hasNegated(rel.substanceAdministration) ||
        hasNegated(rel.act as MaybeNegated[] | undefined)
      ) {
        return true;
      }
    }
  }
  return false;
}

function stripNegatedEntries(ccda: Ccda): string[] {
  const dropped: string[] = [];
  for (const component of ccda.component?.structuredBody?.component ?? []) {
    for (const section of component.section ?? []) {
      if (!section.entry) {
        continue;
      }
      section.entry = section.entry.filter((entry) => {
        if (!isNegated(entry)) {
          return true;
        }
        const id =
          entry.substanceAdministration?.[0]?.id?.[0]?.['@_extension'] ??
          entry.procedure?.[0]?.id?.[0]?.['@_extension'] ??
          entry.observation?.[0]?.id?.[0]?.['@_extension'] ??
          entry.act?.[0]?.entryRelationship?.find((r) => r['@_typeCode'] === 'SUBJ')?.observation?.[0]?.id?.[0]?.[
            '@_extension'
          ] ??
          entry.act?.[0]?.id?.[0]?.['@_extension'] ??
          'unknown';
        dropped.push(`${section.title ?? 'section'}: ${id}`);
        return false;
      });
    }
  }
  return dropped;
}

// ---------------------------------------------------------------------------
// 2. Allergy category/type from source observation.value
// ---------------------------------------------------------------------------

const ALLERGY_TYPE_MAP: Record<
  string,
  { category?: AllergyIntolerance['category']; type?: AllergyIntolerance['type'] }
> = {
  '416098002': { category: ['medication'], type: 'allergy' }, // drug allergy
  '419511003': { category: ['medication'], type: 'allergy' }, // propensity to adverse reactions to drug
  '59037007': { category: ['medication'], type: 'intolerance' }, // drug intolerance
  '414285001': { category: ['food'], type: 'allergy' }, // food allergy
  '418471000': { category: ['food'], type: 'allergy' }, // propensity to adverse reactions to food
  '235719002': { category: ['food'], type: 'intolerance' }, // food intolerance
  '426232007': { category: ['environment'], type: 'allergy' }, // environmental allergy
  '419199007': { type: 'allergy' }, // allergy to substance — category unknown
  '420134006': {}, // propensity to adverse reactions — unknown
};

const CCDA_NARRATIVE_REF_URL = 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference';

// ---------------------------------------------------------------------------
// Historical lab orders (Planned Act entries in Assessment and Plan) -> ServiceRequest
// ---------------------------------------------------------------------------

const OID_ASSESSMENT_AND_PLAN_SECTION = '2.16.840.1.113883.10.20.22.2.9';
const OID_PLANNED_ACT = '2.16.840.1.113883.10.20.22.4.39';
const OID_NPI = '2.16.840.1.113883.4.6';
const SNOMED_SYSTEM = 'http://snomed.info/sct';

const SR_STATUS_MAP: Record<string, ServiceRequest['status']> = {
  // Source statusCode is 'active' on every historical order (Practice Fusion never closes them).
  // These are years-old orders being migrated — mark completed so they don't show as an open worklist.
  active: 'completed',
  completed: 'completed',
  cancelled: 'revoked',
  aborted: 'revoked',
  suspended: 'on-hold',
};

const SR_INTENT_MAP: Record<string, ServiceRequest['intent']> = {
  ARQ: 'order',
  RQO: 'order',
  INT: 'plan',
  PRP: 'proposal',
};

/**
 * Remove Planned Act entries from Assessment and Plan sections (unhandled by the converter) and return them.
 * @param ccda - Parsed CCDA document; the extracted entries are removed from it in place.
 * @returns The Planned Act entries that were removed.
 */
function extractPlannedActs(ccda: Ccda): CcdaAct[] {
  const acts: CcdaAct[] = [];
  for (const component of ccda.component?.structuredBody?.component ?? []) {
    for (const section of component.section ?? []) {
      if (!section.templateId?.some((t) => t['@_root'] === OID_ASSESSMENT_AND_PLAN_SECTION) || !section.entry) {
        continue;
      }
      section.entry = section.entry.filter((entry) => {
        const act = entry.act?.[0];
        if (act?.templateId?.some((t) => t['@_root'] === OID_PLANNED_ACT)) {
          acts.push(act);
          return false;
        }
        return true;
      });
    }
  }
  return acts;
}

function mapAuthorName(author: CcdaAuthor | undefined): string | undefined {
  const name = author?.assignedAuthor?.assignedPerson?.name?.[0];
  if (!name?.family) {
    return undefined;
  }
  return [...(name.given ?? []), name.family].join(' ');
}

interface MedEntryInfo {
  npi?: string;
  name?: string;
  /**
   * True when the entry has a supply entryRelationship — i.e. it went through the
   * e-prescribing/fill-tracking workflow. Entries without one are recorded/patient-reported
   * meds (supplements, outside prescriptions, informal names) -> intent 'plan'.
   */
  hasSupply: boolean;
}

/**
 * Per-medication source info, keyed by the substanceAdministration narrative text reference.
 * @param ccda - Parsed CCDA document.
 * @returns Map of narrative text reference to author NPI/name and supply-relationship flag.
 */
function collectMedicationEntryInfo(ccda: Ccda): Map<string, MedEntryInfo> {
  const result = new Map<string, MedEntryInfo>();
  for (const component of ccda.component?.structuredBody?.component ?? []) {
    for (const section of component.section ?? []) {
      for (const entry of section.entry ?? []) {
        for (const sub of entry.substanceAdministration ?? []) {
          const textRef = typeof sub.text === 'object' ? sub.text.reference?.['@_value'] : undefined;
          if (!textRef) {
            continue;
          }
          const author = sub.author?.[0];
          const npi = author?.assignedAuthor?.id?.find((id) => id['@_root'] === OID_NPI)?.['@_extension'];
          const name = mapAuthorName(author);
          // supply is not declared on CcdaEntryRelationship but survives parsing
          const hasSupply = (sub.entryRelationship ?? []).some((er) => Boolean((er as { supply?: unknown }).supply));
          result.set(textRef, { npi, name, hasSupply });
        }
      }
    }
  }
  return result;
}

function buildServiceRequests(acts: CcdaAct[], patient: Patient, fileBase: string): ServiceRequest[] {
  const patientDisplay = patient.name?.[0]
    ? [...(patient.name[0].given ?? []), patient.name[0].family].filter(Boolean).join(' ')
    : undefined;
  return acts.map((act, i) => {
    const textRef = act.text?.reference?.['@_value'];
    const author = act.author?.[0];
    const npi = author?.assignedAuthor?.id?.find((id) => id['@_root'] === OID_NPI)?.['@_extension'];
    const authorName = mapAuthorName(author);
    let requester: Reference<Practitioner> | undefined;
    if (npi) {
      const pinned = PRACTITIONER_ID_OVERRIDES[npi];
      requester = {
        reference: pinned ? `Practitioner/${pinned}` : `Practitioner?identifier=${NPI_SYSTEM}|${npi}`,
        display: authorName,
      };
    } else if (authorName) {
      requester = { display: authorName };
    }
    const sourceId = act.id?.[0];
    return {
      resourceType: 'ServiceRequest',
      id: `sr-${fileBase}-${i}`, // placeholder; replaced with a deterministic id in postProcess
      identifier:
        sourceId?.['@_extension'] && sourceId['@_root']
          ? [{ system: `urn:oid:${sourceId['@_root']}`, value: sourceId['@_extension'] }]
          : undefined,
      status: SR_STATUS_MAP[act.statusCode?.['@_code'] ?? ''] ?? 'unknown',
      intent: SR_INTENT_MAP[act['@_moodCode']] ?? 'order',
      category: textRef?.startsWith('#APLAB')
        ? [{ coding: [{ system: SNOMED_SYSTEM, code: '108252007', display: 'Laboratory procedure' }] }]
        : undefined,
      code: mapCcdaCodeToCodeableConcept(act.code),
      subject: { reference: `Patient/${patient.id}`, display: patientDisplay },
      authoredOn: mapCcdaToFhirDateTime(author?.time?.['@_value']),
      occurrenceDateTime: mapCcdaToFhirDateTime(act.effectiveTime?.[0]?.['@_value']),
      requester,
      extension: textRef ? [{ url: CCDA_NARRATIVE_REF_URL, valueString: textRef }] : undefined,
    } satisfies ServiceRequest;
  });
}

interface AllergySourceInfo {
  valueCode?: string; // allergy-type code from observation.value (e.g. 416098002 drug allergy)
  narrativeName?: string; // allergen display from the section narrative table row
}

/**
 * Per-allergy source info keyed by the observation's narrative text reference (e.g. '#allergy<uuid>').
 * @param ccda - Parsed CCDA document.
 * @param xml - Raw source XML, used to read the allergy narrative table.
 * @returns Map of narrative text reference to allergy-type code and allergen display name.
 */
function collectAllergyInfo(ccda: Ccda, xml: string): Map<string, AllergySourceInfo> {
  // Practice Fusion narrative: <tr ID="allergy<uuid>"><td>Allergen Name</td>...
  const narrativeNames = new Map<string, string>();
  for (const m of xml.matchAll(/<tr ID="(allergy[^"]+)"[^>]*>\s*<td[^>]*>([^<]*)<\/td>/g)) {
    narrativeNames.set(`#${m[1]}`, m[2].trim());
  }

  const result = new Map<string, AllergySourceInfo>();
  for (const component of ccda.component?.structuredBody?.component ?? []) {
    for (const section of component.section ?? []) {
      for (const entry of section.entry ?? []) {
        for (const act of entry.act ?? []) {
          const obs = act.entryRelationship?.find((r) => r['@_typeCode'] === 'SUBJ')?.observation?.[0];
          const textRef = obs?.text?.reference?.['@_value'];
          if (!textRef?.startsWith('#allergy')) {
            continue;
          }
          result.set(textRef, {
            valueCode: (obs?.value as { '@_code'?: string } | undefined)?.['@_code'],
            narrativeName: narrativeNames.get(textRef),
          });
        }
      }
    }
  }
  return result;
}

function fixAllergyCategories(resources: Resource[], allergyInfo: Map<string, AllergySourceInfo>): string[] {
  const fixes: string[] = [];
  for (const resource of resources) {
    if (resource.resourceType !== 'AllergyIntolerance') {
      continue;
    }
    const allergy = resource;
    const textRef = allergy.extension?.find((e) => e.url === CCDA_NARRATIVE_REF_URL)?.valueString;
    const info = textRef ? allergyInfo.get(textRef) : undefined;
    const mapping = info?.valueCode ? ALLERGY_TYPE_MAP[info.valueCode] : undefined;
    const label = allergy.code?.coding?.[0]?.display ?? info?.narrativeName ?? 'allergy';
    if (mapping?.category) {
      fixes.push(`${label}: category ${JSON.stringify(allergy.category)} -> ${JSON.stringify(mapping.category)}`);
      allergy.category = mapping.category;
    } else {
      // Converter's hardcoded ['food'] is a guess we can't substantiate — remove it
      fixes.push(`${label}: category ${JSON.stringify(allergy.category)} -> (removed, source type unknown)`);
      delete allergy.category;
    }
    if (mapping?.type) {
      allergy.type = mapping.type;
    }
    // Uncoded allergen (nullFlavor UNK) — recover the display name from the narrative table
    if (!allergy.code && info?.narrativeName) {
      allergy.code = { text: info.narrativeName };
      fixes.push(`${info.narrativeName}: code recovered from narrative (allergen was nullFlavor UNK)`);
    }
  }
  return fixes;
}

// ---------------------------------------------------------------------------
// 3. Canonical system URIs for ICD translations
// ---------------------------------------------------------------------------

const SYSTEM_FIXES: Record<string, string> = {
  'urn:oid:2.16.840.1.113883.6.90': 'http://hl7.org/fhir/sid/icd-10-cm',
  'urn:oid:2.16.840.1.113883.6.103': 'http://hl7.org/fhir/sid/icd-9-cm',
};

function fixSystemUris(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(fixSystemUris);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.system === 'string' && SYSTEM_FIXES[obj.system]) {
      obj.system = SYSTEM_FIXES[obj.system];
    }
    Object.values(obj).forEach(fixSystemUris);
  }
}

// ---------------------------------------------------------------------------
// 4/5/6. Dedup, junk removal, deterministic ids, reference rewriting
// ---------------------------------------------------------------------------

function deterministicId(key: string): string {
  const h = createHash('sha256').update(`ccda-import:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function getNpi(resource: Resource): string | undefined {
  const identifiers = (resource as { identifier?: Identifier[] }).identifier;
  return identifiers?.find((i) => i.system === NPI_SYSTEM)?.value;
}

function mergeIdentifiers(winner: Resource, loser: Resource): void {
  const w = winner as { identifier?: Identifier[] };
  const l = loser as { identifier?: Identifier[] };
  for (const ident of l.identifier ?? []) {
    if (!w.identifier?.some((i) => i.system === ident.system && i.value === ident.value)) {
      w.identifier = [...(w.identifier ?? []), ident];
    }
  }
}

/**
 * Batch-wide canonical name per NPI, by majority vote across ALL source files.
 * Needed because Practice Fusion stamps the supervising provider's NPI on staff-recorded
 * entries (e.g. a nurse's entries carry the supervising physician's NPI), and within a single file
 * the wrong name can be the majority. Across the batch the identity holder dominates.
 * @param fileNames - All source XML file names in the input directory.
 * @returns Map of NPI to the most frequently seen HumanName for that NPI.
 */
function collectGlobalNpiNames(fileNames: string[]): Map<string, HumanName> {
  const counts = new Map<string, Map<string, number>>(); // npi -> serialized name -> count
  for (const file of fileNames) {
    const xml = readFileSync(join(INPUT_DIR, file), 'utf8');
    for (const block of xml.matchAll(/<assigned(?:Author|Entity)[^>]*>([\s\S]*?)<\/assigned(?:Author|Entity)>/g)) {
      const npi = /<id root="2\.16\.840\.1\.113883\.4\.6" extension="(\d+)"/.exec(block[1])?.[1];
      if (!npi) {
        continue;
      }
      const nameBlock = /<name>([\s\S]*?)<\/name>/.exec(block[1])?.[1];
      if (!nameBlock) {
        continue;
      }
      const family = /<family>([^<]*)<\/family>/.exec(nameBlock)?.[1];
      if (!family) {
        continue; // organization names have no <family>
      }
      const humanName: HumanName = {
        prefix: [...nameBlock.matchAll(/<prefix>([^<]*)<\/prefix>/g)].map((m) => m[1]),
        given: [...nameBlock.matchAll(/<given>([^<]*)<\/given>/g)].map((m) => m[1]),
        family,
        suffix: [...nameBlock.matchAll(/<suffix>([^<]*)<\/suffix>/g)].map((m) => m[1]),
      };
      const serialized = JSON.stringify(humanName);
      const perNpi = counts.get(npi) ?? new Map<string, number>();
      perNpi.set(serialized, (perNpi.get(serialized) ?? 0) + 1);
      counts.set(npi, perNpi);
    }
  }
  const result = new Map<string, HumanName>();
  for (const [npi, perNpi] of counts) {
    let best = '';
    let bestCount = -1;
    for (const [serialized, count] of perNpi) {
      if (count > bestCount) {
        best = serialized;
        bestCount = count;
      }
    }
    result.set(npi, JSON.parse(best) as HumanName);
  }
  return result;
}

/**
 * Stable dedup/identity key per resource. Returns undefined for resources with no cross-file identity.
 * @param resource - The resource to key.
 * @returns The identity key, or undefined if the resource has no cross-file identity.
 */
function identityKey(resource: Resource): string | undefined {
  if (resource.resourceType === 'Practitioner') {
    const npi = getNpi(resource);
    if (npi) {
      return `Practitioner:npi:${npi}`;
    }
    const name = resource.name?.[0];
    if (name?.family) {
      return `Practitioner:name:${(name.given ?? []).join(' ')} ${name.family}`.toLowerCase();
    }
    return undefined;
  }
  if (resource.resourceType === 'Organization' && resource.name) {
    return `Organization:name:${resource.name.trim().toLowerCase()}`;
  }
  if (resource.resourceType === 'Patient') {
    const first = resource.identifier?.[0];
    if (first?.value) {
      return `Patient:ident:${first.system}|${first.value}`;
    }
  }
  return undefined;
}

/**
 * A resource with no content besides resourceType/id/meta carries no information.
 * The converter sets many fields to explicit undefined, so check values, not key presence.
 * @param resource - The resource to inspect.
 * @returns True if the resource has no content besides resourceType, id and meta.
 */
function isEmptyResource(resource: Resource): boolean {
  return Object.entries(resource).every(
    ([k, v]) =>
      k === 'resourceType' || k === 'id' || k === 'meta' || v === undefined || (Array.isArray(v) && v.length === 0)
  );
}

/**
 * Remove reference objects pointing at dropped ids: filtered out of arrays, deleted from object fields.
 * @param node - Object tree to scrub in place.
 * @param droppedIds - Set of 'Type/id' strings whose references should be removed.
 */
function stripReferencesTo(node: unknown, droppedIds: Set<string>): void {
  const pointsAtDropped = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const ref = (value as Record<string, unknown>).reference;
    if (typeof ref !== 'string') {
      return false;
    }
    const id = ref.split('/')[1];
    return id !== undefined && droppedIds.has(id);
  };
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      if (pointsAtDropped(node[i])) {
        node.splice(i, 1);
      } else {
        stripReferencesTo(node[i], droppedIds);
      }
    }
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (pointsAtDropped(obj[key])) {
        delete obj[key];
      } else {
        stripReferencesTo(obj[key], droppedIds);
      }
    }
  }
}

/**
 * Remove empty arrays and empty objects, bottom-up — both are invalid in FHIR JSON
 * (the converter emits e.g. referenceRange: [] and timing: {}).
 * @param node - Object tree to scrub in place.
 */
function scrubEmpty(node: unknown): void {
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      scrubEmpty(node[i]);
      const v = node[i];
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
        node.splice(i, 1);
      }
    }
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (value === undefined) {
        delete obj[key];
        continue;
      }
      scrubEmpty(value);
      if (Array.isArray(value) && value.length === 0) {
        delete obj[key];
      } else if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
        delete obj[key];
      }
    }
  }
}

interface MedicationNarrativeInfo {
  name?: string; // medication display from the first table cell
  sig?: string; // SIG: line from the status cell
}

/**
 * Recover medication name and sig from the Practice Fusion meds narrative table.
 * @param xml - Raw source XML.
 * @returns Map of narrative row ID to medication display name and sig text.
 */
function collectMedicationInfo(xml: string): Map<string, MedicationNarrativeInfo> {
  const result = new Map<string, MedicationNarrativeInfo>();
  for (const row of xml.matchAll(/<tr ID="(Med[^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const name = /<td[^>]*>\s*([^<]+)/.exec(row[2]);
    const sig = /SIG:\s*([^<]+)/.exec(row[2]);
    result.set(`#${row[1]}`, { name: name?.[1].trim() || undefined, sig: sig?.[1].trim() });
  }
  return result;
}

function fixMedications(
  resources: Resource[],
  medInfo: Map<string, MedicationNarrativeInfo>,
  entryInfo: Map<string, MedEntryInfo>
): string[] {
  const fixes: string[] = [];
  for (const resource of resources) {
    if (resource.resourceType !== 'MedicationRequest') {
      continue;
    }
    const textRef = resource.extension?.find((e) => e.url === CCDA_NARRATIVE_REF_URL)?.valueString;
    const source = textRef ? entryInfo.get(textRef) : undefined;
    // requester is a recommended element (docs/medications) — recover from the source author
    if (!resource.requester) {
      if (source?.npi) {
        const pinned = PRACTITIONER_ID_OVERRIDES[source.npi];
        resource.requester = {
          reference: pinned ? `Practitioner/${pinned}` : `Practitioner?identifier=${NPI_SYSTEM}|${source.npi}`,
          display: source.name,
        };
        fixes.push(`requester set: ${source.name ?? source.npi}`);
      } else if (source?.name) {
        resource.requester = { display: source.name };
        fixes.push(`requester set (display only): ${source.name}`);
      }
    }
    // Patient self-reported meds (no supply/fill-tracking relationship in source): intent 'plan'
    if (source && !source.hasSupply) {
      resource.intent = 'plan';
      resource.reportedBoolean = true;
      fixes.push('self-reported -> intent plan');
    }
    const info = textRef ? medInfo.get(textRef) : undefined;
    if (!info) {
      continue;
    }
    if (info.sig) {
      const dosage = (resource.dosageInstruction ??= [{}])[0];
      if (!dosage.text) {
        dosage.text = info.sig;
        fixes.push(`sig recovered: ${info.sig.slice(0, 50)}`);
      }
    }
    // medication[x] is required 1..1 — uncoded meds (manufacturedMaterial code nullFlavor NI)
    // get their name from the narrative table. The converter emits a contentless
    // medicationCodeableConcept ({...undefined, extension: undefined}) in that case, so check
    // for meaningful content rather than presence.
    const medCC = resource.medicationCodeableConcept;
    const hasMedication =
      Boolean(resource.medicationReference) || Boolean(medCC?.text) || Boolean(medCC?.coding?.length);
    if (!hasMedication && info.name) {
      resource.medicationCodeableConcept = { text: info.name };
      fixes.push(`medication recovered from narrative: ${info.name.slice(0, 60)}`);
    }
  }
  return fixes;
}

/**
 * Labs delivered as PDF attachments produce valueQuantity with no value — strip the junk element.
 * @param resources - Converter output resources, modified in place.
 * @returns Number of valueQuantity elements stripped.
 */
function stripValuelessQuantities(resources: Resource[]): number {
  let stripped = 0;
  for (const resource of resources) {
    if (
      resource.resourceType === 'Observation' &&
      resource.valueQuantity &&
      resource.valueQuantity.value === undefined
    ) {
      delete resource.valueQuantity;
      stripped++;
    }
  }
  return stripped;
}

/**
 * Practice Fusion exports patient phones as +1(xxx)xxx-xxxx and duplicates the home address
 * (one copy in all caps). Normalize phones to bare 10 digits and consolidate duplicate
 * addresses (case/whitespace/line-split-insensitive), keeping the better-cased copy.
 * @param resources - Converter output resources, modified in place.
 * @returns Human-readable descriptions of each fix applied, for logging.
 */
function fixPatientContactInfo(resources: Resource[]): string[] {
  const fixes: string[] = [];
  for (const resource of resources) {
    if (resource.resourceType !== 'Patient') {
      continue;
    }
    for (const telecom of resource.telecom ?? []) {
      if (telecom.system !== 'phone' || !telecom.value) {
        continue;
      }
      let digits = telecom.value.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('1')) {
        digits = digits.slice(1);
      }
      if (digits.length === 10 && digits !== telecom.value) {
        fixes.push(`phone '${telecom.value}' -> ${digits}`);
        telecom.value = digits;
      }
    }
    if (!resource.address || resource.address.length < 2) {
      continue;
    }
    const text = (a: Address): string =>
      [...(a.line ?? []), a.city, a.state, a.postalCode, a.country].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const byKey = new Map<string, Address>();
    for (const addr of resource.address) {
      const key = `${addr.use ?? ''}|${text(addr).toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, addr);
        continue;
      }
      if (text(existing) === text(existing).toUpperCase() && text(addr) !== text(addr).toUpperCase()) {
        byKey.set(key, addr);
      }
      fixes.push(`duplicate address consolidated: '${text(byKey.get(key) as Address)}'`);
    }
    if (byKey.size < resource.address.length) {
      resource.address = [...byKey.values()];
    }
  }
  return fixes;
}

/**
 * Collect every reference string found in the given node tree.
 * @param node - Object tree to walk.
 * @param out - Set that receives every reference string found.
 */
function collectReferences(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectReferences(item, out));
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.reference === 'string') {
      out.add(obj.reference);
    }
    Object.values(obj).forEach((value) => collectReferences(value, out));
  }
}

/**
 * Rewrite references (keyed by full 'Type/id' string) to a conditional reference or pinned existing id.
 * @param node - Object tree to rewrite in place.
 * @param refMap - Map of 'Type/id' reference string to its replacement reference.
 */
function replaceReferenceTargets(node: unknown, refMap: Map<string, string>): void {
  if (Array.isArray(node)) {
    node.forEach((item) => replaceReferenceTargets(item, refMap));
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.reference === 'string' && refMap.has(obj.reference)) {
      obj.reference = refMap.get(obj.reference);
    }
    Object.values(obj).forEach((value) => replaceReferenceTargets(value, refMap));
  }
}

function rewriteReferences(node: unknown, idMap: Map<string, string>): void {
  if (Array.isArray(node)) {
    node.forEach((item) => rewriteReferences(item, idMap));
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.reference === 'string') {
      const match = /^([A-Za-z]+)\/(.+)$/.exec(obj.reference);
      if (match && idMap.has(match[2])) {
        obj.reference = `${match[1]}/${idMap.get(match[2])}`;
      }
    }
    Object.values(obj).forEach((value) => rewriteReferences(value, idMap));
  }
}

interface PostProcessResult {
  resources: Resource[];
  dedupNotes: string[];
  /** Resource id -> ifNoneExist query. Emitted as POST + ifNoneExist (create-if-missing) instead of PUT. */
  conditionalCreates: Map<string, string>;
}

function postProcess(
  fileBase: string,
  resources: Resource[],
  canonicalNpiNames: Map<string, HumanName>
): PostProcessResult {
  const dedupNotes: string[] = [];
  const idMap = new Map<string, string>(); // old id -> new id
  const keyWinners = new Map<string, Resource>(); // identity key -> winning resource
  const kept: Resource[] = [];

  // Drop the nameless authoring-device Practitioner; retarget Composition.author to custodian.
  const composition = resources.find((r) => r.resourceType === 'Composition');
  const junkPractitioners = resources.filter((r) => r.resourceType === 'Practitioner' && !r.name && !getNpi(r));
  const junkIds = new Set(junkPractitioners.map((r) => r.id));
  if (composition?.resourceType === 'Composition' && junkIds.size > 0) {
    const authors = composition.author?.filter((a) => {
      const refId = a.reference?.split('/')[1];
      return !refId || !junkIds.has(refId);
    });
    if ((!authors || authors.length === 0) && composition.custodian) {
      composition.author = [composition.custodian];
      dedupNotes.push('Composition.author retargeted from authoring-device Practitioner to custodian Organization');
    } else {
      composition.author = authors;
    }
  }

  // Pre-pass: choose the canonical copy per identity key by majority vote on the name.
  // Practice Fusion stamps the supervising provider's NPI on staff-recorded entries, so a
  // first-occurrence winner can carry the wrong person's name (e.g. a nurse's name on the
  // supervising physician's NPI). The most common name across copies is the actual identity holder.
  const keyGroups = new Map<string, Resource[]>();
  for (const resource of resources) {
    if (junkIds.has(resource.id)) {
      continue;
    }
    const key = identityKey(resource);
    if (key) {
      const group = keyGroups.get(key) ?? [];
      group.push(resource);
      keyGroups.set(key, group);
    }
  }
  const canonicalByKey = new Map<string, Resource>();
  for (const [key, group] of keyGroups) {
    const nameCounts = new Map<string, number>();
    for (const g of group) {
      const nm = JSON.stringify((g as { name?: unknown }).name ?? '');
      nameCounts.set(nm, (nameCounts.get(nm) ?? 0) + 1);
    }
    let bestName = '';
    let bestCount = -1;
    for (const [nm, c] of nameCounts) {
      if (c > bestCount) {
        bestName = nm;
        bestCount = c;
      }
    }
    canonicalByKey.set(
      key,
      group.find((g) => JSON.stringify((g as { name?: unknown }).name ?? '') === bestName) as Resource
    );
  }

  // Dedup + assign deterministic ids
  const typeCounters = new Map<string, number>();
  const usedKeys = new Set<string>();
  let junkDropCount = 0;
  for (const resource of resources) {
    if (junkIds.has(resource.id)) {
      junkDropCount++;
      continue;
    }
    const key = identityKey(resource);
    if (key) {
      const winner = keyWinners.get(key);
      if (winner) {
        if (winner !== resource) {
          mergeIdentifiers(winner, resource);
          idMap.set(resource.id as string, winner.id as string);
        }
        continue;
      }
    }
    // First occurrence of this identity: keep the canonical (majority-name) copy, not
    // necessarily this one.
    const keeper = (key ? canonicalByKey.get(key) : undefined) ?? resource;
    const resourceOldId = resource.id as string;
    const keeperOldId = keeper.id as string;
    // Deterministic id: identity key if present, else file + type + occurrence index
    const count = typeCounters.get(resource.resourceType) ?? 0;
    typeCounters.set(resource.resourceType, count + 1);
    let idKey = key ?? `${fileBase}:${resource.resourceType}:${count}`;
    while (usedKeys.has(idKey)) {
      idKey += ':dup';
    }
    usedKeys.add(idKey);
    const newId = deterministicId(idKey);
    idMap.set(resourceOldId, newId);
    if (keeperOldId !== resourceOldId) {
      idMap.set(keeperOldId, newId);
      mergeIdentifiers(keeper, resource);
    }
    keeper.id = newId;
    if (key) {
      keyWinners.set(key, keeper);
    }
    kept.push(keeper);
  }

  for (const [key, winner] of keyWinners) {
    const total = idMap.size ? resources.filter((r) => identityKey(r) === key || r.id === winner.id).length : 0;
    if (total > 1) {
      dedupNotes.push(`deduped ${total}x ${key} -> ${winner.id}`);
    }
  }

  for (const resource of kept) {
    rewriteReferences(resource, idMap);
  }

  // Drop empty resources; strip references to them AND to the dropped nameless practitioners.
  // (Junk practitioner refs still carry pre-rewrite ids since they never entered idMap.)
  const emptyIds = new Set(kept.filter(isEmptyResource).map((r) => r.id as string));
  const finalKept = kept.filter((r) => !emptyIds.has(r.id as string));
  for (const r of kept) {
    if (emptyIds.has(r.id as string)) {
      dedupNotes.push(`dropped empty ${r.resourceType} ${r.id}`);
    }
  }
  if (junkDropCount > 0) {
    dedupNotes.push(`dropped ${junkDropCount} nameless Practitioner(s) (no name, no NPI); references stripped`);
  }
  const strippedIds = new Set([...emptyIds, ...junkIds].filter(Boolean) as string[]);
  if (strippedIds.size > 0) {
    for (const resource of finalKept) {
      stripReferencesTo(resource, strippedIds);
    }
  }

  // Organizations already exist per clinic — never created; references become conditional
  // references resolved server-side at write time (exactly-one-match required).
  // Practitioners with an NPI use create-if-missing semantics: the resource stays in the bundle
  // as a conditional create (POST + ifNoneExist by NPI), and all references to them are
  // conditional references by the same NPI. If the project already has the practitioner the
  // POST is a no-op and references resolve to the existing resource; if not, it is created once.
  // The batch processor executes creates before updates (fhir-router batch.ts bucketing), so the
  // practitioner exists before any referencing PUT runs.
  // First+last name -> NPI, for matching author entries that omit the NPI (e.g. 'Jane Doe'
  // in one file vs 'Jane Q Doe' + NPI everywhere else).
  const npiByName = new Map<string, string>();
  for (const r of finalKept) {
    if (r.resourceType === 'Practitioner') {
      const npi = getNpi(r);
      const name = r.name?.[0];
      if (npi && name?.family && name.given?.[0]) {
        npiByName.set(`${name.given[0]} ${name.family}`.toLowerCase(), npi);
      }
    }
  }

  const existingRefs = new Map<string, string>(); // 'Type/id' -> replacement reference
  const conditionalCreates = new Map<string, string>(); // resource id -> ifNoneExist query
  const dropFromOutput = new Set<string>(); // 'Type/id' of resources not emitted at all
  for (const r of finalKept) {
    if (r.resourceType === 'Organization' && r.name) {
      const name = r.name.trim();
      // Name-specific override wins; otherwise the clinic-wide --org-id pin; name-based
      // conditional reference only as a last resort when neither is configured.
      const pinned = ORG_ID_OVERRIDES[name] ?? ORG_ID;
      existingRefs.set(
        `Organization/${r.id}`,
        pinned ? `Organization/${pinned}` : `Organization?name:exact=${encodeURIComponent(name)}`
      );
      dropFromOutput.add(`Organization/${r.id}`);
    } else if (r.resourceType === 'Practitioner') {
      const name = r.name?.[0];
      const nameKey = name?.family && name.given?.[0] ? `${name.given[0]} ${name.family}`.toLowerCase() : undefined;
      const npi = getNpi(r) ?? (nameKey ? npiByName.get(nameKey) : undefined);
      if (npi) {
        const pinned = PRACTITIONER_ID_OVERRIDES[npi];
        existingRefs.set(
          `Practitioner/${r.id}`,
          pinned ? `Practitioner/${pinned}` : `Practitioner?identifier=${NPI_SYSTEM}|${npi}`
        );
        if (pinned) {
          dropFromOutput.add(`Practitioner/${r.id}`); // pinned = known to exist, don't create
        } else if (!getNpi(r)) {
          // Name-matched duplicate of the NPI'd winner in this document — drop the copy
          dedupNotes.push(`Practitioner '${nameKey}' has no NPI but name-matches NPI ${npi} — treated as same person`);
          dropFromOutput.add(`Practitioner/${r.id}`);
        } else {
          // Keep the resource as a conditional create: created only if the NPI isn't in the project.
          // Use the batch-wide canonical name for this NPI (majority vote across all files), so the
          // created resource carries the identity holder's name regardless of file import order.
          const canonicalName = canonicalNpiNames.get(npi);
          if (canonicalName) {
            r.name = [canonicalName];
          }
          conditionalCreates.set(r.id as string, `identifier=${NPI_SYSTEM}|${npi}`);
        }
      } else {
        dedupNotes.push(
          `Practitioner ${r.id} has no NPI — conditional-update upsert on its import identifier (no duplicates across files/re-runs)`
        );
      }
    }
  }
  let output = finalKept.filter((r) => !dropFromOutput.has(`${r.resourceType}/${r.id}`));
  for (const resource of output) {
    replaceReferenceTargets(resource, existingRefs);
  }

  // Requester NPIs recovered from entry authors (fixMedications/buildServiceRequests) can point
  // at practitioners the converter never emitted for this file. Add the missing conditional
  // create so the reference resolves on the first seed regardless of file import order.
  const emittedNpis = new Set(output.map(getNpi).filter(Boolean));
  const allRefs = new Set<string>();
  collectReferences(output, allRefs);
  const npiRefPrefix = `Practitioner?identifier=${NPI_SYSTEM}|`;
  for (const ref of allRefs) {
    if (!ref.startsWith(npiRefPrefix)) {
      continue;
    }
    const npi = ref.slice(npiRefPrefix.length);
    if (emittedNpis.has(npi)) {
      continue;
    }
    emittedNpis.add(npi);
    const canonicalName = canonicalNpiNames.get(npi);
    const missing: Practitioner = {
      resourceType: 'Practitioner',
      id: deterministicId(`Practitioner:npi:${npi}`), // same identity key as emitted copies in other files
      identifier: [{ system: NPI_SYSTEM, value: npi }],
      name: canonicalName ? [canonicalName] : undefined,
    };
    output.push(missing);
    conditionalCreates.set(missing.id as string, `identifier=${NPI_SYSTEM}|${npi}`);
    dedupNotes.push(`Practitioner NPI ${npi} referenced but not emitted by the converter — conditional create added`);
  }

  for (const [id, query] of conditionalCreates) {
    dedupNotes.push(`Practitioner ${id}: conditional create (ifNoneExist ${query}) — reused if already in project`);
  }
  for (const ref of existingRefs.values()) {
    dedupNotes.push(`references rewritten to '${decodeURIComponent(ref)}'`);
  }

  // A PractitionerRole whose only content is the practitioner<->organization link now points at
  // resources that already exist in the project. Creating it per file would duplicate that link
  // 13x. If something references it (e.g. Encounter.participant), repoint that reference at the
  // role's practitioner (Encounter.participant.individual accepts Practitioner directly), then drop.
  const linkOnlyRoles = output.filter(
    (r) =>
      r.resourceType === 'PractitionerRole' &&
      Object.entries(r).every(
        ([k, v]) =>
          k === 'resourceType' ||
          k === 'id' ||
          k === 'meta' ||
          k === 'practitioner' ||
          k === 'organization' ||
          v === undefined
      )
  ) as PractitionerRole[];
  if (linkOnlyRoles.length > 0) {
    const referenced = new Set<string>();
    collectReferences(output, referenced);
    const roleReplacements = new Map<string, string>();
    const dropIds = new Set<string>();
    for (const role of linkOnlyRoles) {
      const key = `PractitionerRole/${role.id}`;
      const practRef = role.practitioner?.reference;
      if (!referenced.has(key)) {
        dropIds.add(role.id as string);
        dedupNotes.push(`dropped unreferenced link-only PractitionerRole ${role.id}`);
      } else if (practRef) {
        roleReplacements.set(key, practRef);
        dropIds.add(role.id as string);
        dedupNotes.push(`inlined link-only PractitionerRole ${role.id} -> '${decodeURIComponent(practRef)}'`);
      }
    }
    if (roleReplacements.size > 0) {
      for (const resource of output) {
        replaceReferenceTargets(resource, roleReplacements);
      }
    }
    if (dropIds.size > 0) {
      output = output.filter((r) => !(r.resourceType === 'PractitionerRole' && dropIds.has(r.id as string)));
    }
  }

  let valuelessIdentifiers = 0;
  const importRefs = new Map<string, string>(); // 'Type/id' -> conditional reference by import identifier
  for (const resource of output) {
    // Source ids with nullFlavor UNK (e.g. <id nullFlavor="UNK" root=NPI-OID/>) become
    // identifiers with a system but no value — junk; strip them.
    const withIdent = resource as { identifier?: Identifier[] };
    if (withIdent.identifier?.some((i) => i.value === undefined)) {
      valuelessIdentifiers += withIdent.identifier.length;
      withIdent.identifier = withIdent.identifier.filter((i) => i.value !== undefined);
      valuelessIdentifiers -= withIdent.identifier.length;
    }
    scrubEmpty(resource);
    // Plain `PUT Type/<new-id>` is super-admin-only (Repository.canSetId), so each resource
    // carries its deterministic id as an identifier and is upserted with a conditional update
    // on it; references to it become conditional references, resolved server-side at write time.
    if (!conditionalCreates.has(resource.id as string)) {
      const importIdentifier: Identifier = { system: IMPORT_ID_SYSTEM, value: resource.id };
      if (resource.resourceType === 'Composition') {
        resource.identifier = importIdentifier; // Composition.identifier is 0..1; unset by the converter
      } else {
        withIdent.identifier = [...(withIdent.identifier ?? []), importIdentifier];
      }
      importRefs.set(
        `${resource.resourceType}/${resource.id}`,
        `${resource.resourceType}?identifier=${IMPORT_ID_SYSTEM}|${resource.id}`
      );
    }
    resource.meta = {
      ...resource.meta,
      tag: [BATCH_TAG, { system: 'urn:ccda-import:source', code: fileBase }],
    };
    // Stamp the clinic Organization as the account so org-restricted access policies can see the
    // import. Honored because the seeding membership is a project admin and MedplumClient sends
    // X-Medplum: extended; compartment resources would otherwise inherit it from the Patient on
    // write anyway. Practitioners are shared across clinics and stay unstamped.
    if (ORG_ID && resource.resourceType !== 'Practitioner') {
      const account = { reference: `Organization/${ORG_ID}` };
      resource.meta.account = account;
      resource.meta.accounts = [account];
    }
  }
  for (const resource of output) {
    replaceReferenceTargets(resource, importRefs);
  }
  if (valuelessIdentifiers > 0) {
    dedupNotes.push(`stripped ${valuelessIdentifiers} valueless identifier(s) (source id nullFlavor UNK)`);
  }

  return { resources: output, dedupNotes, conditionalCreates };
}

// ---------------------------------------------------------------------------
// Section inventory (pre-strip, true source contents)
// ---------------------------------------------------------------------------

function sectionInventory(ccda: Ccda): string[] {
  const lines: string[] = [];
  for (const component of ccda.component?.structuredBody?.component ?? []) {
    for (const section of component.section ?? []) {
      const s = section;
      const oid = s.templateId?.[0]?.['@_root'] ?? '?';
      const entryCount = s.entry?.length ?? 0;
      let flag = '';
      if (entryCount > 0 && KNOWN_DROPPED_SECTION_OIDS[oid]) {
        flag = '  ** SECTION ENTRIES SILENTLY DROPPED BY CONVERTER **';
      }
      lines.push(`${s.title ?? oid} (${oid}) — ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'}${flag}`);
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

mkdirSync(OUTPUT_DIR, { recursive: true });
const files = readdirSync(INPUT_DIR).filter((f) => f.toLowerCase().endsWith('.xml'));
console.log(`Found ${files.length} CCDA file(s) in ${INPUT_DIR}\n`);

const canonicalNpiNames = collectGlobalNpiNames(files);

for (const file of files) {
  const fileBase = file.replace(/\.xml$/i, '');
  console.log(`=== ${file} ===`);

  const xml = readFileSync(join(INPUT_DIR, file), 'utf8');
  let ccda: Ccda;
  try {
    ccda = convertXmlToCcda(xml);
  } catch (err: any) {
    console.log(`  PARSE FAILED: ${err.message}`);
    continue;
  }

  console.log('  section inventory:');
  for (const line of sectionInventory(ccda)) {
    console.log(`    ${line}`);
  }

  const allergyInfo = collectAllergyInfo(ccda, xml);

  const dropped = stripNegatedEntries(ccda);
  for (const d of dropped) {
    console.log(`  dropped negated entry — ${d}`);
  }

  const plannedActs = extractPlannedActs(ccda);
  if (plannedActs.length > 0) {
    console.log(`  extracted ${plannedActs.length} Planned Act(s) from Assessment and Plan -> ServiceRequest`);
  }

  // Strict-mode probe: detect section templates the converter has never seen
  let strictError: string | undefined;
  try {
    convertCcdaToFhir(ccda, { ignoreUnsupportedSections: false });
  } catch (err: any) {
    strictError = err.message;
  }
  console.log(`  strict mode: ${strictError ? `THREW - ${strictError}` : 'OK'}`);

  const documentBundle = convertCcdaToFhir(ccda, { ignoreUnsupportedSections: true });
  const rawResources = (documentBundle.entry ?? []).map((e) => e.resource).filter(Boolean) as Resource[];

  const patient = rawResources.find((r) => r.resourceType === 'Patient');
  if (patient && plannedActs.length > 0) {
    rawResources.push(...buildServiceRequests(plannedActs, patient, fileBase));
  } else if (plannedActs.length > 0) {
    console.log('  WARNING: planned acts found but no Patient resource — ServiceRequests NOT built');
  }

  for (const fix of fixAllergyCategories(rawResources, allergyInfo)) {
    console.log(`  allergy fix — ${fix}`);
  }
  fixSystemUris(rawResources);
  const medFixes = fixMedications(rawResources, collectMedicationInfo(xml), collectMedicationEntryInfo(ccda));
  if (medFixes.length > 0) {
    const medsRecovered = medFixes.filter((f) => f.startsWith('medication recovered')).length;
    const sigsRecovered = medFixes.filter((f) => f.startsWith('sig recovered')).length;
    const requestersSet = medFixes.filter((f) => f.startsWith('requester set')).length;
    const selfReported = medFixes.filter((f) => f.startsWith('self-reported')).length;
    console.log(
      `  medications: ${sigsRecovered} sig(s), ${medsRecovered} uncoded name(s), ${requestersSet} requester(s), ${selfReported} self-reported -> intent plan`
    );
  }
  const quantitiesStripped = stripValuelessQuantities(rawResources);
  if (quantitiesStripped > 0) {
    console.log(`  stripped ${quantitiesStripped} valueless valueQuantity element(s) (PDF-attachment lab results)`);
  }
  for (const fix of fixPatientContactInfo(rawResources)) {
    console.log(`  patient fix — ${fix}`);
  }

  const { resources, dedupNotes, conditionalCreates } = postProcess(fileBase, rawResources, canonicalNpiNames);
  for (const note of dedupNotes) {
    console.log(`  ${note}`);
  }

  const counts: Record<string, number> = {};
  for (const r of resources) {
    counts[r.resourceType] = (counts[r.resourceType] ?? 0) + 1;
  }
  console.log(`  resource counts: ${JSON.stringify(counts)}`);

  const reviewBundle: Bundle = {
    resourceType: 'Bundle',
    type: 'document',
    entry: resources.map((r) => ({ resource: r })),
  };
  writeFileSync(join(OUTPUT_DIR, `${fileBase}.fhir.json`), JSON.stringify(reviewBundle, null, 2));

  // Batch bundles (not transactions): Medplum transactions require the transaction-bundles
  // feature flag. Chunked to stay under the server's 1MB maxJsonSize default. Conditional
  // updates keyed by import identifier are idempotent, so partial failures are safely retryable.
  const MAX_BATCH_BYTES = 800_000;
  // Entry order follows docs/migration/migration-sequence: practitioners first, then patient,
  // then the clinical snapshot (problems, meds, allergies), then longitudinal history, and the
  // Composition (which references everything) last. Conditional-create practitioners lead so
  // they exist in project state before later chunks' conditional references resolve (within a
  // single batch the server already runs creates before updates; chunks are separate requests).
  const IMPORT_ORDER = [
    'Practitioner',
    'PractitionerRole',
    'Organization',
    'Patient',
    'Condition',
    'MedicationRequest',
    'AllergyIntolerance',
    'Encounter',
    'Observation',
    'DiagnosticReport',
    'ServiceRequest',
    'CarePlan',
    'Goal',
  ];
  const rankOf = (r: Resource): number => {
    if (conditionalCreates.has(r.id as string)) {
      return -1;
    }
    if (r.resourceType === 'Composition') {
      return 999;
    }
    const i = IMPORT_ORDER.indexOf(r.resourceType);
    return i === -1 ? 500 : i;
  };
  const ordered = [...resources].sort((a, b) => rankOf(a) - rankOf(b));
  const chunks: Resource[][] = [];
  let current: Resource[] = [];
  let currentSize = 0;
  for (const r of ordered) {
    const size = JSON.stringify(r).length + 200;
    if (current.length > 0 && currentSize + size > MAX_BATCH_BYTES) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(r);
    currentSize += size;
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  // Remove this file's chunks from previous runs — the chunk count can change between runs,
  // and --seed executes every *.batch* file in the output directory.
  for (const stale of readdirSync(OUTPUT_DIR).filter((f) => f.startsWith(`${fileBase}.batch`))) {
    rmSync(join(OUTPUT_DIR, stale));
  }

  const batchFiles: string[] = [];
  chunks.forEach((chunk, idx) => {
    const batchBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: chunk.map((r): BundleEntry => {
        const ifNoneExist = conditionalCreates.get(r.id as string);
        if (ifNoneExist) {
          // Create-if-missing: POST is a no-op when the ifNoneExist query already matches.
          return {
            resource: { ...r, id: undefined },
            request: { method: 'POST', url: r.resourceType, ifNoneExist },
          };
        }
        // Conditional update: create-if-missing, update-if-present, keyed by the import
        // identifier. The body must not carry an id (create-by-update rejects client ids).
        return {
          resource: { ...r, id: undefined },
          request: { method: 'PUT', url: `${r.resourceType}?identifier=${IMPORT_ID_SYSTEM}|${r.id}` },
        };
      }),
    };
    const suffix = chunks.length > 1 ? `.batch${idx + 1}of${chunks.length}` : '.batch';
    const filename = `${fileBase}${suffix}.json`;
    writeFileSync(join(OUTPUT_DIR, filename), JSON.stringify(batchBundle));
    batchFiles.push(filename);
  });
  console.log(`  wrote ${fileBase}.fhir.json + ${batchFiles.join(', ')}\n`);
}

// ---------------------------------------------------------------------------
// Seed: execute the generated batch bundles against the target project
// ---------------------------------------------------------------------------

/**
 * POST with Prefer: respond-async, then poll the AsyncJob status URL until the job completes.
 * Work inside the background job does NOT consume the per-user FHIR interaction quota — a
 * synchronous executeBatch exhausts it (~50k points/min) and 429s most entries.
 *
 * Polling is manual, not startAsyncRequest({pollStatusOnAccepted}): MedplumClient.pollStatus
 * reuses the POST options for the status GET — including the body — and Node fetch rejects a
 * GET with a body ("Request with GET/HEAD method cannot have body").
 * @param medplum - Authenticated Medplum client.
 * @param url - URL to POST to.
 * @param body - JSON request body.
 * @returns The completed AsyncJob.
 */
async function runAsyncJob(medplum: MedplumClient, url: string, body: string): Promise<AsyncJob> {
  const accepted = await medplum.post(url, body, ContentType.FHIR_JSON, {
    headers: { Prefer: 'respond-async' },
  });
  const statusUrl = accepted.issue?.[0]?.diagnostics;
  if (!statusUrl?.startsWith('http')) {
    throw new Error(`no status URL in async accept response: ${JSON.stringify(accepted).slice(0, 300)}`);
  }
  const deadline = Date.now() + 30 * 60_000;
  for (;;) {
    const job = await medplum.get(statusUrl, { cache: 'no-cache' });
    if (job?.resourceType === 'AsyncJob' && (job.status === 'error' || job.status === 'cancelled')) {
      throw new Error(`async job ${job.status}: ${JSON.stringify(job.output ?? {}).slice(0, 300)}`);
    }
    if (job?.resourceType === 'AsyncJob' && job.status === 'completed') {
      return job;
    }
    if (Date.now() > deadline) {
      throw new Error('async job still not finished after 30 minutes; check the AsyncJob in the project');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }
}

/**
 * Execute a batch bundle asynchronously and download the batch-response Bundle from the results Binary.
 * @param medplum - Authenticated Medplum client.
 * @param bundle - Batch bundle to execute.
 * @returns The batch-response Bundle.
 */
async function executeBatchAsync(medplum: MedplumClient, bundle: Bundle): Promise<Bundle> {
  const job = await runAsyncJob(medplum, medplum.fhirUrl().toString(), JSON.stringify(bundle));
  const resultsRef = job.output?.parameter?.find((p) => p.name === 'results')?.valueReference?.reference;
  if (!resultsRef) {
    throw new Error(`async job completed without a results Binary: ${JSON.stringify(job.output).slice(0, 300)}`);
  }
  return JSON.parse(await (await medplum.download(resultsRef)).text()) as Bundle;
}

async function seedProject(): Promise<void> {
  const baseUrl = SEED_BASE_URL;
  const clientId = SEED_CLIENT_ID;
  const clientSecret = SEED_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      '\n--seed requires credentials: set the MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET env vars ' +
        '(a ClientApplication in the target project; see .env.defaults). Nothing was uploaded.'
    );
    process.exit(1);
  }

  const medplum = new MedplumClient({ baseUrl, fetch });
  await medplum.startClientLogin(clientId, clientSecret);
  console.log(`\nSeeding ${baseUrl} (tag ${BATCH_TAG.system}|${BATCH_TAG.code}) ...`);

  const batchFileNames = readdirSync(OUTPUT_DIR)
    .filter((f) => f.includes('.batch'))
    .sort();
  let succeeded = 0;
  let failed = 0;
  for (const file of batchFileNames) {
    const bundle = JSON.parse(readFileSync(join(OUTPUT_DIR, file), 'utf8')) as Bundle;
    // Sequential on purpose: each chunk's job completes before the next is submitted, so
    // practitioner conditional creates exist before later chunks' references resolve.
    let response: Bundle;
    try {
      response = await executeBatchAsync(medplum, bundle);
    } catch (err: any) {
      failed += bundle.entry?.length ?? 0;
      console.log(`  ${file}: FAILED — ${err.message}`);
      continue;
    }
    const entries = response.entry ?? [];
    const errors = entries.filter((e) => !e.response?.status?.startsWith('2'));
    succeeded += entries.length - errors.length;
    failed += errors.length;
    console.log(`  ${file}: ${entries.length - errors.length}/${entries.length} entries succeeded`);
    for (const e of errors.slice(0, 5)) {
      console.log(`    FAILED ${e.response?.status}: ${JSON.stringify(e.response?.outcome ?? {}).slice(0, 300)}`);
    }
    if (errors.length > 5) {
      console.log(`    ... and ${errors.length - 5} more failures in this bundle`);
    }
  }
  console.log(
    `\nSeed complete: ${succeeded} succeeded, ${failed} failed.` +
      (failed > 0 ? ' Fix the cause and re-run with --seed — all writes are idempotent.' : '')
  );
  if (failed > 0) {
    process.exit(1);
  }
}

if (SEED) {
  await seedProject();
} else {
  console.log('Review the bundles above, then seed with: --seed (set MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET)');
}
