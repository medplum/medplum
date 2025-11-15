// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import { DEFAULT_ENCODING } from '@medplum/hl7';
import { CLIENT_RELEASE_COUNTDOWN_MS } from './constants';
import { EnhancedHl7Client } from './enhanced-hl7-client';
import type { HeartbeatEmitter } from './types';

export interface Hl7ClientPoolOptions {
  host: string;
  port: number;
  encoding?: string;
  keepAlive: boolean;
  maxClients: number;
  log: ILogger;
  heartbeatEmitter: HeartbeatEmitter;
}

/**
 * Manages a pool of HL7 clients for a single remote host.
 *
 * In keepAlive mode, connections are reused up to maxClients limit.
 * In non-keepAlive mode, tracks outstanding connections and enforces the limit.
 */
export class Hl7ClientPool {
  private readonly host: string;
  private readonly port: number;
  private readonly encoding?: string;
  private readonly keepAlive: boolean;
  private maxClients: number;
  private readonly log: ILogger;
  private readonly clients: EnhancedHl7Client[] = [];
  private readonly lastUsedTimestamps = new WeakMap<EnhancedHl7Client, number>(); // WeakMap allows entries to be GC'd once key gets GC'd
  private closingPromise: Promise<void> | undefined;
  private nextClientIdx: number = 0;
  private heartbeatEmitter: HeartbeatEmitter;
  private trackingStats = false;
  private gcListener: (() => void) | undefined;

  constructor(options: Hl7ClientPoolOptions) {
    this.host = options.host;
    this.port = options.port;
    this.encoding = options.encoding;
    this.keepAlive = options.keepAlive;
    this.maxClients = options.maxClients;
    this.log = options.log;
    this.heartbeatEmitter = options.heartbeatEmitter;

    this.startAutoClientGc();
  }

  /**
   * Gets a client for sending a message.
   * In keepAlive mode, reuses or creates a connection up to the limit.
   * In non-keepAlive mode, creates a temporary connection if under the limit.
   *
   * @returns Promise that resolves with an HL7 client
   */
  getClient(): EnhancedHl7Client {
    if (this.closingPromise) {
      throw new Error('Cannot get new client, pool is closed');
    }
    return this.getNextClient();
  }

  private closeAndRemoveClient(client: EnhancedHl7Client): void {
    this.log.info(
      `Closing client for remote 'mllp://${client.host}:${client.port}?encoding=${client.encoding ?? DEFAULT_ENCODING}' and removing it from the pool...`
    );
    this.removeClient(client);
    client.close().catch((err: Error) => {
      this.log.error('Error while closing and removing client', err);
    });
  }

  /**
   * Releases a client back to the pool.
   * In keepAlive mode, marks the client as available.
   * In non-keepAlive mode, removes the client from tracking.
   *
   * @param client - The client to release.
   * @param forceClose - Optional boolean on whether to force the client to close its connect and be removed from the pool. Defaults to `false`.
   */
  releaseClient(client: EnhancedHl7Client, forceClose = false): void {
    // If forcing the connection closed
    // Or if keepAlive is off and connection is undefined
    // We should close the client and remove it from the pool immediately
    if (forceClose || (!this.keepAlive && client.connection === undefined)) {
      this.closeAndRemoveClient(client);
      return;
    }

    // We should track the last used time for non-keepAlive clients
    if (!this.keepAlive) {
      this.lastUsedTimestamps.set(client, Date.now());
    }
  }

  private runClientGc(): void {
    for (const client of this.clients) {
      // If the last time the client was used was more than CLIENT_RELEASE_COUNTDOWN_MS milliseconds ago, call closeAndRemoveClient
      if ((this.lastUsedTimestamps.get(client) as number) + CLIENT_RELEASE_COUNTDOWN_MS <= Date.now()) {
        this.closeAndRemoveClient(client);
      }
    }
  }

  /**
   * Starts the automatic Hl7Client garbage collection, when not in `keepAlive` mode.
   *
   * Clients that have not been used in `CLIENT_RELEASE_COUNTDOWN_MS` milliseconds (10 secs) are closed automatically.
   */
  startAutoClientGc(): void {
    if (this.gcListener || this.keepAlive) {
      return;
    }
    const gcListener = (): void => {
      this.runClientGc();
    };
    this.heartbeatEmitter.addEventListener('heartbeat', gcListener);
    this.gcListener = gcListener;
  }

  /**
   * Stops the automatic Hl7Client garbage collection.
   *
   * No-ops when GC is not active or if the pool is in `keepAlive` mode.
   */
  stopAutoClientGc(): void {
    if (!this.gcListener) {
      return;
    }
    this.heartbeatEmitter.removeEventListener('heartbeat', this.gcListener);
    this.gcListener = undefined;
  }

  /**
   * Removes a client from the pool when it closes or errors.
   *
   * @param client - The client to remove
   */
  removeClient(client: EnhancedHl7Client): void {
    const clientIdx = this.clients.indexOf(client);
    if (clientIdx === -1) {
      return;
    }
    this.clients.splice(clientIdx, 1);
  }

  /**
   * Closes all clients in the pool.
   */
  async closeAll(): Promise<void> {
    // If we are already closing the pool, return the existing closing promise
    if (this.closingPromise) {
      await this.closingPromise;
      return;
    }

    this.stopAutoClientGc();

    const closePromises = this.clients.map((client) => client.close());

    this.closingPromise = new Promise<void>((resolve, reject) => {
      Promise.all(closePromises)
        .then(() => resolve())
        .catch(reject);
    });

    // Remove any clients that didn't get cleaned up by close listener
    // This is especially for when this method is called in the same tick as a client is created
    for (const client of this.clients) {
      this.removeClient(client);
    }

    // We wait for the closing promise to resolve
    await this.closingPromise;
  }

  /**
   * Gets the number of clients currently in the pool.
   * @returns the number of clients in the pool.
   */
  size(): number {
    return this.clients.length;
  }

  /**
   * Gets all clients in the pool.
   * @returns An array of the raw `EnhancedHl7Client`s.
   */
  getClients(): EnhancedHl7Client[] {
    return this.clients;
  }

  /**
   * Gets a client for keepAlive mode.
   * Reuses an available client or creates a new one up to the limit.
   * @returns An `EnhancedHl7Client`.
   */
  private getNextClient(): EnhancedHl7Client {
    // If we're under the limit, create a new client
    if (this.clients.length < this.maxClients) {
      const client = this.createAndTrackClient();
      return client;
    }

    // If we can't create a new client, try to get the next one
    // We use a naive round-robin strategy for getting the next client
    const client = this.clients[this.nextClientIdx];
    this.nextClientIdx = (this.nextClientIdx + 1) % this.clients.length;
    return client;
  }

  /**
   * Creates a new client and adds it to the pool.
   * @returns a new `EnhancedHl7Client`.
   */
  private createAndTrackClient(): EnhancedHl7Client {
    const client = new EnhancedHl7Client({
      host: this.host,
      port: this.port,
      encoding: this.encoding,
      keepAlive: this.keepAlive,
      log: this.log,
    });

    // If GC is running, we should add the current timestamp as last used for this client
    if (this.gcListener) {
      this.lastUsedTimestamps.set(client, Date.now());
    }

    if (this.trackingStats) {
      client.startTrackingStats({ heartbeatEmitter: this.heartbeatEmitter });
    }

    this.clients.push(client);

    // Set up event listeners
    client.addEventListener('close', () => {
      this.removeClient(client);
      if (this.keepAlive) {
        this.log.info(`Persistent connection to remote 'mllp://${this.host}:${this.port}' closed`);
      }
    });

    client.addEventListener('error', (event) => {
      this.closeAndRemoveClient(client);
      if (this.keepAlive) {
        this.log.error(
          `Persistent connection to remote 'mllp://${this.host}:${this.port}' encountered error: '${normalizeErrorString(event.error)}' - Closing connection...`
        );
      }
    });

    return client;
  }

  setMaxClients(maxClients: number): void {
    this.maxClients = maxClients;
  }

  getMaxClients(): number {
    return this.maxClients;
  }

  startTrackingStats(): void {
    this.trackingStats = true;
    for (const client of this.clients) {
      client.startTrackingStats({ heartbeatEmitter: this.heartbeatEmitter });
    }
  }

  stopTrackingStats(): void {
    this.trackingStats = false;
    for (const client of this.clients) {
      client.stopTrackingStats();
    }
  }

  isTrackingStats(): boolean {
    return this.trackingStats;
  }
}
