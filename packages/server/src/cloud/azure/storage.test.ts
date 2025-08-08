// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Binary } from '@medplum/fhirtypes';
import { PassThrough } from 'stream';
import { mockUpload, mockUploadStream } from '../../__mocks__/@azure/storage-blob';
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
});
