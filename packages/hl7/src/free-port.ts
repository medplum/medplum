// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createServer } from 'node:net';

// Every port ever handed out by `getFreePort`, so we never issue the same one twice
// within a single test process — see the comment on `getFreePort` below.
const issuedPorts = new Set<number>();

/**
 * Returns a TCP port number that is currently free, with *nothing* listening on it.
 *
 * Used only for tests that need a free port number. For tests that start an Hl7Server, prefer
 * `server.start(0)`, which returns the OS-assigned port and never has a release-then-rebind window.
 *
 * Because we close the probing server before returning, the port is freed immediately and the OS
 * may hand the *same* ephemeral port to a subsequent call. Callers that allocate two ports (e.g.
 * one per channel) would then collide. To avoid this, we remember every port we issue and keep any
 * probing server that lands on an already-issued port open until we find a fresh one, so the OS
 * can't reissue it in the same round.
 * @returns A promise that resolves with a free TCP port number.
 */
export async function getFreePort(): Promise<number> {
  const heldServers: ReturnType<typeof createServer>[] = [];
  const closeServer = async (server: ReturnType<typeof createServer>): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      const server = createServer();
      const port = await new Promise<number>((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, () => {
          resolve((server.address() as { port: number }).port);
        });
      });
      if (issuedPorts.has(port)) {
        // Keep this server listening so the OS won't hand the same port out again this round.
        heldServers.push(server);
        continue;
      }
      issuedPorts.add(port);
      await closeServer(server);
      return port;
    }
    throw new Error('Unable to find a free port after 20 attempts');
  } finally {
    await Promise.all(heldServers.map((server) => closeServer(server).catch(() => undefined)));
  }
}
