import { createReference } from '@medplum/core';
import { Account, Patient, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { HEALTH_GORILLA_SYSTEM } from './constants';
import { HealthGorillaRequestGroupBuilder } from './requestgroupbuilder';
import { HealthGorillaConfig } from './utils';

describe('Health Gorilla RequestGroup builder', () => {
  test('Happy path', async () => {
    const medplum = new MockClient();

    const medplumPatient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      identifier: [
        // { system: HEALTH_GORILLA_SYSTEM, value: '123' },
        { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] }, value: '123' },
      ],
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '2000-01-01',
      gender: 'female',
      address: [{ line: ['123 Main St'], city: 'Anytown', state: 'CA', postalCode: '12345' }],
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    });

    // const medplumPractitioner = DrAliceSmith;
    const medplumPractitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      identifier: [
        { system: HEALTH_GORILLA_SYSTEM, value: '123' },
        // { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] }, value: '123' },
      ],
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '2000-01-01',
      gender: 'female',
      address: [{ line: ['123 Main St'], city: 'Anytown', state: 'CA', postalCode: '12345' }],
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    });

    const medplumAccount = { resourceType: 'Account' } satisfies Account;
    const healthGorilla = new MockClient();

    const config: HealthGorillaConfig = {
      baseUrl: 'https://example.com',
      audienceUrl: 'https://example.com',
      clientId: '123',
      clientSecret: '123',
      clientUri: 'https://example.com',
      userLogin: '123',
      tenantId: '123',
      subtenantId: '123',
      subtenantAccountNumber: '123',
      scopes: '123',
      callbackBotId: '123',
      callbackClientId: '123',
      callbackClientSecret: '123',
    };

    // Do everything twice to verify that the builder is reusable
    for (let i = 0; i < 2; i++) {
      const builder = new HealthGorillaRequestGroupBuilder();

      // Synchronize the patient
      await builder.syncPatient(medplum, healthGorilla, medplumPatient);

      // Get the practitioner
      await builder.getPractitioner(healthGorilla, medplumPractitioner);

      // Setup the Account, Coverage, and Subscriber
      await builder.setupAccount(medplum, medplumPatient, medplumAccount);

      // Get the tenant organization
      // This is a special organization that is not available in the Health Gorilla API
      builder.authorizedBy = {
        resourceType: 'Organization',
        id: config.tenantId,
        identifier: [
          {
            system: HEALTH_GORILLA_SYSTEM,
            value: config.tenantId,
          },
        ],
      };

      // Get the subtenant organization
      // This is a special organization that is not available in the Health Gorilla API
      builder.practitionerOrganization = {
        resourceType: 'Organization',
        id: config.subtenantId,
        identifier: [
          {
            system: HEALTH_GORILLA_SYSTEM,
            value: config.subtenantId,
          },
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                  code: 'AN',
                  display: 'Account number',
                },
              ],
              text: 'Account_number',
            },
            value: config.subtenantAccountNumber,
          },
        ],
        partOf: createReference(builder.authorizedBy),
      };

      // Get the performing organization
      // This is a special organization that is not available in the Health Gorilla API
      builder.performer = {
        resourceType: 'Organization',
        // id: availableLabs[performer],
      };

      // Create the service requests
      // Parse the test answers and create the service requests.
      // If the test is selected, create a service request with the given priority and note.
      // This is another area where you can customize the experience for your users.
      // In our example questionnaire, we use checkboxes for commonly available tests.
      // You could also use a dropdown or a free text field.
      // The important thing is that you pass the correct code to Health Gorilla.
      // for (const testId of Object.keys(availableTests)) {
      //   if (answers[testId]?.valueBoolean) {
      //     builder.createServiceRequest(testId, answers);
      //   }
      // }
      builder.createServiceRequest('TST', {});

      // Create the diagnoses
      // // Parse the diagnosis answers and create the diagnoses.
      // for (const diagnosisId of Object.keys(availableDiagnoses)) {
      //   if (answers[diagnosisId]?.valueBoolean) {
      //     const code = diagnosisId.substring(diagnosisId.indexOf('-') + 1);
      //     const display = availableDiagnoses[diagnosisId];
      //     builder.addDiagnosis(code, display);
      //   }
      // }
      builder.addDiagnosis('R73.9', 'Hyperglycemia, unspecified');

      // Specimen collected date/time
      // This is an optional field.  If present, it will create a Specimen resource.
      // builder.specimenCollectedDateTime = answers.specimenCollectedDateTime?.valueDateTime;
      builder.specimenCollectedDateTime = '2021-01-01T00:00:00.000Z';

      // Order level notes
      // builder.note = answers.orderNote?.valueString;
      builder.note = 'Test note';

      // Create the order
      const requestGroup = builder.buildRequestGroup();
      expect(requestGroup).toMatchObject({
        resourceType: 'RequestGroup',
      });
    }
  });

  test('Missing values', async () => {
    const b = new HealthGorillaRequestGroupBuilder();
    expect(() => b.buildRequestGroup()).toThrow('Missing account');
    b.account = { resourceType: 'Account' };
    expect(() => b.buildRequestGroup()).toThrow('Missing authorizedBy');
    b.authorizedBy = { resourceType: 'Organization' };
    expect(() => b.buildRequestGroup()).toThrow('Missing patient');
    b.patient = { resourceType: 'Patient' };
    expect(() => b.buildRequestGroup()).toThrow('Missing performer');
    b.performer = { resourceType: 'Organization' };
    expect(() => b.buildRequestGroup()).toThrow('Missing practitioner');
    b.practitioner = { resourceType: 'Practitioner' };
    expect(() => b.buildRequestGroup()).toThrow('Missing practitionerOrganization');
    b.practitionerOrganization = { resourceType: 'Organization' };
    expect(() => b.buildRequestGroup()).toThrow('Missing tests');
    b.tests = [{ resourceType: 'ServiceRequest' }];
    expect(() => b.buildRequestGroup()).not.toThrow();
  });
});
