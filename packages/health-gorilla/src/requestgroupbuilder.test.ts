import { createReference } from '@medplum/core';
import {
  Account,
  AccountCoverage,
  Coverage,
  Organization,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  RelatedPerson,
  ServiceRequest,
} from '@medplum/fhirtypes';
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

    const medplumPractitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      identifier: [{ system: HEALTH_GORILLA_SYSTEM, value: '123' }],
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '2000-01-01',
      gender: 'female',
      address: [{ line: ['123 Main St'], city: 'Anytown', state: 'CA', postalCode: '12345' }],
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    });

    const medplumAccount = { resourceType: 'Account', status: 'active' } satisfies Account;
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
      await builder.setupAccount(medplum, medplumAccount);

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
      builder.performer = { resourceType: 'Organization' };

      // Create the service requests
      builder.createServiceRequest('TST', {});

      // Create the diagnoses
      builder.addDiagnosis('R73.9', 'Hyperglycemia, unspecified');

      // Specimen collected date/time
      // This is an optional field.  If present, it will create a Specimen resource.
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

  test('Third party coverage', async () => {
    const medplum = new MockClient();

    const medplumPatient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      identifier: [
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

    const medplumPractitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      identifier: [{ system: HEALTH_GORILLA_SYSTEM, value: '123' }],
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '2000-01-01',
      gender: 'female',
      address: [{ line: ['123 Main St'], city: 'Anytown', state: 'CA', postalCode: '12345' }],
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    });

    const medplumPayor = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Medicare',
    });

    const medplumCoverage1 = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      payor: [createReference(medplumPayor)],
    } as Coverage);

    const medplumRelatedPerson = await medplum.createResource<RelatedPerson>({
      resourceType: 'RelatedPerson',
      patient: createReference(medplumPatient),
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    const medplumCoverage2 = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      subscriber: createReference(medplumRelatedPerson),
    } as Coverage);

    const medplumAccount = await medplum.createResource<Account>({
      resourceType: 'Account',
      type: { coding: [{ code: 'patient' }] },
      subject: [createReference(medplumPatient)],
      coverage: [{ coverage: createReference(medplumCoverage1) }, { coverage: createReference(medplumCoverage2) }],
    } as Account);

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

    const builder = new HealthGorillaRequestGroupBuilder();

    // Synchronize the patient
    await builder.syncPatient(medplum, healthGorilla, medplumPatient);

    // Get the practitioner
    await builder.getPractitioner(healthGorilla, medplumPractitioner);

    // Setup the Account, Coverage, and Subscriber
    await builder.setupAccount(medplum, medplumAccount);

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
    builder.performer = { resourceType: 'Organization' };

    // Create the service requests
    builder.createServiceRequest('TST', {});

    // Create the diagnoses
    builder.addDiagnosis('R73.9', 'Hyperglycemia, unspecified');

    // Specimen collected date/time
    // This is an optional field.  If present, it will create a Specimen resource.
    builder.specimenCollectedDateTime = '2021-01-01T00:00:00.000Z';

    // Order level notes
    // builder.note = answers.orderNote?.valueString;
    builder.note = 'Test note';

    // Create the order
    const requestGroup = builder.buildRequestGroup();
    expect(requestGroup).toMatchObject({ resourceType: 'RequestGroup' });

    const resultCoverage = requestGroup.contained?.filter((r) => r.resourceType === 'Coverage');
    expect(resultCoverage).toHaveLength(2);
  });

  test('AOE response', async () => {
    const medplum = new MockClient();
    const b = new HealthGorillaRequestGroupBuilder();
    b.authorizedBy = { resourceType: 'Organization' };
    b.patient = { resourceType: 'Patient' };
    await b.setupAccount(medplum, { resourceType: 'Account', coverage: [{} as AccountCoverage] } as Account);
    b.performer = { resourceType: 'Organization' };
    b.practitioner = { resourceType: 'Practitioner' };
    b.practitionerOrganization = { resourceType: 'Organization' };
    b.createServiceRequest('test-TST', {
      'test-TST-priority': { valueCoding: { code: 'routine' } },
      'test-TST-note': { valueString: 'Test note' },
      'test-TST-aoe-fasting': { valueBoolean: true },
    });
    const requestGroup = b.buildRequestGroup();

    const questionnaireResponse = requestGroup.contained?.find(
      (r) => r.resourceType === 'QuestionnaireResponse'
    ) as QuestionnaireResponse;
    expect(questionnaireResponse).toBeDefined();
    expect(questionnaireResponse.id).toBe('aoe-TST');
    expect(questionnaireResponse.status).toBe('completed');

    const item = questionnaireResponse.item?.[0] as QuestionnaireResponseItem;
    expect(item.linkId).toBe('fasting');
    expect(item.answer?.[0].valueBoolean).toBe(true);
  });

  test('Missing values', async () => {
    const b = new HealthGorillaRequestGroupBuilder();
    expect(() => b.buildRequestGroup()).toThrow('Missing account');
    b.account = { resourceType: 'Account' } as Account;
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
    b.tests = [{ resourceType: 'ServiceRequest' } as ServiceRequest];
    expect(() => b.buildRequestGroup()).not.toThrow();
  });
});
