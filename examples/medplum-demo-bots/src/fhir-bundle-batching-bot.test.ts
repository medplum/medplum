// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot, Bundle, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handler } from './fhir-bundle-batching-bot';

describe('FHIR Bundle Batching Bot', () => {
  let medplum: MockClient;
  const bot: Reference<Bot> = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';
  const secrets = {};

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('Handles empty bundle', async () => {
    const emptyBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [],
    };

    // Create a Binary resource containing the bundle
    const binary = await medplum.createBinary({
      data: JSON.stringify(emptyBundle),
      contentType: 'application/fhir+json',
      filename: 'bundle.json',
    });

    const result = await handler(medplum, {
      bot,
      input: binary,
      contentType,
      secrets,
    });

    expect(result.status).toBe('empty');
    expect(result.batchCount).toBe(0);
  });

  test('Processes bundle with Patient and Observation', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'patient-1',
            identifier: [{ system: 'http://example.com/mrn', value: 'MRN-001' }],
            name: [{ given: ['John'], family: 'Doe' }],
          },
        },
        {
          resource: {
            resourceType: 'Observation',
            id: 'obs-1',
            status: 'final',
            code: { text: 'Heart Rate' },
            subject: { reference: 'Patient/patient-1' },
            valueQuantity: { value: 72, unit: 'bpm' },
          },
        },
      ],
    };

    const binary = await medplum.createBinary({
      data: JSON.stringify(inputBundle),
      contentType: 'application/fhir+json',
      filename: 'bundle.json',
    });

    // Spy on executeBatch to verify the batches submitted
    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');

    const result = await handler(medplum, {
      bot,
      input: binary,
      contentType,
      secrets,
    });

    expect(result.status).toBe('complete');
    expect(result.totalResources).toBe(2);

    // Should have at least 2 batches: one for humans, one for other resources
    expect(executeBatchSpy).toHaveBeenCalled();

    // First batch should contain the Patient with conditional create
    const firstBatch = executeBatchSpy.mock.calls[0][0] as Bundle;
    const patientEntry = firstBatch.entry?.find((e) => e.resource?.resourceType === 'Patient');
    expect(patientEntry).toBeDefined();
    expect(patientEntry?.request?.method).toBe('POST');
    expect(patientEntry?.request?.ifNoneExist).toBeDefined();

    // Patient should have original ID in identifier
    const patientIdentifiers = (patientEntry?.resource as any)?.identifier;
    expect(patientIdentifiers).toBeDefined();
    const originalIdIdentifier = patientIdentifiers?.find(
      (id: any) => id.system === 'urn:medplum:original-id'
    );
    expect(originalIdIdentifier?.value).toBe('patient-1');

    // Patient should not have original id field
    expect(patientEntry?.resource?.id).toBeUndefined();
  });

  test('Processes bundle with DiagnosticReport and Observations kept together', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Practitioner',
            id: 'pract-1',
            identifier: [{ system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567890' }],
            name: [{ given: ['Dr'], family: 'Smith' }],
          },
        },
        {
          resource: {
            resourceType: 'Observation',
            id: 'obs-1',
            status: 'final',
            code: { text: 'WBC' },
            valueQuantity: { value: 5.0, unit: '10*3/uL' },
          },
        },
        {
          resource: {
            resourceType: 'Observation',
            id: 'obs-2',
            status: 'final',
            code: { text: 'RBC' },
            valueQuantity: { value: 4.5, unit: '10*6/uL' },
          },
        },
        {
          resource: {
            resourceType: 'DiagnosticReport',
            id: 'dr-1',
            status: 'final',
            code: { text: 'CBC' },
            result: [{ reference: 'Observation/obs-1' }, { reference: 'Observation/obs-2' }],
          },
        },
      ],
    };

    const binary = await medplum.createBinary({
      data: JSON.stringify(inputBundle),
      contentType: 'application/fhir+json',
      filename: 'bundle.json',
    });

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');

    const result = await handler(medplum, {
      bot,
      input: binary,
      contentType,
      secrets,
    });

    expect(result.status).toBe('complete');

    // Find the batch containing the DiagnosticReport
    const nonHumanBatches = executeBatchSpy.mock.calls.slice(1);
    const drBatch = nonHumanBatches.find(([bundle]) =>
      (bundle as Bundle).entry?.some((e) => e.resource?.resourceType === 'DiagnosticReport')
    );
    expect(drBatch).toBeDefined();

    const drBundle = drBatch?.[0] as Bundle;
    const drEntry = drBundle.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport');
    const obs1Entry = drBundle.entry?.find(
      (e) =>
        e.resource?.resourceType === 'Observation' &&
        (e.resource as any).code?.text === 'WBC'
    );
    const obs2Entry = drBundle.entry?.find(
      (e) =>
        e.resource?.resourceType === 'Observation' &&
        (e.resource as any).code?.text === 'RBC'
    );

    // DiagnosticReport and its Observations should be in the same batch
    expect(drEntry).toBeDefined();
    expect(obs1Entry).toBeDefined();
    expect(obs2Entry).toBeDefined();

    // DiagnosticReport should reference observations via urn:uuid
    const drResource = drEntry?.resource as any;
    for (const ref of drResource.result) {
      expect(ref.reference).toMatch(/^urn:uuid:/);
    }
  });

  test('Processes bundle with Binary resource co-located with referencing resource', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Binary',
            id: 'binary-1',
            contentType: 'application/pdf',
          },
        },
        {
          resource: {
            resourceType: 'DocumentReference',
            id: 'docref-1',
            status: 'current',
            content: [
              {
                attachment: {
                  url: 'Binary/binary-1',
                },
              },
            ],
          },
        },
      ],
    };

    const binary = await medplum.createBinary({
      data: JSON.stringify(inputBundle),
      contentType: 'application/fhir+json',
      filename: 'bundle.json',
    });

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');

    const result = await handler(medplum, {
      bot,
      input: binary,
      contentType,
      secrets,
    });

    expect(result.status).toBe('complete');

    // The Binary and DocumentReference should be in the same batch
    const nonHumanCalls = executeBatchSpy.mock.calls.filter(([bundle]) =>
      (bundle as Bundle).entry?.some((e) => e.resource?.resourceType === 'DocumentReference')
    );
    expect(nonHumanCalls.length).toBeGreaterThan(0);

    const batchBundle = nonHumanCalls[0][0] as Bundle;
    const binaryEntry = batchBundle.entry?.find((e) => e.resource?.resourceType === 'Binary');
    const docRefEntry = batchBundle.entry?.find((e) => e.resource?.resourceType === 'DocumentReference');

    expect(binaryEntry).toBeDefined();
    expect(docRefEntry).toBeDefined();

    // Binary should have securityContext pointing to the DocumentReference
    const binaryResource = binaryEntry?.resource as any;
    expect(binaryResource.securityContext).toBeDefined();
    expect(binaryResource.securityContext.reference).toMatch(/^urn:uuid:/);
  });

  test('Uses conditional update (PUT) for non-human resources', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Condition',
            id: 'cond-1',
            identifier: [{ system: 'http://example.com/conditions', value: 'COND-001' }],
            code: { text: 'Hypertension' },
          },
        },
      ],
    };

    const binary = await medplum.createBinary({
      data: JSON.stringify(inputBundle),
      contentType: 'application/fhir+json',
      filename: 'bundle.json',
    });

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');

    await handler(medplum, {
      bot,
      input: binary,
      contentType,
      secrets,
    });

    // Find the batch with the Condition
    const condBatch = executeBatchSpy.mock.calls.find(([bundle]) =>
      (bundle as Bundle).entry?.some((e) => e.resource?.resourceType === 'Condition')
    );
    expect(condBatch).toBeDefined();

    const condBundle = condBatch?.[0] as Bundle;
    const condEntry = condBundle.entry?.find((e) => e.resource?.resourceType === 'Condition');

    // Should use PUT for conditional update with identifier in the URL
    expect(condEntry?.request?.method).toBe('PUT');
    expect(condEntry?.request?.url).toContain('Condition?identifier=');
    expect(condEntry?.request?.url).toContain('http%3A%2F%2Fexample.com%2Fconditions');
  });
});
