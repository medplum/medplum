// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';

const SignaturePad = vi.fn(function () {
  return {
    fromDataURL: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    toDataURL: vi.fn(() => 'data:image/png;base64,signature-data'),
  };
});

export default SignaturePad;
