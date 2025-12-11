// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Binary } from '@medplum/fhirtypes';
import { PassThrough, Readable } from 'stream';
import {
  mockBeginCopyFromURL,
  mockDownload,
  mockGenerateUserDelegationSasUrl,
  mockGetUserDelegationKey,
  mockUpload,
  mockUploadStream,
} from '../../__mocks__/@azure/storage-blob';
import { AzureBlobStorage } from './storage';

describe('AzureBlobStorage', () => {
  const testStorageString = 'testaccount:testcontainer';
  let storage: AzureBlobStorage;

  beforeEach(() => {
    storage = new AzureBlobStorage(testStorageString);
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const testBinary: Binary = {
    id: 'test123',
    meta: { versionId: 'v1' },
    resourceType: 'Binary',
    contentType: 'text/plain',
  };

  describe('writeBinary', () => {
    test('should call upload method when writing string data', async () => {
      const content = 'Hello, world!';

      await storage.writeBinary(testBinary, 'test.txt', 'text/plain', content);

      // Verify that upload was called (for string data)
      expect(mockUpload).toHaveBeenCalledWith(
        content,
        content.length,
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({
            blobContentType: 'text/plain',
          }),
        })
      );

      // Verify that uploadStream was not called
      expect(mockUploadStream).not.toHaveBeenCalled();
    });

    test('should call uploadStream method when writing stream data', async () => {
      const content = 'Hello, world!';
      const contentStream = new PassThrough();
      contentStream.end(content);

      await storage.writeBinary(testBinary, 'test.txt', 'text/plain', contentStream);

      // Verify that uploadStream was called (for stream data)
      expect(mockUploadStream).toHaveBeenCalledWith(
        contentStream,
        undefined,
        undefined,
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({
            blobContentType: 'text/plain',
          }),
        })
      );

      // Verify that upload was not called
      expect(mockUpload).not.toHaveBeenCalled();
    });

    test('should use default content type when not provided', async () => {
      const content = 'Hello, world!';

      await storage.writeBinary(testBinary, 'test.txt', undefined, content);

      expect(mockUpload).toHaveBeenCalledWith(
        content,
        content.length,
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({
            blobContentType: 'application/octet-stream',
          }),
        })
      );
    });

    test('should set cache control headers', async () => {
      const content = 'Hello, world!';

      await storage.writeBinary(testBinary, 'test.txt', 'text/plain', content);

      expect(mockUpload).toHaveBeenCalledWith(
        content,
        content.length,
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({
            blobCacheControl: 'max-age=3600, s-maxage=86400',
          }),
        })
      );
    });
  });

  describe('readBinary', () => {
    test('should read a binary file and return a readable stream', async () => {
      const content = 'Hello, world!';
      const mockStream = new PassThrough();
      mockStream.end(content);

      mockDownload.mockResolvedValueOnce({
        readableStreamBody: mockStream,
      });

      const stream = await storage.readBinary(testBinary);

      expect(mockDownload).toHaveBeenCalled();
      expect(stream).toBeInstanceOf(Readable);

      // Verify the stream contains the expected data
      let data = '';
      for await (const chunk of stream) {
        data += chunk;
      }
      expect(data).toEqual(content);
    });
  });

  describe('copyBinary', () => {
    test('should copy a binary file from source to destination', async () => {
      const destinationBinary: Binary = {
        id: 'test456',
        meta: { versionId: 'v2' },
        resourceType: 'Binary',
        contentType: 'text/plain',
      };

      await storage.copyBinary(testBinary, destinationBinary);

      expect(mockBeginCopyFromURL).toHaveBeenCalledWith(
        'https://example.blob.core.windows.net/container/source-file'
      );
    });
  });

  describe('getPresignedUrl', () => {
    test('should generate a presigned URL with user delegation key', async () => {
      const url = await storage.getPresignedUrl(testBinary);

      expect(mockGetUserDelegationKey).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date)
      );
      expect(mockGenerateUserDelegationSasUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresOn: expect.any(Date),
          permissions: expect.objectContaining({ read: true }),
        }),
        { value: 'mock-delegation-key' }
      );
      expect(url).toContain('https://');
      expect(url).toContain('sig=mockSasToken');
    });

    test('should set URL expiry to 1 hour', async () => {
      const before = new Date();

      await storage.getPresignedUrl(testBinary);

      const after = new Date();

      // Get the actual call arguments
      const generateUrlCall = mockGenerateUserDelegationSasUrl.mock.calls[0];
      const expiresOn = generateUrlCall[0].expiresOn as Date;

      // Verify the expiry is approximately 1 hour from now (within 2 seconds tolerance)
      const expectedExpiry = new Date(before.getTime() + 60 * 60 * 1000);
      const timeDiff = Math.abs(expiresOn.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(2000); // 2 seconds tolerance

      // Verify delegation key expiry is also approximately 1 hour
      const delegationKeyCall = mockGetUserDelegationKey.mock.calls[0];
      const delegationExpiry = delegationKeyCall[1] as Date;
      const delegationTimeDiff = Math.abs(delegationExpiry.getTime() - expectedExpiry.getTime());
      expect(delegationTimeDiff).toBeLessThan(2000); // 2 seconds tolerance
    });

    test('should set read permissions on the SAS URL', async () => {
      await storage.getPresignedUrl(testBinary);

      expect(mockGenerateUserDelegationSasUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: expect.objectContaining({ read: true }),
        }),
        expect.anything()
      );
    });
  });
});
