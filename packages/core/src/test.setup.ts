// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TextDecoder, TextEncoder } from 'node:util';
import { MemoryStorage } from './storage';

Object.defineProperty(globalThis.window, 'sessionStorage', { value: new MemoryStorage() });
Object.defineProperty(globalThis.window, 'TextDecoder', { value: TextDecoder });
Object.defineProperty(globalThis.window, 'TextEncoder', { value: TextEncoder });
