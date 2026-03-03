// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { HEALTHIE_DOCUMENT_ID_SYSTEM } from './constants';
import type { HealthieDocument } from './document';
import {
  convertHealthieDocumentToFhir,
  downloadDocumentContent,
  fetchDocuments,
  shouldDownloadDocument,
} from './document';

vi.mock('./client', async (importOriginal) => {
  const original = (await importOriginal()) as any;
  original.HealthieClient.prototype.query = vi.fn();
  return original;
});

import { HealthieClient } from './client';

function getMockQuery(): ReturnType<typeof vi.fn> {
  return vi.mocked(HealthieClient.prototype.query);
}

beforeAll(() => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
  }
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const FULL_DOC: HealthieDocument = {
  id: 'doc-1',
  display_name: 'Lab Results.pdf',
  description: 'Blood work results',
  file_content_type: 'application/pdf',
  extension: '.pdf',
  expiring_url: 'https://s3.example.com/doc-1.pdf?token=abc',
  rel_user_id: 'patient-1',
  owner: { id: 'prov-1', name: 'Dr. Smith' },
  include_in_charting: true,
  internal_notes: 'Follow up needed',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-16T10:00:00Z',
};

describe('fetchDocuments', () => {
  test('fetches documents for a patient', async () => {
    getMockQuery().mockResolvedValueOnce({
      documents: [
        { id: 'doc-1', display_name: 'File 1', created_at: '2025-01-01T00:00:00Z' },
        { id: 'doc-2', display_name: 'File 2', created_at: '2025-01-02T00:00:00Z' },
      ],
    });

    const client = new HealthieClient('https://api.example.com', 'secret');
    const result = await fetchDocuments(client, 'patient-1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('doc-1');
    expect(result[1].id).toBe('doc-2');
  });

  test('returns empty array when null', async () => {
    getMockQuery().mockResolvedValueOnce({ documents: null });

    const client = new HealthieClient('https://api.example.com', 'secret');
    const result = await fetchDocuments(client, 'patient-1');
    expect(result).toEqual([]);
  });

  test('returns empty array when no documents', async () => {
    getMockQuery().mockResolvedValueOnce({ documents: [] });

    const client = new HealthieClient('https://api.example.com', 'secret');
    const result = await fetchDocuments(client, 'patient-1');
    expect(result).toEqual([]);
  });

  test('paginates when page is full', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      id: `doc-${i}`,
      display_name: `File ${i}`,
      created_at: '2025-01-01T00:00:00Z',
    }));

    getMockQuery().mockResolvedValueOnce({ documents: fullPage });
    getMockQuery().mockResolvedValueOnce({
      documents: [{ id: 'doc-100', display_name: 'Last File', created_at: '2025-01-01T00:00:00Z' }],
    });

    const client = new HealthieClient('https://api.example.com', 'secret');
    const result = await fetchDocuments(client, 'patient-1');

    expect(result).toHaveLength(101);
    expect(getMockQuery()).toHaveBeenCalledTimes(2);
  });
});

describe('downloadDocumentContent', () => {
  test('downloads and returns base64 content', async () => {
    const mockArrayBuffer = new TextEncoder().encode('hello world').buffer;
    const mockResponse = {
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse as Response);

    const result = await downloadDocumentContent('https://s3.example.com/file.pdf');

    expect(result).toBeDefined();
    expect(result?.contentType).toBe('application/pdf');
    expect(typeof result?.data).toBe('string');
    const decoded = atob(result?.data ?? '');
    expect(decoded).toBe('hello world');
  });

  test('returns undefined on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    const result = await downloadDocumentContent('https://s3.example.com/expired.pdf');
    expect(result).toBeUndefined();
  });

  test('returns undefined on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await downloadDocumentContent('https://s3.example.com/file.pdf');
    expect(result).toBeUndefined();
  });

  test('defaults content type to application/octet-stream', async () => {
    const mockArrayBuffer = new TextEncoder().encode('data').buffer;
    const mockResponse = {
      ok: true,
      headers: new Headers({}),
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse as Response);

    const result = await downloadDocumentContent('https://s3.example.com/file');

    expect(result?.contentType).toBe('application/octet-stream');
  });

  test('logs warning for large files', async () => {
    const mockArrayBuffer = new TextEncoder().encode('data').buffer;
    const mockResponse = {
      ok: true,
      headers: new Headers({ 'content-type': 'image/png', 'content-length': '20000000' }),
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse as Response);
    const consoleSpy = vi.spyOn(console, 'log');

    await downloadDocumentContent('https://s3.example.com/large.png');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('large'));
  });
});

describe('shouldDownloadDocument', () => {
  test('returns true when no existing document', async () => {
    const medplum = new MockClient();
    const result = await shouldDownloadDocument(FULL_DOC, medplum);
    expect(result).toBe(true);
  });

  test('returns true when Healthie doc is newer', async () => {
    const medplum = new MockClient();
    await medplum.createResource({
      resourceType: 'DocumentReference',
      identifier: [{ system: HEALTHIE_DOCUMENT_ID_SYSTEM, value: 'doc-1' }],
      status: 'current',
      content: [{ attachment: { contentType: 'application/pdf' } }],
    });

    const doc: HealthieDocument = {
      ...FULL_DOC,
      updated_at: new Date(Date.now() + 60000).toISOString(),
    };
    const result = await shouldDownloadDocument(doc, medplum);
    expect(result).toBe(true);
  });

  test('returns false when Healthie doc is older', async () => {
    const medplum = new MockClient();
    await medplum.createResource({
      resourceType: 'DocumentReference',
      identifier: [{ system: HEALTHIE_DOCUMENT_ID_SYSTEM, value: 'doc-1' }],
      status: 'current',
      content: [{ attachment: { contentType: 'application/pdf' } }],
    });

    const doc: HealthieDocument = {
      ...FULL_DOC,
      updated_at: '2020-01-01T00:00:00Z',
    };
    const result = await shouldDownloadDocument(doc, medplum);
    expect(result).toBe(false);
  });

  test('returns true when updated_at is missing', async () => {
    const medplum = new MockClient();
    await medplum.createResource({
      resourceType: 'DocumentReference',
      identifier: [{ system: HEALTHIE_DOCUMENT_ID_SYSTEM, value: 'doc-1' }],
      status: 'current',
      content: [{ attachment: { contentType: 'application/pdf' } }],
    });

    const doc: HealthieDocument = { ...FULL_DOC, updated_at: undefined };
    const result = await shouldDownloadDocument(doc, medplum);
    expect(result).toBe(true);
  });

  test('returns true on search error', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockRejectedValueOnce(new Error('Search failed'));

    const result = await shouldDownloadDocument(FULL_DOC, medplum);
    expect(result).toBe(true);
  });
});

describe('convertHealthieDocumentToFhir', () => {
  const patientRef = { reference: 'urn:uuid:patient-1' } as any;

  test('converts document with binary data', () => {
    const { documentReference, binary } = convertHealthieDocumentToFhir(FULL_DOC, 'base64data==', patientRef);

    expect(documentReference.resourceType).toBe('DocumentReference');
    expect(documentReference.identifier?.[0]).toEqual({ system: HEALTHIE_DOCUMENT_ID_SYSTEM, value: 'doc-1' });
    expect(documentReference.status).toBe('current');
    expect(documentReference.subject).toBe(patientRef);
    expect(documentReference.date).toBe('2025-01-15T10:00:00Z');
    expect(documentReference.description).toBe('Blood work results');
    expect(documentReference.content[0].attachment.contentType).toBe('application/pdf');
    expect(documentReference.content[0].attachment.title).toBe('Lab Results.pdf');

    expect(binary).toBeDefined();
    expect(binary?.resourceType).toBe('Binary');
    expect(binary?.contentType).toBe('application/pdf');
    expect(binary?.data).toBe('base64data==');
    expect(binary?.meta?.tag?.[0]).toEqual({ system: HEALTHIE_DOCUMENT_ID_SYSTEM, code: 'binary-doc-1' });
  });

  test('converts document without binary data', () => {
    const { documentReference, binary } = convertHealthieDocumentToFhir(FULL_DOC, undefined, patientRef);

    expect(documentReference.resourceType).toBe('DocumentReference');
    expect(binary).toBeUndefined();
  });

  test('defaults content type to application/octet-stream', () => {
    const doc: HealthieDocument = { ...FULL_DOC, file_content_type: undefined };
    const { documentReference, binary } = convertHealthieDocumentToFhir(doc, 'data', patientRef);

    expect(documentReference.content[0].attachment.contentType).toBe('application/octet-stream');
    expect(binary?.contentType).toBe('application/octet-stream');
  });

  test('uses fallback title when display_name is missing', () => {
    const doc: HealthieDocument = { ...FULL_DOC, display_name: undefined };
    const { documentReference } = convertHealthieDocumentToFhir(doc, undefined, patientRef);

    expect(documentReference.content[0].attachment.title).toBe('document-doc-1');
  });

  test('prefers description over internal_notes', () => {
    const doc: HealthieDocument = {
      ...FULL_DOC,
      description: 'Main description',
      internal_notes: 'Internal note',
    };
    const { documentReference } = convertHealthieDocumentToFhir(doc, undefined, patientRef);

    expect(documentReference.description).toBe('Main description');
  });

  test('falls back to internal_notes when no description', () => {
    const doc: HealthieDocument = {
      ...FULL_DOC,
      description: undefined,
      internal_notes: 'Internal note',
    };
    const { documentReference } = convertHealthieDocumentToFhir(doc, undefined, patientRef);

    expect(documentReference.description).toBe('Internal note');
  });

  test('omits description when both are missing', () => {
    const doc: HealthieDocument = {
      ...FULL_DOC,
      description: undefined,
      internal_notes: undefined,
    };
    const { documentReference } = convertHealthieDocumentToFhir(doc, undefined, patientRef);

    expect(documentReference.description).toBeUndefined();
  });

  test('meta tag on binary uses correct system and code format', () => {
    const doc: HealthieDocument = { ...FULL_DOC, id: 'doc-42' };
    const { binary } = convertHealthieDocumentToFhir(doc, 'data', patientRef);

    expect(binary?.meta?.tag).toEqual([{ system: HEALTHIE_DOCUMENT_ID_SYSTEM, code: 'binary-doc-42' }]);
  });
});
