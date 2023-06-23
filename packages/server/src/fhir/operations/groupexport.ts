import { accepted } from '@medplum/core';
import { Group, Patient, Project } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { logger } from '../../logger';
import { sendOutcome } from '../outcomes';
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
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function groupExportHandler(req: Request, res: Response): Promise<void> {
  const { baseUrl } = getConfig();
  const { id } = req.params;
  const query = req.query as Record<string, string | undefined>;
  const since = query._since;
  const types = query._type?.split(',');
  const repo = res.locals.repo as Repository;
  const project = res.locals.project as Project;

  // First read the group as the user to verify access
  const group = await repo.readResource<Group>('Group', id);

  // Start the exporter
  const exporter = new BulkExporter(repo, since, types);
  const bulkDataExport = await exporter.start(req.protocol + '://' + req.get('host') + req.originalUrl);

  groupExportResources(exporter, project, group, repo)
    .then(() => logger.info(`Group export for ${project.id} is completed`))
    .catch((err) => logger.error(`Group export for  ${project.id} failed: ${err}`));

  sendOutcome(res, accepted(`${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`));
}

async function groupExportResources(
  exporter: BulkExporter,
  project: Project,
  group: Group,
  repo: Repository
): Promise<void> {
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
        logger.warn('Unable to read patient: ' + member.entity.reference);
      }
    }

    // Close the exporter
    await exporter.close(project);
  }
}
