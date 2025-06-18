import {
  ContentType,
  LOINC,
  UCUM,
  createReference,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  MedplumClient,
} from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import {
  Bundle,
  DiagnosticReport,
  Observation,
  Patient,
  Practitioner,
  SearchParameter,
  ServiceRequest,
  Specimen,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import * as dotenv from 'dotenv';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createOruMessage, handler } from './send-oru-message';

dotenv.config();

const CONNECTION_DETAILS = {
  SFTP_HOST: { name: 'SFTP_HOST', valueString: 'example.server.transfer.us-east-1.amazonaws.com' },
  SFTP_USER: { name: 'SFTP_USER', valueString: 'user' },
  SFTP_PRIVATE_KEY: { name: 'SFTP_PRIVATE_KEY', valueString: 'abcd' },
};

// Mock the ssh2-sftp-client
vi.mock('ssh2-sftp-client');

describe('Send ORU Message to Partner', () => {
  beforeAll(() => {
    // Initialize FHIR structure definitions
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async (ctx: any) => {
    const medplum = new MockClient();

    // Create test patient
    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          given: ['Jane'],
          family: 'Doe',
        },
      ],
      birthDate: '1985-08-01',
      address: [
        {
          line: ['123 Main Street'],
          city: 'Springfield',
          state: 'MA',
          postalCode: '12345',
        },
      ],
      telecom: [
        {
          system: 'phone',
          use: 'home',
          value: '(555) 123-4567',
        },
        {
          system: 'phone',
          use: 'work',
          value: '(555) 987-6543',
        },
      ],
      gender: 'female',
      identifier: [
        {
          system: 'https://lab.medplum.com/patientId',
          value: 'PT12345',
        },
      ],
    });

    // Create ordering provider
    const orderer = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [
        {
          prefix: ['Dr.'],
          given: ['Robert'],
          family: 'Johnson',
        },
      ],
      gender: 'male',
      identifier: [
        {
          system: 'https://lab.medplum.com/practitionerId',
          value: 'DR12345',
        },
      ],
    });

    // Create specimen
    const specimen = await medplum.createResource({
      resourceType: 'Specimen',
      subject: createReference(patient),
      receivedTime: '2023-04-15T14:30:00Z',
      collection: {
        collectedDateTime: '2023-04-15T09:15:00Z',
      },
      type: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '119364003',
            display: 'Serum specimen',
          },
        ],
        text: 'Serum',
      },
      status: 'available',
    });

    // Create service request (lab order)
    const serviceRequest = await medplum.createResource({
      resourceType: 'ServiceRequest',
      subject: createReference(patient),
      requester: createReference(orderer),
      status: 'active',
      intent: 'order',
      authoredOn: '2023-04-14T16:00:00Z',
      specimen: [createReference(specimen)],
      identifier: [
        {
          system: 'https://lab.medplum.com/orderId',
          value: 'ORD98765',
        },
      ],
      code: {
        coding: [
          {
            system: 'https://lab.medplum.com/orderCode',
            code: 'PANEL-CHEM',
            display: 'Comprehensive Chemistry Panel',
          },
        ],
        text: 'Comprehensive Chemistry Panel',
      },
    });

    // Create observations (lab results)
    const observations = [];

    // Glucose observation
    observations.push(
      await medplum.createResource({
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        basedOn: [createReference(serviceRequest)],
        specimen: createReference(specimen),
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
                display: 'Laboratory',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: LOINC,
              code: '2339-0',
              display: 'Glucose',
            },
          ],
          text: 'Glucose',
        },
        valueQuantity: {
          value: 95,
          unit: 'mg/dL',
          system: UCUM,
          code: 'mg/dL',
        },
        referenceRange: [
          {
            low: {
              value: 70,
              unit: 'mg/dL',
              system: UCUM,
              code: 'mg/dL',
            },
            high: {
              value: 99,
              unit: 'mg/dL',
              system: UCUM,
              code: 'mg/dL',
            },
            text: '70 - 99 mg/dL',
          },
        ],
        issued: '2023-04-16T10:00:00Z',
      })
    );

    // BUN observation
    observations.push(
      await medplum.createResource({
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        basedOn: [createReference(serviceRequest)],
        specimen: createReference(specimen),
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
                display: 'Laboratory',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: LOINC,
              code: '3094-0',
              display: 'BUN',
            },
          ],
          text: 'BUN',
        },
        valueQuantity: {
          value: 18,
          unit: 'mg/dL',
          system: UCUM,
          code: 'mg/dL',
        },
        referenceRange: [
          {
            low: {
              value: 7,
              unit: 'mg/dL',
              system: UCUM,
              code: 'mg/dL',
            },
            high: {
              value: 20,
              unit: 'mg/dL',
              system: UCUM,
              code: 'mg/dL',
            },
            text: '7 - 20 mg/dL',
          },
        ],
        issued: '2023-04-16T10:00:00Z',
      })
    );

    // Cholesterol observation with high value
    observations.push(
      await medplum.createResource({
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient),
        basedOn: [createReference(serviceRequest)],
        specimen: createReference(specimen),
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
                display: 'Laboratory',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: LOINC,
              code: '2093-3',
              display: 'Cholesterol',
            },
          ],
          text: 'Cholesterol',
        },
        valueQuantity: {
          value: 220,
          unit: 'mg/dL',
          system: UCUM,
          code: 'mg/dL',
        },
        interpretation: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                code: 'H',
                display: 'High',
              },
            ],
            text: 'High',
          },
        ],
        referenceRange: [
          {
            high: {
              value: 200,
              unit: 'mg/dL',
              system: UCUM,
              code: 'mg/dL',
            },
            text: '< 200 mg/dL',
          },
        ],
        issued: '2023-04-16T10:00:00Z',
        note: [
          {
            text: 'Levels above 200 mg/dL may indicate increased risk of heart disease.',
          },
        ],
      })
    );

    // Create diagnostic report
    const diagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: {
        coding: [
          {
            system: 'https://lab.medplum.com/orderCode',
            code: 'PANEL-CHEM',
            display: 'Comprehensive Chemistry Panel',
          },
        ],
        text: 'Comprehensive Chemistry Panel',
      },
      subject: createReference(patient),
      resultsInterpreter: [createReference(orderer)],
      basedOn: [createReference(serviceRequest)],
      specimen: [createReference(specimen)],
      result: observations.map(createReference),
      issued: '2023-04-16T10:30:00Z',
      performer: [
        {
          display: 'MEDPLUM_LAB',
        },
      ],
      note: [
        {
          text: 'Sample processed according to standard protocol.',
        },
      ],
    });

    Object.assign(ctx, {
      medplum,
      patient,
      orderer,
      specimen,
      serviceRequest,
      observations,
      diagnosticReport,
    });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-04-16T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test.skip('Test Connection', async (ctx: any) => {
    try {
      await handler(ctx.medplum, {
        bot: { reference: 'Bot/123' },
        input: ctx.order,
        contentType: 'string',
        secrets: { ...CONNECTION_DETAILS },
      });
    } catch {
      console.error('Here');
    }
  });

  test('Create ORU message format', async (ctx: any) => {
    const diagnosticReport = ctx.diagnosticReport as DiagnosticReport;
    const patient = ctx.patient as Patient;
    const serviceRequest = ctx.serviceRequest as ServiceRequest;
    const observations = ctx.observations as Observation[];
    const specimen = ctx.specimen as Specimen;
    const orderer = ctx.orderer as Practitioner;

    const oruMessage = await createOruMessage(
      diagnosticReport,
      serviceRequest,
      observations,
      specimen,
      patient,
      orderer
    );

    // Verify message exists
    expect(oruMessage).toBeDefined();

    const messageString = oruMessage?.toString() || '';

    expect(messageString).toBe(TEST_MESSAGE);
  });

  test('Create ORU message with child observations', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const patient = ctx.patient as Patient;
    const serviceRequest = ctx.serviceRequest as ServiceRequest;
    const specimen = ctx.specimen as Specimen;
    const orderer = ctx.orderer as Practitioner;

    // Create child observations
    const childObs1 = await medplum.createResource({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      basedOn: [createReference(serviceRequest)],
      specimen: createReference(specimen),
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: LOINC,
            code: '2339-1',
            display: 'Glucose Fasting',
          },
        ],
        text: 'Glucose Fasting',
      },
      valueQuantity: {
        value: 92,
        unit: 'mg/dL',
        system: UCUM,
        code: 'mg/dL',
      },
      issued: '2023-04-16T10:00:00Z',
    });

    const childObs2 = await medplum.createResource({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      basedOn: [createReference(serviceRequest)],
      specimen: createReference(specimen),
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: LOINC,
            code: '2339-2',
            display: 'Glucose Post-Meal',
          },
        ],
        text: 'Glucose Post-Meal',
      },
      valueQuantity: {
        value: 98,
        unit: 'mg/dL',
        system: UCUM,
        code: 'mg/dL',
      },
      issued: '2023-04-16T10:00:00Z',
    });

    // Create parent observation with child observations
    const parentObs = await medplum.createResource({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      basedOn: [createReference(serviceRequest)],
      specimen: createReference(specimen),
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: LOINC,
            code: '2339-0',
            display: 'Glucose Panel',
          },
        ],
        text: 'Glucose Panel',
      },
      hasMember: [createReference(childObs1), createReference(childObs2)],
      issued: '2023-04-16T10:00:00Z',
    });

    // Create diagnostic report with parent observation
    const diagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: {
        coding: [
          {
            system: 'https://lab.medplum.com/orderCode',
            code: 'PANEL-CHEM',
            display: 'Comprehensive Chemistry Panel',
          },
        ],
        text: 'Comprehensive Chemistry Panel',
      },
      subject: createReference(patient),
      resultsInterpreter: [createReference(orderer)],
      basedOn: [createReference(serviceRequest)],
      specimen: [createReference(specimen)],
      result: [createReference(parentObs)],
      issued: '2023-04-16T10:30:00Z',
      performer: [
        {
          display: 'MEDPLUM_LAB',
        },
      ],
    });

    const oruMessage = createOruMessage(
      diagnosticReport,
      serviceRequest,
      [parentObs, childObs1, childObs2],
      specimen,
      patient,
      orderer
    );

    // Verify message exists
    expect(oruMessage).toBeDefined();

    const messageString = oruMessage?.toString() || '';

    // Verify that both parent and child observations are in the message
    expect(messageString).toContain('2339-0^Glucose Panel^http://loinc.org');
    expect(messageString).toContain('2339-1^Glucose Fasting^http://loinc.org');
    expect(messageString).toContain('2339-2^Glucose Post-Meal^http://loinc.org');
  });

  test('Create ORU message with PDF attachments', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const patient = ctx.patient as Patient;
    const serviceRequest = ctx.serviceRequest as ServiceRequest;
    const specimen = ctx.specimen as Specimen;
    const orderer = ctx.orderer as Practitioner;

    // Create a simple observation
    const observation = await medplum.createResource({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      basedOn: [createReference(serviceRequest)],
      specimen: createReference(specimen),
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: LOINC,
            code: '2339-0',
            display: 'Glucose',
          },
        ],
        text: 'Glucose',
      },
      valueQuantity: {
        value: 95,
        unit: 'mg/dL',
        system: UCUM,
        code: 'mg/dL',
      },
      issued: '2023-04-16T10:00:00Z',
    });

    // Create diagnostic report with PDF attachment
    const diagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: {
        coding: [
          {
            system: 'https://lab.medplum.com/orderCode',
            code: 'PANEL-CHEM',
            display: 'Comprehensive Chemistry Panel',
          },
        ],
        text: 'Comprehensive Chemistry Panel',
      },
      subject: createReference(patient),
      resultsInterpreter: [createReference(orderer)],
      basedOn: [createReference(serviceRequest)],
      specimen: [createReference(specimen)],
      result: [createReference(observation)],
      issued: '2023-04-16T10:30:00Z',
      performer: [
        {
          display: 'MEDPLUM_LAB',
        },
      ],
      presentedForm: [
        {
          contentType: 'application/pdf',
          data: 'JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwog', // Sample base64 PDF content
          title: 'DiagnosticReport-2011e7673174e366cfbb17b3.pdf',
        },
      ],
    });

    const oruMessage = createOruMessage(
      diagnosticReport,
      serviceRequest,
      [observation],
      specimen,
      patient,
      orderer,
      diagnosticReport.presentedForm
    );

    // Verify message exists
    expect(oruMessage).toBeDefined();

    const messageString = oruMessage?.toString() || '';

    // Verify that both the observation and PDF attachment are in the message
    expect(messageString).toContain('2339-0^Glucose^http://loinc.org');
    expect(messageString).toContain(
      'OBX|2|ED|PDF^PDFBASE64|1|JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwog'
    );
  });

  test('Handle missing related resources', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    // Create a diagnostic report without proper references
    const incompleteReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: {
        text: 'Incomplete Report',
      },
      subject: {
        reference: 'Patient/missing-id',
      },
    });

    // Should throw an error when trying to process this report
    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/123' },
        input: incompleteReport,
        contentType: ContentType.JSON,
        secrets: CONNECTION_DETAILS,
      })
    ).rejects.toThrow('Could not find required resources for ORU message');
  });
});

const TEST_MESSAGE = `MSH|^~\\&|MEDPLUM_LAB|MEDPLUM_LAB||RECEIVING_FACILITY|20230416120000||ORU^R01|MEDPLUM_1681646400000|P|2.5|||||||
PID|1|PT12345|||Doe^Jane^^^||1985-08-01|F|||123 Main Street^^Springfield^MA^12345^||(555) 123-4567|(555) 987-6543||||||
OBR|1|ORD98765||PANEL-CHEM^Comprehensive Chemistry Panel^https://lab.medplum.com/orderCode|||20230415091500|||||||||||||||20230416103000|||F
OBX|1|NM|2339-0^Glucose^http://loinc.org||95|mg/dL|70-99||||F|||20230416100000|||
OBX|2|NM|3094-0^BUN^http://loinc.org||18|mg/dL|7-20||||F|||20230416100000|||
OBX|3|NM|2093-3^Cholesterol^http://loinc.org||220|mg/dL|<200|H|||F|||20230416100000|||
NTE|1||Levels above 200 mg/dL may indicate increased risk of heart disease.`;
