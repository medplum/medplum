// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';

export const KubeConfig = vi.fn().mockImplementation(() => ({
  loadFromDefault: vi.fn(),
  makeApiClient: vi.fn().mockReturnValue({
    createNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
  }),
}));

export const CustomObjectsApi = vi.fn().mockImplementation(() => ({
  createNamespacedCustomObject: vi.fn().mockResolvedValue({}),
  patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
}));

export const PatchStrategy = {
  ServerSideApply: 'patch-apply',
};

export const setHeaderOptions = vi.fn().mockReturnValue({});
