// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, TextInput } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { MultiResourceInput } from '../../ResourceInput/MultiResourceInput';
import { ResourceInput } from '../../ResourceInput/ResourceInput';

/**
 * Props for the ThreadMessageForm component — the shared Patient + Practitioner + Topic fields
 * used by the New Message and Message Settings dialogs. The form owns the spacing between its
 * own sections, so call sites drop it in without a wrapping layout element.
 * The patient and practitioner inputs are uncontrolled: the `default*` props seed them on
 * mount only, and later edits are reported through the `on*Change` callbacks. Mount the form
 * only once the defaults are known (both dialogs mount it after the thread is resolved).
 * @param defaultPractitioners - The initial practitioner recipients (init-only, uncontrolled input).
 * @param onPractitionersChange - Called with the new practitioner reference list when the selection changes.
 * @param topic - The current topic text (controlled).
 * @param onTopicChange - Called with the new topic text on every edit.
 * @param defaultPatient - The initial patient (init-only, uncontrolled input).
 * @param onPatientChange - Called with the new patient reference when the selection changes. When omitted, the patient field is read-only.
 * @param allowPatientSelection - When true, the patient field is an editable search input. When false (default), the field is pre-filled from `defaultPatient` and disabled.
 */
export interface ThreadMessageFormProps {
  defaultPractitioners: Reference<Practitioner>[];
  onPractitionersChange: (practitioners: Reference<Practitioner>[]) => void;
  topic: string;
  onTopicChange: (topic: string) => void;
  defaultPatient?: Reference<Patient>;
  onPatientChange?: (patient: Reference<Patient> | undefined) => void;
  allowPatientSelection?: boolean;
}

export const ThreadMessageForm = (props: ThreadMessageFormProps): JSX.Element => {
  const { defaultPractitioners, onPractitionersChange, topic, onTopicChange, defaultPatient, onPatientChange } = props;
  const allowPatientSelection = props.allowPatientSelection ?? false;
  return (
    <Stack gap="lg">
      <Stack gap={0}>
        <Text fw={500}>Patient</Text>

        {allowPatientSelection && <Text c="dimmed">Select a patient</Text>}

        <ResourceInput
          resourceType="Patient"
          name="patient"
          required={!!onPatientChange}
          defaultValue={defaultPatient}
          disabled={!allowPatientSelection && !!defaultPatient}
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
          defaultValue={defaultPractitioners}
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
    </Stack>
  );
};
