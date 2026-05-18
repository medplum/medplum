// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Harness used by index.test.ts to exercise the uncaughtException handler
// installed by `main()` in index.ts in a real child process.
import { main } from './index';

const configName = process.argv[2] ?? 'file:does-not-exist.config.json';
const errorMessage = process.argv[3] ?? 'kaboom';
const floodCount = Number.parseInt(process.argv[4] ?? '0', 10);

// Calling main() synchronously registers the unhandledRejection /
// uncaughtException listeners before its first await. We pass a bogus
// config name so it rejects on loadConfig before booting the server, and
// swallow that rejection here. Then we trigger an uncaught exception so
// the listener installed by main() handles it for real.
main(configName).catch(() => {
  setImmediate(() => {
    for (let i = 0; i < floodCount; i++) {
      process.stdout.write(`flood-${i}\n`);
    }
    throw new Error(errorMessage);
  });
});
