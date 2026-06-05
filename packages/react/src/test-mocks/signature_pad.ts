// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Vitest stub for the `signature_pad` package (see vite.config.ts resolve.alias).
 * SignatureInput uses signature_pad to draw on a canvas; jsdom has no real canvas
 * drawing, so tests import this mock instead of the library. The constructor and
 * instance methods mirror what SignatureInput calls so tests can assert setup and
 * simulate strokes by invoking the handler passed to addEventListener('endStroke').
 */
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
