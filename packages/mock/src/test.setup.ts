// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TextDecoder, TextEncoder } from 'node:util';

if (typeof globalThis.window !== 'undefined') {
  Object.defineProperty(globalThis.window, 'TextDecoder', { value: TextDecoder });
  Object.defineProperty(globalThis.window, 'TextEncoder', { value: TextEncoder });
}
