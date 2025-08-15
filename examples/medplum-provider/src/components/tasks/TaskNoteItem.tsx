// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Anchor, Divider, Group, Stack, Text } from '@mantine/core';
import { formatDateTime, getDisplayString } from '@medplum/core';
import { Annotation } from '@medplum/fhirtypes';
import { ResourceAvatar, useResource } from '@medplum/react';
import React from 'react';

interface TaskNoteItemProps {
  note: Annotation;
  index: number;
}

function renderTextWithLinks(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <Anchor key={index} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </Anchor>
      );
    }
    return part;
  });
}

export function TaskNoteItem(props: TaskNoteItemProps): React.JSX.Element {
  const { note } = props;
  const author = useResource(note.authorReference);

  return (
    <Stack gap="md" pt="sm" pb="sm">
      <Group align="center" gap="xs">
        <ResourceAvatar value={note.authorReference} radius="xl" size={36} />
        <Text fw={500}>{author && getDisplayString(author)}</Text>
        <Text>{formatDateTime(note.time ?? '')}</Text>
      </Group>
      <Text>{note.text ? renderTextWithLinks(note.text) : ''}</Text>
      <Divider />
    </Stack>
  );
}
