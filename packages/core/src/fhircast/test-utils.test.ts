import { FhircastEventContext } from '.';
import { OperationOutcomeError } from '../outcomes';
import { createFhircastMessageContext } from './test-utils';

describe('FHIRcast Test Utils', () => {
  describe('createFhircastMessageContext', () => {
    test('Valid inputs', () => {
      expect(createFhircastMessageContext<'patient-open'>('Patient', 'patient-123')).toEqual<
        FhircastEventContext<'patient-open'>
      >({
        key: 'patient',
        resource: {
          resourceType: 'Patient',
          id: 'patient-123',
        },
      });

      expect(createFhircastMessageContext<'imagingstudy-open'>('ImagingStudy', 'imagingstudy-456')).toEqual<
        FhircastEventContext<'imagingstudy-open'>
      >({
        key: 'study',
        resource: {
          resourceType: 'ImagingStudy',
          id: 'imagingstudy-456',
        },
      });
    });

    test('Invalid inputs', () => {
      // @ts-expect-error Invalid resource type, must be one a FHIRcast resource type
      expect(() => createFhircastMessageContext<'patient-open'>('', 'patient-123')).toThrowError(OperationOutcomeError);
      // @ts-expect-error Invalid resource type, must be one a FHIRcast resource type, eg. Patient, ImagingStudy
      expect(() => createFhircastMessageContext<'patient-open'>('Observation', 'observation-123')).toThrowError(
        OperationOutcomeError
      );
      // @ts-expect-error Resource ID needs to be a string
      expect(() => createFhircastMessageContext<'patient-open'>('Patient', 123)).toThrowError(OperationOutcomeError);
      // Resource ID needs a length
      expect(() => createFhircastMessageContext<'patient-open'>('Patient', '')).toThrowError(OperationOutcomeError);
    });
  });
});
