// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Button, Center, Group, Loader, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
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
  const [schedule, setSchedule] = useState<WithId<Schedule> | undefined>();

  const [selectedActor, setSelectedActor] = useState<Reference<Practitioner> | undefined>(
    // When mounting, if no schedule was selected via the URL parameters, default
    // to choosing the current profile.
    !id ? createReference(profile) : undefined
  );
  const [loading, setLoading] = useState(true);

  // ReferenceInput does not take a `value` prop, so we use this stateful `key` to trigger
  // it to remount and take new values from `initialValue` on demand. :confounded:
  const [stateKey, setStateKey] = useState(0);

  // Load the schedule directly from the URL param
  useEffect(() => {
    if (!id) {
      return () => {};
    }
    let active = true;
    medplum
      .readResource('Schedule', id)
      .then((s) => {
        if (active) {
          setSchedule(s);
          setSelectedActor(undefined);
          setStateKey((prev) => prev + 1);
        }
      })
      .catch((err) => {
        if (active) {
          showErrorNotification(err);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, medplum]);

  // Search for a schedule when the user picks an actor
  useEffect(() => {
    if (!selectedActor?.reference) {
      return () => {};
    }
    let active = true;
    medplum
      .searchOne('Schedule', { actor: selectedActor.reference })
      .then((foundSchedule) => {
        if (!active) {
          return;
        }
        if (foundSchedule?.id) {
          // Loading ownership transfers to the ID-loading effect on navigation.
          navigate(`/Calendar/Schedule/${foundSchedule.id}`, { replace: true })?.catch(console.error);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        showErrorNotification(err);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedActor, medplum, navigate, id]);

  const handleActorChange = useCallback(
    (ref: Reference | undefined) => {
      if (ref) {
        setLoading(true);
        setSelectedActor(ref as Reference<Practitioner>);
      } else {
        setSelectedActor(undefined);
        setSchedule(undefined);
        if (id) {
          navigate('/Calendar/Schedule')?.catch(console.error);
        }
      }
    },
    [navigate, id]
  );

  const handleCreateScheduleForActor = useCallback(() => {
    if (!selectedActor) {
      return;
    }
    setLoading(true);
    medplum
      .createResource({
        resourceType: 'Schedule',
        actor: [selectedActor],
        active: true,
      })
      .then((created) => {
        // Loading ownership transfers to the ID-loading effect on navigation.
        navigate(`/Calendar/Schedule/${created.id}`)?.catch(console.error);
      })
      .catch((err) => {
        showErrorNotification(err);
        setLoading(false);
      });
  }, [selectedActor, medplum, navigate]);

  const schedulingEnabled = project?.features?.includes('scheduling');

  let mainContent: JSX.Element | null = null;
  if (loading) {
    mainContent = (
      <Center flex={1}>
        <Loader />
      </Center>
    );
  } else if (schedule) {
    mainContent = <ScheduleDetails schedule={schedule} />;
  } else if (selectedActor) {
    const noScheduleText = selectedActor.display
      ? `No schedule found for ${selectedActor.display}.`
      : 'No schedule found for this practitioner.';
    mainContent = (
      <Center flex={1}>
        <Stack align="center" gap="md">
          <Text c="dimmed">{noScheduleText}</Text>
          <Button onClick={handleCreateScheduleForActor}>Create Schedule</Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack p="sm" className={classes.page}>
      <Group justify="space-between">
        <Box w={320}>
          <ReferenceInput
            key={stateKey}
            name="schedule-actor"
            targetTypes={['Practitioner']}
            placeholder="Switch schedule..."
            defaultValue={(schedule?.actor?.[0] ?? selectedActor) as Reference<Practitioner>}
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
      {mainContent}
    </Stack>
  );
}
