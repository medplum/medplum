// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, generateId } from '@medplum/core';
import type { DocumentReference, Practitioner, Reference } from '@medplum/fhirtypes';
import { getProjectId } from '../../utils';
import type { AdminEntry, ClientEntry, SecurityFinding } from './checks';
import type { SecurityCheckResult } from './useSecurityCheckData';

export const SECURITY_REPORT_TYPE_TEXT = 'Security health check report';
export const SECURITY_REPORT_IDENTIFIER_SYSTEM = 'https://medplum.com/fhir/security-health-check-report';

/**
 * Contents of a saved report's JSON attachment.
 */
interface SavedSecurityReport {
  readonly checkedAt: string;
  readonly findings: SecurityFinding[];
  readonly clients: ClientEntry[];
  readonly admins: AdminEntry[];
}

/**
 * Saves a snapshot of a security health check as a DocumentReference with a JSON attachment.
 * The attachment Binary uses the Project as its security context, so only members who can read the Project can read it.
 * The DocumentReference holds no findings, because its readers are not limited the same way.
 * @param medplum - The Medplum client.
 * @param result - The security check result shown on the page.
 * @returns The created DocumentReference.
 */
export async function saveSecurityReport(
  medplum: MedplumClient,
  result: SecurityCheckResult
): Promise<WithId<DocumentReference>> {
  const projectId = getProjectId(medplum);
  const profile = medplum.getProfile();
  const author = profile ? (createReference(profile) as Reference<Practitioner>) : undefined;
  const savedAt = new Date().toISOString();
  const checkedAt = result.checkedAt.toISOString();
  const filename = `security-health-check-${checkedAt.slice(0, 10)}.json`;

  const report = {
    project: { reference: `Project/${projectId}` },
    checkedAt,
    savedAt,
    savedBy: author,
    findings: result.findings,
    clients: result.clients,
    admins: result.admins,
  };

  const attachment = await medplum.createAttachment({
    data: JSON.stringify(report, undefined, 2),
    contentType: 'application/json',
    filename,
    securityContext: { reference: `Project/${projectId}` },
  });

  return medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    identifier: [{ system: SECURITY_REPORT_IDENTIFIER_SYSTEM, value: generateId() }],
    type: { text: SECURITY_REPORT_TYPE_TEXT },
    date: savedAt,
    author: author ? [author] : undefined,
    content: [{ attachment: { ...attachment, title: filename, creation: checkedAt } }],
  });
}

/**
 * Loads the most recently saved security health check report for the current project.
 * @param medplum - The Medplum client.
 * @returns The saved result, or undefined when no report has been saved.
 */
export async function loadLatestSecurityReport(medplum: MedplumClient): Promise<SecurityCheckResult | undefined> {
  const doc = await medplum.searchOne(
    'DocumentReference',
    { identifier: `${SECURITY_REPORT_IDENTIFIER_SYSTEM}|`, _sort: '-date' },
    { cache: 'no-cache' }
  );
  const url = doc?.content[0]?.attachment.url;
  if (!url) {
    return undefined;
  }
  const blob = await medplum.download(url);
  const report = JSON.parse(await blob.text()) as SavedSecurityReport;
  return {
    checkedAt: new Date(report.checkedAt),
    findings: report.findings,
    clients: report.clients,
    admins: report.admins,
  };
}
