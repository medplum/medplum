import { AccessPolicy } from '@medplum/fhirtypes';
import { applySmartScopes, parseSmartScopes } from './smart';

describe('SMART on FHIR', () => {
  test('Parse empty', () => {
    expect(parseSmartScopes(undefined)).toEqual([]);
    expect(parseSmartScopes(null as unknown as string)).toEqual([]);
    expect(parseSmartScopes('')).toEqual([]);
    expect(parseSmartScopes('openid')).toEqual([]);
    expect(parseSmartScopes('x/y.z')).toEqual([]);
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
  });

  test('Do not change access policy', () => {
    const startAccessPolicy: AccessPolicy = {
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
      applySmartScopes({ resourceType: 'AccessPolicy' }, 'patient/Observation.cruds patient/Patient.cruds')
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
    const startAccessPolicy: AccessPolicy = {
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
});
