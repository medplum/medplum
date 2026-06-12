// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';

export const mockUpload = vi.fn().mockResolvedValue(undefined);
export const mockUploadStream = vi.fn().mockResolvedValue(undefined);
export const mockDownload = vi.fn();
export const mockBeginCopyFromURL = vi.fn().mockResolvedValue({ pollUntilDone: vi.fn().mockResolvedValue({}) });
export const mockGenerateUserDelegationSasUrl = vi
  .fn()
  .mockReturnValue('https://example.blob.core.windows.net/container/file?sig=mockSasToken');
export const mockGetUserDelegationKey = vi.fn().mockResolvedValue({ value: 'mock-delegation-key' });

/**
 * Mock implementation of BlobSASPermissions (required for class instantiation)
 */
export const BlobSASPermissions = vi.fn(function () {
  return {
    read: false,
  };
});

/**
 * Minimal mock implementation of BlobServiceClient for testing.
 */
export const BlobServiceClient = vi.fn(function () {
  return {
    getUserDelegationKey: mockGetUserDelegationKey,
    getContainerClient: vi.fn().mockImplementation(() => ({
      getBlockBlobClient: vi.fn().mockImplementation(() => ({
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
      getBlobClient: vi.fn().mockImplementation(() => ({
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
  };
});
