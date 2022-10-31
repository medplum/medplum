import { getReferenceString, resolveId } from '@medplum/core';
import { Binary, BulkDataExport, Group, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { PassThrough } from 'stream';
import { getConfig } from '../../config';
import { logger } from '../../logger';
import { Repository, systemRepo } from '../repo';
import { getBinaryStorage } from '../storage';

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

  // Create a Binary placeholder
  const contentType = 'application/fhir+ndjson';
  const filename = `export-${bulkDataExport.id}.ndjson`;
  const binary = await repo.createResource<Binary>({
    resourceType: 'Binary',
    contentType,
  });

  // Create the stream
  const stream = new PassThrough();

  // Start writing the stream to binary storage
  const writerPromise = getBinaryStorage().writeBinary(binary, filename, contentType, stream);

  // Read all patients in the group
  if (group.member) {
    for (const member of group.member) {
      try {
        const patientId = resolveId(member.entity);
        if (patientId) {
          const patient = await repo.readResource('Patient', patientId);
          stream.write(JSON.stringify(patient) + '\n');
        }
      } catch (err) {
        logger.warn('Unable to read patient: ' + member.entity?.reference);
      }
    }
  }

  // Write end of stream
  stream.push(null);

  // Wait for the stream to finish writing
  await writerPromise;

  // Update the BulkDataExport
  await systemRepo.updateResource<BulkDataExport>({
    ...bulkDataExport,
    meta: {
      project: (res.locals.project as Project).id,
    },
    transactionTime: new Date().toISOString(),
    output: [
      {
        type: 'Patient',
        url: getReferenceString(binary),
      },
    ],
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
