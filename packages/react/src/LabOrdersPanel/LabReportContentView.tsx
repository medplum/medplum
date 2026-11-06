// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import type { Attachment, DiagnosticReport, Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import type { RenderResourceLink } from '../DiagnosticReportDisplay/DiagnosticReportDisplayView';
import { DiagnosticReportDisplayView } from '../DiagnosticReportDisplay/DiagnosticReportDisplayView';
import classes from './LabReportContent.module.css';

export interface LabReportContentViewProps {
  readonly report: DiagnosticReport;
  /** The lab documents shown above the results: the presentedForm and derivedFrom PDFs, resolved by the caller. */
  readonly attachments?: Attachment[];
  /** The resources the report references, resolved by the caller. See DiagnosticReportDisplayView. */
  readonly resources?: Resource[];
  /** Renders the links in the report display. Default: no links. */
  readonly renderLink?: RenderResourceLink;
}

/**
 * The content of a lab report: the lab documents followed by the structured results. It holds
 * no client: the caller resolves the documents and the referenced resources.
 * @param props - The report and its resolved documents and resources.
 * @returns The lab report content.
 */
export function LabReportContentView(props: LabReportContentViewProps): JSX.Element {
  const { report, attachments, resources, renderLink } = props;

  return (
    <Stack gap="sm" mb="xl">
      {attachments && attachments.length > 0 && (
        <Stack gap="lg" mb="xl">
          <Text fw={800} size="md" pb="0">
            Lab Document
          </Text>
          <Stack gap="md">
            {attachments.map((form, index) => (
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
          <DiagnosticReportDisplayView value={report} resources={resources} renderLink={renderLink} />
        </Stack>
      )}
    </Stack>
  );
}
