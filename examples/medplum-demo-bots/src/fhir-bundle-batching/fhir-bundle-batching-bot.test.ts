// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot, Bundle, Condition, DocumentReference, Observation, Patient, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
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

    const binaryData = JSON.stringify(inputBundle);
    vi.spyOn(medplum, 'download').mockResolvedValueOnce(new Blob([binaryData], { type: 'application/fhir+json' }));
    const binary = { resourceType: 'Binary' as const, id: 'fake-binary-1', contentType: 'application/fhir+json' };

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

    const binaryData = JSON.stringify(inputBundle);
    vi.spyOn(medplum, 'download').mockResolvedValueOnce(new Blob([binaryData], { type: 'application/fhir+json' }));

    const result = await handler(medplum, makeEvent({ reference: 'Binary/fake-binary-2' }));

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

    const batch = executeBatchSpy.mock.calls[0][0];
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
    const firstBatch = executeBatchSpy.mock.calls[0][0];
    expect(firstBatch.entry?.some((e) => e.resource?.resourceType === 'Practitioner')).toBe(true);

    // Second batch should contain Organization
    const secondBatch = executeBatchSpy.mock.calls[1][0];
    expect(secondBatch.entry?.some((e) => e.resource?.resourceType === 'Organization')).toBe(true);

    // Third batch should contain Patient
    const thirdBatch = executeBatchSpy.mock.calls[2][0];
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
      (bundle).entry?.some((e) => e.resource?.resourceType === 'DiagnosticReport')
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
      (bundle).entry?.some((e) => e.resource?.resourceType === 'DocumentReference')
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
      (bundle).entry?.some((e) => e.resource?.resourceType === 'Patient')
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
      (bundle).entry?.some((e) => e.resource?.resourceType === 'Condition')
    );
    const condEntry = (condBatch?.[0] as Bundle).entry?.find((e) => e.resource?.resourceType === 'Condition');

    expect(condEntry?.request?.method).toBe('PUT');
    expect(condEntry?.request?.url).toContain('Condition?identifier=');
    expect(condEntry?.request?.url).toContain('http%3A%2F%2Fexample.com%2Fconditions');
  });

  // --- Cross-batch reference redirection tests ---

  test('Rewrites cross-batch references from Patient/id to conditional reference', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'patient-1',
            identifier: [{ system: 'http://hospital.org/mrn', value: 'MRN-100' }],
            name: [{ given: ['Alice'], family: 'Smith' }],
          } as Patient,
        },
        {
          resource: {
            resourceType: 'Observation',
            id: 'obs-1',
            status: 'final',
            code: { text: 'Heart Rate' },
            subject: { reference: 'Patient/patient-1' },
          } as Observation,
        },
      ],
    };

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    await handler(medplum, makeEvent(inputBundle));

    // Find the batch containing the Observation
    const obsBatch = executeBatchSpy.mock.calls.find(([bundle]) =>
      (bundle).entry?.some((e) => e.resource?.resourceType === 'Observation')
    );
    expect(obsBatch).toBeDefined();

    const obsBundle = obsBatch?.[0] as Bundle;
    const obsEntry = obsBundle.entry?.find((e) => e.resource?.resourceType === 'Observation');
    const obsResource = obsEntry?.resource as Observation;

    // The reference should have been rewritten to a conditional reference (Patient?identifier=...)
    expect(obsResource.subject?.reference).toContain('Patient?identifier=');
    expect(obsResource.subject?.reference).toContain('http%3A%2F%2Fhospital.org%2Fmrn');
  });

  // --- Multiple disconnected components tests ---

  test('Processes multiple unrelated resources with no shared references', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Condition',
            id: 'cond-a',
            code: { text: 'Diabetes' },
          } as Condition,
        },
        {
          resource: {
            resourceType: 'Condition',
            id: 'cond-b',
            code: { text: 'Asthma' },
          } as Condition,
        },
      ],
    };

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    const result = await handler(medplum, makeEvent(inputBundle));

    expect(result.status).toBe('complete');
    expect(result.totalResources).toBe(2);

    // Both conditions should be processed across the submitted batches
    const allEntries = executeBatchSpy.mock.calls.flatMap(([bundle]) => bundle.entry ?? []);
    const conditionEntries = allEntries.filter((e) => e.resource?.resourceType === 'Condition');
    expect(conditionEntries).toHaveLength(2);
  });

  // --- Reference to stored Bundle input tests ---

  test('Handles Reference to a stored Bundle resource', async () => {
    const storedBundle = await medplum.createResource<Bundle>({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'patient-from-bundle',
            name: [{ given: ['Bob'], family: 'Jones' }],
          },
        },
      ],
    });

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    const result = await handler(medplum, makeEvent({ reference: `Bundle/${storedBundle.id}` }));

    expect(result.status).toBe('complete');
    expect(result.totalResources).toBe(1);
    expect(executeBatchSpy).toHaveBeenCalled();

    const allEntries = executeBatchSpy.mock.calls.flatMap(([bundle]) => bundle.entry ?? []);
    expect(allEntries.some((e) => e.resource?.resourceType === 'Patient')).toBe(true);
  });

  // --- DocumentReference with multiple Binary attachments ---

  test('Co-locates multiple Binaries from different attachments with DocumentReference', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Binary',
            id: 'bin-1',
            contentType: 'application/pdf',
          },
        },
        {
          resource: {
            resourceType: 'Binary',
            id: 'bin-2',
            contentType: 'image/png',
          },
        },
        {
          resource: {
            resourceType: 'Binary',
            id: 'bin-3',
            contentType: 'text/plain',
          },
        },
        {
          resource: {
            resourceType: 'DocumentReference',
            id: 'docref-multi',
            status: 'current',
            content: [
              { attachment: { url: 'Binary/bin-1' } },
              { attachment: { url: 'Binary/bin-2' } },
              { attachment: { url: 'Binary/bin-3' } },
            ],
          } as DocumentReference,
        },
      ],
    };

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    await handler(medplum, makeEvent(inputBundle));

    // Find the batch containing the DocumentReference
    const docBatch = executeBatchSpy.mock.calls.find(([bundle]) =>
      (bundle).entry?.some((e) => e.resource?.resourceType === 'DocumentReference')
    );
    expect(docBatch).toBeDefined();

    const batchBundle = docBatch?.[0] as Bundle;
    const binaryEntries = batchBundle.entry?.filter((e) => e.resource?.resourceType === 'Binary') ?? [];
    const docRefEntry = batchBundle.entry?.find((e) => e.resource?.resourceType === 'DocumentReference');

    // All three binaries should be co-located with the DocumentReference
    expect(binaryEntries).toHaveLength(3);
    expect(docRefEntry).toBeDefined();

    // Each Binary should have securityContext set to the DocumentReference's fullUrl
    for (const binEntry of binaryEntries) {
      const binResource = binEntry.resource as any;
      expect(binResource.securityContext).toBeDefined();
      expect(binResource.securityContext.reference).toMatch(/^urn:uuid:/);
    }

    // All securityContext references should point to the same DocumentReference fullUrl
    const secContextRefs = binaryEntries.map((e) => (e.resource as any).securityContext.reference);
    expect(new Set(secContextRefs).size).toBe(1);
    expect(secContextRefs[0]).toBe(docRefEntry?.fullUrl);
  });

  // --- PractitionerRole grouped with Practitioner tests ---

  test('Groups PractitionerRole with Practitioner in the same batch (first priority phase)', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Practitioner',
            id: 'pract-1',
            name: [{ given: ['Dr'], family: 'House' }],
          } as Practitioner,
        },
        {
          resource: {
            resourceType: 'PractitionerRole',
            id: 'practrole-1',
            code: [{ text: 'General Practitioner' }],
          } as PractitionerRole,
        },
      ],
    };

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    await handler(medplum, makeEvent(inputBundle));

    // The first batch should contain both Practitioner and PractitionerRole
    const firstBatch = executeBatchSpy.mock.calls[0][0];
    expect(firstBatch.entry?.some((e) => e.resource?.resourceType === 'Practitioner')).toBe(true);
    expect(firstBatch.entry?.some((e) => e.resource?.resourceType === 'PractitionerRole')).toBe(true);
  });

  // --- Preferred identifier selection for conditional refs ---

  test('Prefers existing MRN identifier over original-id for conditional references', async () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: 'patient-1',
            identifier: [{ system: 'http://hospital.org/mrn', value: 'MRN-123' }],
            name: [{ given: ['Carol'], family: 'White' }],
          } as Patient,
        },
      ],
    };

    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch');
    await handler(medplum, makeEvent(inputBundle));

    const patientBatch = executeBatchSpy.mock.calls.find(([bundle]) =>
      (bundle).entry?.some((e) => e.resource?.resourceType === 'Patient')
    );
    const patientEntry = (patientBatch?.[0] as Bundle).entry?.find((e) => e.resource?.resourceType === 'Patient');

    // The ifNoneExist should use the MRN identifier, not the original-id system
    expect(patientEntry?.request?.ifNoneExist).toContain('http%3A%2F%2Fhospital.org%2Fmrn');
    expect(patientEntry?.request?.ifNoneExist).toContain('MRN-123');
    expect(patientEntry?.request?.ifNoneExist).not.toContain('urn%3Amedplum%3Aoriginal-id');
  });
});
