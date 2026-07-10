// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import type { Attachment, DiagnosticReport } from '@medplum/fhirtypes';
import { AttachmentDisplay, DiagnosticReportDisplay, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { resolvePresentedFormAttachments } from '../../utils/documentReference';
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
  const [presentedFormAttachments, setPresentedFormAttachments] = useState<Attachment[]>([]);

  // Resolve presentedForm entries that point at a DocumentReference instead of binary content
  useEffect(() => {
    resolvePresentedFormAttachments(medplum, report.presentedForm)
      .then(setPresentedFormAttachments)
      .catch(console.error);

    return () => {
      setPresentedFormAttachments([]);
    };
  }, [medplum, report]);

  return (
    <Stack gap="sm" mb="xl">
      {/* Results PDF */}
      {presentedFormAttachments.length > 0 && (
        <Stack gap="lg" mb="xl">
          <Text fw={800} size="md" pb="0">
            Lab Document
          </Text>
          <Stack gap="md">
            {presentedFormAttachments.map((form, index) => (
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
