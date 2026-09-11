// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumRequestOptions, ValueSetExpandParams } from '@medplum/core';
import type { ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { APPOINTMENT_CANCELLATION_REASON_CODE_SYSTEM, APPOINTMENT_CANCELLATION_REASON_VALUE_SET } from '../constants';

/** The FHIR R4 `appointment-cancellation-reason` CodeSystem, as a real server would expand it. */
const CANCELLATION_REASONS: readonly ValueSetExpansionContains[] = [
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

/** The value sets this stub knows how to expand, by URL. */
const EXPANSIONS: Record<string, readonly ValueSetExpansionContains[]> = {
  [APPOINTMENT_CANCELLATION_REASON_VALUE_SET]: CANCELLATION_REASONS,
};

/**
 * Expands the value sets the scheduling components are bound to.
 *
 * `MockClient` answers every `ValueSet/$expand` with the same three example codes, so a
 * story or test driving a value-set-bound field would offer "Test Display" where a server
 * offers real terminology. This answers the ones the components ask for the way a server
 * with R4 terminology loaded does, honouring `filter` and `count` as an expansion must:
 * the field searches as the user types, and only shows what it asked for.
 *
 * @param medplum - The client to patch. Other value sets are passed through.
 * @returns A function restoring the client's own `valueSetExpand`.
 */
export function installValueSetStub(medplum: MedplumClient): () => void {
  const original = medplum.valueSetExpand.bind(medplum);

  medplum.valueSetExpand = async function stubbedExpand(
    params: ValueSetExpandParams,
    options?: MedplumRequestOptions
  ): Promise<ValueSet> {
    const concepts = params.url ? EXPANSIONS[params.url] : undefined;
    if (!concepts) {
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
        contains: matches.slice(0, params.count ?? 10),
      },
    };
  } as MedplumClient['valueSetExpand'];

  return () => {
    medplum.valueSetExpand = original;
  };
}
