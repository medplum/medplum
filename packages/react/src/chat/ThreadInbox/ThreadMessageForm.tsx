// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Stack, Text, TextInput } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { MultiResourceInput } from '../../ResourceInput/MultiResourceInput';
import { ResourceInput } from '../../ResourceInput/ResourceInput';

/**
 * Props for the ThreadMessageForm component — the shared Patient + Practitioner + Topic fields
 * (plus the trailing divider before the action button) used by the New Message and Message
 * Settings dialogs.
 * @param practitioners - The currently selected practitioner recipients (the input's default value).
 * @param onPractitionersChange - Called with the new practitioner reference list when the selection changes.
 * @param topic - The current topic text.
 * @param onTopicChange - Called with the new topic text on every edit.
 * @param patient - The currently selected patient (the input's default value).
 * @param onPatientChange - Called with the new patient reference when the selection changes. When omitted, the patient field is read-only.
 * @param allowPatientSelection - When true, the patient field is an editable search input. When false (default), the field is pre-filled from `patient` and disabled.
 */
export interface ThreadMessageFormProps {
  practitioners: Reference<Practitioner>[];
  onPractitionersChange: (practitioners: Reference<Practitioner>[]) => void;
  topic: string;
  onTopicChange: (topic: string) => void;
  patient?: Reference<Patient>;
  onPatientChange?: (patient: Reference<Patient> | undefined) => void;
  allowPatientSelection?: boolean;
}

export const ThreadMessageForm = (props: ThreadMessageFormProps): JSX.Element => {
  const { practitioners, onPractitionersChange, topic, onTopicChange, patient, onPatientChange } = props;
  const allowPatientSelection = props.allowPatientSelection ?? false;
  return (
    <>
      <Stack gap={0}>
        <Text fw={500}>Patient</Text>

        {allowPatientSelection && <Text c="dimmed">Select a patient</Text>}

        <ResourceInput
          resourceType="Patient"
          name="patient"
          required={!!onPatientChange}
          defaultValue={patient}
          disabled={!allowPatientSelection && !!patient}
          onChange={(value) => {
            onPatientChange?.(value ? createReference(value) : undefined);
          }}
        />
      </Stack>

      <Stack gap={0}>
        <Text fw={500}>Practitioner</Text>
        <Text c="dimmed">Select one or more practitioners</Text>

        <MultiResourceInput<Practitioner>
          resourceType="Practitioner"
          name="practitioners"
          defaultValue={practitioners}
          onChange={(resources) =>
            onPractitionersChange(resources.map((practitioner) => createReference(practitioner)))
          }
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
