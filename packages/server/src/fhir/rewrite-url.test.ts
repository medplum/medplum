// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Practitioner } from '@medplum/fhirtypes';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Repository } from './repo';
import { RewriteMode, normalizeBinaryUrl, rewriteAttachments } from './rewrite';

vi.mock('../config/loader', () => ({
  getConfig: () => ({
    baseUrl: 'https://fhir.example.com/',
    storageBaseUrl: 'https://storage.example.com/binary',
  }),
}));

// Keep this unit test self-contained: REFERENCE mode never touches the
// logger or the storage layer, but importing rewrite.ts pulls them in.
vi.mock('../logger', () => ({
  getLogger: () => ({ debug: () => undefined }),
}));
vi.mock('../storage/loader', () => ({
  getPresignedUrl: async () => 'https://storage.example.com/binary/123/456?Signature=mock',
}));

describe('normalizeBinaryUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('FHIR reference string', () => {
    expect(normalizeBinaryUrl('Binary/123')).toStrictEqual({ id: '123' });
  });

  test('FHIR reference string with version', () => {
    expect(normalizeBinaryUrl('Binary/123/_history/456')).toStrictEqual({ id: '123', versionId: '456' });
  });

  test('FHIR API URL', () => {
    expect(normalizeBinaryUrl('https://fhir.example.com/fhir/R4/Binary/123')).toStrictEqual({ id: '123' });
  });

  test('FHIR API URL with version', () => {
    expect(normalizeBinaryUrl('https://fhir.example.com/fhir/R4/Binary/123/_history/456')).toStrictEqual({
      id: '123',
      versionId: '456',
    });
  });

  test('Presigned storage URL preserves the version', () => {
    // Regression test: the two-part storage form must keep its version,
    // and the signature query string must be stripped.
    expect(
      normalizeBinaryUrl('https://storage.example.com/binary/123/456?Expires=1726700000&Signature=abc123')
    ).toStrictEqual({ id: '123', versionId: '456' });
  });

  test('Non-binary URL', () => {
    expect(normalizeBinaryUrl('https://example.com/profile/123/picture.jpg')).toStrictEqual({});
  });
});

describe('rewriteAttachments in REFERENCE mode', () => {
  // REFERENCE mode performs no access checks, so no repository is needed.
  const repo = {} as unknown as Repository;

  test('Preserves the version of a version-pinned reference', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [{ contentType: 'image/jpeg', url: 'Binary/123/_history/456' }],
    };

    const result = await rewriteAttachments(RewriteMode.REFERENCE, repo, practitioner);
    expect(result.photo?.[0]?.url).toBe('Binary/123/_history/456');
  });

  test('Leaves an unversioned reference unchanged', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [{ contentType: 'image/jpeg', url: 'Binary/123' }],
    };

    const result = await rewriteAttachments(RewriteMode.REFERENCE, repo, practitioner);
    expect(result.photo?.[0]?.url).toBe('Binary/123');
  });

  test('Round-trips a presigned storage URL back to a versioned reference', async () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      photo: [
        {
          contentType: 'image/jpeg',
          url: 'https://storage.example.com/binary/123/456?Expires=1726700000&Signature=abc123',
        },
      ],
    };

    const result = await rewriteAttachments(RewriteMode.REFERENCE, repo, practitioner);
    expect(result.photo?.[0]?.url).toBe('Binary/123/_history/456');
  });
});
