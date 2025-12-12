// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export const mockGetSecret = jest.fn();

/**
 * Mock implementation of SecretClient for testing Azure Key Vault operations.
 */
export const SecretClient = jest.fn().mockImplementation(() => ({
  getSecret: mockGetSecret,
}));
