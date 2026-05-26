#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { MockReleasesServer } from '../backends/mock-releases';

/**
 * Container entrypoint for the `mock-releases` compose service.
 *
 * Reads server.crt / server.key from $CERT_DIR (default /certs), scans
 * $RELEASES_DIR (default /releases) on every request, and listens on $PORT
 * (default 443) over TLS. baseUrl is fixed to https://meta.medplum.com so the
 * agent's hardcoded MEDPLUM_RELEASES_URL produces matching download links —
 * the DNS alias in docker-compose makes that hostname resolve to this service.
 */
async function main(): Promise<void> {
  const certDir = process.env.CERT_DIR ?? '/certs';
  const releasesDir = process.env.RELEASES_DIR ?? '/releases';
  const port = Number(process.env.PORT ?? 443);
  const baseUrl = process.env.BASE_URL ?? 'https://meta.medplum.com';

  const server = new MockReleasesServer({
    port,
    host: '0.0.0.0',
    releasesDir,
    baseUrl,
    tls: {
      cert: readFileSync(`${certDir}/server.crt`),
      key: readFileSync(`${certDir}/server.key`),
    },
  });
  const { port: actualPort } = await server.start();
  console.log(
    `mock-releases: listening on https://0.0.0.0:${actualPort} (baseUrl=${baseUrl}, releases=${releasesDir})`
  );
  const versions = server.listVersions();
  if (versions.length === 0) {
    console.log(
      `mock-releases: no release binaries found in ${releasesDir}; drop medplum-agent-{version}-{linux|darwin} or medplum-agent-installer-{version}.exe files into the volume`
    );
  } else {
    console.log(`mock-releases: seeded versions from ${releasesDir}: ${versions.join(', ')}`);
  }

  const shutdown = async (sig: string): Promise<void> => {
    console.log(`mock-releases: received ${sig}, shutting down`);
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('mock-releases: fatal', err);
  process.exit(1);
});
