// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DocumentReference, Observation, ServiceRequest } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { MedplumErrorHandler } from '@medplum/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  fetchLabOrderRequisitionDocuments,
  getHealthGorillaRequisitionId,
  resolveDerivedFromAttachments,
} from './documentReference';

describe('documentReference utils', () => {
  let medplum: MockClient;
  let onError: Mock<MedplumErrorHandler>;

  beforeEach(() => {
    medplum = new MockClient();
    onError = vi.fn();
  });

  describe('getHealthGorillaRequisitionId', () => {
    test('returns id from requisition', () => {
      const request: ServiceRequest = {
        resourceType: 'ServiceRequest',
        requisition: {
          system: 'https://www.healthgorilla.com',
          value: 'req-1',
        },
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/patient-1' },
      };

      expect(getHealthGorillaRequisitionId(request)).toBe('req-1');
    });

    test('returns id from identifier array', () => {
      const request: ServiceRequest = {
        resourceType: 'ServiceRequest',
        identifier: [
          { system: 'https://www.healthgorilla.com', value: 'req-2' },
          { system: 'http://example.com', value: 'other' },
        ],
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/patient-1' },
      };

      expect(getHealthGorillaRequisitionId(request)).toBe('req-2');
    });

    test('returns undefined when not present', () => {
      const request: ServiceRequest = {
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/patient-1' },
      };
      expect(getHealthGorillaRequisitionId(request)).toBeUndefined();
    });
  });

  describe('fetchLabOrderRequisitionDocuments', () => {
    test('returns empty array when requisition id missing', async () => {
      const request: ServiceRequest = {
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/patient-1' },
      };
      const searchSpy = vi.spyOn(medplum, 'searchResources');

      const result = await fetchLabOrderRequisitionDocuments(medplum, request);

      expect(result).toEqual([]);
      expect(searchSpy).not.toHaveBeenCalled();
    });

    test('fetches requisition documents', async () => {
      const request: ServiceRequest = {
        resourceType: 'ServiceRequest',
        requisition: { system: 'https://www.healthgorilla.com', value: 'req-42' },
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/patient-1' },
      };
      const documents: DocumentReference[] = [
        { resourceType: 'DocumentReference', id: 'doc-1', status: 'current', content: [] },
      ];
      const searchSpy = vi.spyOn(medplum, 'searchResources').mockResolvedValue(documents as any);

      const result = await fetchLabOrderRequisitionDocuments(medplum, request);

      expect(searchSpy).toHaveBeenCalledWith(
        'DocumentReference',
        expect.objectContaining({
          toString: expect.any(Function),
        }),
        { cache: 'no-cache' }
      );
      const searchParams = (searchSpy.mock.calls[0][1] as URLSearchParams).toString();
      expect(searchParams).toContain('category=LabOrderRequisition');
      expect(searchParams).toContain('identifier=https%3A%2F%2Fwww.healthgorilla.com%7Creq-42');
      expect(searchParams).toContain('_sort=-_lastUpdated');
      expect(result).toEqual(documents);
    });
  });

  describe('resolveDerivedFromAttachments', () => {
    test('returns empty array when no result references given', async () => {
      const result = await resolveDerivedFromAttachments(medplum, undefined, onError);
      expect(result).toEqual([]);
    });

    test('resolves an attachment from a result Observation.derivedFrom', async () => {
      const docRef = await medplum.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        status: 'current',
        content: [
          { attachment: { contentType: 'application/pdf', url: 'https://example.com/lab.pdf', title: 'Lab.pdf' } },
        ],
      });
      const observation = await medplum.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Clinical PDF Report' },
        derivedFrom: [{ reference: `DocumentReference/${docRef.id}`, display: 'Lab.pdf' }],
      });

      const result = await resolveDerivedFromAttachments(
        medplum,
        [{ reference: `Observation/${observation.id}` }],
        onError
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ url: 'https://example.com/lab.pdf', title: 'Lab.pdf' });
    });

    test('resolves an attachment from a hasMember descendant Observation', async () => {
      const docRef = await medplum.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        status: 'current',
        content: [{ attachment: { contentType: 'application/pdf', url: 'https://example.com/child.pdf' } }],
      });
      const child = await medplum.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Clinical PDF Report' },
        derivedFrom: [{ reference: `DocumentReference/${docRef.id}` }],
      });
      const parent = await medplum.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Clinical PDF Report' },
        hasMember: [{ reference: `Observation/${child.id}` }],
      });

      const result = await resolveDerivedFromAttachments(medplum, [{ reference: `Observation/${parent.id}` }], onError);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ url: 'https://example.com/child.pdf' });
    });

    test('ignores derivedFrom references that are not DocumentReferences', async () => {
      const observation = await medplum.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'T4, FREE' },
        derivedFrom: [{ reference: 'Observation/some-other-observation' }],
      });

      const result = await resolveDerivedFromAttachments(
        medplum,
        [{ reference: `Observation/${observation.id}` }],
        onError
      );

      expect(result).toEqual([]);
    });

    test('does not revisit the same Observation twice', async () => {
      const observation = await medplum.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'T4, FREE' },
      });
      const ref = { reference: `Observation/${observation.id}` };

      const readSpy = vi.spyOn(medplum, 'readReference');

      await resolveDerivedFromAttachments(medplum, [ref, ref], onError);

      expect(readSpy).toHaveBeenCalledTimes(1);
    });

    test('reports Observations it cannot read and resolves the rest', async () => {
      const docRef = await medplum.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        status: 'current',
        content: [{ attachment: { contentType: 'application/pdf', url: 'https://example.com/lab.pdf' } }],
      });
      const observation = await medplum.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Clinical PDF Report' },
        derivedFrom: [{ reference: `DocumentReference/${docRef.id}` }],
      });

      const result = await resolveDerivedFromAttachments(
        medplum,
        [{ reference: 'Observation/missing' }, { reference: `Observation/${observation.id}` }],
        onError
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ url: 'https://example.com/lab.pdf' });
      expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
        source: 'resolveDerivedFromAttachments',
        message: 'Error resolving Observation for derivedFrom attachment',
      });
    });
  });
});
