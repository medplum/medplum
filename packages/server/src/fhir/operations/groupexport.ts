import { accepted } from '@medplum/core';
import { Group, Patient, Project } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { getPatientEverything } from './patienteverything';
import { BulkExporter } from './utils/bulkexporter';
import { getAuthenticatedContext, getRequestContext } from '../../context';

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
  const ctx = getAuthenticatedContext();
  const { baseUrl } = getConfig();
  const { id } = req.params;
  const query = req.query as Record<string, string | undefined>;
  const since = query._since;
  const types = query._type?.split(',');

  // First read the group as the user to verify access
  const group = await ctx.repo.readResource<Group>('Group', id);

  // Start the exporter
  const exporter = new BulkExporter(ctx.repo, since, types);
  const bulkDataExport = await exporter.start(req.protocol + '://' + req.get('host') + req.originalUrl);

  groupExportResources(exporter, ctx.project, group, ctx.repo)
    .then(() => ctx.logger.info('Group export completed', { id: ctx.project.id }))
    .catch((err) => ctx.logger.error('Group export failed', { id: ctx.project.id, error: err }));

  sendOutcome(res, accepted(`${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`));
}

export async function groupExportResources(
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
        getRequestContext().logger.warn('Unable to read patient for group export', {
          reference: member.entity.reference,
        });
      }
    }

    // Close the exporter
    await exporter.close(project);
  }
}
