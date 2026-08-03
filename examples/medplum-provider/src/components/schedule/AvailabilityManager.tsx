// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Drawer, LoadingOverlay, Stack, Text, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, isResourceWithId } from '@medplum/core';
import type { Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useSchedulingSlots } from '../../hooks/useSchedulingResources';
import type { Range } from '../../types/scheduling';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { Calendar } from '../Calendar';
import classes from './AvailabilityManager.module.css';
import { SlotForm } from './SlotForm';

export interface AvailabilityManagerProps {
  schedule: WithId<Schedule>;
}

export function AvailabilityManager(props: AvailabilityManagerProps): JSX.Element {
  const [range, setRange] = useState<Range | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<Slot | undefined>(undefined);
  const { slots, loading } = useSchedulingSlots([props.schedule], range);

  const medplum = useMedplum();
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (slot: Slot): Promise<void> => {
    setIsSaving(true);
    const isUpdate = isResourceWithId(slot);
    try {
      if (isUpdate) {
        await medplum.updateResource(slot);
      } else {
        await medplum.createResource(slot);
      }
      showSuccessNotification({
        title: 'Success',
        message: isUpdate ? 'Slot updated' : 'Slot created',
      });
      setSelectedSlot(undefined);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectInterval = (range: Range): void => {
    setSelectedSlot({
      resourceType: 'Slot',
      schedule: createReference(props.schedule),
      status: 'busy',
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });
  };

  return (
    <>
      <div className={classes.container}>
        <Stack gap="sm" h="100%" className={classes.calendarPane}>
          <Box pos="relative" h="100%">
            <LoadingOverlay visible={loading} />
            <Calendar
              slots={slots ?? []}
              appointments={[]}
              onRangeChange={setRange}
              onSelectInterval={handleSelectInterval}
              focus="Slot"
              onSelectSlot={setSelectedSlot}
            />
          </Box>
        </Stack>
        <Stack gap="sm" className={classes.sidePane}>
          <Title order={4}>Availability Manager</Title>
          <Button
            fullWidth
            onClick={() =>
              setSelectedSlot({
                resourceType: 'Slot',
                schedule: createReference(props.schedule),
                status: 'busy',
                start: '',
                end: '',
              })
            }
          >
            Add Blocked Time
          </Button>
          <Text size="sm" c="dimmed">
            Click and drag across the calendar to select a block of time, then set it to <strong>Free</strong> to open
            it for scheduling or <strong>Busy</strong> to block it off.
          </Text>
        </Stack>
      </div>
      <Drawer
        opened={!!selectedSlot}
        onClose={() => setSelectedSlot(undefined)}
        position="right"
        title={
          <Text size="xl" fw={700}>
            {isResourceWithId(selectedSlot) ? 'Edit Slot' : 'Create Slot'}
          </Text>
        }
      >
        {selectedSlot && <SlotForm slot={selectedSlot} isLoading={isSaving} onSubmit={handleSubmit} />}
      </Drawer>
    </>
  );
}
