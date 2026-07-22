// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Drawer, Group, Modal, Stack, Switch, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { createReference, formatDateTime } from '@medplum/core';
import type { HealthcareService, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCalendarOff, IconClockEdit } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { Range } from '../../types/scheduling';
import { showErrorNotification } from '../../utils/notifications';
import type { AvailabilityWindow } from '../../utils/schedulingParameters';
import { getScheduleAvailability, setScheduleAvailability, toPerDayWindows } from '../../utils/schedulingParameters';
import { AvailabilityBlocksCalendar } from './AvailabilityBlocksCalendar';
import type { BlockSpec, BlockTimeDefaults } from './BlockTimeModal';
import { BlockTimeModal } from './BlockTimeModal';
import { WeeklyHoursConfig } from './WeeklyHoursConfig';

/**
 * Availability mode for one actor: one dated calendar (the time-off surface,
 * showing recurring hours as translucent green + one-time blocks) plus the
 * recurring **weekly hours configuration** behind an "Edit weekly hours"
 * drawer, and a Google-style "Block time" modal. Recurring hours are keyed
 * per-HealthcareService, but providers think "my hours," so "Apply to all
 * visit types" is the save default. Remounted via a `key` on actor+visitType
 * so the template seeds cleanly.
 * @param props - Availability manager props.
 * @returns The availability management element for one actor.
 */
export type AvailabilityManagerProps = {
  schedule: WithId<Schedule>;
  // Schedule has no display-friendly name/text field (getDisplayString falls
  // back to the bare "Schedule/<id>" reference) — always pass the resolved
  // actor label (e.g. the provider's name) instead.
  actorLabel: string;
  visitType: WithId<HealthcareService>;
  // Every HealthcareService reference string this schedule serves (apply-to-all-visit-types).
  serviceRefsForSchedule: string[];
  // Every schedule in the practice (for the holiday cascade / apply-to-all-actors).
  allSchedules: WithId<Schedule>[];
  blocks: WithId<Slot>[];
  blocksRange: Range | undefined;
  onBlocksRangeChange: (range: Range) => void;
  onRefresh: () => void;
};

export function AvailabilityManager(props: AvailabilityManagerProps): JSX.Element {
  const { schedule, visitType, serviceRefsForSchedule, allSchedules } = props;
  const medplum = useMedplum();

  const [windows, setWindows] = useState<AvailabilityWindow[]>(() =>
    toPerDayWindows(getScheduleAvailability(schedule, visitType))
  );
  const [applyToAll, setApplyToAll] = useState(true);
  const [saving, setSaving] = useState(false);

  const [hoursOpened, hoursHandlers] = useDisclosure(false);
  const [blockOpened, blockHandlers] = useDisclosure(false);
  const [blockDefaults, setBlockDefaults] = useState<BlockTimeDefaults>();
  const [viewingBlock, setViewingBlock] = useState<WithId<Slot> | null>(null);
  const [viewOpened, viewHandlers] = useDisclosure(false);

  const handleSaveHours = async (): Promise<void> => {
    setSaving(true);
    try {
      // Re-read immediately before writing rather than trusting `schedule`'s
      // versionId, which is a prop that can sit in React state for a long
      // time (the drawer can stay open, or the page can just have been
      // loaded a while ago) — if the Schedule changed on the server in the
      // meantime for *any* reason (another edit, a reseed, another admin),
      // the captured versionId goes stale and the write 412s ("precondition
      // failed") even though nothing about this save was actually wrong.
      // Read-modify-write on a fresh copy fixes that regardless of cause.
      const fresh = await medplum.readResource('Schedule', schedule.id);
      const targetRefs = applyToAll ? serviceRefsForSchedule : [`HealthcareService/${visitType.id}`];
      let working: Schedule = fresh;
      for (const ref of targetRefs) {
        working = setScheduleAvailability(working, { reference: ref }, windows);
      }
      await medplum.updateResource(working, {
        headers: { 'If-Match': fresh.meta?.versionId ? `W/"${fresh.meta.versionId}"` : '' },
      });
      medplum.invalidateSearches('Schedule');
      props.onRefresh();
      hoursHandlers.close();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  };

  const handleBlockSubmit = async (spec: BlockSpec): Promise<void> => {
    blockHandlers.close();
    // Timed = single day + times; all-day = full days across an inclusive
    // date range (end date + 1 day at midnight).
    let start: Date;
    let end: Date;
    if (spec.allDay) {
      start = new Date(`${spec.startDate}T00:00:00`);
      end = new Date(`${spec.endDate}T00:00:00`);
      end.setDate(end.getDate() + 1);
    } else {
      start = new Date(`${spec.date}T${spec.startTime}:00`);
      end = new Date(`${spec.date}T${spec.endTime}:00`);
    }
    const targets = spec.applyToAll ? allSchedules : [schedule];
    try {
      await Promise.all(
        targets.map((target) =>
          medplum.createResource<Slot>({
            resourceType: 'Slot',
            schedule: createReference(target),
            status: 'busy-unavailable',
            start: start.toISOString(),
            end: end.toISOString(),
            comment: spec.reason,
          })
        )
      );
      props.onRefresh();
    } catch (err) {
      showErrorNotification(err);
    }
  };

  const handleDeleteBlock = async (slot: WithId<Slot>): Promise<void> => {
    viewHandlers.close();
    try {
      await medplum.deleteResource('Slot', slot.id);
      props.onRefresh();
    } catch (err) {
      showErrorNotification(err);
    }
  };

  const headerActions = (
    <Group gap="xs" wrap="nowrap">
      <Button variant="default" size="xs" leftSection={<IconClockEdit size={14} />} onClick={hoursHandlers.open}>
        Edit weekly hours
      </Button>
      <Button
        size="xs"
        leftSection={<IconCalendarOff size={14} />}
        onClick={() => {
          setBlockDefaults(undefined);
          blockHandlers.open();
        }}
      >
        Block time
      </Button>
    </Group>
  );

  return (
    <div style={{ height: '100%' }}>
      <AvailabilityBlocksCalendar
        availabilityWindows={windows}
        blocks={props.blocks}
        range={props.blocksRange}
        onRangeChange={props.onBlocksRangeChange}
        headerActions={headerActions}
        onSelectRange={(start, end) => {
          setBlockDefaults({
            date: start.toISOString().slice(0, 10),
            startTime: start.toTimeString().slice(0, 5),
            endTime: end.toTimeString().slice(0, 5),
          });
          blockHandlers.open();
        }}
        onSelectBlock={(slot) => {
          setViewingBlock(slot);
          viewHandlers.open();
        }}
      />

      <Drawer opened={hoursOpened} onClose={hoursHandlers.close} position="right" size="lg" title={`Weekly hours — ${props.actorLabel}`}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Set the standing weekly availability for {props.actorLabel}. These hours drive what Find &amp; Book can offer.
          </Text>
          <WeeklyHoursConfig windows={windows} onChange={setWindows} />
          <Divider />
          <Switch
            label="Apply to all visit types this actor serves"
            description={
              applyToAll ? 'Same hours across every visit type (recommended)' : `Editing hours for “${visitType.name}” only`
            }
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={hoursHandlers.close}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleSaveHours}>
              Save hours
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <BlockTimeModal
        opened={blockOpened}
        onClose={blockHandlers.close}
        actorTypeLabel="actors"
        defaults={blockDefaults}
        onSubmit={handleBlockSubmit}
      />

      <Modal opened={viewOpened} onClose={viewHandlers.close} title="Blocked time">
        {viewingBlock && (
          <Stack gap="sm">
            <Text fw={600}>{viewingBlock.comment ?? 'Blocked'}</Text>
            <Text size="sm">
              {formatDateTime(viewingBlock.start)} – {formatDateTime(viewingBlock.end)}
            </Text>
            <Group justify="flex-end">
              <Button color="red" variant="outline" onClick={() => handleDeleteBlock(viewingBlock)}>
                Delete block
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
