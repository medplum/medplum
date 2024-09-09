import { getReferenceString } from '@medplum/core';
import { Binary, BulkDataExport, Bundle, Project, Resource, ResourceType } from '@medplum/fhirtypes';
import { PassThrough } from 'node:stream';
import { Repository, getSystemRepo } from '../../repo';
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
  readonly types: string[];
  private resource: BulkDataExport | undefined;
  readonly writers: Record<string, BulkFileWriter> = {};
  readonly resourceSet = new Set<string>();

  constructor(repo: Repository, since: string | undefined, types: string[] = []) {
    this.repo = repo;
    this.since = since;
    this.types = types;
  }

  async start(url: string): Promise<BulkDataExport> {
    this.resource = await this.repo.createResource<BulkDataExport>({
      resourceType: 'BulkDataExport',
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
    if (this.types.length > 0 && !this.types.includes(resource.resourceType)) {
      return;
    }
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

  async close(project: Project): Promise<BulkDataExport> {
    if (!this.resource) {
      throw new Error('Export muse be started before calling close()');
    }

    for (const writer of Object.values(this.writers)) {
      await writer.close();
    }

    // Update the BulkDataExport
    const systemRepo = getSystemRepo();
    return systemRepo.updateResource<BulkDataExport>({
      ...this.resource,
      meta: {
        project: project.id,
      },
      status: 'completed',
      transactionTime: new Date().toISOString(),
      output: Object.entries(this.writers).map(([resourceType, writer]) => ({
        type: resourceType as ResourceType,
        url: getReferenceString(writer.binary),
      })),
    });
  }
}
