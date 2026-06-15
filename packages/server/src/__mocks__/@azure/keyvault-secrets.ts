// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';

export const mockGetSecret = vi.fn();

/**
 * Mock implementation of SecretClient for testing Azure Key Vault operations.
 */
export const SecretClient = vi.fn(function SecretClient(this: { getSecret: typeof mockGetSecret }) {
  this.getSecret = mockGetSecret;
});
