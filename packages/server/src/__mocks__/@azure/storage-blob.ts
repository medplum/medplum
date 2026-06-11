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

const mockContainerClient = {
  getBlockBlobClient: vi.fn().mockReturnValue({
    upload: mockUpload,
    uploadStream: mockUploadStream,
  }),
  getBlobClient: vi.fn().mockReturnValue({
    download: mockDownload,
    beginCopyFromURL: mockBeginCopyFromURL,
    generateUserDelegationSasUrl: mockGenerateUserDelegationSasUrl,
    url: 'https://example.blob.core.windows.net/container/source-file',
  }),
};

/**
 * Mock implementation of BlobSASPermissions (required for class instantiation)
 */
export const BlobSASPermissions = vi.fn(function BlobSASPermissions(this: { read: boolean }) {
  this.read = false;
});

/**
 * Minimal mock implementation of BlobServiceClient for testing.
 */
export const BlobServiceClient = vi.fn(function BlobServiceClient(this: {
  getUserDelegationKey: typeof mockGetUserDelegationKey;
  getContainerClient: ReturnType<typeof vi.fn>;
}) {
  this.getUserDelegationKey = mockGetUserDelegationKey;
  this.getContainerClient = vi.fn().mockReturnValue(mockContainerClient);
});
