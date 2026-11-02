// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Loader, Stack, Text } from '@mantine/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import classes from './LabDocumentSection.module.css';

export interface LabDocumentSectionProps {
  readonly title: string;
  readonly loading: boolean;
  readonly loadingText: string;
  readonly emptyText: string;
  readonly docs: DocumentReference[];
}

export function LabDocumentSection(props: LabDocumentSectionProps): JSX.Element {
  const { title, loading, loadingText, emptyText, docs } = props;
  return (
    <Stack gap="lg" mb="xl">
      <Text fw={800} size="md" pb="0">
        {title}
      </Text>
      {loading && (
        <Group>
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            {loadingText}
          </Text>
        </Group>
      )}

      {!loading && docs.length > 0 && (
        <Stack gap="md">
          {docs.map((doc, index) => (
            <Stack key={doc.id || index} gap="xs">
              {doc.content?.map((content, contentIndex) => (
                <div key={contentIndex} className={classes.frame}>
                  <AttachmentDisplay value={content.attachment} />
                </div>
              ))}
            </Stack>
          ))}
        </Stack>
      )}

      {!loading && docs.length === 0 && (
        <Text size="sm" c="dimmed">
          {emptyText}
        </Text>
      )}
    </Stack>
  );
}
