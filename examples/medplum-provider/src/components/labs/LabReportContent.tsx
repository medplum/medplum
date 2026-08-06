// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import type { Attachment, DiagnosticReport } from '@medplum/fhirtypes';
import { AttachmentDisplay, DiagnosticReportDisplay, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { resolveDerivedFromAttachments, resolvePresentedFormAttachments } from '../../utils/documentReference';
import classes from './LabReportContent.module.css';

interface LabReportContentProps {
  report: DiagnosticReport;
}

/**
 * Renders the content of a lab report: the presented form documents (e.g. the
 * lab's PDF) followed by the structured report results. Shared between the
 * standalone result view and the order's Report tab.
 * @param props - The DiagnosticReport to render.
 * @returns The lab report content.
 */
export function LabReportContent(props: LabReportContentProps): JSX.Element {
  const { report } = props;
  const medplum = useMedplum();
  const [labDocumentAttachments, setLabDocumentAttachments] = useState<Attachment[]>([]);

  // Resolve both attachment sources together and commit them in a single state update, so the
  // list doesn't render with just one source and then visibly reorder once the other resolves.
  // Health Gorilla doesn't always fold the lab-branded PDF into presentedForm; derivedFrom is a
  // more reliable fallback source for it, so it's placed first.
  useEffect(() => {
    Promise.all([
      resolveDerivedFromAttachments(medplum, report.result),
      resolvePresentedFormAttachments(medplum, report.presentedForm),
    ])
      .then(([derivedFromAttachments, presentedFormAttachments]) =>
        setLabDocumentAttachments([...derivedFromAttachments, ...presentedFormAttachments])
      )
      .catch(console.error);

    return () => {
      setLabDocumentAttachments([]);
    };
  }, [medplum, report]);

  return (
    <Stack gap="sm" mb="xl">
      {/* Results PDF */}
      {labDocumentAttachments.length > 0 && (
        <Stack gap="lg" mb="xl">
          <Text fw={800} size="md" pb="0">
            Lab Document
          </Text>
          <Stack gap="md">
            {labDocumentAttachments.map((form, index) => (
              <Stack key={index} gap="xs">
                <div className={classes.attachment}>
                  <AttachmentDisplay value={form} />
                </div>
              </Stack>
            ))}
          </Stack>
        </Stack>
      )}

      {report.result && report.result.length > 0 && (
        <Stack pt="md">
          <DiagnosticReportDisplay value={report} />
        </Stack>
      )}
    </Stack>
  );
}
