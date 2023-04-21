import { accepted, getReferenceString } from '@medplum/core';
import { BulkDataExport, Group, Patient, Project, ResourceType } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { logger } from '../../logger';
import { Repository, systemRepo } from '../repo';
import { getPatientEverything } from './patienteverything';
import { BulkExporter } from './utils/bulkexporter';

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
    status: 'completed',
    transactionTime: new Date().toISOString(),
    output: Object.entries(exporter.writers).map(([resourceType, writer]) => ({
      type: resourceType as ResourceType,
      url: getReferenceString(writer.binary),
    })),
  });

  // Send the response
  res.set('Content-Location', `${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`).status(202).json(accepted);
}
