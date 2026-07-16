// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Stack, Text, TextInput } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Practitioner, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { MultiResourceInput } from '../../ResourceInput/MultiResourceInput';

/**
 * Props for the ThreadMessageFields component — the shared Practitioner + Topic fields (plus the
 * trailing divider before the action button) used identically by the New Message and Message
 * Settings dialogs.
 * @param practitioners - The currently selected practitioner recipients (the input's default value).
 * @param onPractitionersChange - Called with the new practitioner reference list when the selection changes.
 * @param topic - The current topic text.
 * @param onTopicChange - Called with the new topic text on every edit.
 */
export interface ThreadMessageFieldsProps {
  practitioners: Reference<Practitioner>[];
  onPractitionersChange: (practitioners: Reference<Practitioner>[]) => void;
  topic: string;
  onTopicChange: (topic: string) => void;
}

export const ThreadMessageFields = (props: ThreadMessageFieldsProps): JSX.Element => {
  const { practitioners, onPractitionersChange, topic, onTopicChange } = props;
  return (
    <>
      <Stack gap={0}>
        <Text fw={500}>Practitioner</Text>
        <Text c="dimmed">Select one or more practitioners</Text>

        {/* MultiResourceInput dedupes by reference string, so a practitioner can only be added once. */}
        <MultiResourceInput<Practitioner>
          resourceType="Practitioner"
          name="practitioners"
          defaultValue={practitioners}
          onChange={(resources) => onPractitionersChange(resources.map((practitioner) => createReference(practitioner)))}
        />
      </Stack>

      <Stack gap={0}>
        <Text fw={500}>Topic (optional)</Text>
        <Text c="dimmed">Enter a topic for the message</Text>

        <TextInput placeholder="Enter your topic" value={topic} onChange={(e) => onTopicChange(e.target.value)} />
      </Stack>

      <Divider pt="xs" />
    </>
  );
};
