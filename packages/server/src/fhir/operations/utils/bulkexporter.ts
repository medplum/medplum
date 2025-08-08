// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, WithId } from '@medplum/core';
import { AsyncJob, Binary, Bundle, Parameters, Project, Resource } from '@medplum/fhirtypes';
import { PassThrough } from 'node:stream';
import { getBinaryStorage } from '../../../storage/loader';
import { getSystemRepo, Repository } from '../../repo';

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

  write(resource: Resource): void {
    this.stream.write(JSON.stringify(resource) + '\n');
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
  readonly resourceSet = new Set<string>();

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
    const ref = getReferenceString(resource);
    if (!this.resourceSet.has(ref)) {
      const writer = await this.getWriter(resource.resourceType);
      writer.write(resource);
      this.resourceSet.add(ref);
    }
  }

  async close(project: Project): Promise<AsyncJob> {
    if (!this.resource) {
      throw new Error('Export muse be started before calling close()');
    }

    for (const writer of Object.values(this.writers)) {
      await writer.close();
    }

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
