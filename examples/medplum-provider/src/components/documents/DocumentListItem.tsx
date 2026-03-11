// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { MedplumLink } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
import classes from './DocumentListItem.module.css';
import type { PatientDocument } from './DocumentListItem.utils';
import { formatContentType } from './DocumentListItem.utils';

interface DocumentListItemProps {
  item: PatientDocument;
  selectedItem: PatientDocument | undefined;
  getItemUri: (item: PatientDocument) => string;
  hideDivider?: boolean;
}

export function DocumentListItem({ item, selectedItem, getItemUri, hideDivider }: DocumentListItemProps): JSX.Element {
  const isSelected = selectedItem?.id === item.id;

  return (
    <div className={cx(classes.itemWrapper, { [classes.hideDivider]: hideDivider })}>
      <MedplumLink to={getItemUri(item)} underline="never">
        <Group
          align="center"
          wrap="nowrap"
          className={cx(classes.contentContainer, {
            [classes.selected]: isSelected,
          })}
        >
          <Stack gap={0} flex={1} style={{ minWidth: 0 }}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Text fw={700} className={classes.title} flex={1}>
                {item.name}
              </Text>
              {item.tag !== 'Document' && (
                <Badge size="sm" color={item.tagColor} variant="light">
                  {item.tag}
                </Badge>
              )}
            </Group>
            {(item.contentType || item.date) && (
              <Text size="sm" c="dimmed">
                {[formatContentType(item.contentType), item.date ? formatDate(item.date) : undefined]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
          </Stack>
        </Group>
      </MedplumLink>
    </div>
  );
}
