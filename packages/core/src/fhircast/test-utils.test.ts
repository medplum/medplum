import { ImagingStudy } from '@medplum/fhirtypes';
import { FhircastEventContext } from '.';
import { OperationOutcomeError } from '../outcomes';
import { createFhircastMessageContext } from './test-utils';

describe('FHIRcast Test Utils', () => {
  describe('createFhircastMessageContext', () => {
    test('Valid inputs', () => {
      expect(createFhircastMessageContext<'Patient-open'>('patient', 'Patient', 'patient-123')).toEqual<
        FhircastEventContext<'Patient-open'>
      >({
        key: 'patient',
        resource: {
          resourceType: 'Patient',
          id: 'patient-123',
        },
      });

      expect(createFhircastMessageContext<'ImagingStudy-open'>('study', 'ImagingStudy', 'imagingstudy-456')).toEqual<
        FhircastEventContext<'ImagingStudy-open'>
      >({
        key: 'study',
        resource: {
          resourceType: 'ImagingStudy',
          id: 'imagingstudy-456',
        } as ImagingStudy & { id: string },
      });
    });

    test('Invalid inputs', () => {
      // @ts-expect-error Invalid resource type, must be one a FHIRcast resource type
      expect(() => createFhircastMessageContext<'Patient-open'>('', 'patient-123')).toThrow(OperationOutcomeError);
      // @ts-expect-error Invalid resource type, must be one a FHIRcast resource type, eg. Patient, ImagingStudy
      expect(() => createFhircastMessageContext<'Patient-open'>('Observation', 'observation-123')).toThrow(
        OperationOutcomeError
      );
      // @ts-expect-error Resource ID needs to be a string
      expect(() => createFhircastMessageContext<'Patient-open'>('patient', 'Patient', 123)).toThrow(
        OperationOutcomeError
      );
      // Resource ID needs a length
      expect(() => createFhircastMessageContext<'Patient-open'>('patient', 'Patient', '')).toThrow(
        OperationOutcomeError
      );
    });
  });
});
