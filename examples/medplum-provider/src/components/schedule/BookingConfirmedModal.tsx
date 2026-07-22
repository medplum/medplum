// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatDateTime, getDisplayString } from '@medplum/core';
import type { Appointment, Encounter, Patient } from '@medplum/fhirtypes';
import { IconCircleCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { encounterUrl } from '../../utils/encounter';

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

export type BookingConfirmedResult = {
  appointment: WithId<Appointment>;
  patient: WithId<Patient>;
  encounter: WithId<Encounter> | undefined;
  comboSummary: string; // e.g. "Dr. Chen · Procedure Room A · Cystoscopy Ultrasound Unit 1"
};

type BookingConfirmedModalProps = {
  result: BookingConfirmedResult | undefined;
  onClose: () => void;
};

/**
 * Confirmation shown right after a successful `$book` call (nothing
 * previously acknowledged this on screen — the drawer just closed). Gives
 * the admin a clear "you're done" moment and, when an Encounter was
 * created, a direct link into that visit elsewhere in Provider
 * (`/Patient/:id/Encounter/:id`, via the same `encounterUrl` helper used by
 * the rest of the app) rather than having to go hunt for it.
 * @param props - Booking-confirmed modal props.
 * @returns A React element rendering the confirmation modal.
 */
export function BookingConfirmedModal(props: BookingConfirmedModalProps): JSX.Element {
  const { result, onClose } = props;

  return (
    <Modal opened={!!result} onClose={onClose} title="Appointment Booked" centered>
      {result && (
        <Stack align="center" gap="sm" py="md">
          <ThemeIcon color="teal" variant="light" size={56} radius="xl">
            <IconCircleCheck size={32} />
          </ThemeIcon>
          <Title order={4} ta="center">
            {getDisplayString(result.patient)} is booked
          </Title>
          <Text ta="center">{formatDateTime(result.appointment.start, undefined, DATE_TIME_FORMAT)}</Text>
          <Text size="sm" c="dimmed" ta="center">
            {result.comboSummary}
          </Text>

          <Group mt="md">
            <Button variant="default" onClick={onClose}>
              Close
            </Button>
            {result.encounter && (
              <Button component={Link} to={encounterUrl(result.encounter)} onClick={onClose}>
                View Visit
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
