// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';

export const mockAccessSecretVersion = vi.fn();

export const SecretManagerServiceClient = vi.fn(function SecretManagerServiceClient(this: {
  accessSecretVersion: typeof mockAccessSecretVersion;
}) {
  this.accessSecretVersion = mockAccessSecretVersion;
});
