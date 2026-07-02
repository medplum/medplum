// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  createReference,
  DEFAULT_SEARCH_COUNT,
  EMPTY,
  HTTP_HL7_ORG,
  normalizeErrorString,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, BundleEntry, Extension, Patient } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { getAuthenticatedContext } from '../../context';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import type { Repository } from '../repo';
import { getOperationDefinition } from './definitions';
import type { CmsPatientMatchResult } from './utils/cms-patient-match';
import { cmsPatientMatch } from './utils/cms-patient-match';
import { parseInputParameters } from './utils/parameters';

const operation = getOperationDefinition('Patient', 'match');

// Extension URL for match-grade, as defined by the FHIR spec
const MATCH_GRADE_EXTENSION_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/match-grade`;

// CMS Patient Match extension: the Table 2 combination (criteria id) the match satisfied.
const CMS_COMBINATION_EXTENSION_URL = 'https://medplum.com/fhir/StructureDefinition/cms-match-combination';
const CMS_MATCH_TYPE_EXTENSION_URL = 'https://medplum.com/fhir/StructureDefinition/cms-match-type';

const CANDIDATE_SEARCH_COUNT = 100;
const PROBABLE_THRESHOLD = 0.65;
const POSSIBLE_THRESHOLD = 0.2;
const CMS_MATCH_FACTOR_COUNT = 11;

export type MatchGrade = 'certain' | 'probable' | 'possible' | 'certainly-not';

export interface PatientMatchParameters {
  resource: Patient;
  onlyCertainMatches?: boolean;
  count?: number;
}

export interface ScoredPatient {
  patient: WithId<Patient>;
  result: CmsPatientMatchResult;
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
      badRequest('Input Patient must include at least one of: identifier, name, birthDate, or telecom')
    );
  }

  const result = await matchPatients(ctx.repo, params);
  if (params.onlyCertainMatches) {
    logCmsAuditEvent(ctx, result.certainMatches, result.truncated);
  }

  return [allOk, result.bundle];
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
): Promise<{ bundle: Bundle<WithId<Patient>>; certainMatches: ScoredPatient[]; truncated: boolean }> {
  const input = params.resource;
  const maxCount = params.count ?? DEFAULT_SEARCH_COUNT;
  const { candidates, truncated } = await gatherCandidates(repo, input);
  const scored = candidates.map((candidate) => scoreCandidate(candidate, input));
  const relevant = scored.filter((s) => s.grade !== 'certainly-not');
  const certainMatches = relevant.filter((s) => s.grade === 'certain');
  let filtered: ScoredPatient[];
  if (params.onlyCertainMatches) {
    filtered = !truncated && certainMatches.length === 1 ? certainMatches : [];
  } else {
    filtered = relevant;
  }

  filtered.sort((a, b) => b.score - a.score);
  const limited = filtered.slice(0, maxCount);

  return { bundle: buildMatchBundle(limited), certainMatches, truncated };
}

/**
 * Collects candidate patients by running FHIR searches based on the available
 * demographics in the input patient. Results are deduplicated by patient ID.
 * @param repo - The repository.
 * @param input - The input patient resource to match against.
 * @returns Deduplicated array of candidate patients and whether any search was truncated.
 */
async function gatherCandidates(
  repo: Repository,
  input: Patient
): Promise<{ candidates: WithId<Patient>[]; truncated: boolean }> {
  const seen = new Map<string, WithId<Patient>>();
  let truncated = false;

  const runSearch = async (filters: { code: string; operator: Operator; value: string }[]): Promise<void> => {
    const result = await repo.search<WithId<Patient>>({
      resourceType: 'Patient',
      filters,
      count: CANDIDATE_SEARCH_COUNT,
    });
    const entries = result.entry ?? EMPTY;
    if (entries.length >= CANDIDATE_SEARCH_COUNT) {
      truncated = true;
    }
    for (const entry of entries) {
      if (entry.resource) {
        seen.set(entry.resource.id, entry.resource);
      }
    }
  };

  try {
    // Strategy 1: search by identifier (strongest signal)
    for (const id of input.identifier ?? EMPTY) {
      if (id.value) {
        const value = id.system ? `${id.system}|${id.value}` : id.value;
        await runSearch([{ code: 'identifier', operator: Operator.EQUALS, value }]);
      }
    }

    // Strategy 2: search by telecom (phone/email) when present.
    const telecomValues = new Set(
      (input.telecom ?? EMPTY)
        .filter((t) => (t.system === 'phone' || t.system === 'email') && t.value)
        .map((t) => t.value as string)
    );
    for (const value of telecomValues) {
      await runSearch([{ code: 'telecom', operator: Operator.EQUALS, value }]);
    }

    // Strategy 3: search by name + birthdate.
    if (input.birthDate) {
      const dobFilter = { code: 'birthdate', operator: Operator.EQUALS, value: input.birthDate };
      const family = getFamilyName(input);
      const given = getGivenNames(input)[0];
      if (family) {
        await runSearch([dobFilter, { code: 'family', operator: Operator.EQUALS, value: family }]);
      }
      if (given) {
        await runSearch([dobFilter, { code: 'given', operator: Operator.EQUALS, value: given }]);
      }
    }
  } catch (err) {
    throw new OperationOutcomeError(badRequest(`Error searching for patient candidates: ${normalizeErrorString(err)}`));
  }

  return { candidates: Array.from(seen.values()), truncated };
}

/**
 * Scores a candidate patient against the input patient using the CMS criteria
 * and lightweight FHIR discovery scoring.
 * @param candidate - The candidate patient from the repository.
 * @param input - The input patient to match against.
 * @returns A ScoredPatient with a numeric score and match grade.
 */
export function scoreCandidate(candidate: WithId<Patient>, input: Patient): ScoredPatient {
  const result = cmsPatientMatch(input, candidate);
  if (result.criteriaId) {
    return { patient: candidate, result, score: 1, grade: 'certain' };
  }
  if (result.suffixConflict) {
    return { patient: candidate, result, score: 0, grade: 'certainly-not' };
  }

  const score = Math.min((result.exactCount + result.fuzzyCount * 0.5) / CMS_MATCH_FACTOR_COUNT, 0.9);
  return { patient: candidate, result, score, grade: classifyMatchGrade(score) };
}

function classifyMatchGrade(score: number): MatchGrade {
  if (score >= PROBABLE_THRESHOLD) {
    return 'probable';
  }
  if (score >= POSSIBLE_THRESHOLD) {
    return 'possible';
  }
  return 'certainly-not';
}

/**
 * Builds a searchset Bundle from a list of scored patients.
 * Each entry includes a search score and match-grade extension per the FHIR spec.
 * @param scored - The scored and sorted patient matches.
 * @returns A searchset Bundle.
 */
function buildMatchBundle(scored: ScoredPatient[]): Bundle<WithId<Patient>> {
  const entries: BundleEntry<WithId<Patient>>[] = scored.map(({ patient, result, score, grade }) => {
    const extension: Extension[] = [{ url: MATCH_GRADE_EXTENSION_URL, valueCode: grade }];
    if (result.criteriaId) {
      extension.push({ url: CMS_COMBINATION_EXTENSION_URL, valueString: result.criteriaId });
    }
    if (result.matchType) {
      extension.push({ url: CMS_MATCH_TYPE_EXTENSION_URL, valueCode: result.matchType });
    }
    return {
      resource: patient,
      search: {
        mode: 'match',
        score,
        extension,
      },
    };
  });
  return { resourceType: 'Bundle', type: 'searchset', total: entries.length, entry: entries };
}

/**
 * Logs an audit record for a CMS disclosure decision (§VII): query initiator, the Table 2
 * combinations evaluated, matched record id(s), and the final determination. Ambiguous and
 * truncated outcomes are flagged as minor failures so they surface in monitoring.
 * @param ctx - The authenticated request context.
 * @param matches - The candidates that satisfied a combination.
 * @param truncated - Whether the candidate gather was capped (uniqueness unprovable).
 */
function logCmsAuditEvent(ctx: AuthenticatedRequestContext, matches: ScoredPatient[], truncated: boolean): void {
  const released = !truncated && matches.length === 1;
  let outcome: string;
  if (released) {
    outcome = 'released';
  } else if (truncated) {
    outcome = 'gather-truncated';
  } else if (matches.length === 0) {
    outcome = 'no-match';
  } else {
    outcome = 'ambiguous';
  }

  const description = JSON.stringify({
    operation: 'Patient/$match',
    outcome,
    criteria: matches.map((m) => m.result.criteriaId),
    matchTypes: matches.map((m) => m.result.matchType),
    matchedIds: matches.map((m) => m.patient.id),
    uniqueness: getUniquenessResult(released, matches, truncated),
  });

  const auditEvent = createAuditEvent(
    RestfulOperationType,
    OperationInteraction,
    ctx.project.id,
    ctx.profile,
    undefined,
    outcome === 'released' || outcome === 'no-match' ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure,
    {
      description,
      resource: released ? createReference(matches[0].patient) : undefined,
    }
  );
  logAuditEvent(auditEvent);
}

function getUniquenessResult(
  released: boolean,
  matches: ScoredPatient[],
  truncated: boolean
): 'unique' | 'ambiguous' | 'unproven' | 'none' {
  if (released) {
    return 'unique';
  }
  if (truncated) {
    return 'unproven';
  }
  if (matches.length > 1) {
    return 'ambiguous';
  }
  return 'none';
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
  return hasIdentifier || hasName || hasBirthDate || hasTelecom;
}
