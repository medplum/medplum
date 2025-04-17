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
import { default as SftpClient } from 'ssh2-sftp-client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createOruMessage, handler } from './generate-oru-message';

dotenv.config();

const CONNECTION_DETAILS = {
  SFTP_HOST: { name: 'SFTP_HOST', valueString: 'example.server.transfer.us-east-1.amazonaws.com' },
  SFTP_USER: { name: 'SFTP_USER', valueString: 'user' },
  SFTP_PRIVATE_KEY: { name: 'SFTP_PRIVATE_KEY', valueString: 'abcd' },
};

// Mock the ssh2-sftp-client
vi.mock('ssh2-sftp-client');

describe('Send ORU Message to Partner', () => {
  let mockSftp: SftpClient;

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
    observations.push(await medplum.createResource({
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
    }));

    // BUN observation
    observations.push(await medplum.createResource({
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
    }));

    // Cholesterol observation with high value
    observations.push(await medplum.createResource({
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
    }));

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
      encounter: serviceRequest.encounter,
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
      diagnosticReport 
    });
  });

  // Mock the sftp connection
  beforeEach(() => {
    mockSftp = new SftpClient();
    vi.mocked(mockSftp).connect.mockResolvedValue();
    vi.mocked(mockSftp).put.mockResolvedValue();
    vi.mocked(mockSftp).end.mockResolvedValue();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-04-16T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test('Send ORU message via SFTP', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const diagnosticReport = ctx.diagnosticReport as DiagnosticReport;

    const putSpy = vi.spyOn(mockSftp, 'put');

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: diagnosticReport,
      contentType: ContentType.JSON,
      secrets: CONNECTION_DETAILS,
    });

    // Verify SFTP connection was established
    expect(mockSftp.connect).toHaveBeenCalledTimes(1);
    
    // Verify a file was written to SFTP
    expect(putSpy).toHaveBeenCalledTimes(1);
    
    // Verify the first argument of put is a Buffer
    const firstArg = putSpy.mock.calls[0][0];
    expect(firstArg).toBeInstanceOf(Buffer);
    
    // Verify the second argument (path) contains order ID
    const secondArg = putSpy.mock.calls[0][1];
    expect(secondArg).toContain('ORD98765');
    expect(secondArg).toContain('.oru');
  });

  test('Create ORU message format', async (ctx: any) => {
    const diagnosticReport = ctx.diagnosticReport as DiagnosticReport;
    const patient = ctx.patient as Patient;
    const serviceRequest = ctx.serviceRequest as ServiceRequest;
    const observations = ctx.observations as Observation[];
    const specimen = ctx.specimen as Specimen;
    const orderer = ctx.orderer as Practitioner;

    const oruMessage = createOruMessage(
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
    
    // Check MSH segment
    expect(messageString).toContain('MSH|^~\\&|MEDPLUM_LAB|FACILITY_CODE');
    expect(messageString).toContain('ORU^R01');
    
    // Check PID segment
    expect(messageString).toContain('PID|1|PT12345');
    expect(messageString).toContain('Doe^Jane');
    expect(messageString).toContain('19850801|F');
    
    // Check OBR segment
    expect(messageString).toContain('OBR|1|ORD98765');
    expect(messageString).toContain('PANEL-CHEM^Comprehensive Chemistry Panel');
    
    // Check OBX segments - should have 3 (one for each observation)
    const obxCount = (messageString.match(/OBX\|/g) || []).length;
    expect(obxCount).toBe(3);
    
    // Check for glucose result
    expect(messageString).toContain('2339-0^Glucose');
    expect(messageString).toContain('95|mg/dL|70 - 99');
    
    // Check for high cholesterol with H flag
    expect(messageString).toContain('2093-3^Cholesterol');
    expect(messageString).toContain('220|mg/dL|< 200|H');
    
    // Check for notes
    const nteCount = (messageString.match(/NTE\|/g) || []).length;
    expect(nteCount).toBeGreaterThan(0);
    
    // Should match expected message format - not doing full string match since times will differ
    expect(messageString).toMatch(EXPECTED_MESSAGE_PATTERN);
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

// This is a regex pattern to match the general structure of an ORU message while being flexible about exact values
const EXPECTED_MESSAGE_PATTERN = /MSH\|.*\|MEDPLUM_LAB\|.*\|.*\|.*\|.*\|ORU\^R01\|.*\|.*\|.*\|.*\|\n/;