// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumRequestOptions, ValueSetExpandParams } from '@medplum/core';
import { notFound, OperationOutcomeError } from '@medplum/core';
import type { Coding, ValueSet } from '@medplum/fhirtypes';
import { APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM, APPOINTMENT_CANCELLATION_REASON_VALUE_SET } from '../constants';

/** The FHIR R4 `appointment-cancellation-reason` CodeSystem, as a real server would expand it. */
const CANCELLATION_REASONS: readonly Coding[] = [
  { code: 'pat', display: 'Patient' },
  { code: 'pat-crs', display: 'Patient: Canceled via automated reminder system' },
  { code: 'pat-cpp', display: 'Patient: Canceled via Patient Portal' },
  { code: 'pat-dec', display: 'Patient: Deceased' },
  { code: 'pat-fb', display: 'Patient: Feeling Better' },
  { code: 'pat-lt', display: 'Patient: Lack of Transportation' },
  { code: 'pat-mt', display: 'Patient: Member Terminated' },
  { code: 'pat-mv', display: 'Patient: Moved' },
  { code: 'pat-preg', display: 'Patient: Pregnant' },
  { code: 'pat-swl', display: 'Patient: Scheduled from Wait List' },
  { code: 'pat-ucp', display: 'Patient: Unhappy/Changed Provider' },
  { code: 'prov', display: 'Provider' },
  { code: 'prov-pers', display: 'Provider: Personal' },
  { code: 'prov-dch', display: 'Provider: Discharged' },
  { code: 'prov-edu', display: 'Provider: Edu/Meeting' },
  { code: 'prov-hosp', display: 'Provider: Hospitalized' },
  { code: 'prov-labs', display: 'Provider: Labs Out of Acceptable Range' },
  { code: 'prov-mri', display: 'Provider: MRI Screening Form Marked Do Not Proceed' },
  { code: 'prov-onc', display: 'Provider: Oncology Treatment Plan Changes' },
  { code: 'maint', display: 'Equipment Maintenance/Repair' },
  { code: 'meds-inc', display: 'Prep/Med Incomplete' },
  { code: 'other', display: 'Other' },
  { code: 'oth-cms', display: 'Other: CMS Therapy Cap Service Not Authorized' },
  { code: 'oth-err', display: 'Other: Error' },
  { code: 'oth-fin', display: 'Other: Financial' },
  { code: 'oth-iv', display: 'Other: Improper IV Access/Infiltrate IV' },
  { code: 'oth-int', display: 'Other: No Interpreter Available' },
  { code: 'oth-mu', display: 'Other: Prep/Med/Results Unavailable' },
  { code: 'oth-room', display: 'Other: Room/Resource Maintenance' },
  { code: 'oth-oerr', display: 'Other: Schedule Order Error' },
  { code: 'oth-swie', display: 'Other: Silent Walk In Error' },
  { code: 'oth-weath', display: 'Other: Weather' },
].map((concept) => ({ ...concept, system: APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM }));

/** What the stub knows when the caller names nothing: the cancellation reasons, and no more. */
const DEFAULT_EXPANSIONS: Record<string, readonly Coding[]> = {
  [APPOINTMENT_CANCELLATION_REASON_VALUE_SET]: CANCELLATION_REASONS,
};

/**
 * Answers `ValueSet/$expand` from a fixed set of value sets.
 *
 * `MockClient` answers every expansion with the same three placeholder concepts, which is enough to
 * prove a field is wired up and not enough to prove anything about what it captured. This serves
 * real-looking codes per url, honouring `filter` and `count` as an expansion must, so a field
 * searches as the user types and shows only what it asked for.
 *
 * @param medplum - The client to patch.
 * @param valueSets - Concepts to offer, keyed by the value set's canonical url. Given a map, this
 * is the whole of what the client knows: an unknown url draws the 404 a server gives for a value
 * set nobody imported, which is the verdict that takes a bound field out of use. Omitted, the
 * cancellation reasons are served and every other url is left to the client's own expansion.
 * @returns A function restoring the client's own `valueSetExpand`.
 */
export function installValueSetStub(medplum: MedplumClient, valueSets?: Record<string, Coding[]>): () => void {
  const original = medplum.valueSetExpand.bind(medplum);
  const expansions: Record<string, readonly Coding[]> = valueSets ?? DEFAULT_EXPANSIONS;
  // Naming the value sets is a claim about what exists; omitting them is only a convenience.
  const unknownUrlIsMissing = valueSets !== undefined;

  medplum.valueSetExpand = async function stubbedExpand(
    params: ValueSetExpandParams,
    options?: MedplumRequestOptions
  ): Promise<ValueSet> {
    const concepts = params.url === undefined ? undefined : expansions[params.url];
    if (!concepts) {
      if (unknownUrlIsMissing) {
        // What the availability probe reads as "nobody imported this", and the only verdict that
        // takes a field out of use. A transient failure deliberately does not.
        throw new OperationOutcomeError(notFound);
      }
      return original(params, options);
    }

    const filter = (params.filter ?? '').toLowerCase();
    const matches = concepts.filter(
      (concept) =>
        !filter ||
        (concept.display ?? '').toLowerCase().includes(filter) ||
        (concept.code ?? '').toLowerCase().includes(filter)
    );

    return {
      resourceType: 'ValueSet',
      status: 'active',
      url: params.url,
      expansion: {
        // Fixed rather than "now": a story pinned to a mocked clock has no business
        // reading the wall clock, and nothing here depends on the value.
        timestamp: '2020-05-04T00:00:00.000Z',
        contains: matches.slice(0, params.count ?? matches.length),
      },
    };
  } as MedplumClient['valueSetExpand'];

  return () => {
    medplum.valueSetExpand = original;
  };
}
