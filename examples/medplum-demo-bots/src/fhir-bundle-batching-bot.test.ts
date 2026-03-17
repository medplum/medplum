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

  function makeEvent(input: any, overrideSecrets?: Record<string, any>): any {
    return { bot, input, contentType, secrets: overrideSecrets ?? secrets };
  }

  // --- Input handling tests ---

  test('Handles direct Bundle input', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'patient-1',
            name: [{ given: ['Jane'], family: 'Doe' }],
          },
        },
      ],
    };

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    const result = await handler(medplum, makeEvent(inputBundle));

    expect(result.status).toBe('complete');
    expect(result.totalResources).toBe(1);
    expect(executeBatchSpy).toHaveBeenCalled();
  });

  test('Handles Binary resource input', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'patient-1',
            name: [{ given: ['Jane'], family: 'Doe' }],
          },
        },
      ],
    };

    const binary = await medplum.createBinary({
      data: JSON.stringify(inputBundle),
      contentType: 'application/fhir+json',
      filename: 'bundle.json',
    });

    const result = await handler(medplum, makeEvent(binary));

    expect(result.status).toBe('complete');
    expect(result.totalResources).toBe(1);
  });

  test('Handles Reference to Binary input', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'patient-1',
            name: [{ given: ['Jane'], family: 'Doe' }],
          },
        },
      ],
    };

    const binary = await medplum.createBinary({
      data: JSON.stringify(inputBundle),
      contentType: 'application/fhir+json',
      filename: 'bundle.json',
    });

    const result = await handler(medplum, makeEvent({ reference: `Binary/${binary.id}` }));

    expect(result.status).toBe('complete');
    expect(result.totalResources).toBe(1);
  });

  test('Handles empty bundle', async () => {
    const emptyBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [],
    };

    const result = await handler(medplum, makeEvent(emptyBundle));
    expect(result.status).toBe('empty');
    expect(result.batchCount).toBe(0);
  });

  test('Throws on unsupported input type', async () => {
    await expect(handler(medplum, makeEvent('invalid-string'))).rejects.toThrow('Unsupported input type');
  });

  // --- Identifier system tests ---

  test('Uses custom identifier system from secrets', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Condition',
            id: 'cond-1',
            code: { text: 'Hypertension' },
          },
        },
      ],
    };

    const customSystem = 'https://my-ehr.example.com/fhir-ids';
    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');

    await handler(
      medplum,
      makeEvent(inputBundle, { IDENTIFIER_SYSTEM: { value: customSystem } })
    );

    const batch = executeBatchSpy.mock.calls[0][0] as Bundle;
    const condEntry = batch.entry?.find((e) => e.resource?.resourceType === 'Condition');
    const identifiers = (condEntry?.resource as any)?.identifier;
    const customIdentifier = identifiers?.find((id: any) => id.system === customSystem);
    expect(customIdentifier).toBeDefined();
    expect(customIdentifier.value).toBe('cond-1');
  });

  // --- Migration sequence ordering tests ---

  test('Ingests resources in migration sequence order: Practitioners -> Organizations -> Patients', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'patient-1',
            name: [{ given: ['John'], family: 'Doe' }],
          },
        },
        {
          resource: {
            resourceType: 'Organization',
            id: 'org-1',
            name: 'Test Clinic',
          },
        },
        {
          resource: {
            resourceType: 'Practitioner',
            id: 'pract-1',
            name: [{ given: ['Dr'], family: 'Smith' }],
          },
        },
        {
          resource: {
            resourceType: 'Observation',
            id: 'obs-1',
            status: 'final',
            code: { text: 'BP' },
            subject: { reference: 'Patient/patient-1' },
          },
        },
      ],
    };

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    await handler(medplum, makeEvent(inputBundle));

    // Should have at least 3 batches: practitioners, organizations, patients, then other resources
    expect(executeBatchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);

    // First batch should contain Practitioner
    const firstBatch = executeBatchSpy.mock.calls[0][0] as Bundle;
    expect(firstBatch.entry?.some((e) => e.resource?.resourceType === 'Practitioner')).toBe(true);

    // Second batch should contain Organization
    const secondBatch = executeBatchSpy.mock.calls[1][0] as Bundle;
    expect(secondBatch.entry?.some((e) => e.resource?.resourceType === 'Organization')).toBe(true);

    // Third batch should contain Patient
    const thirdBatch = executeBatchSpy.mock.calls[2][0] as Bundle;
    expect(thirdBatch.entry?.some((e) => e.resource?.resourceType === 'Patient')).toBe(true);
  });

  // --- Connected component tests ---

  test('Keeps DiagnosticReport and Observations in the same batch', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
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

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    await handler(medplum, makeEvent(inputBundle));

    // Find the batch containing the DiagnosticReport
    const drBatch = executeBatchSpy.mock.calls.find(([bundle]) =>
      (bundle as Bundle).entry?.some((e) => e.resource?.resourceType === 'DiagnosticReport')
    );
    expect(drBatch).toBeDefined();

    const drBundle = drBatch?.[0] as Bundle;
    // All three (DR + 2 obs) should be in the same batch
    expect(drBundle.entry?.filter((e) => e.resource?.resourceType === 'Observation')).toHaveLength(2);
    expect(drBundle.entry?.filter((e) => e.resource?.resourceType === 'DiagnosticReport')).toHaveLength(1);

    // DiagnosticReport should reference observations via urn:uuid
    const drResource = drBundle.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport')?.resource as any;
    for (const ref of drResource.result) {
      expect(ref.reference).toMatch(/^urn:uuid:/);
    }
  });

  // --- Binary co-location tests ---

  test('Co-locates Binary with referencing resource and sets securityContext', async () => {
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

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    await handler(medplum, makeEvent(inputBundle));

    // Find the batch containing DocumentReference
    const docBatch = executeBatchSpy.mock.calls.find(([bundle]) =>
      (bundle as Bundle).entry?.some((e) => e.resource?.resourceType === 'DocumentReference')
    );
    expect(docBatch).toBeDefined();

    const batchBundle = docBatch?.[0] as Bundle;
    const binaryEntry = batchBundle.entry?.find((e) => e.resource?.resourceType === 'Binary');
    const docRefEntry = batchBundle.entry?.find((e) => e.resource?.resourceType === 'DocumentReference');

    expect(binaryEntry).toBeDefined();
    expect(docRefEntry).toBeDefined();

    // Binary should have securityContext
    const binaryResource = binaryEntry?.resource as any;
    expect(binaryResource.securityContext).toBeDefined();
    expect(binaryResource.securityContext.reference).toMatch(/^urn:uuid:/);
  });

  // --- Conditional operations tests ---

  test('Uses conditional create (POST+ifNoneExist) for priority resources', async () => {
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
      ],
    };

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    await handler(medplum, makeEvent(inputBundle));

    const patientBatch = executeBatchSpy.mock.calls.find(([bundle]) =>
      (bundle as Bundle).entry?.some((e) => e.resource?.resourceType === 'Patient')
    );
    const patientEntry = (patientBatch?.[0] as Bundle).entry?.find((e) => e.resource?.resourceType === 'Patient');

    expect(patientEntry?.request?.method).toBe('POST');
    expect(patientEntry?.request?.ifNoneExist).toBeDefined();
    expect(patientEntry?.resource?.id).toBeUndefined();
  });

  test('Uses conditional update (PUT) for non-priority resources', async () => {
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

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    await handler(medplum, makeEvent(inputBundle));

    const condBatch = executeBatchSpy.mock.calls.find(([bundle]) =>
      (bundle as Bundle).entry?.some((e) => e.resource?.resourceType === 'Condition')
    );
    const condEntry = (condBatch?.[0] as Bundle).entry?.find((e) => e.resource?.resourceType === 'Condition');

    expect(condEntry?.request?.method).toBe('PUT');
    expect(condEntry?.request?.url).toContain('Condition?identifier=');
    expect(condEntry?.request?.url).toContain('http%3A%2F%2Fexample.com%2Fconditions');
  });
});
