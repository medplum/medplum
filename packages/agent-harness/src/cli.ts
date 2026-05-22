#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HarnessHttpServer } from './server/http-server';

async function main(): Promise<void> {
  const port = Number(process.env.HARNESS_PORT ?? 7681);
  const server = new HarnessHttpServer();
  const bound = await server.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[agent-harness] control plane listening on http://127.0.0.1:${bound}`);

  const shutdown = async (): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log('[agent-harness] shutting down...');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[agent-harness] fatal:', err);
  process.exit(1);
});
