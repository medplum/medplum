import { Subscription } from '@medplum/fhirtypes';
import { isJobSuccessful } from './utils';
import { withTestContext } from '../test.setup';

describe('Job Success Checker', () => {
  test('Successful job with no custom codes', () => {
    const subscription: Subscription = {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'test',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
    };
    expect(isJobSuccessful(subscription, 200)).toBe(true);
  });

  test('Successful job with invalid custom codes', () => {
    const subscription: Subscription = {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'test',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
          valueString: '123, fda-fda',
        },
      ],
    };
    withTestContext(() => expect(isJobSuccessful(subscription, 200)).toBe(true));
  });

  test('Unsuccessful job with invalid custom codes', () => {
    const subscription: Subscription = {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'test',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
          valueString: '1a,asd,fda-fda',
        },
      ],
    };
    withTestContext(() => expect(isJobSuccessful(subscription, 500)).toBe(false));
  });

  test('Successful job with valid custom codes', () => {
    const subscription: Subscription = {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'test',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
          valueString: '200,300,400-505',
        },
      ],
    };
    withTestContext(() => expect(isJobSuccessful(subscription, 500)).toBe(true));
  });

  test('Unsuccessful job with valid custom codes', () => {
    const subscription: Subscription = {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'test',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
          valueString: '300,400-505',
        },
      ],
    };
    withTestContext(() => expect(isJobSuccessful(subscription, 200)).toBe(false));
  });

  test('Successful job with valid custom codes comma separated', () => {
    const subscription: Subscription = {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'test',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
          valueString: '200, 204',
        },
      ],
    };
    withTestContext(() => expect(isJobSuccessful(subscription, 200)).toBe(true));
  });
});
