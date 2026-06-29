// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MemoryStorage } from '@medplum/core';

function installInMemoryWebStorage(name: 'localStorage' | 'sessionStorage'): void {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, { value: storage, configurable: true });
  if (typeof globalThis.window !== 'undefined') {
    Object.defineProperty(globalThis.window, name, { value: storage, configurable: true });
  }
}

// Node 24+ defines Web Storage globals on `globalThis`. That is intentional — `localStorage` in Node
// requires `--localstorage-file` to be fully available — but in tests those globals can shadow jsdom's
// implementations. Tests that call `localStorage.clear()` directly or expect browser-like isolation
// between runs need a predictable in-memory implementation on both `globalThis` and `window`.
installInMemoryWebStorage('localStorage');
installInMemoryWebStorage('sessionStorage');
