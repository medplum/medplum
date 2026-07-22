// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Group, Modal, Select, Stack, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { formatDateTime, getReferenceString, isReference, parseReference } from '@medplum/core';
import type { Appointment, CodeableConcept } from '@medplum/fhirtypes';
import { MedplumLink, ResourceName, useMedplum } from '@medplum/react';
import { IconCalendarTime, IconCheck, IconFileCheck, IconUserOff, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

// Fixed 3-value coding for the demo (spec §4.6, §8) — no external terminology
// system needed. Populates the native `Appointment.cancelationReason`
// CodeableConcept (note single-l FHIR spelling), not a custom extension.
const CANCELLATION_REASON_SYSTEM = 'https://medplum.com/fhir/CodeSystem/candid-cancellation-reason';
const CANCELLATION_REASONS = [
  { value: 'patient', label: 'Patient request' },
  { value: 'provider', label: 'Provider request' },
  { value: 'org', label: 'Organization/operational' },
];

function isToday(iso: string | undefined): boolean {
  if (!iso) {
    return false;
  }
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function SessionDetailsPanel(props: {
  appointment: WithId<Appointment>;
  healthcareServiceName?: string;
  onUpdate: (appointment: WithId<Appointment>) => void;
  onReschedule: (appointment: WithId<Appointment>) => void;
}): JSX.Element {
  const { appointment, onUpdate, onReschedule } = props;
  const medplum = useMedplum();

  const [rescheduleConfirmOpened, rescheduleConfirmHandlers] = useDisclosure(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [noShowLoading, setNoShowLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);

  const cancellable = appointment.status === 'booked' || appointment.status === 'pending';
  const confirmable = appointment.status === 'pending';
  const checkInable = appointment.status === 'booked' && isToday(appointment.start);
  const noShowable = appointment.status === 'booked' || appointment.status === 'checked-in';

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      const cancelled = await medplum.post<WithId<Appointment>>(medplum.fhirUrl('Appointment', appointment.id, '$cancel'));
      let final = cancelled;
      if (cancelReason) {
        const cancelationReason: CodeableConcept = {
          coding: [
            {
              system: CANCELLATION_REASON_SYSTEM,
              code: cancelReason,
              display: CANCELLATION_REASONS.find((r) => r.value === cancelReason)?.label,
            },
          ],
        };
        final = await medplum.updateResource({ ...cancelled, cancelationReason });
      }
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');
      onUpdate(final);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setCancelling(false);
    }
  }, [medplum, appointment.id, cancelReason, onUpdate]);

  const handleNoShow = useCallback(async () => {
    setNoShowLoading(true);
    try {
      const updated = await medplum.updateResource<Appointment>({ ...appointment, status: 'noshow' });
      medplum.invalidateSearches('Appointment');
      onUpdate(updated);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setNoShowLoading(false);
    }
  }, [medplum, appointment, onUpdate]);

  const handleConfirm = useCallback(async () => {
    setConfirmLoading(true);
    try {
      const updated = await medplum.post<WithId<Appointment>>(medplum.fhirUrl('Appointment', appointment.id, '$confirm'));
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');
      onUpdate(updated);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setConfirmLoading(false);
    }
  }, [medplum, appointment.id, onUpdate]);

  const handleCheckIn = useCallback(async () => {
    setCheckInLoading(true);
    try {
      const updated = await medplum.updateResource<Appointment>({ ...appointment, status: 'checked-in' });
      medplum.invalidateSearches('Appointment');
      onUpdate(updated);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setCheckInLoading(false);
    }
  }, [medplum, appointment, onUpdate]);

  const patientParticipant = appointment.participant.find((p) => isReference(p.actor, 'Patient'));
  const otherParticipants = appointment.participant.filter(
    (p) => p.actor && isReference(p.actor) && parseReference(p.actor)[0] !== 'Patient'
  );

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={700} tt="capitalize">
          {appointment.status}
        </Text>
        {props.healthcareServiceName && <Text c="dimmed">{props.healthcareServiceName}</Text>}
      </Group>

      {patientParticipant?.actor && (
        <div>
          <Text size="xs" c="dimmed">
            Patient
          </Text>
          <ResourceName value={patientParticipant.actor} link fw={600} />
        </div>
      )}

      {otherParticipants.map((p, i) => {
        if (!p.actor || !isReference(p.actor)) {
          return null;
        }
        const [resourceType] = parseReference(p.actor);
        return (
          <div key={getReferenceString(p.actor) ?? i}>
            <Text size="xs" c="dimmed">
              {resourceType}
            </Text>
            <MedplumLink to={p.actor}>
              <ResourceName value={p.actor} />
            </MedplumLink>
          </div>
        );
      })}

      <Divider />

      <dl>
        <dt>
          <Text size="xs" c="dimmed">
            Start
          </Text>
        </dt>
        <dd>{formatDateTime(appointment.start)}</dd>
        <dt>
          <Text size="xs" c="dimmed">
            End
          </Text>
        </dt>
        <dd>{formatDateTime(appointment.end)}</dd>
        {appointment.comment && (
          <>
            <dt>
              <Text size="xs" c="dimmed">
                Reason/notes
              </Text>
            </dt>
            <dd>{appointment.comment}</dd>
          </>
        )}
        {appointment.cancelationReason && (
          <>
            <dt>
              <Text size="xs" c="dimmed">
                Cancellation reason
              </Text>
            </dt>
            <dd>{appointment.cancelationReason.coding?.[0]?.display ?? appointment.cancelationReason.text}</dd>
          </>
        )}
      </dl>

      <Divider />

      <Stack gap="xs">
        <Button variant="outline" leftSection={<IconCalendarTime size={16} />} onClick={rescheduleConfirmHandlers.open}>
          Reschedule
        </Button>

        {confirmable && (
          <Button
            variant="outline"
            loading={confirmLoading}
            leftSection={<IconFileCheck size={16} />}
            onClick={handleConfirm}
          >
            Confirm appointment
          </Button>
        )}

        {checkInable && (
          <Button variant="outline" loading={checkInLoading} leftSection={<IconCheck size={16} />} onClick={handleCheckIn}>
            Check in
          </Button>
        )}

        <Tooltip label="Only booked or checked-in visits can be marked no-show" disabled={noShowable}>
          <Button
            variant="outline"
            color="orange"
            data-disabled={!noShowable}
            loading={noShowLoading}
            leftSection={<IconUserOff size={16} />}
            onClick={noShowable ? handleNoShow : undefined}
          >
            No-show
          </Button>
        </Tooltip>

        <Divider label="Cancel" labelPosition="left" />
        <Select
          placeholder="Cancellation reason (optional)"
          data={CANCELLATION_REASONS}
          value={cancelReason}
          onChange={setCancelReason}
          disabled={!cancellable}
          clearable
        />
        <Tooltip label={`Can't cancel an appointment with status "${appointment.status}"`} disabled={cancellable}>
          <Button
            variant="outline"
            color="red"
            data-disabled={!cancellable}
            loading={cancelling}
            leftSection={<IconX size={16} />}
            onClick={cancellable ? handleCancel : undefined}
          >
            Cancel visit
          </Button>
        </Tooltip>
      </Stack>

      <Modal opened={rescheduleConfirmOpened} onClose={rescheduleConfirmHandlers.close} title="Reschedule appointment">
        <Stack gap="sm">
          <Text size="sm">
            This opens Find &amp; Book to search for a new time, pre-filled with the same visit type and patient. The
            current appointment stays booked until you confirm the new one — if you leave without rebooking, nothing
            changes.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={rescheduleConfirmHandlers.close}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                rescheduleConfirmHandlers.close();
                onReschedule(appointment);
              }}
            >
              Find a new time
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
