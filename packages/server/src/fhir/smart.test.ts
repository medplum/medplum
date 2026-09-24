// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { AccessPolicyInteraction, accessPolicySupportsInteraction } from '@medplum/core';
import type { AccessPolicy, Login, Project, ProjectMembership } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { initApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { AuthState } from '../oauth/middleware';
import { createTestProject } from '../test.setup';
import type { PopulatedAccessPolicy } from './accesspolicy';
import { applySmartScopes, parseSmartScopes } from './smart';

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

    test('Do not change access policy', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation' },
          { resourceType: 'Patient' },
          { resourceType: 'VisionPrescription' },
        ],
      };

      const authState: AuthState = {
        login: { ...login, scope: 'openid' },
        membership,
        project,
        userConfig: { resourceType: 'UserConfiguration' },
      };

      expect(applySmartScopes(startAccessPolicy, authState)).toMatchObject({
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation' },
          { resourceType: 'Patient' },
          { resourceType: 'VisionPrescription' },
        ],
      });
    });

    test('Generate access policy', () => {
      const compartment = `Patient/${randomUUID()}`;
      const authState: AuthState = {
        login: { ...login, scope: 'patient/Observation.cruds patient/Patient.cruds' },
        membership: { ...membership, profile: { reference: compartment } },
        project,
        userConfig: { resourceType: 'UserConfiguration' },
      };
      expect(
        applySmartScopes({ resourceType: 'AccessPolicy', resource: [{ resourceType: '*' }] }, authState)
      ).toMatchObject({
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation', criteria: `Observation?_compartment=${compartment}` },
          { resourceType: 'Patient', criteria: `Patient?_compartment=${compartment}` },
        ],
      });
    });

    test('Intersect access policy', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation' },
          { resourceType: 'Patient' },
          { resourceType: 'VisionPrescription' },
        ],
      };

      const compartment = `Patient/${randomUUID()}`;
      const authState: AuthState = {
        login: { ...login, scope: 'patient/Patient.cruds patient/ServiceRequest.cruds' },
        membership: { ...membership, profile: { reference: compartment } },
        project,
        userConfig: { resourceType: 'UserConfiguration' },
      };

      expect(applySmartScopes(startAccessPolicy, authState)).toMatchObject({
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Patient', criteria: `Patient?_compartment=${compartment}` }],
      });
    });

    test('Intersect with system wildcard read scope', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation' },
          { resourceType: 'Patient' },
          { resourceType: 'VisionPrescription' },
        ],
      };

      const authState: AuthState = {
        login: { ...login, scope: 'system/*.read' },
        membership,
        project,
        userConfig: { resourceType: 'UserConfiguration' },
      };

      const result = applySmartScopes(startAccessPolicy, authState);
      expect(result).toMatchObject<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Observation',
            readonly: true,
          },
          {
            resourceType: 'Patient',
            readonly: true,
          },
          {
            resourceType: 'VisionPrescription',
            readonly: true,
          },
        ],
      });
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.READ, 'Observation')).toBe(true);
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.SEARCH, 'Patient')).toBe(true);
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.UPDATE, 'VisionPrescription')).toBe(false);
    });

    test('Intersect with patient and system wildcard read scopes', () => {
      const patientId = randomUUID();
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation' },
          { resourceType: 'Patient' },
          { resourceType: 'VisionPrescription' },
        ],
      };

      const authState: AuthState = {
        login: { ...login, scope: 'patient/*.read system/*.read' },
        membership,
        project,
        userConfig: { resourceType: 'UserConfiguration' },
        smartAppLaunch: {
          resourceType: 'SmartAppLaunch',
          id: randomUUID(),
          patient: { reference: `Patient/${patientId}` },
        },
      };

      const result = applySmartScopes(startAccessPolicy, authState);
      expect(result.resource).toMatchObject([
        {
          resourceType: 'Observation',
          readonly: true,
          criteria: `Observation?_compartment=Patient/${patientId}`,
        },
        {
          resourceType: 'Observation',
          readonly: true,
        },
        {
          resourceType: 'Patient',
          readonly: true,
          criteria: `Patient?_compartment=Patient/${patientId}`,
        },
        {
          resourceType: 'Patient',
          readonly: true,
        },
        {
          resourceType: 'VisionPrescription',
          readonly: true,
          criteria: `VisionPrescription?_compartment=Patient/${patientId}`,
        },
        {
          resourceType: 'VisionPrescription',
          readonly: true,
        },
      ]);
      expect(result.resource.filter((r) => r.resourceType === 'Observation' && !r.criteria)).toHaveLength(1);
      expect(result.resource.filter((r) => r.resourceType === 'Patient' && !r.criteria)).toHaveLength(1);
      expect(result.resource.filter((r) => r.resourceType === 'VisionPrescription' && !r.criteria)).toHaveLength(1);
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.UPDATE, 'Observation')).toBe(false);
    });

    test('Intersect system wildcard read scope with explicit interactions', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Observation', interaction: ['create', 'read', 'update', 'search'] },
          { resourceType: 'Patient', interaction: ['create', 'update', 'delete'] },
        ],
      };

      const authState: AuthState = {
        login: { ...login, scope: 'system/*.read' },
        membership,
        project,
        userConfig: { resourceType: 'UserConfiguration' },
      };

      const result = applySmartScopes(startAccessPolicy, authState);
      expect(result).toMatchObject<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Observation', readonly: true, interaction: ['read', 'search'] }],
      });
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.READ, 'Observation')).toBe(true);
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.SEARCH, 'Observation')).toBe(true);
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.UPDATE, 'Observation')).toBe(false);
      expect(accessPolicySupportsInteraction(result, AccessPolicyInteraction.READ, 'Patient')).toBe(false);
    });

    test('Intersect with wildcard access policy', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'StructureDefinition', readonly: true },
          { resourceType: 'SearchParameter', readonly: true },
          { resourceType: '*' },
        ],
      };

      const compartment = `Patient/${randomUUID()}`;
      const authState: AuthState = {
        login: { ...login, scope: 'patient/Patient.rs patient/StructureDefinition.* patient/Practitioner.rus' },
        membership: { ...membership, profile: { reference: compartment } },
        project,
        userConfig: { resourceType: 'UserConfiguration' },
      };

      expect(applySmartScopes(startAccessPolicy, authState)).toMatchObject<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'StructureDefinition',
            readonly: true,
            criteria: `StructureDefinition?_compartment=${compartment}`,
          },
          { resourceType: 'Patient', readonly: true, criteria: `Patient?_compartment=${compartment}` },
          { resourceType: 'StructureDefinition', criteria: `StructureDefinition?_compartment=${compartment}` }, // Expanded from *
          { resourceType: 'Practitioner', criteria: `Practitioner?_compartment=${compartment}` },
        ],
      });
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
      const authState: AuthState = {
        login: { ...login, scope },
        membership: { ...membership, profile: { reference: compartment } },
        project,
        userConfig: { resourceType: 'UserConfiguration' },
      };

      // Every patient scope adds the Patient context compartment, even where the policy already restricts to it
      expect(applySmartScopes(startAccessPolicy, authState)).toMatchObject<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Patient', readonly: true, criteria: `Patient?_id=${id}&_compartment=${compartment}` },
          {
            resourceType: 'Practitioner',
            readonly: true,
            criteria: `Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|1234567893&_compartment=${compartment}`,
          },
          {
            resourceType: 'Goal',
            readonly: true,
            criteria: `Goal?identifier=http://example.com/patientVisible|true&_compartment=${compartment}&category=nursing&_compartment=${compartment}`,
          },
          {
            resourceType: 'Patient',
            criteria: `Patient?_compartment=${compartment}&_compartment=${compartment}`,
          },
          {
            resourceType: 'Practitioner',
            criteria: `Practitioner?_compartment=${compartment}&identifier=http://hl7.org/fhir/sid/us-npi|1234567893&_compartment=${compartment}`,
          },
          {
            resourceType: 'Goal',
            readonly: true,
            criteria: `Goal?_compartment=${compartment}&category=nursing&_compartment=${compartment}`,
          },
          {
            resourceType: 'Condition',
            criteria: `Condition?_compartment=${compartment}&category=encounter-diagnosis&_compartment=${compartment}`,
          },
          {
            resourceType: 'Condition',
            criteria: `Condition?_compartment=${compartment}&category=health-concern&_compartment=${compartment}`,
          },
        ],
      });
    });

    describe('Patient context', () => {
      const startAccessPolicy: PopulatedAccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Observation' }],
      };

      function authStateFor(scope: string, overrides?: Partial<AuthState>): AuthState {
        return {
          login: { ...login, scope },
          membership,
          project,
          userConfig: { resourceType: 'UserConfiguration' },
          ...overrides,
        };
      }

      test('Reject patient scope without context', () => {
        expect(() => applySmartScopes(startAccessPolicy, authStateFor('openid patient/Observation.rs'))).toThrow(
          'Missing patient context'
        );
      });

      test('Reject patient scope for resource type outside of access policy', () => {
        // The scope does not intersect the access policy at all, but the missing context is still an error
        expect(() => applySmartScopes(startAccessPolicy, authStateFor('openid patient/ServiceRequest.rs'))).toThrow(
          'Missing patient context'
        );
      });

      test('Reject launch context without Patient', () => {
        const authState = authStateFor('openid patient/Observation.rs', {
          smartAppLaunch: {
            resourceType: 'SmartAppLaunch',
            id: randomUUID(),
            encounter: { reference: `Encounter/${randomUUID()}` },
          },
        });
        expect(() => applySmartScopes(startAccessPolicy, authState)).toThrow('Missing patient context');
      });

      test('Reject malformed Patient reference in launch context', () => {
        const authState = authStateFor('openid patient/Observation.rs', {
          smartAppLaunch: {
            resourceType: 'SmartAppLaunch',
            id: randomUUID(),
            patient: { reference: 'Patient/' },
          },
        });
        expect(() => applySmartScopes(startAccessPolicy, authState)).toThrow('Missing patient context');
      });

      test('Reject non-Patient reference in launch context', () => {
        const authState = authStateFor('openid patient/Observation.rs', {
          smartAppLaunch: {
            resourceType: 'SmartAppLaunch',
            id: randomUUID(),
            patient: { reference: `Group/${randomUUID()}` },
          },
        });
        expect(() => applySmartScopes(startAccessPolicy, authState)).toThrow('Missing patient context');
      });

      test('Allow user and system scopes without context', () => {
        const result = applySmartScopes(startAccessPolicy, authStateFor('openid user/Observation.rs system/*.rs'));
        expect(result.resource).toMatchObject([
          { resourceType: 'Observation', readonly: true },
          { resourceType: 'Observation', readonly: true },
        ]);
        expect(result.resource.every((r) => !r.criteria)).toBe(true);
      });

      test('Fall back to Patient profile when launch context is missing Patient', () => {
        const patientId = randomUUID();
        const authState = authStateFor('openid patient/Observation.rs', {
          membership: { ...membership, profile: { reference: `Patient/${patientId}` } },
          smartAppLaunch: { resourceType: 'SmartAppLaunch', id: randomUUID() },
        });
        expect(applySmartScopes(startAccessPolicy, authState).resource).toMatchObject([
          { resourceType: 'Observation', readonly: true, criteria: `Observation?_compartment=Patient/${patientId}` },
        ]);
      });

      test('Use on-behalf-of Patient profile as context', () => {
        const patientId = randomUUID();
        const authState = authStateFor('openid patient/Observation.rs', {
          onBehalfOfMembership: { ...membership, profile: { reference: `Patient/${patientId}` } },
        });
        expect(applySmartScopes(startAccessPolicy, authState).resource).toMatchObject([
          { resourceType: 'Observation', readonly: true, criteria: `Observation?_compartment=Patient/${patientId}` },
        ]);
      });

      test('Reject non-Patient on-behalf-of profile', () => {
        const authState = authStateFor('openid patient/Observation.rs', {
          onBehalfOfMembership: { ...membership, profile: { reference: `Practitioner/${randomUUID()}` } },
        });
        expect(() => applySmartScopes(startAccessPolicy, authState)).toThrow('Missing patient context');
      });

      test('Prefer launch context over on-behalf-of profile', () => {
        const patientId = randomUUID();
        const authState = authStateFor('openid patient/Observation.rs', {
          onBehalfOfMembership: { ...membership, profile: { reference: `Patient/${randomUUID()}` } },
          smartAppLaunch: {
            resourceType: 'SmartAppLaunch',
            id: randomUUID(),
            patient: { reference: `Patient/${patientId}` },
          },
        });
        expect(applySmartScopes(startAccessPolicy, authState).resource).toMatchObject([
          { resourceType: 'Observation', readonly: true, criteria: `Observation?_compartment=Patient/${patientId}` },
        ]);
      });
    });
  });
});
