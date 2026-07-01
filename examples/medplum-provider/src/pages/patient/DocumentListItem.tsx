// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatDate, getDisplayString, getReferenceString } from '@medplum/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { MedplumLink } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
import classes from './DocumentListItem.module.css';
import { getDocumentTypeDisplay } from './DocumentReference.utils';

interface DocumentListItemProps {
  item: WithId<DocumentReference>;
  selectedDocumentId?: string;
  getItemUri: (item: WithId<DocumentReference>) => string;
}

export function DocumentListItem({ item, selectedDocumentId, getItemUri }: DocumentListItemProps): JSX.Element {
  const isSelected = selectedDocumentId === item.id;

  const name = getDisplayString(item);
  const referenceString = getReferenceString(item);
  const date = item.date || item.meta?.lastUpdated;
  const documentType = getDocumentTypeDisplay(item);

  const metaPrefix = date ? formatDate(date) : '';
  const metaLine = documentType ? `${metaPrefix}: ${documentType}` : metaPrefix;

  return (
    <MedplumLink
      to={getItemUri(item)}
      aria-current={isSelected ? 'page' : undefined}
      underline="never"
      className={cx(classes.item, isSelected && classes.selected)}
    >
      <Stack gap={0} miw={0}>
        <Tooltip label={name} multiline maw={320} withinPortal openDelay={300}>
          <Text fw={700} truncate="end" miw={0}>
            {name === referenceString ? 'Untitled Document' : name}
          </Text>
        </Tooltip>

        {metaLine && (
          <Tooltip label={metaLine} multiline maw={320} withinPortal openDelay={300}>
            <Text size="sm" c="dimmed" truncate="end">
              {metaLine}
            </Text>
          </Tooltip>
        )}
      </Stack>
    </MedplumLink>
  );
}
