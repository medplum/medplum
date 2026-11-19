// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import net from 'node:net';
import pg from 'pg';
import { loadTestConfig } from './config/loader';

// Setup file for the unit test project only. A test that connects to Postgres or Redis but is not
// named *.int.test.ts would otherwise pass locally while racing the integration suite.
function unitTestError(service: string): Error {
  return new Error(`${service} used in a unit test. Tests that need Postgres/Redis must be named *.int.test.ts`);
}

// Block at the socket level so every client library is caught (pg, ioredis, Cluster, raw net)
// Ports come from loadTestConfig() so they match whatever the integration tests would connect to.
const config = await loadTestConfig();
const blockedPorts = new Map<number, string>([
  [config.database.port ?? 5432, 'Postgres'],
  [config.redis.port ?? 6379, 'Redis'],
]);
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  // net.connect() passes [options, callback] as a single normalized array
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const port = Number(typeof first === 'object' && first ? (first as net.TcpNetConnectOpts).port : first);
  const service = blockedPorts.get(port);
  if (service) {
    throw unitTestError(service);
  }
  return originalConnect.apply(this, args as Parameters<typeof originalConnect>);
};

// pg queues queries on a client that was never connected, so they hang instead of opening a socket
pg.Client.prototype.query = function () {
  throw unitTestError('Postgres');
};
