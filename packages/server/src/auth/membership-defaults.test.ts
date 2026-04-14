// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import { getDefaultMembershipAccessFields, projectHasDefaultPatientAccess } from './membershipDefaults';

describe('Membership default access', () => {
  test('projectHasDefaultPatientAccess is true when Project.defaultAccessPolicy supplies Patient access', () => {
    const policy = { resourceType: 'AccessPolicy' as const, id: 'new-style' };
    const project = {
      resourceType: 'Project' as const,
      defaultAccessPolicy: [{ resourceType: 'Patient' as const, access: [{ policy: createReference(policy) }] }],
    } satisfies Project;

    expect(projectHasDefaultPatientAccess(project)).toBe(true);
    const fields = getDefaultMembershipAccessFields(project, 'Patient');
    expect(fields.access).toHaveLength(1);
    expect(fields.accessPolicy).toBeUndefined();
  });

  test('Patient defaults prefer defaultAccessPolicy over legacy defaultPatientAccessPolicy', () => {
    const legacy = { resourceType: 'AccessPolicy' as const, id: 'legacy' };
    const preferred = { resourceType: 'AccessPolicy' as const, id: 'preferred' };
    const project = {
      resourceType: 'Project' as const,
      defaultPatientAccessPolicy: createReference(legacy),
      defaultAccessPolicy: [{ resourceType: 'Patient' as const, access: [{ policy: createReference(preferred) }] }],
    } satisfies Project;

    const fields = getDefaultMembershipAccessFields(project, 'Patient');
    expect(fields.access?.[0]?.policy.reference).toBe('AccessPolicy/preferred');
    expect(fields.accessPolicy).toBeUndefined();
  });

  test('legacy defaultPatientAccessPolicy is used when there is no Patient defaultAccessPolicy entry', () => {
    const policy = { resourceType: 'AccessPolicy' as const, id: 'legacy-only' };
    const project = {
      resourceType: 'Project' as const,
      defaultPatientAccessPolicy: createReference(policy),
    } satisfies Project;

    const fields = getDefaultMembershipAccessFields(project, 'Patient');
    expect(fields.accessPolicy?.reference).toBe('AccessPolicy/legacy-only');
  });

  test('details with access: undefined does not shadow defaults after stripping', () => {
    const policy = { resourceType: 'AccessPolicy' as const, id: 'new-style' };
    const project = {
      resourceType: 'Project' as const,
      defaultAccessPolicy: [{ resourceType: 'Patient' as const, access: [{ policy: createReference(policy) }] }],
    } satisfies Project;

    // Simulates what invite.ts spreads: all fields present, access/accessPolicy are undefined
    const rawDetails = { access: undefined as undefined, accessPolicy: undefined as undefined, externalId: 'some-id' };
    const clean = Object.fromEntries(Object.entries(rawDetails).filter(([, v]) => v !== undefined && v !== null));

    // After stripping, the keys are gone — defaults will not be overwritten
    expect('access' in clean).toBe(false);
    expect('accessPolicy' in clean).toBe(false);
    // Defaults resolve as expected
    const fields = getDefaultMembershipAccessFields(project, 'Patient');
    expect(fields.access).toHaveLength(1);
  });

  test('details with access: null does not shadow defaults (null treated same as undefined)', () => {
    const policy = { resourceType: 'AccessPolicy' as const, id: 'new-style' };
    const project = {
      resourceType: 'Project' as const,
      defaultAccessPolicy: [{ resourceType: 'Patient' as const, access: [{ policy: createReference(policy) }] }],
    } satisfies Project;

    // null in JSON body must not bypass defaults — callers use [] for explicit "no policy"
    const rawDetails = { access: null as null, accessPolicy: null as null, externalId: 'some-id' };
    const clean = Object.fromEntries(Object.entries(rawDetails).filter(([, v]) => v !== undefined && v !== null));

    expect('access' in clean).toBe(false);
    expect('accessPolicy' in clean).toBe(false);
    const fields = getDefaultMembershipAccessFields(project, 'Patient');
    expect(fields.access).toHaveLength(1);
  });
});
