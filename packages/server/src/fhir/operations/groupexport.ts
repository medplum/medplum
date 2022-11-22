import { getReferenceString } from '@medplum/core';
import { Binary, BulkDataExport, Bundle, Group, Patient, Project, Resource, ResourceType } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { PassThrough } from 'stream';
import { getConfig } from '../../config';
import { logger } from '../../logger';
import { Repository, systemRepo } from '../repo';
import { getBinaryStorage } from '../storage';
import { getPatientEverything } from './patienteverything';

const NDJSON_CONTENT_TYPE = 'application/fhir+ndjson';

/**
 * Handles a Group export request.
 *
 * Endpoint - Group of Patients
 *   [fhir base]/Group/[id]/$export
 *
 * See: https://hl7.org/fhir/uv/bulkdata/export.html
 * See: https://hl7.org/fhir/R4/async.html
 *
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function groupExportHandler(req: Request, res: Response): Promise<void> {
  const { baseUrl } = getConfig();
  const { id } = req.params;
  const query = req.query as Record<string, string | undefined>;
  const since = query._since;
  const repo = res.locals.repo as Repository;

  // First read the group as the user to verify access
  const group = await repo.readResource<Group>('Group', id);

  // Create the BulkDataExport
  const bulkDataExport = await repo.createResource<BulkDataExport>({
    resourceType: 'BulkDataExport',
    status: 'active',
    request: req.protocol + '://' + req.get('host') + req.originalUrl,
    requestTime: new Date().toISOString(),
  });

  // Start the exporter
  const exporter = new BulkExporter(repo, since);

  // Read all patients in the group
  if (group.member) {
    for (const member of group.member) {
      if (!member.entity?.reference) {
        continue;
      }
      const [resourceType, memberId] = member.entity.reference.split('/') as [string, string];
      try {
        if (resourceType === 'Patient') {
          const patient = await repo.readResource<Patient>('Patient', memberId);
          const bundle = await getPatientEverything(repo, patient);
          await exporter.writeBundle(bundle);
        } else {
          const resource = await repo.readResource(resourceType, memberId);
          await exporter.writeResource(resource);
        }
      } catch (err) {
        logger.warn('Unable to read patient: ' + member.entity?.reference);
      }
    }
  }

  // Close the exporter
  await exporter.close();

  // Update the BulkDataExport
  await systemRepo.updateResource<BulkDataExport>({
    ...bulkDataExport,
    meta: {
      project: (res.locals.project as Project).id,
    },
    transactionTime: new Date().toISOString(),
    output: Object.entries(exporter.writers).map(([resourceType, writer]) => ({
      type: resourceType as ResourceType,
      url: getReferenceString(writer.binary),
    })),
  });

  // Send the response
  res
    .set('Content-Location', `${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`)
    .status(202)
    .json({
      resourceType: 'OperationOutcome',
      id: randomUUID(),
      issue: [
        {
          severity: 'information',
          code: 'informational',
          details: {
            text: 'Accepted',
          },
        },
      ],
    });
}

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
    this.stream.push(null);
    return this.writerPromise;
  }
}

class BulkExporter {
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
