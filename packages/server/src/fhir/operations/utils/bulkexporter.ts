import { Binary, Bundle, Resource } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';
import { Repository } from '../../repo';
import { PassThrough } from 'node:stream';
import { getBinaryStorage } from '../../storage';

const NDJSON_CONTENT_TYPE = 'application/fhir+ndjson';

class BulkFileWriter {
  readonly binary: Binary;
  private readonly stream: PassThrough;
  private readonly writerPromise: Promise<void>;

  constructor(binary: Binary) {
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
  readonly since: string | undefined;
  readonly writers: Record<string, BulkFileWriter> = {};
  readonly resourceSet: Set<string> = new Set();

  constructor(repo: Repository, since: string | undefined) {
    this.repo = repo;
    this.since = since;
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

  async writeBundle(bundle: Bundle): Promise<void> {
    if (bundle.entry) {
      for (const entry of bundle.entry) {
        if (entry.resource) {
          await this.writeResource(entry.resource);
        }
      }
    }
  }

  async writeResource(resource: Resource): Promise<void> {
    if (resource.resourceType === 'AuditEvent') {
      return;
    }
    if (this.since !== undefined && (resource.meta?.lastUpdated as string) < this.since) {
      return;
    }
    const ref = getReferenceString(resource);
    if (!this.resourceSet.has(ref)) {
      const writer = await this.getWriter(resource.resourceType);
      writer.write(resource);
      this.resourceSet.add(ref);
    }
  }

  async close(): Promise<void> {
    for (const writer of Object.values(this.writers)) {
      await writer.close();
    }
  }
}
