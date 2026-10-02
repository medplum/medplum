// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { DiagnosticReport, ImagingStudy, Patient, Reference, Task } from '@medplum/fhirtypes';

/** Marks the Tasks and DiagnosticReports that belong to the radiology dictation worklist. */
export const RADIOLOGY_SYSTEM = 'https://medplum.com/radiology-dictation';

/** Task.code used by `generate-diag-report-task`, and the filter the worklist searches on. */
export const RADIOLOGY_TASK_CODE = 'read-imaging-study';

export const RADIOLOGY_WORKLIST_QUERY = `identifier=${RADIOLOGY_SYSTEM}|${RADIOLOGY_TASK_CODE}&status:not=completed,cancelled&_sort=-_lastUpdated&_count=50`;

/**
 * The draft report is keyed to its Task, so reopening the Task resumes the same draft.
 * @param task - The worklist Task.
 * @returns The identifier value for the Task's draft report.
 */
export function draftIdentifierValue(task: Task): string {
  return `${RADIOLOGY_TASK_CODE}/${task.id}`;
}

/**
 * @param task - The worklist Task.
 * @returns The ImagingStudy the Task was created for, if any.
 */
export function getTaskImagingStudy(task: Task): Reference<ImagingStudy> | undefined {
  const input = task.input?.find((i) => i.valueReference?.reference?.startsWith('ImagingStudy/'));
  return input?.valueReference as Reference<ImagingStudy> | undefined;
}

/**
 * Returns the existing draft for a Task, or creates a blank one. The blank draft is the only thing
 * written on open — dictation edits stay local until the radiologist saves, so switching worklist
 * items never persists a half-finished report.
 * @param medplum - The Medplum client.
 * @param task - The worklist Task being opened.
 * @param patient - The subject of the report.
 * @returns The resumable draft DiagnosticReport.
 */
export async function getOrCreateDraftReport(
  medplum: MedplumClient,
  task: Task,
  patient: Reference<Patient>
): Promise<DiagnosticReport> {
  const identifier = draftIdentifierValue(task);
  const existing = await medplum.searchOne('DiagnosticReport', { identifier: `${RADIOLOGY_SYSTEM}|${identifier}` });
  if (existing) {
    return existing;
  }
  const imagingStudy = getTaskImagingStudy(task);
  return medplum.createResource<DiagnosticReport>({
    resourceType: 'DiagnosticReport',
    identifier: [{ system: RADIOLOGY_SYSTEM, value: identifier }],
    status: 'registered',
    code: task.code ?? { text: 'Radiology report' },
    subject: patient,
    basedOn: [{ reference: getReferenceString(task) }],
    ...(imagingStudy ? { imagingStudy: [imagingStudy] } : {}),
  });
}

/**
 * Announces a change of study on the FHIRcast topic: the study leaving the viewport is closed before
 * the new one opens, so subscribers never see two studies open at once.
 *
 * The full ImagingStudy is published rather than a stub, since subscribers key off details such as
 * the accession number that a bare id would not carry.
 * @param medplum - The Medplum client.
 * @param topic - The connected FHIRcast topic.
 * @param previous - The study currently open, if any.
 * @param next - The study being opened, if any.
 */
export async function publishStudyChange(
  medplum: MedplumClient,
  topic: string,
  previous: ImagingStudy | undefined,
  next: ImagingStudy | undefined
): Promise<void> {
  if (previous) {
    await medplum.fhircastPublish(topic, 'ImagingStudy-close', { key: 'study', resource: previous });
  }
  if (next) {
    await medplum.fhircastPublish(topic, 'ImagingStudy-open', { key: 'study', resource: next });
  }
}
