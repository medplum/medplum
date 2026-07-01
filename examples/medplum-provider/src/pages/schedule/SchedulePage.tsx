// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Group, Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { Practitioner, Reference, Schedule } from '@medplum/fhirtypes';
import { ReferenceInput, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconSettings } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScheduleDetails } from '../../components/schedule/ScheduleDetails';
import { showErrorNotification } from '../../utils/notifications';
import classes from './SchedulePage.module.css';

/**
 * Schedule page that displays the practitioner's schedule.
 * Allows the practitioner to create/update slots and create appointments.
 * @returns A React component that displays the schedule page.
 */
export function SchedulePage(): JSX.Element | null {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const project = medplum.getProject();

  // Redirect to the current user's schedule if no id in the URL
  useEffect(() => {
    if (id || !profile?.id) {
      return;
    }
    medplum
      .searchOne('Schedule', { actor: getReferenceString(profile as WithId<Practitioner>) })
      .then((foundSchedule) => {
        if (foundSchedule?.id) {
          navigate(`/Calendar/Schedule/${foundSchedule.id}`, { replace: true })?.catch(console.log);
        } else {
          medplum
            .createResource({
              resourceType: 'Schedule',
              actor: [createReference(profile as WithId<Practitioner>)],
              active: true,
            })
            .then((created) => {
              navigate(`/Calendar/Schedule/${created.id}`, { replace: true })?.catch(console.log);
            })
            .catch(showErrorNotification);
        }
      })
      .catch(showErrorNotification);
  }, [id, profile, medplum, navigate]);
  const [schedule, setSchedule] = useState<WithId<Schedule> | undefined>();

  // Load the schedule directly from the URL param
  useEffect(() => {
    if (!id) {
      return;
    }
    setSchedule(undefined);
    medplum.readResource('Schedule', id).then(setSchedule).catch(showErrorNotification);
  }, [id, medplum]);

  const handleActorChange = useCallback(
    (ref: Reference | undefined) => {
      if (!ref?.reference) {
        return;
      }
      medplum
        .searchOne('Schedule', { actor: ref.reference })
        .then((foundSchedule) => {
          if (foundSchedule?.id) {
            navigate(`/Calendar/Schedule/${foundSchedule.id}`)?.catch(console.error);
          }
        })
        .catch(showErrorNotification);
    },
    [medplum, navigate]
  );

  const schedulingEnabled = project?.features?.includes('scheduling');

  return (
    <Stack p="sm" className={classes.page}>
      <Group justify="space-between">
        <Box w={320}>
          <ReferenceInput
            key={schedule?.id}
            name="schedule-actor"
            targetTypes={['Practitioner']}
            placeholder="Switch schedule..."
            defaultValue={schedule?.actor?.[0] as Reference<Practitioner>}
            onChange={handleActorChange}
          />
        </Box>
        {schedule && schedulingEnabled && (
          <ActionIcon
            variant="subtle"
            aria-label="Schedule settings"
            onClick={() => navigate(`/Calendar/Schedule/${schedule.id}/settings`)}
          >
            <IconSettings />
          </ActionIcon>
        )}
      </Group>
      {schedule && <ScheduleDetails schedule={schedule} />}
    </Stack>
  );
}
