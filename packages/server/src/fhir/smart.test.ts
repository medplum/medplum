// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { AccessPolicyInteraction, accessPolicySupportsInteraction, parseSearchRequest } from '@medplum/core';
import type { AccessPolicy, Login, Project, ProjectMembership } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { initApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { AuthState } from '../oauth/middleware';
import { createTestProject } from '../test.setup';
import type { PopulatedAccessPolicy } from './accesspolicy';
import { applySmartScopes, getPartialPermissionScopes, hasSmartResourceScopes, parseSmartScopes } from './smart';

describe('SMART on FHIR', () => {
  test('Parse empty', () => {
    expect(parseSmartScopes(undefined)).toStrictEqual([]);
    expect(parseSmartScopes(null as unknown as string)).toStrictEqual([]);
    expect(parseSmartScopes('')).toStrictEqual([]);
    expect(parseSmartScopes('openid')).toStrictEqual([]);
    expect(parseSmartScopes('x/y.z')).toStrictEqual([]);
    expect(parseSmartScopes('patient/Observation.chum')).toStrictEqual([]);
    expect(parseSmartScopes('patient/Observation.sdurc')).toStrictEqual([]);
    expect(parseSmartScopes('patient/Observation.c*')).toStrictEqual([]);
    expect(parseSmartScopes('patient/Observation.*c')).toStrictEqual([]);
  });

  test('Parse scopes', () => {
    // Patient-specific scopes
    // https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html#patient-specific-scopes
    expect(parseSmartScopes('patient/Observation.rs')).toMatchObject([
      { permissionType: 'patient', resourceType: 'Observation', scope: 'rs' },
    ]);
    expect(parseSmartScopes('patient/Patient.r')).toMatchObject([
      { permissionType: 'patient', resourceType: 'Patient', scope: 'r' },
    ]);
    expect(parseSmartScopes('patient/Observation.c')).toMatchObject([
      { permissionType: 'patient', resourceType: 'Observation', scope: 'c' },
    ]);
    expect(parseSmartScopes('patient/*.cruds')).toMatchObject([
      { permissionType: 'patient', resourceType: '*', scope: 'cruds' },
    ]);
    expect(parseSmartScopes('patient/*.*')).toMatchObject([
      { permissionType: 'patient', resourceType: '*', scope: 'cruds' },
    ]);

    // User-level scopes
    // https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html#user-level-scopes
    expect(parseSmartScopes('user/Observation.rs')).toMatchObject([
      { permissionType: 'user', resourceType: 'Observation', scope: 'rs' },
    ]);
    expect(parseSmartScopes('user/Appointment.cruds')).toMatchObject([
      { permissionType: 'user', resourceType: 'Appointment', scope: 'cruds' },
    ]);
    expect(parseSmartScopes('user/*.cruds')).toMatchObject([
      { permissionType: 'user', resourceType: '*', scope: 'cruds' },
    ]);
    expect(parseSmartScopes('user/Patient.rs')).toMatchObject([
      { permissionType: 'user', resourceType: 'Patient', scope: 'rs' },
    ]);

    // System-level scopes
    // https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html#system-level-scopes
    expect(parseSmartScopes('system/Observation.rs')).toMatchObject([
      { permissionType: 'system', resourceType: 'Observation', scope: 'rs' },
    ]);
    expect(parseSmartScopes('system/*.rs')).toMatchObject([
      { permissionType: 'system', resourceType: '*', scope: 'rs' },
    ]);
    expect(parseSmartScopes('system/Encounter.cud')).toMatchObject([
      { permissionType: 'system', resourceType: 'Encounter', scope: 'cud' },
    ]);

    // SMART v1 scope formats
    // https://hl7.org/fhir/smart-app-launch/scopes-and-launch-context.html#scopes-for-requesting-fhir-resources
    expect(parseSmartScopes('system/Observation.*')).toMatchObject([
      { permissionType: 'system', resourceType: 'Observation', scope: 'cruds' },
    ]);
    expect(parseSmartScopes('system/*.read')).toMatchObject([
      { permissionType: 'system', resourceType: '*', scope: 'rs' },
    ]);
    expect(parseSmartScopes('system/Encounter.write')).toMatchObject([
      { permissionType: 'system', resourceType: 'Encounter', scope: 'cud' },
    ]);
  });

  test('Parse scope search parameters', () => {
    expect(parseSmartScopes('patient/Observation.rs?code=a?b&category=c')).toStrictEqual([
      {
        permissionType: 'patient',
        resourceType: 'Observation',
        scope: 'rs',
        params: [
          ['code', 'a?b'],
          ['category', 'c'],
        ],
      },
    ]);
    expect(parseSmartScopes('patient/Observation.rs?')[0].params).toBeUndefined();
  });

  test.each<[string, string[]]>([
    ['openid offline_access', []],
    ['patient/Observation.rs patient/Patient.read', []],
    ['patient/Observation.read patient/Observation.write', []],
    ['patient/Observation.r patient/Observation.s', []],
    ['user/*.*', []],
    ['patient/Observation.r', ['patient/Observation.r']],
    ['patient/Observation.s', ['patient/Observation.s']],
    ['user/Patient.c openid', ['user/Patient.c']],
    ['patient/Observation.write', ['patient/Observation.cud']],
    ['patient/Observation.c patient/Observation.rs', ['patient/Observation.crs']],
    ['user/*.* user/Patient.c', []],
    ['user/*.c user/Patient.rs', ['user/*.c', 'user/Patient.crs']],
  ])('Partial permission scopes for %s', (scope, expected) => {
    expect(getPartialPermissionScopes(scope)).toStrictEqual(expected);
  });

  describe('applySmartScopes()', () => {
    let project: WithId<Project>;
    let login: WithId<Login>;
    let membership: WithId<ProjectMembership>;

    const app = express();

    beforeAll(async () => {
      const config = await loadTestConfig();
      await initApp(app, config);
      ({ project, login, membership } = await createTestProject({ withAccessToken: true, withClient: true }));
    });

    function authStateFor(scope: string, overrides?: Partial<AuthState>): AuthState {
      return {
        login: { ...login, scope },
        membership,
        project,
        userConfig: { resourceType: 'UserConfiguration' },
        ...overrides,
      };
    }

    const clinicalPolicy: PopulatedAccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Observation' }, { resourceType: 'Patient' }, { resourceType: 'VisionPrescription' }],
    };

    test('Do not change access policy', () => {
      expect(applySmartScopes(clinicalPolicy, authStateFor('openid'))).toMatchObject(clinicalPolicy);
    });

    test('Project admin resource types are only covered by scopes that name them', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: '*' },
          { resourceType: 'ProjectMembership', criteria: 'ProjectMembership?_project=' + project.id },
        ],
      };
      const applyScope = (scope: string): PopulatedAccessPolicy['resource'] =>
        applySmartScopes(startAccessPolicy, authStateFor(scope)).resource;

      expect(applyScope('user/*.rs').map((r) => r.resourceType)).toStrictEqual(['*']);
      expect(applyScope('user/ProjectMembership.rs')).toMatchObject([
        { resourceType: 'ProjectMembership', criteria: 'ProjectMembership?_project=' + project.id },
      ]);
    });

    test('Apply patient scopes to access policy', () => {
      const compartment = `Patient/${randomUUID()}`;
      const encoded = encodeURIComponent(compartment);
      const patientState = (scope: string): AuthState =>
        authStateFor(scope, { membership: { ...membership, profile: { reference: compartment } } });

      // Generated from a wildcard entry
      expect(
        applySmartScopes(
          { resourceType: 'AccessPolicy', resource: [{ resourceType: '*' }] },
          patientState('patient/Observation.cruds patient/Patient.cruds')
        )
      ).toMatchObject({
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation', criteria: `Observation?_compartment=${encoded}` },
          { resourceType: 'Patient', criteria: `Patient?_compartment=${encoded}` },
        ],
      });

      // Intersected with explicit entries; resource types outside the policy are dropped
      expect(
        applySmartScopes(clinicalPolicy, patientState('patient/Patient.cruds patient/ServiceRequest.cruds'))
      ).toMatchObject({
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Patient', criteria: `Patient?_compartment=${encoded}` }],
      });

      // Intersected with a policy that mixes explicit entries and a wildcard
      const wildcardPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'StructureDefinition', readonly: true },
          { resourceType: 'SearchParameter', readonly: true },
          { resourceType: '*' },
        ],
      };
      expect(
        applySmartScopes(
          wildcardPolicy,
          patientState('patient/Patient.rs patient/StructureDefinition.* patient/Practitioner.rus')
        )
      ).toMatchObject<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'StructureDefinition',
            readonly: true,
            criteria: `StructureDefinition?_compartment=${encoded}`,
          },
          { resourceType: 'Patient', readonly: true, criteria: `Patient?_compartment=${encoded}` },
          {
            resourceType: 'StructureDefinition',
            criteria: `StructureDefinition?_compartment=${encoded}`,
          }, // Expanded from *
          { resourceType: 'Practitioner', criteria: `Practitioner?_compartment=${encoded}` },
        ],
      });
    });

    test('Intersect with wildcard read scopes', () => {
      const system = applySmartScopes(clinicalPolicy, authStateFor('system/*.read'));
      expect(system).toMatchObject<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation', readonly: true },
          { resourceType: 'Patient', readonly: true },
          { resourceType: 'VisionPrescription', readonly: true },
        ],
      });
      expect(accessPolicySupportsInteraction(system, AccessPolicyInteraction.READ, 'Observation')).toBe(true);
      expect(accessPolicySupportsInteraction(system, AccessPolicyInteraction.SEARCH, 'Patient')).toBe(true);
      expect(accessPolicySupportsInteraction(system, AccessPolicyInteraction.UPDATE, 'VisionPrescription')).toBe(false);

      // Adding a patient scope keeps the unrestricted system entries alongside the compartment-restricted ones
      const patientId = randomUUID();
      const both = applySmartScopes(
        clinicalPolicy,
        authStateFor('patient/*.read system/*.read', {
          smartAppLaunch: {
            resourceType: 'SmartAppLaunch',
            id: randomUUID(),
            patient: { reference: `Patient/${patientId}` },
          },
        })
      );
      expect(both.resource).toMatchObject([
        { resourceType: 'Observation', readonly: true, criteria: `Observation?_compartment=Patient%2F${patientId}` },
        { resourceType: 'Observation', readonly: true },
        { resourceType: 'Patient', readonly: true, criteria: `Patient?_compartment=Patient%2F${patientId}` },
        { resourceType: 'Patient', readonly: true },
        {
          resourceType: 'VisionPrescription',
          readonly: true,
          criteria: `VisionPrescription?_compartment=Patient%2F${patientId}`,
        },
        { resourceType: 'VisionPrescription', readonly: true },
      ]);
      expect(both.resource.filter((r) => !r.criteria)).toHaveLength(3);
      expect(accessPolicySupportsInteraction(both, AccessPolicyInteraction.UPDATE, 'Observation')).toBe(false);
    });

    test('Intersect system wildcard read scope with explicit interactions', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation', interaction: ['create', 'read', 'update', 'search'] },
          { resourceType: 'Patient', interaction: ['create', 'update', 'delete'] },
        ],
      };

      const result = applySmartScopes(startAccessPolicy, authStateFor('system/*.read'));
      expect(result).toMatchObject<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Observation', readonly: true, interaction: ['read', 'search'] }],
      });
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.READ, 'Observation')).toBe(true);
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.SEARCH, 'Observation')).toBe(true);
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.UPDATE, 'Observation')).toBe(false);
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.READ, 'Patient')).toBe(false);
    });

    test('Scope with no permissions grants no access', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Patient' }, { resourceType: '*' }],
      };

      const result = applySmartScopes(startAccessPolicy, authStateFor('user/Patient. user/*.'));
      expect(result.resource).toStrictEqual([]);
    });

    test('Intersect with granular scopes and criteria', () => {
      const id = randomUUID();
      const compartment = `Patient/${id}`;
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Patient', readonly: true, criteria: 'Patient?_id=' + id },
          { resourceType: 'Practitioner', readonly: true },
          {
            resourceType: 'Goal',
            criteria: 'Goal?identifier=http://example.com/patientVisible|true&_compartment=' + compartment,
          },
          { resourceType: '*', criteria: '*?_compartment=' + compartment },
        ],
      };

      const scope = [
        'patient/Patient.*',
        'patient/Practitioner.rus?identifier=http://hl7.org/fhir/sid/us-npi|1234567893',
        'patient/Goal.rs?category=nursing',
        'patient/Condition.rus?category=encounter-diagnosis',
        'patient/Condition.rus?category=health-concern',
      ].join(' ');
      const authState = authStateFor(scope, { membership: { ...membership, profile: { reference: compartment } } });

      // Every patient scope adds the Patient context compartment, even where the policy already restricts to it
      const npi = 'identifier=http%3A%2F%2Fhl7.org%2Ffhir%2Fsid%2Fus-npi%7C1234567893';
      const inCompartment = `_compartment=Patient%2F${id}`;
      expect(applySmartScopes(startAccessPolicy, authState)).toMatchObject<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Patient', readonly: true, criteria: `Patient?_id=${id}&${inCompartment}` },
          { resourceType: 'Practitioner', readonly: true, criteria: `Practitioner?${npi}&${inCompartment}` },
          {
            resourceType: 'Goal',
            readonly: true,
            criteria: `Goal?identifier=http%3A%2F%2Fexample.com%2FpatientVisible%7Ctrue&${inCompartment}&category=nursing&${inCompartment}`,
          },
          { resourceType: 'Patient', criteria: `Patient?${inCompartment}&${inCompartment}` },
          { resourceType: 'Practitioner', criteria: `Practitioner?${inCompartment}&${npi}&${inCompartment}` },
          {
            resourceType: 'Goal',
            readonly: true,
            criteria: `Goal?${inCompartment}&category=nursing&${inCompartment}`,
          },
          {
            resourceType: 'Condition',
            criteria: `Condition?${inCompartment}&category=encounter-diagnosis&${inCompartment}`,
          },
          {
            resourceType: 'Condition',
            criteria: `Condition?${inCompartment}&category=health-concern&${inCompartment}`,
          },
        ],
      });
    });

    test('Extra ? in scope or access policy criteria is handled as by search', () => {
      const compartment = `Patient/${randomUUID()}`;
      const encoded = encodeURIComponent(compartment);
      const membershipWithProfile = { ...membership, profile: { reference: compartment } };

      // In the scope: everything after the first ? belongs to the search string
      const scoped = applySmartScopes(
        { resourceType: 'AccessPolicy', resource: [{ resourceType: 'Observation' }] },
        authStateFor('patient/Observation.rs?code=x?y=z', { membership: membershipWithProfile })
      );
      const scopedCriteria = scoped.resource[0].criteria as string;
      expect(scopedCriteria).toStrictEqual(`Observation?code=x%3Fy%3Dz&_compartment=${encoded}`);
      expect(parseSearchRequest(scopedCriteria).filters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: '_compartment', value: compartment }),
          expect.objectContaining({ code: 'code', value: 'x?y=z' }),
        ])
      );

      // In the access policy: anything after a second ? is ignored
      const policed = applySmartScopes(
        {
          resourceType: 'AccessPolicy',
          resource: [{ resourceType: 'Observation', criteria: 'Observation?category=a?b=c' }],
        },
        authStateFor('patient/Observation.rs', { membership: membershipWithProfile })
      );
      expect(policed.resource[0].criteria).toStrictEqual(`Observation?category=a&_compartment=${encoded}`);
    });

    test('Normalize access policy entries with compartment or mismatched criteria', () => {
      const org = `Organization/${randomUUID()}`;
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          // Criteria for another resource type are rejected, so the entry is removed
          { resourceType: 'Observation', criteria: 'Patient?name=x' },
          // The deprecated compartment is converted to a criteria filter
          { resourceType: 'Observation', compartment: { reference: org } },
          // Unless it is not a single literal reference, which search would parse as `org` OR the other Organization
          { resourceType: 'Observation', compartment: { reference: `${org},Organization/${randomUUID()}` } },
        ],
      };

      const result = applySmartScopes(startAccessPolicy, authStateFor('user/Observation.rs?category=laboratory'));
      expect(result.resource).toMatchObject([
        {
          resourceType: 'Observation',
          readonly: true,
          criteria: `Observation?_compartment=${encodeURIComponent(org)}&category=laboratory`,
        },
      ]);
      expect(result.resource).toHaveLength(1);
      expect(result.resource[0].compartment).toBeUndefined();
    });

    describe('Patient context', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Observation' }],
      };

      test.each<[string, string, () => Partial<AuthState>]>([
        ['no context', 'openid patient/Observation.rs', () => ({})],
        // The scope does not intersect the access policy at all, but the missing context is still an error
        ['resource type outside of access policy', 'openid patient/ServiceRequest.rs', () => ({})],
        [
          'launch context without Patient',
          'openid patient/Observation.rs',
          () => ({
            smartAppLaunch: {
              resourceType: 'SmartAppLaunch',
              id: randomUUID(),
              encounter: { reference: `Encounter/${randomUUID()}` },
            },
          }),
        ],
        [
          'malformed Patient reference in launch context',
          'openid patient/Observation.rs',
          () => ({
            smartAppLaunch: { resourceType: 'SmartAppLaunch', id: randomUUID(), patient: { reference: 'Patient/' } },
          }),
        ],
        [
          'non-Patient reference in launch context',
          'openid patient/Observation.rs',
          () => ({
            smartAppLaunch: {
              resourceType: 'SmartAppLaunch',
              id: randomUUID(),
              patient: { reference: `Group/${randomUUID()}` },
            },
          }),
        ],
        [
          'multiple Patients in launch context',
          'openid patient/Observation.rs',
          () => ({
            smartAppLaunch: {
              resourceType: 'SmartAppLaunch',
              id: randomUUID(),
              patient: { reference: `Patient/${randomUUID()},Patient/${randomUUID()}` },
            },
          }),
        ],
        [
          'multiple Patients in profile',
          'openid patient/Observation.rs',
          () => ({
            membership: { ...membership, profile: { reference: `Patient/${randomUUID()},Patient/${randomUUID()}` } },
          }),
        ],
        [
          'non-Patient on-behalf-of profile',
          'openid patient/Observation.rs',
          () => ({ onBehalfOfMembership: { ...membership, profile: { reference: `Practitioner/${randomUUID()}` } } }),
        ],
      ])('Reject patient scope with %s', (_name, scope, overrides) => {
        expect(() => applySmartScopes(startAccessPolicy, authStateFor(scope, overrides()))).toThrow(
          'Missing patient context'
        );
      });

      test('Allow user and system scopes without context', () => {
        const result = applySmartScopes(startAccessPolicy, authStateFor('openid user/Observation.rs system/*.rs'));
        expect(result.resource).toMatchObject([
          { resourceType: 'Observation', readonly: true },
          { resourceType: 'Observation', readonly: true },
        ]);
        expect(result.resource.every((r) => !r.criteria)).toBe(true);
      });

      test('Resolve Patient context from launch context, then profiles', () => {
        const resolveCompartment = (overrides: Partial<AuthState>): PopulatedAccessPolicy['resource'] =>
          applySmartScopes(startAccessPolicy, authStateFor('openid patient/Observation.rs', overrides)).resource;
        const expected = (patientId: string): object[] => [
          {
            resourceType: 'Observation',
            readonly: true,
            criteria: `Observation?_compartment=Patient%2F${patientId}`,
          },
        ];

        // Membership profile when the launch context has no Patient
        const profileId = randomUUID();
        expect(
          resolveCompartment({
            membership: { ...membership, profile: { reference: `Patient/${profileId}` } },
            smartAppLaunch: { resourceType: 'SmartAppLaunch', id: randomUUID() },
          })
        ).toMatchObject(expected(profileId));

        // On-behalf-of profile
        const onBehalfOfId = randomUUID();
        expect(
          resolveCompartment({
            onBehalfOfMembership: { ...membership, profile: { reference: `Patient/${onBehalfOfId}` } },
          })
        ).toMatchObject(expected(onBehalfOfId));

        // Launch context wins over on-behalf-of profile
        const launchId = randomUUID();
        expect(
          resolveCompartment({
            onBehalfOfMembership: { ...membership, profile: { reference: `Patient/${randomUUID()}` } },
            smartAppLaunch: {
              resourceType: 'SmartAppLaunch',
              id: randomUUID(),
              patient: { reference: `Patient/${launchId}` },
            },
          })
        ).toMatchObject(expected(launchId));
      });
    });
  });
});

describe('hasSmartResourceScopes', () => {
  test.each([
    [undefined, false],
    ['openid', false],
    ['openid profile email fhirUser launch/patient offline_access', false],
    ['openid user/Observation.rs', true],
    ['openid patient/*.rs', true],
    ['openid user/*.*', true],
  ])('%s', (scope, expected) => {
    expect(hasSmartResourceScopes({ scope })).toBe(expected);
  });
});
