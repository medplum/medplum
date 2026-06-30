// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { EMPTY, getReferenceString } from '@medplum/core';
import type { AsyncJob, Binary, Bundle, Parameters, Project, Resource } from '@medplum/fhirtypes';
import { PassThrough } from 'node:stream';
import { getBinaryStorage } from '../../../storage/loader';
import type { Repository } from '../../repo';

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
    // $export is a read operation, but it creates an AsyncJob to track itself. That write must
    // not require the caller to have write access -- a read-only scope (e.g. system/*.read) is
    // sufficient -- so create it with the system repo. Replicate the scoping the caller's own
    // repo would have applied: their project (so they can read it back) and their access-policy
    // compartment as the account (so a policy that filters AsyncJob by _compartment still
    // matches it -- the poll in job.ts / bulkdata.ts reads through the caller's repo).
    const accountCompartment = this.repo.effectiveAccessPolicy()?.compartment;
    this.resource = await this.repo.getSystemRepo().createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'active',
      request: url,
      requestTime: new Date().toISOString(),
      meta: {
        project: this.repo.currentProject()?.id,
        accounts: accountCompartment ? [accountCompartment] : undefined,
      },
    });
    return this.resource;
  }

  async getWriter(resourceType: string): Promise<BulkFileWriter> {
    let writer = this.writers[resourceType];
    if (!writer) {
      // Like the AsyncJob, the output Binary is bookkeeping for a read operation, so create it
      // with the system repo (scoped to the caller's project + account compartment so they can
      // presign/download it). The exported data was already access-checked when read.
      const accountCompartment = this.repo.effectiveAccessPolicy()?.compartment;
      const binary = await this.repo.getSystemRepo().createResource<Binary>({
        resourceType: 'Binary',
        contentType: NDJSON_CONTENT_TYPE,
        meta: {
          project: this.repo.currentProject()?.id,
          accounts: accountCompartment ? [accountCompartment] : undefined,
        },
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
    for (const entry of bundle.entry ?? EMPTY) {
      if (entry.resource) {
        await this.writeResource(entry.resource);
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
    const systemRepo = this.repo.getSystemRepo();
    const asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', this.resource.id);
    if (asyncJob.status !== 'cancelled') {
      return systemRepo.updateResource<AsyncJob>({
        ...this.resource,
        meta: {
          project: project.id,
          // Preserve the account compartment assigned at start() so a caller whose access
          // policy filters AsyncJob by _compartment can still read the completed job.
          accounts: this.resource.meta?.accounts,
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
