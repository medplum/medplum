// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  DEFAULT_SEARCH_COUNT,
  EMPTY,
  HTTP_HL7_ORG,
  normalizeErrorString,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, BundleEntry, ContactPoint, Identifier, Patient } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type { Repository } from '../repo';
import { getOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

const operation = getOperationDefinition('Patient', 'match');

// Extension URL for match-grade, as defined by the FHIR spec
const MATCH_GRADE_EXTENSION_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/match-grade`;

// Thresholds for match-grade classification
const CERTAIN_THRESHOLD = 0.9;
const PROBABLE_THRESHOLD = 0.65;
const POSSIBLE_THRESHOLD = 0.4;
const CANDIDATE_SEARCH_COUNT = 100;

export type MatchGrade = 'certain' | 'probable' | 'possible' | 'certainly-not';

export interface PatientMatchParameters {
  resource: Patient;
  onlyCertainMatches?: boolean;
  count?: number;
}

export interface ScoredPatient {
  patient: WithId<Patient>;
  score: number;
  grade: MatchGrade;
}

// Patient $match operation.
// https://hl7.org/fhir/R4/patient-operation-match.html

/**
 * Handles a Patient $match request.
 * Accepts a (possibly partial) Patient resource and returns a Bundle of candidate
 * matches ordered from most to least likely, each annotated with a search score
 * and match-grade extension.
 * @param req - The FHIR request.
 * @returns The FHIR response containing a searchset Bundle.
 */
export async function patientMatchHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<PatientMatchParameters>(operation, req);

  if (params.resource?.resourceType !== 'Patient') {
    throw new OperationOutcomeError(badRequest('Input parameter "resource" must be a Patient resource'));
  }
  if (!hasMatchableField(params.resource)) {
    throw new OperationOutcomeError(
      badRequest('Input Patient must include at least one of: identifier, name, birthDate, telecom, or gender')
    );
  }

  const bundle = await matchPatients(ctx.repo, params);
  return [allOk, bundle];
}

/**
 * Core Patient matching logic. Finds candidate patients from the repository using
 * available demographics from the input patient, then scores and ranks them.
 * @param repo - The repository.
 * @param params - The parsed operation parameters.
 * @returns A searchset Bundle of scored patient matches.
 */
export async function matchPatients(
  repo: Repository,
  params: PatientMatchParameters
): Promise<Bundle<WithId<Patient>>> {
  const input = params.resource;
  const maxCount = params.count ?? DEFAULT_SEARCH_COUNT;

  // Gather candidates via multiple search strategies, then deduplicate
  const candidates = await gatherCandidates(repo, input);

  // Score and classify each candidate
  const scored: ScoredPatient[] = candidates.map((candidate) => scoreCandidate(candidate, input));

  // Filter by onlyCertainMatches if requested
  const filtered = params.onlyCertainMatches ? scored.filter((s) => s.grade === 'certain') : scored;

  // Remove certainly-not matches (score below possible threshold)
  const relevant = filtered.filter((s) => s.grade !== 'certainly-not');

  // Sort descending by score, then apply count limit
  relevant.sort((a, b) => b.score - a.score);
  const limited = relevant.slice(0, maxCount);

  return buildMatchBundle(limited);
}

/**
 * Collects candidate patients by running FHIR searches based on the available
 * demographics in the input patient. Results are deduplicated by patient ID.
 * @param repo - The repository.
 * @param input - The input patient resource to match against.
 * @returns Deduplicated array of candidate patients.
 */
async function gatherCandidates(repo: Repository, input: Patient): Promise<WithId<Patient>[]> {
  const seen = new Map<string, WithId<Patient>>();

  const addCandidates = (bundle: Bundle<WithId<Patient>>): void => {
    for (const entry of bundle.entry ?? EMPTY) {
      if (entry.resource) {
        seen.set(entry.resource.id, entry.resource);
      }
    }
  };

  try {
    // Strategy 1: search by identifier (strongest signal)
    if (input.identifier?.length) {
      for (const id of input.identifier) {
        if (!id.value) {
          continue;
        }
        const value = id.system ? `${id.system}|${id.value}` : id.value;
        const result = await repo.search<WithId<Patient>>({
          resourceType: 'Patient',
          filters: [{ code: 'identifier', operator: Operator.EQUALS, value }],
          count: CANDIDATE_SEARCH_COUNT,
        });
        addCandidates(result);
      }
    }

    // Strategy 2: search by birthdate alone.
    // Birthdate is more stable than family name (which can change due to marriage/maiden name),
    // so we use it as the primary broad-net search and rely on scoring to rank the results.
    if (input.birthDate) {
      const result = await repo.search<WithId<Patient>>({
        resourceType: 'Patient',
        filters: [{ code: 'birthdate', operator: Operator.EQUALS, value: input.birthDate }],
        count: CANDIDATE_SEARCH_COUNT,
      });
      addCandidates(result);
    }

    // Strategy 3: search by telecom (phone/email) when present.
    const telecomValues = new Set(
      (input.telecom ?? EMPTY)
        .filter((t) => (t.system === 'phone' || t.system === 'email') && t.value)
        .map((t) => t.value as string)
    );
    for (const value of telecomValues) {
      const result = await repo.search<WithId<Patient>>({
        resourceType: 'Patient',
        filters: [{ code: 'telecom', operator: Operator.EQUALS, value }],
        count: CANDIDATE_SEARCH_COUNT,
      });
      addCandidates(result);
    }
  } catch (err) {
    throw new OperationOutcomeError(badRequest(`Error searching for patient candidates: ${normalizeErrorString(err)}`));
  }

  return Array.from(seen.values());
}

/**
 * Scores a candidate patient against the input patient using a weighted
 * demographic comparison. Returns a score from 0 to 1 and a match grade.
 *
 * This is intentionally a simple baseline algorithm. Future iterations should
 * incorporate probabilistic (e.g. Fellegi-Sunter) or ML-based scoring.
 * @param candidate - The candidate patient from the repository.
 * @param input - The input patient to match against.
 * @returns A ScoredPatient with a numeric score and match grade.
 */
export function scoreCandidate(candidate: WithId<Patient>, input: Patient): ScoredPatient {
  let score = 0;
  let totalWeight = 0;

  // Identifier match — highest weight; an exact identifier match is a strong signal
  if (input.identifier?.length && candidate.identifier?.length) {
    const weight = 0.4;
    totalWeight += weight;
    const matched = input.identifier.some((inputId) =>
      candidate.identifier?.some(
        (candId: Identifier) => candId.value === inputId.value && (!inputId.system || candId.system === inputId.system)
      )
    );
    if (matched) {
      score += weight;
    }
  }

  // Family name match
  const inputFamily = getFamilyName(input)?.toLowerCase();
  const candFamily = getFamilyName(candidate)?.toLowerCase();
  if (inputFamily && candFamily) {
    const weight = 0.2;
    totalWeight += weight;
    if (inputFamily === candFamily) {
      score += weight;
    } else if (candFamily.startsWith(inputFamily) || inputFamily.startsWith(candFamily)) {
      score += weight * 0.5;
    }
  }

  // Given name match
  const inputGiven = getGivenNames(input).map((n) => n.toLowerCase());
  const candGiven = getGivenNames(candidate).map((n) => n.toLowerCase());
  if (inputGiven.length && candGiven.length) {
    const weight = 0.15;
    totalWeight += weight;
    const matched = inputGiven.some((n) => candGiven.includes(n));
    if (matched) {
      score += weight;
    }
  }

  // Birthdate match — strong signal when present
  if (input.birthDate && candidate.birthDate) {
    const weight = 0.2;
    totalWeight += weight;
    if (input.birthDate === candidate.birthDate) {
      score += weight;
    }
  }

  // Phone match — strong signal in digital health contexts where patients self-register
  const inputPhones = getTelecom(input, 'phone');
  const candPhones = getTelecom(candidate, 'phone');
  if (inputPhones.length && candPhones.length) {
    const weight = 0.3;
    totalWeight += weight;
    const matched = inputPhones.some((n) => candPhones.includes(n));
    if (matched) {
      score += weight;
    }
  }

  // Email match — equally strong signal for the same reasons as phone
  const inputEmails = getTelecom(input, 'email');
  const candEmails = getTelecom(candidate, 'email');
  if (inputEmails.length && candEmails.length) {
    const weight = 0.3;
    totalWeight += weight;
    const matched = inputEmails.some((e) => candEmails.includes(e));
    if (matched) {
      score += weight;
    }
  }

  // Gender match — low weight; not a discriminating field on its own
  if (input.gender && candidate.gender) {
    const weight = 0.05;
    totalWeight += weight;
    if (input.gender === candidate.gender) {
      score += weight;
    }
  }

  // Normalize: if we had no overlapping fields to compare, score is 0
  // Note: totalWeight only includes fields present on both input and candidate,
  // so missing candidate fields do not penalize the score.
  const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;
  const grade = classifyMatchGrade(normalizedScore);

  return { patient: candidate, score: normalizedScore, grade };
}

function classifyMatchGrade(score: number): MatchGrade {
  if (score >= CERTAIN_THRESHOLD) {
    return 'certain';
  }
  if (score >= PROBABLE_THRESHOLD) {
    return 'probable';
  }
  if (score >= POSSIBLE_THRESHOLD) {
    return 'possible';
  }
  return 'certainly-not';
}

function getFamilyName(patient: Patient): string | undefined {
  return patient.name?.find((n) => n.family)?.family;
}

function getGivenNames(patient: Patient): readonly string[] {
  return patient.name?.flatMap((n) => n.given ?? EMPTY) ?? EMPTY;
}

function hasMatchableField(patient: Patient): boolean {
  const hasIdentifier = !!patient.identifier?.some((id) => id.value);
  const hasName = !!patient.name?.some((n) => n.family || (n.given && n.given.length > 0));
  const hasBirthDate = !!patient.birthDate;
  const hasTelecom = !!patient.telecom?.some((t) => (t.system === 'phone' || t.system === 'email') && t.value);
  const hasGender = !!patient.gender;
  return hasIdentifier || hasName || hasBirthDate || hasTelecom || hasGender;
}

/**
 * Returns normalized telecom values for a given system (e.g. 'phone', 'email').
 * Phone numbers are stripped to digits only to handle formatting variations.
 * Email addresses are lowercased.
 *
 * @param patient - The patient resource containing telecom entries.
 * @param system - The telecom system to filter by ('phone' or 'email').
 * @returns An array of normalized telecom values for the specified system.
 */
function getTelecom(patient: Patient, system: 'phone' | 'email'): string[] {
  return (patient.telecom ?? EMPTY)
    .filter((t): t is ContactPoint & { value: string } => !!(t.system === system && t.value))
    .map((t) => (system === 'phone' ? t.value.replace(/\D/g, '') : t.value.toLowerCase()));
}

/**
 * Builds a searchset Bundle from a list of scored patients.
 * Each entry includes a search score and match-grade extension per the FHIR spec.
 * @param scored - The scored and sorted patient matches.
 * @returns A searchset Bundle.
 */
function buildMatchBundle(scored: ScoredPatient[]): Bundle<WithId<Patient>> {
  const entries: BundleEntry<WithId<Patient>>[] = scored.map(({ patient, score, grade }) => ({
    resource: patient,
    search: {
      mode: 'match',
      score,
      extension: [
        {
          url: MATCH_GRADE_EXTENSION_URL,
          valueCode: grade,
        },
      ],
    },
  }));

  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: entries.length,
    entry: entries,
  };
}
