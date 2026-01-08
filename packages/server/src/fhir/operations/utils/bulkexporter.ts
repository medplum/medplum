// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { AsyncJob, Binary, Bundle, Parameters, Project, Resource } from '@medplum/fhirtypes';
import { PassThrough } from 'node:stream';
import { getBinaryStorage } from '../../../storage/loader';
import type { Repository } from '../../repo';
import { getSystemRepo } from '../../repo';

const NDJSON_CONTENT_TYPE = 'application/fhir+ndjson';

class BulkFileWriter {
  readonly binary: WithId<Binary>;
  private readonly stream: PassThrough;
  private readonly writerPromise: Promise<void>;

  constructor(binary: WithId<Binary>) {
    this.binary = binary;

    const filename = `export.ndjson`;
    this.stream = new PassThrough();
    this.writerPromise = getBinaryStorage().writeBinary(binary, filename, NDJSON_CONTENT_TYPE, this.stream);
  }

  async write(resource: Resource): Promise<void> {
    const data = JSON.stringify(resource) + '\n';
    // Handle backpressure - if write buffer is full, wait for drain
    if (!this.stream.write(data)) {
      await new Promise<void>((resolve, reject) => {
        this.stream.once('drain', () => resolve());
        this.stream.once('error', (err) => reject(err));
      });
    }
  }

  close(): Promise<void> {
    this.stream.end();
    return this.writerPromise;
  }
}

export class BulkExporter {
  readonly repo: Repository;
  private resource: WithId<AsyncJob> | undefined;
  readonly writers: Record<string, BulkFileWriter> = {};
  readonly resourceSets = new Map<string, Set<string>>();

  constructor(repo: Repository) {
    this.repo = repo;
  }

  async start(url: string): Promise<WithId<AsyncJob>> {
    this.resource = await this.repo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'active',
      request: url,
      requestTime: new Date().toISOString(),
    });
    return this.resource;
  }

  async getWriter(resourceType: string): Promise<BulkFileWriter> {
    let writer = this.writers[resourceType];
    if (!writer) {
      const binary = await this.repo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: NDJSON_CONTENT_TYPE,
      });
      writer = new BulkFileWriter(binary);
      this.writers[resourceType] = writer;
    }
    return writer;
  }

  async closeWriter(resourceType: string): Promise<void> {
    const writer = this.writers[resourceType];
    if (writer) {
      await writer.close();
      // Keep reference for formatOutput(), but free the stream resources
    }

    // Clear tracking for this resource type to free memory
    this.resourceSets.delete(resourceType);
  }

  async writeBundle(bundle: Bundle<WithId<Resource>>): Promise<void> {
    if (bundle.entry) {
      for (const entry of bundle.entry) {
        if (entry.resource) {
          await this.writeResource(entry.resource);
        }
      }
    }
  }

  async writeResource(resource: WithId<Resource>): Promise<void> {
    const resourceType = resource.resourceType;
    const ref = getReferenceString(resource);

    // Get or create the Set for this resource type
    let exportedResources = this.resourceSets.get(resourceType);
    if (!exportedResources) {
      exportedResources = new Set<string>();
      this.resourceSets.set(resourceType, exportedResources);
    }

    // Only write if not already tracked
    if (!exportedResources.has(ref)) {
      const writer = await this.getWriter(resourceType);
      await writer.write(resource);
      exportedResources.add(ref);
    }
  }

  async close(project: Project): Promise<AsyncJob> {
    if (!this.resource) {
      throw new Error('Export must be started before calling close()');
    }

    for (const writer of Object.values(this.writers)) {
      await writer.close();
    }

    // Clear remaining tracked resources to free memory immediately
    this.resourceSets.clear();

    // Update the AsyncJob
    const systemRepo = getSystemRepo();
    const asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', this.resource.id);
    if (asyncJob.status !== 'cancelled') {
      return systemRepo.updateResource<AsyncJob>({
        ...this.resource,
        meta: {
          project: project.id,
        },
        status: 'completed',
        transactionTime: new Date().toISOString(),
        output: this.formatOutput(),
      });
    }
    return this.resource;
  }

  formatOutput(): Parameters {
    return {
      resourceType: 'Parameters',
      parameter: Object.entries(this.writers).map(([resourceType, writer]) => ({
        name: 'output',
        part: [
          { name: 'type', valueCode: resourceType },
          { name: 'url', valueUri: getReferenceString(writer.binary) },
        ],
      })),
    };
  }
}
