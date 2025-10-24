// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import type { Hl7Client } from '@medplum/hl7';

export interface Hl7ClientPoolOptions {
  host: string;
  port: number;
  encoding?: string;
  keepAlive: boolean;
  maxClientsPerRemote: number;
  log: ILogger;
  createClient: (options: { host: string; port: number; encoding?: string; keepAlive: boolean }) => Hl7Client;
  onEmpty?: () => void;
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
  private readonly createClient: Hl7ClientPoolOptions['createClient'];
  private readonly onEmpty?: () => void;
  private readonly clients: PooledClient[] = [];
  private readonly waitQueue: {
    resolve: (client: Hl7Client) => void;
    reject: (err: Error) => void;
  }[] = [];

  constructor(options: Hl7ClientPoolOptions) {
    this.host = options.host;
    this.port = options.port;
    this.encoding = options.encoding;
    this.keepAlive = options.keepAlive;
    this.maxClientsPerRemote = options.maxClientsPerRemote;
    this.log = options.log;
    this.createClient = options.createClient;
    this.onEmpty = options.onEmpty;
  }

  /**
   * Gets a client for sending a message.
   * In keepAlive mode, reuses or creates a connection up to the limit.
   * In non-keepAlive mode, creates a temporary connection if under the limit.
   *
   * @returns Promise that resolves with an HL7 client
   */
  async getClient(): Promise<Hl7Client> {
    if (this.keepAlive) {
      return this.getKeepAliveClient();
    } else {
      return this.getNonKeepAliveClient();
    }
  }

  /**
   * Releases a client back to the pool.
   * In keepAlive mode, marks the client as available.
   * In non-keepAlive mode, removes the client from tracking.
   *
   * @param client - The client to release
   */
  releaseClient(client: Hl7Client): void {
    const pooledClient = this.clients.find((pc) => pc.client === client);
    if (!pooledClient) {
      return;
    }

    if (this.keepAlive) {
      pooledClient.inUse = false;
      // Try to satisfy any waiting requests
      this.processWaitQueue();
    } else {
      // Remove the client from the pool
      const index = this.clients.indexOf(pooledClient);
      if (index !== -1) {
        this.clients.splice(index, 1);
      }
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
    const index = this.clients.findIndex((pc) => pc.client === client);
    if (index !== -1) {
      this.clients.splice(index, 1);
    }

    // If pool is now empty and in keepAlive mode, notify parent
    if (this.clients.length === 0 && this.keepAlive && this.onEmpty) {
      this.onEmpty();
    }

    // Try to satisfy any waiting requests
    this.processWaitQueue();
  }

  /**
   * Closes all clients in the pool.
   */
  async closeAll(): Promise<void> {
    const closePromises = this.clients.map((pc) => pc.client.close());
    this.clients.length = 0;

    // Reject all waiting requests
    while (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      if (waiter) {
        waiter.reject(new Error('Pool closed while waiting for available client'));
      }
    }

    await Promise.all(closePromises);
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
   * @returns An array of the raw HL7Clients.
   */
  getClients(): Hl7Client[] {
    return this.clients.map((pc) => pc.client);
  }

  /**
   * Gets a client for keepAlive mode.
   * Reuses an available client or creates a new one up to the limit.
   * @returns a Promise that resolves to an Hl7Client, either immediately or when the next client becomes available.
   */
  private async getKeepAliveClient(): Promise<Hl7Client> {
    // Try to find an available client
    const availableClient = this.clients.find((pc) => !pc.inUse);
    if (availableClient) {
      availableClient.inUse = true;
      return availableClient.client;
    }

    // If we're under the limit, create a new client
    if (this.clients.length < this.maxClientsPerRemote) {
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
    if (this.clients.length < this.maxClientsPerRemote) {
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
    const client = this.createClient({
      host: this.host,
      port: this.port,
      encoding: this.encoding,
      keepAlive: this.keepAlive,
    });

    const pooledClient: PooledClient = {
      client,
      inUse: true,
    };

    this.clients.push(pooledClient);

    // Set up event listeners
    client.addEventListener('close', () => {
      this.removeClient(client);
      if (this.keepAlive) {
        this.log.info(`Persistent connection closed for ${this.host}:${this.port}`);
      }
    });

    client.addEventListener('error', (event) => {
      this.removeClient(client);
      if (this.keepAlive) {
        this.log.error(`Persistent connection error for ${this.host}:${this.port}: ${event.error}`);
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
      const availableClient = this.clients.find((pc) => !pc.inUse);

      if (availableClient) {
        const waiter = this.waitQueue.shift();
        if (waiter) {
          availableClient.inUse = true;
          waiter.resolve(availableClient.client);
        }
      } else if (this.clients.length < this.maxClientsPerRemote) {
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
