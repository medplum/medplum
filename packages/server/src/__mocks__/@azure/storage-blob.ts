// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Readable } from 'stream';

export const mockUpload = jest.fn().mockResolvedValue(undefined);
export const mockUploadStream = jest.fn().mockResolvedValue(undefined);
export const mockDownload = jest.fn();
export const mockBeginCopyFromURL = jest.fn().mockResolvedValue({ pollUntilDone: jest.fn().mockResolvedValue({}) });
export const mockGenerateUserDelegationSasUrl = jest.fn().mockReturnValue('https://example.blob.core.windows.net/container/file?sig=mockSasToken');
export const mockGetUserDelegationKey = jest.fn().mockResolvedValue({ value: 'mock-delegation-key' });

/**
 * Mock implementation of BlobSASPermissions (required for class instantiation)
 */
export const BlobSASPermissions = jest.fn().mockImplementation(() => ({
  read: false,
}));

/**
 * Minimal mock implementation of BlobServiceClient for testing.
 */
export const BlobServiceClient = jest.fn().mockImplementation(() => ({
  getUserDelegationKey: mockGetUserDelegationKey,
  getContainerClient: jest.fn().mockImplementation(() => ({
    getBlockBlobClient: jest.fn().mockImplementation(() => ({
      /**
       * Mocks the `upload` method used for uploading strings/buffers.
       * This is the method used in the bug fix for string data.
       */
      upload: mockUpload,

      /**
       * Mocks the `uploadStream` method used for uploading streams.
       * This is the method used for stream data.
       */
      uploadStream: mockUploadStream,
    })),
    getBlobClient: jest.fn().mockImplementation(() => ({
      /**
       * Mocks the `download` method used for reading blob data.
       */
      download: mockDownload,

      /**
       * Mocks the `beginCopyFromURL` method used for copying blobs.
       */
      beginCopyFromURL: mockBeginCopyFromURL,

      /**
       * Mocks the `generateUserDelegationSasUrl` method for generating presigned URLs.
       */
      generateUserDelegationSasUrl: mockGenerateUserDelegationSasUrl,

      /**
       * Mock URL property for blob client.
       */
      url: 'https://example.blob.core.windows.net/container/source-file',
    })),
  })),
}));
