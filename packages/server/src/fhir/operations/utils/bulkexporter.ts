// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  AccessPolicyInteraction,
  EMPTY,
  getReferenceString,
  getResourceTypes,
  Operator,
  parseReference,
  protectedResourceTypes,
} from '@medplum/core';
import type {
  AsyncJob,
  Binary,
  Bundle,
  Group,
  Parameters,
  Patient,
  Project,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { getLogger } from '../../../logger';
import { getBinaryStorage } from '../../../storage/loader';
import { getPatientResourceTypes } from '../../patient';
import type { Repository } from '../../repo';
import type { PatientEverythingParameters } from '../patienteverything';
import { getPatientEverything } from '../patienteverything';

const NDJSON_CONTENT_TYPE = 'application/fhir+ndjson';

class BulkFileWriter {
  readonly binary: WithId<Binary>;
  private readonly stream: PassThrough;
  private readonly writerPromise: Promise<void>;

  constructor(binary: WithId<Binary>) {
    this.binary = binary;

    const filename = `export.ndjson`;
    this.stream = new PassThrough();
    // Storage may attach its pipeline asynchronously; abort must be safe before then.
    this.stream.on('error', () => {});
    this.writerPromise = getBinaryStorage().writeBinary(binary, filename, NDJSON_CONTENT_TYPE, this.stream);
    // Observe early upload failures even before close() awaits the result.
    this.writerPromise.catch((err) => this.stream.destroy(err));
  }

  async write(resource: Resource): Promise<void> {
    if (this.stream.errored) {
      throw this.stream.errored;
    }
    const data = JSON.stringify(resource) + '\n';
    // Handle backpressure - if write buffer is full, wait for drain
    if (!this.stream.write(data)) {
      await once(this.stream, 'drain');
    }
  }

  async abort(): Promise<void> {
    this.stream.destroy(new Error('Export attempt interrupted'));
    await this.writerPromise.catch(() => {});
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

  private readonly checkInterrupted?: () => Promise<void>;

  constructor(repo: Repository, resource?: WithId<AsyncJob>, checkInterrupted?: () => Promise<void>) {
    this.repo = repo;
    this.resource = resource;
    this.checkInterrupted = checkInterrupted;
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
      if (!this.resource) {
        throw new Error('Export must be started before writing output');
      }
      // Like the AsyncJob, the output Binary is bookkeeping for a read operation, so create it
      // with the system repo (scoped to the caller's project + account compartment so they can
      // presign/download it). The exported data was already access-checked when read.
      const accountCompartment = this.repo.effectiveAccessPolicy()?.compartment;
      const binary = await this.repo.getSystemRepo().createResource<Binary>({
        resourceType: 'Binary',
        contentType: NDJSON_CONTENT_TYPE,
        // Bind export output Binary authorization to the export job context.
        // Binary read/presign paths must be able to read this reference.
        securityContext: {
          reference: getReferenceString(this.resource),
        },
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

  async writeResource(resource: WithId<Resource>, options?: { skipDedupe?: boolean }): Promise<void> {
    await this.checkInterrupted?.();
    const resourceType = resource.resourceType;
    if (options?.skipDedupe) {
      const writer = await this.getWriter(resourceType);
      await writer.write(resource);
      return;
    }

    let exportedIds = this.resourceSets.get(resourceType);
    if (!exportedIds) {
      exportedIds = new Set<string>();
      this.resourceSets.set(resourceType, exportedIds);
    }

    if (!exportedIds.has(resource.id)) {
      const writer = await this.getWriter(resourceType);
      await writer.write(resource);
      exportedIds.add(resource.id);
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
    await this.checkInterrupted?.();
    if (asyncJob.status === 'active' || asyncJob.status === 'accepted') {
      return systemRepo.updateResource<AsyncJob>(
        {
          ...asyncJob,
          meta: {
            project: project.id,
            // Preserve the account compartment assigned at start() so a caller whose access
            // policy filters AsyncJob by _compartment can still read the completed job.
            accounts: this.resource.meta?.accounts,
          },
          status: 'completed',
          transactionTime: new Date().toISOString(),
          output: this.formatOutput(),
        },
        { ifMatch: asyncJob.meta?.versionId }
      );
    }
    return asyncJob;
  }

  /** Stops open streams when an attempt is interrupted. */
  async abort(): Promise<void> {
    await Promise.all(Object.values(this.writers).map((writer) => writer.abort()));
    this.resourceSets.clear();
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

export async function exportResources(
  exporter: BulkExporter,
  project: Project,
  types: string[] | undefined,
  exportLevel: string,
  since?: string
): Promise<void> {
  const resourceTypes = getResourceTypesByExportLevel(exportLevel);
  const pageSize = 1000;

  for (const resourceType of resourceTypes) {
    if (
      !canBeExported(resourceType) ||
      (types && !types.includes(resourceType)) ||
      !exporter.repo.supportsInteraction(AccessPolicyInteraction.SEARCH, resourceType)
    ) {
      continue;
    }
    await exportResourceType(exporter, resourceType, pageSize, since);
  }

  // Close the exporter
  await exporter.close(project);
}

export async function exportResourceType<T extends Resource>(
  exporter: BulkExporter,
  resourceType: T['resourceType'],
  count: number,
  since?: string
): Promise<void> {
  const repo = exporter.repo;
  const searchRequest: SearchRequest<T> | undefined = {
    resourceType,
    count,
    filters: since ? [{ code: '_lastUpdated', operator: Operator.GREATER_THAN_OR_EQUALS, value: since }] : undefined,
    sortRules: [{ code: '_lastUpdated', descending: false }],
  };
  await repo.processAllResources(searchRequest, async (resource) => {
    // Cursor pagination yields each resource exactly once, so skip the exporter's dedupe tracking
    await exporter.writeResource(resource, { skipDedupe: true });
  });

  // Close writer and free memory for this resource type immediately
  await exporter.closeWriter(resourceType);
}

function getResourceTypesByExportLevel(exportLevel: string): ResourceType[] {
  if (exportLevel === 'Patient') {
    return getPatientResourceTypes();
  }

  return getResourceTypes();
}

const unexportedResourceTypes = new Set([
  'Binary',
  'CodeSystem',
  'SearchParameter',
  'StructureDefinition',
  'ValueSet',
  'BulkDataExport',
  'AsyncJob',
  'AuditEvent',
]);

function canBeExported(resourceType: string): boolean {
  return !unexportedResourceTypes.has(resourceType) && !protectedResourceTypes.includes(resourceType);
}

export async function groupExportResources(
  repo: Repository,
  exporter: BulkExporter,
  project: Project,
  group: Group,
  params?: PatientEverythingParameters
): Promise<void> {
  for (const member of group.member ?? EMPTY) {
    if (!member.entity?.reference) {
      continue;
    }
    const output = await readGroupMember(repo, member.entity, params);
    if (output?.bundle) {
      await exporter.writeBundle(output.bundle);
    } else if (output?.resource) {
      await exporter.writeResource(output.resource);
    }
  }
  await exporter.close(project);
}

/**
 * Reads a group member for export: a Patient's everything bundle, or the resource itself.
 * Read failures are logged and skipped; write failures stay with the caller so interruptions propagate.
 * @param repo - The repository.
 * @param entity - The member reference.
 * @param params - The $everything parameters.
 * @returns The member output, or undefined if it could not be read.
 */
async function readGroupMember(
  repo: Repository,
  entity: Reference,
  params: PatientEverythingParameters | undefined
): Promise<{ bundle?: Bundle<WithId<Resource>>; resource?: WithId<Resource> } | undefined> {
  const [resourceType, memberId] = parseReference(entity);
  try {
    if (resourceType === 'Patient') {
      const patient = await repo.readResource<Patient>('Patient', memberId);
      return { bundle: await getPatientEverything(repo, patient, params) };
    }
    return { resource: await repo.readResource(resourceType, memberId) };
  } catch {
    getLogger().warn('Unable to read patient for group export', { reference: entity.reference });
    return undefined;
  }
}
