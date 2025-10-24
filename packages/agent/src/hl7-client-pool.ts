// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import { Hl7Client } from '@medplum/hl7';

export interface Hl7ClientPoolOptions {
  host: string;
  port: number;
  encoding?: string;
  keepAlive: boolean;
  maxClientsPerRemote: number;
  log: ILogger;
}

export interface PooledClient {
  client: Hl7Client;
  inUse: boolean;
}

/**
 * Manages a pool of HL7 clients for a single remote host.
 *
 * In keepAlive mode, connections are reused up to maxClientsPerRemote limit.
 * In non-keepAlive mode, tracks outstanding connections and enforces the limit.
 */
export class Hl7ClientPool {
  private readonly host: string;
  private readonly port: number;
  private readonly encoding?: string;
  private readonly keepAlive: boolean;
  private readonly maxClientsPerRemote: number;
  private readonly log: ILogger;
  private readonly clients = new Map<Hl7Client, PooledClient>();
  private readonly waitQueue: {
    resolve: (client: Hl7Client) => void;
    reject: (err: Error) => void;
  }[] = [];
  private closingPromise: Promise<void> | undefined;

  constructor(options: Hl7ClientPoolOptions) {
    this.host = options.host;
    this.port = options.port;
    this.encoding = options.encoding;
    this.keepAlive = options.keepAlive;
    this.maxClientsPerRemote = options.maxClientsPerRemote;
    this.log = options.log;
  }

  /**
   * Gets a client for sending a message.
   * In keepAlive mode, reuses or creates a connection up to the limit.
   * In non-keepAlive mode, creates a temporary connection if under the limit.
   *
   * @returns Promise that resolves with an HL7 client
   */
  async getClient(): Promise<Hl7Client> {
    if (this.closingPromise) {
      throw new Error('Cannot get new client, pool is closing');
    }
    if (this.keepAlive) {
      return this.getKeepAliveClient();
    } else {
      return this.getNonKeepAliveClient();
    }
  }

  private closeAndRemoveClient(client: Hl7Client): void {
    client.close().catch((err) => {
      this.log.error(normalizeErrorString(err));
    });
    this.removeClient(client);
  }

  /**
   * Releases a client back to the pool.
   * In keepAlive mode, marks the client as available.
   * In non-keepAlive mode, removes the client from tracking.
   *
   * @param client - The client to release.
   * @param forceClose - Optional boolean on whether to force the client to close its connect and be removed from the pool. Defaults to `false`.
   */
  releaseClient(client: Hl7Client, forceClose = false): void {
    if (!this.clients.has(client)) {
      return;
    }

    // If forcing the connection closed OR not in keepAlive mode,
    // We should close the client and remove it from the pool
    if (forceClose || !this.keepAlive) {
      this.closeAndRemoveClient(client);
    } else {
      (this.clients.get(client) as PooledClient).inUse = false;
      // Try to satisfy any waiting requests
      this.processWaitQueue();
    }
  }

  /**
   * Removes a client from the pool when it closes or errors.
   *
   * @param client - The client to remove
   */
  removeClient(client: Hl7Client): void {
    this.clients.delete(client);

    // Try to satisfy any waiting requests
    this.processWaitQueue();
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

    // Reject all waiting requests
    // We need to reject them before closing connections, otherwise we risk the closed connections opening slots for these requests
    while (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      if (waiter) {
        waiter.reject(new Error('Pool closed while waiting for available client'));
      }
    }

    const closePromises = Array.from(this.clients.keys()).map((client) => client.close());

    this.closingPromise = new Promise<void>((resolve, reject) => {
      Promise.all(closePromises)
        .then(() => resolve())
        .catch(reject);
    });

    // We wait for the closing promise to resolve
    await this.closingPromise;
    // Then we finally remove the closing promise
    this.closingPromise = undefined;
  }

  /**
   * Gets the number of clients currently in the pool.
   * @returns the number of clients in the pool.
   */
  size(): number {
    return this.clients.size;
  }

  /**
   * Gets all clients in the pool.
   * @returns An array of the raw HL7Clients.
   */
  getClients(): Hl7Client[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Gets a client for keepAlive mode.
   * Reuses an available client or creates a new one up to the limit.
   * @returns a Promise that resolves to an Hl7Client, either immediately or when the next client becomes available.
   */
  private async getKeepAliveClient(): Promise<Hl7Client> {
    // Try to find an available client
    const availableClient = Array.from(this.clients.values()).find((pc) => !pc.inUse);
    if (availableClient) {
      availableClient.inUse = true;
      return availableClient.client;
    }

    // If we're under the limit, create a new client
    if (this.clients.size < this.maxClientsPerRemote) {
      const client = this.createAndTrackClient();
      return client;
    }

    // Wait for a client to become available
    return new Promise<Hl7Client>((resolve, reject) => {
      this.waitQueue.push({ resolve, reject });
    });
  }

  /**
   * Gets a client for non-keepAlive mode.
   * Creates a temporary client if under the limit.
   * @returns a Promise that resolves to an Hl7Client, either immediately or when the next client becomes available.
   */
  private async getNonKeepAliveClient(): Promise<Hl7Client> {
    // If we're under the limit, create a new client
    if (this.clients.size < this.maxClientsPerRemote) {
      const client = this.createAndTrackClient();
      return client;
    }

    // Wait for a slot to become available
    return new Promise<Hl7Client>((resolve, reject) => {
      this.waitQueue.push({ resolve, reject });
    });
  }

  /**
   * Creates a new client and adds it to the pool.
   * @returns a new Hl7Client.
   */
  private createAndTrackClient(): Hl7Client {
    const client = new Hl7Client({
      host: this.host,
      port: this.port,
      encoding: this.encoding,
      keepAlive: this.keepAlive,
    });

    const pooledClient: PooledClient = {
      client,
      inUse: true,
    };

    this.clients.set(client, pooledClient);

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

  /**
   * Processes the wait queue by creating or assigning clients to waiting requests.
   */
  private processWaitQueue(): void {
    while (this.waitQueue.length > 0) {
      // Check if we can satisfy a waiting request
      const availableClient = Array.from(this.clients.values()).find((pc) => !pc.inUse);

      if (availableClient) {
        const waiter = this.waitQueue.shift();
        if (waiter) {
          availableClient.inUse = true;
          waiter.resolve(availableClient.client);
        }
      } else if (this.clients.size < this.maxClientsPerRemote) {
        const waiter = this.waitQueue.shift();
        if (waiter) {
          try {
            const client = this.createAndTrackClient();
            waiter.resolve(client);
          } catch (err) {
            waiter.reject(err as Error);
          }
        }
      } else {
        // No available clients and at max capacity
        break;
      }
    }
  }
}
