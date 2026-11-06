// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Attachment, DiagnosticReport } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { renderMedplumLink, useDiagnosticReportResources } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { resolveDerivedFromAttachments, resolvePresentedFormAttachments } from './documentReference';
import { LabReportContentView } from './LabReportContentView';

export interface LabReportContentProps {
  readonly report: DiagnosticReport;
}

/**
 * The content of a lab report, resolving its documents and referenced resources through the
 * Medplum client and linking with MedplumLink.
 * @param props - The DiagnosticReport to render.
 * @returns The lab report content.
 */
export function LabReportContent(props: LabReportContentProps): JSX.Element {
  const { report } = props;
  const attachments = useLabReportAttachments(report);
  const resources = useDiagnosticReportResources(report);
  return (
    <LabReportContentView report={report} attachments={attachments} resources={resources} renderLink={renderMedplumLink} />
  );
}

/**
 * Resolves a report's lab documents through the Medplum client, for LabReportContentView.
 *
 * Both attachment sources resolve together and commit in a single state update, so the list
 * doesn't render with just one source and then visibly reorder once the other resolves.
 * Health Gorilla doesn't always fold the lab-branded PDF into presentedForm; derivedFrom is a
 * more reliable fallback source for it, so it's placed first. The two sources often resolve the
 * same lab-branded PDF (Health Gorilla usually folds it into presentedForm too), so de-dupe by
 * URL before rendering.
 * @param report - The report, or undefined for no documents.
 * @returns The displayable attachments, empty until resolved.
 */
export function useLabReportAttachments(report: DiagnosticReport | undefined): Attachment[] {
  const medplum = useMedplum();
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    if (!report) {
      return undefined;
    }
    let cancelled = false;

    Promise.allSettled([
      resolveDerivedFromAttachments(medplum, report.result),
      resolvePresentedFormAttachments(medplum, report.presentedForm),
    ])
      .then(([derivedFromResult, presentedFormResult]) => {
        if (cancelled) {
          return;
        }
        if (derivedFromResult.status === 'rejected') {
          console.error('Error resolving derivedFrom attachments:', derivedFromResult.reason);
        }
        if (presentedFormResult.status === 'rejected') {
          console.error('Error resolving presentedForm attachments:', presentedFormResult.reason);
        }
        const derivedFromAttachments = derivedFromResult.status === 'fulfilled' ? derivedFromResult.value : [];
        const presentedFormAttachments = presentedFormResult.status === 'fulfilled' ? presentedFormResult.value : [];

        // Only de-dupe attachments that have a URL to key on; attachments without one
        // (e.g. a bare presentedForm entry with just a title/contentType) always render.
        const seenUrls = new Set<string>();
        const deduped = [...derivedFromAttachments, ...presentedFormAttachments].filter((attachment) => {
          if (!attachment.url) {
            return true;
          }
          if (seenUrls.has(attachment.url)) {
            return false;
          }
          seenUrls.add(attachment.url);
          return true;
        });
        setAttachments(deduped);
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      setAttachments([]);
    };
  }, [medplum, report]);

  return attachments;
}
