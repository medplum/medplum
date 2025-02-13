import { FhircastEventContext } from '.';
import { OperationOutcomeError } from '../outcomes';
import { createFhircastMessageContext } from './test-utils';

describe('FHIRcast Test Utils', () => {
  describe('createFhircastMessageContext', () => {
    test('Valid inputs', () => {
      expect(
        createFhircastMessageContext('Patient-open', 'patient', {
          id: '123',
          resourceType: 'Patient',
        })
      ).toEqual<FhircastEventContext<'Patient-open'>>({
        key: 'patient',
        resource: {
          id: '123',
          resourceType: 'Patient',
        },
      });

      expect(
        createFhircastMessageContext('ImagingStudy-open', 'study', {
          id: '456',
          resourceType: 'ImagingStudy',
          status: 'available',
          subject: { reference: 'Patient/123' },
        })
      ).toEqual<FhircastEventContext<'ImagingStudy-open'>>({
        key: 'study',
        resource: {
          id: '456',
          resourceType: 'ImagingStudy',
          status: 'available',
          subject: { reference: 'Patient/123' },
        },
      });
    });

    test('Invalid inputs', () => {
      // @ts-expect-error Invalid event name, must have a length
      expect(() => createFhircastMessageContext('', '')).toThrow(OperationOutcomeError);
      // @ts-expect-error Invalid key, must be a valid key for this event
      expect(() => createFhircastMessageContext('DiagnosticReport-open', '')).toThrow(OperationOutcomeError);
      // @ts-expect-error Resource needs to be a valid resource
      expect(() => createFhircastMessageContext('DiagnosticReport-open', 'patient', 'patient-123')).toThrow(
        OperationOutcomeError
      );
      // Resource needs an ID
      expect(() =>
        createFhircastMessageContext('DiagnosticReport-open', 'patient', { resourceType: 'Patient' })
      ).toThrow(OperationOutcomeError);
    });
  });
});
