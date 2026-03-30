// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Bundle, BundleEntry, CareTeam, Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const input = event.input as Record<string, string>;
  const role = input?.['role'];
  const memberName = input?.['member-name'];
  const roleSystem = input?.['role-system'];
  const status = input?.['status'] || 'active';

  if (!role || !memberName) {
    throw new OperationOutcomeError({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'required',
          diagnostics: `Missing required parameter(s): ${[!role && 'role', !memberName && 'member-name'].filter(Boolean).join(', ')}`,
        },
      ],
    });
  }

  console.log(
    `Searching for CareTeams where a participant named "${memberName}" has role "${role}"${roleSystem ? ` (system: ${roleSystem})` : ''}, status=${status}`
  );

  const practitioners = await medplum.searchResources('Practitioner', {
    'name:contains': memberName,
    _count: '100',
  });

  console.log(`Found ${practitioners.length} practitioner(s) matching "${memberName}"`);

  if (practitioners.length === 0) {
    return emptySearchsetBundle();
  }

  const practitionerRefs = practitioners.map((p) => `Practitioner/${p.id}`);

  const careTeams = await medplum.searchResources('CareTeam', {
    participant: practitionerRefs.join(','),
    status,
    _count: '1000',
  });

  console.log(`Found ${careTeams.length} candidate CareTeam(s) from server-side search`);

  const roleLower = role.toLowerCase();
  const practitionerRefSet = new Set(practitionerRefs);

  const filtered = careTeams.filter((ct) =>
    ct.participant?.some(
      (p) =>
        p.member?.reference &&
        practitionerRefSet.has(p.member.reference) &&
        p.role?.some((r) =>
          r.coding?.some((c) => c.code?.toLowerCase() === roleLower && (!roleSystem || c.system === roleSystem))
        )
    )
  );

  console.log(`${filtered.length} CareTeam(s) passed composite filter (same participant has both member and role)`);

  const patientIds = [
    ...new Set(
      filtered
        .map((ct) => ct.subject?.reference)
        .filter((ref): ref is string => !!ref && ref.startsWith('Patient/'))
        .map((ref) => ref.replace('Patient/', ''))
    ),
  ];

  if (patientIds.length === 0) {
    return emptySearchsetBundle();
  }

  const patients = await medplum.searchResources('Patient', {
    _id: patientIds.join(','),
    _count: '1000',
  });

  console.log(`Returning ${patients.length} patient(s) with ${filtered.length} included CareTeam(s)`);

  const entries: BundleEntry[] = [
    ...patients.map(
      (p): BundleEntry => ({
        resource: p as Patient,
        search: { mode: 'match' },
      })
    ),
    ...filtered.map(
      (ct): BundleEntry => ({
        resource: ct as CareTeam,
        search: { mode: 'include' },
      })
    ),
  ];

  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: patients.length,
    entry: entries,
  };
}

function emptySearchsetBundle(): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: 0,
    entry: [],
  };
}
