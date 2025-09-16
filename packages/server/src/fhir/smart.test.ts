// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicy } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { PopulatedAccessPolicy } from './accesspolicy';
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

  test('Do not change access policy', () => {
    const startAccessPolicy: PopulatedAccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Observation',
        },
        {
          resourceType: 'Patient',
        },
        {
          resourceType: 'VisionPrescription',
        },
      ],
    };

    const scope = 'openid';

    expect(applySmartScopes(startAccessPolicy, scope)).toMatchObject({
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Observation',
        },
        {
          resourceType: 'Patient',
        },
        {
          resourceType: 'VisionPrescription',
        },
      ],
    });
  });

  test('Generate access policy', () => {
    expect(
      applySmartScopes(
        { resourceType: 'AccessPolicy', resource: [{ resourceType: '*' }] },
        'patient/Observation.cruds patient/Patient.cruds'
      )
    ).toMatchObject({
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Observation',
        },
        {
          resourceType: 'Patient',
        },
      ],
    });
  });

  test('Intersect access policy', () => {
    const startAccessPolicy: PopulatedAccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Observation',
        },
        {
          resourceType: 'Patient',
        },
        {
          resourceType: 'VisionPrescription',
        },
      ],
    };

    const scope = 'patient/Patient.cruds patient/ServiceRequest.cruds';

    expect(applySmartScopes(startAccessPolicy, scope)).toMatchObject({
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Patient',
        },
      ],
    });
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

    const scope = 'patient/Patient.rs patient/StructureDefinition.* patient/Practitioner.rus';

    expect(applySmartScopes(startAccessPolicy, scope)).toMatchObject<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [
        { resourceType: 'StructureDefinition', readonly: true },
        { resourceType: 'Patient', readonly: true },
        { resourceType: 'StructureDefinition' }, // Expanded from *
        { resourceType: 'Practitioner' },
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

    const scope =
      'patient/Patient.* patient/Practitioner.rus?identifier=http://hl7.org/fhir/sid/us-npi|1234567893 patient/Goal.rs?category=nursing patient/Condition.rus?category=encounter-diagnosis patient/Condition.rus?category=health-concern';

    expect(applySmartScopes(startAccessPolicy, scope)).toMatchObject<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [
        { resourceType: 'Patient', readonly: true, criteria: 'Patient?_id=' + id },
        {
          resourceType: 'Practitioner',
          readonly: true,
          criteria: 'Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|1234567893',
        },
        {
          resourceType: 'Goal',
          readonly: true,
          criteria: `Goal?identifier=http://example.com/patientVisible|true&_compartment=${compartment}&category=nursing`,
        },
        {
          resourceType: 'Patient',
          criteria: `Patient?_compartment=${compartment}`,
        },
        {
          resourceType: 'Practitioner',
          criteria: `Practitioner?_compartment=${compartment}&identifier=http://hl7.org/fhir/sid/us-npi|1234567893`,
        },
        {
          resourceType: 'Goal',
          readonly: true,
          criteria: `Goal?_compartment=${compartment}&category=nursing`,
        },
        {
          resourceType: 'Condition',
          criteria: `Condition?_compartment=${compartment}&category=encounter-diagnosis`,
        },
        {
          resourceType: 'Condition',
          criteria: `Condition?_compartment=${compartment}&category=health-concern`,
        },
      ],
    });
  });
});
