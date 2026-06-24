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
import type { Bundle, BundleEntry, Patient } from '@medplum/fhirtypes';
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
import { cmsPatientMatch } from './utils/cms-patient-match';
import { parseInputParameters } from './utils/parameters';

const operation = getOperationDefinition('Patient', 'match');

// Extension URL for match-grade, as defined by the FHIR spec
const MATCH_GRADE_EXTENSION_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/match-grade`;

// CMS Patient Match extension: the Table 2 combination (criteria id) the match satisfied.
const CMS_COMBINATION_EXTENSION_URL = 'https://medplum.com/fhir/StructureDefinition/cms-match-combination';

const CANDIDATE_SEARCH_COUNT = 100;

export interface PatientMatchParameters {
  resource: Patient;
  onlyCertainMatches?: boolean;
  count?: number;
}

/** A candidate that satisfied a CMS Table 2 matching combination. */
interface CmsMatch {
  candidate: WithId<Patient>;
  criteriaId: string;
}

// Patient $match operation.
// https://hl7.org/fhir/R4/patient-operation-match.html

/**
 * Handles a Patient $match request using the CMS Patient Matching criteria.
 *
 * Gathers candidate patients and returns those that satisfy an approved Table 2 combination.
 * With `onlyCertainMatches=true` (disclosure), a match is returned only when exactly one
 * candidate qualifies and the candidate search was complete; otherwise it is suppressed.
 * With `onlyCertainMatches=false` (discovery), every combination match is returned.
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

  const input = params.resource;
  const { candidates, truncated } = await gatherCmsCandidates(ctx.repo, input);

  const matches: CmsMatch[] = [];
  for (const candidate of candidates) {
    const { criteriaId } = cmsPatientMatch(input, candidate);
    if (criteriaId) {
      matches.push({ candidate, criteriaId });
    }
  }

  let released: CmsMatch[];
  if (params.onlyCertainMatches) {
    // Disclosure: release only a unique match, and only if the gather was complete — a
    // truncated search cannot prove uniqueness. Ambiguous and truncated results are suppressed.
    released = !truncated && matches.length === 1 ? matches : [];
    logCmsAuditEvent(ctx, matches, truncated);
  } else {
    // Discovery: return every combination match.
    released = matches;
  }

  const maxCount = params.count ?? DEFAULT_SEARCH_COUNT;
  return [allOk, buildMatchBundle(released.slice(0, maxCount))];
}

/**
 * Gathers CMS match candidates using selective, conjunctive searches anchored on the
 * query's exact identifiers, telecom, and name+birthdate. Returns the deduplicated set
 * along with a `truncated` flag: if any search hit the result cap, uniqueness cannot be
 * proven and the disclosure path suppresses the match.
 *
 * NOTE: recall is bounded by FHIR search semantics (e.g. unnormalized telecom/name values
 * may not match exactly). Full recall requires DB-level normalized search tokens, tracked
 * alongside the address-normalization work item.
 *
 * @param repo - The repository.
 * @param input - The input patient resource.
 * @returns The candidate set and a truncation flag.
 */
async function gatherCmsCandidates(
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
    // Exact identifiers (MBI, legal ID, EMPI, etc.) — highly selective token searches.
    for (const id of input.identifier ?? EMPTY) {
      if (id.value) {
        const value = id.system ? `${id.system}|${id.value}` : id.value;
        await runSearch([{ code: 'identifier', operator: Operator.EQUALS, value }]);
      }
    }

    // Phone / email — selective token searches.
    const telecomValues = new Set(
      (input.telecom ?? EMPTY)
        .filter((t) => (t.system === 'phone' || t.system === 'email') && t.value)
        .map((t) => t.value as string)
    );
    for (const value of telecomValues) {
      await runSearch([{ code: 'telecom', operator: Operator.EQUALS, value }]);
    }

    // Name + birthdate — anchors the demographic combinations (01-07, 11, 12). Searching
    // both family+DOB and given+DOB covers the fuzzy-name cases, since at most one name
    // field may be fuzzy so the other remains an exact anchor.
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
 * Builds a searchset Bundle from CMS matches. Each entry is a certain match (score 1) with
 * the matched Table 2 combination recorded as an extension.
 * @param matches - The matched candidates.
 * @returns The searchset Bundle.
 */
function buildMatchBundle(matches: CmsMatch[]): Bundle<WithId<Patient>> {
  const entry: BundleEntry<WithId<Patient>>[] = matches.map(({ candidate, criteriaId }) => ({
    resource: candidate,
    search: {
      mode: 'match',
      score: 1,
      extension: [
        { url: MATCH_GRADE_EXTENSION_URL, valueCode: 'certain' },
        { url: CMS_COMBINATION_EXTENSION_URL, valueString: criteriaId },
      ],
    },
  }));
  return { resourceType: 'Bundle', type: 'searchset', total: entry.length, entry };
}

/**
 * Logs an audit record for a CMS disclosure decision (§VII): query initiator, the Table 2
 * combinations evaluated, matched record id(s), and the final determination. Ambiguous and
 * truncated outcomes are flagged as minor failures so they surface in monitoring.
 * @param ctx - The authenticated request context.
 * @param matches - The candidates that satisfied a combination.
 * @param truncated - Whether the candidate gather was capped (uniqueness unprovable).
 */
function logCmsAuditEvent(ctx: AuthenticatedRequestContext, matches: CmsMatch[], truncated: boolean): void {
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
    criteria: matches.map((m) => m.criteriaId),
    matchedIds: matches.map((m) => m.candidate.id),
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
      resource: released ? createReference(matches[0].candidate) : undefined,
    }
  );
  logAuditEvent(auditEvent);
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
