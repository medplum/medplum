// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference, SNOMED } from '@medplum/core';
import { Bundle, Composition, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION, OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE } from '../../oids';
import { FhirToCcdaConverter } from '../convert';
import { createPlanOfTreatmentServiceRequestEntry, mapPlanOfTreatmentStatus } from './servicerequest';

describe('createPlanOfTreatmentServiceRequestEntry', () => {
  let converter: FhirToCcdaConverter;
  let bundle: Bundle;
  let patient: Patient;

  beforeEach(() => {
    patient = {
      id: 'patient-1',
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    bundle = {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        { resource: patient },
        {
          resource: {
            id: 'composition-1',
            resourceType: 'Composition',
            status: 'final',
            type: { text: 'test' },
            date: new Date().toISOString(),
            author: [{ display: 'test' }],
            title: 'test',
            subject: createReference(patient),
            section: [],
          } as Composition,
        },
      ],
    };

    converter = new FhirToCcdaConverter(bundle);
  });

  test('should return procedure entry for SNOMED coded service request', () => {
    const serviceRequest: ServiceRequest = {
      id: 'servicerequest-1',
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
      code: {
        coding: [
          {
            system: SNOMED,
            code: '387713003',
            display: 'Surgical procedure',
          },
        ],
      },
      identifier: [{ system: 'http://example.org', value: 'sr-123' }],
      authoredOn: '2024-01-01T10:00:00Z',
    };

    const result = createPlanOfTreatmentServiceRequestEntry(converter, serviceRequest);

    expect(result).toBeDefined();
    expect(result.procedure).toBeDefined();
    expect(result.procedure?.length).toBe(1);

    const procedure = result.procedure?.[0];
    expect(procedure?.['@_classCode']).toBe('PROC');
    expect(procedure?.['@_moodCode']).toBe('RQO');
    expect(procedure?.templateId).toEqual([
      { '@_root': OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE },
      { '@_root': OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE, '@_extension': '2014-06-09' },
      { '@_root': OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE, '@_extension': '2022-06-01' },
    ]);
    expect(procedure?.statusCode?.['@_code']).toBe('active');
    expect(procedure?.code?.['@_code']).toBe('387713003');
    expect(procedure?.code?.['@_displayName']).toBe('Surgical procedure');
    expect(procedure?.effectiveTime?.[0]?.['@_value']).toBe('20240101100000+0000');
    expect(procedure?.id).toBeDefined();
  });

  test('should return observation entry for non-SNOMED coded service request', () => {
    const serviceRequest: ServiceRequest = {
      id: 'servicerequest-1',
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '33747-0',
            display: 'General appearance',
          },
        ],
      },
      identifier: [{ system: 'http://example.org', value: 'sr-123' }],
      occurrenceDateTime: '2024-01-01T10:00:00Z',
    };

    const result = createPlanOfTreatmentServiceRequestEntry(converter, serviceRequest);

    expect(result).toBeDefined();
    expect(result.observation).toBeDefined();
    expect(result.observation?.length).toBe(1);

    const observation = result.observation?.[0];
    expect(observation?.['@_classCode']).toBe('OBS');
    expect(observation?.['@_moodCode']).toBe('RQO');
    expect(observation?.templateId).toEqual([{ '@_root': OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION }]);
    expect(observation?.statusCode?.['@_code']).toBe('active');
    expect(observation?.code?.['@_code']).toBe('33747-0');
    expect(observation?.code?.['@_displayName']).toBe('General appearance');
    expect(observation?.effectiveTime?.[0]?.['@_value']).toBe('20240101100000+0000');
    expect(observation?.id).toBeDefined();
  });

  test('should return observation entry for service request without code', () => {
    const serviceRequest: ServiceRequest = {
      id: 'servicerequest-1',
      resourceType: 'ServiceRequest',
      status: 'completed',
      intent: 'order',
      subject: createReference(patient),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
          valueString: '#service-request-text',
        },
      ],
    };

    const result = createPlanOfTreatmentServiceRequestEntry(converter, serviceRequest);

    expect(result).toBeDefined();
    expect(result.observation).toBeDefined();
    const observation = result.observation?.[0];
    expect(observation?.code).toBeUndefined();
    expect(observation?.statusCode?.['@_code']).toBe('completed');
    expect(observation?.text?.reference?.['@_value']).toBe('#service-request-text');
  });

  test('should handle cancelled service request status', () => {
    const serviceRequest: ServiceRequest = {
      id: 'servicerequest-1',
      resourceType: 'ServiceRequest',
      status: 'entered-in-error',
      intent: 'order',
      subject: createReference(patient),
    };

    const result = createPlanOfTreatmentServiceRequestEntry(converter, serviceRequest);

    expect(result).toBeDefined();
    const observation = result.observation?.[0];
    expect(observation?.statusCode?.['@_code']).toBe('cancelled');
  });

  test('should handle service request without id or identifiers', () => {
    const serviceRequest: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
    };

    const result = createPlanOfTreatmentServiceRequestEntry(converter, serviceRequest);

    expect(result).toBeDefined();
    const observation = result.observation?.[0];
    expect(observation?.id).toBeDefined();
  });

  describe('mapPlanOfTreatmentStatus', () => {
    test('should map achieved to completed', () => {
      expect(mapPlanOfTreatmentStatus('completed')).toBe('completed');
    });

    test('should map cancelled to cancelled', () => {
      expect(mapPlanOfTreatmentStatus('entered-in-error')).toBe('cancelled');
    });

    test('should map unknown status to active', () => {
      expect(mapPlanOfTreatmentStatus('draft')).toBe('active');
      expect(mapPlanOfTreatmentStatus('unknown')).toBe('active');
      expect(mapPlanOfTreatmentStatus(undefined)).toBe('active');
    });
  });
});
