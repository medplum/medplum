// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export const mockUpload = jest.fn().mockResolvedValue(undefined);
export const mockUploadStream = jest.fn().mockResolvedValue(undefined);

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
  })),
}));
