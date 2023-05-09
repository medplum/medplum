import { accepted } from '@medplum/core';
import { Group, Patient, Project } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { logger } from '../../logger';
import { Repository } from '../repo';
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

  // Start the exporter
  const exporter = new BulkExporter(repo, since);
  await exporter.start(req.protocol + '://' + req.get('host') + req.originalUrl);

  // Read all patients in the group
  if (group.member) {
    for (const member of group.member) {
      if (!member.entity?.reference) {
        continue;
      }
      const [resourceType, memberId] = member.entity.reference.split('/') as [string, string];
      const writer = await exporter.getWriter(resourceType);
      try {
        if (resourceType === 'Patient') {
          const patient = await repo.readResource<Patient>('Patient', memberId);
          const bundle = await getPatientEverything(repo, patient);
          await exporter.writeBundle(bundle, writer);
        } else {
          const resource = await repo.readResource(resourceType, memberId);
          await exporter.writeResource(resource, writer);
        }
      } catch (err) {
        logger.warn('Unable to read patient: ' + member.entity?.reference);
      }
    }
  }

  // Close the exporter
  const bulkDataExport = await exporter.close(res.locals.project as Project);

  // Send the response
  res.set('Content-Location', `${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`).status(202).json(accepted);
}
