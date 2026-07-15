// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Alert, Box, Button, Center, Group, Loader, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, isNotFound, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Practitioner, Reference, Schedule } from '@medplum/fhirtypes';
import { OperationOutcomeAlert, ReferenceInput, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconAlertCircle, IconSettings } from '@tabler/icons-react';
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
    !id && profile?.id ? createReference(profile) : undefined
  );
  const [loading, setLoading] = useState(true);
  const [readOutcome, setReadOutcome] = useState<OperationOutcome | undefined>();
  // Tracks the last ID whose fetch has settled (success or failure), so that
  // isLoadingById clears even when readResource rejects and schedule stays stale.
  const [resolvedId, setResolvedId] = useState<string | undefined>(undefined);

  // True immediately when the URL id changes (derived, no extra render) and stays
  // true until the fetch for that id settles or the schedule already matches.
  const isLoadingById = Boolean(id) && schedule?.id !== id && resolvedId !== id;

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
          setReadOutcome(undefined);

          // clear selection and bump state key to make the UI re-render showing
          // a practitioner from the schedule we just loaded.
          setSelectedActor(undefined);
          setStateKey((prev) => prev + 1);
        }
      })
      .catch((err) => {
        if (active) {
          setSchedule(undefined);
          setReadOutcome(normalizeOperationOutcome(err));

          // avoid showing a different practitioner's name along side
          // the error message. Clear the selected actor state and force a
          // re-render.
          setSelectedActor(undefined);
          setStateKey((prev) => prev + 1);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setResolvedId(id);
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
          if (foundSchedule.id === id) {
            // The found schedule is already displayed, so navigating would be a
            // no-op and the ID-loading effect would never fire to clear the
            // loading state. Settle here instead.
            setSelectedActor(undefined);
            setLoading(false);
          } else {
            // Loading ownership transfers to the ID-loading effect on navigation.
            navigate(`/Calendar/Schedule/${foundSchedule.id}`, { replace: true })?.catch(console.error);
          }
        } else {
          setSchedule(undefined);
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
        setReadOutcome(undefined);
        setSelectedActor(ref as Reference<Practitioner>);
      } else {
        setSelectedActor(undefined);
        setSchedule(undefined);
        setLoading(false);
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
        navigate(`/Calendar/Schedule/${created.id}`, { replace: true })?.catch(console.error);
      })
      .catch((err) => {
        showErrorNotification(err);
        setLoading(false);
      });
  }, [selectedActor, medplum, navigate]);

  const schedulingEnabled = project?.features?.includes('scheduling');

  let mainContent: JSX.Element | null = null;
  if (loading || isLoadingById) {
    mainContent = (
      <Center flex={1}>
        <Loader />
      </Center>
    );
  } else if (readOutcome) {
    // Special case some nicer UI for the most frequent error. Common scenario:
    // changing project while on a permalink page for a Schedule resource, you
    // suddenly don't have permission to see the resource you were just looking at.
    if (isNotFound(readOutcome)) {
      mainContent = (
        <Alert color="red" icon={<IconAlertCircle />} title="Not Found" m="xl">
          This schedule does not exist or you do not have permission to view it.
        </Alert>
      );
    } else {
      mainContent = <OperationOutcomeAlert outcome={readOutcome} m="xl" />;
    }
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
            disabled={isLoadingById}
          />
        </Box>
        {schedule && schedulingEnabled && (
          <ActionIcon
            variant="subtle"
            aria-label="Schedule settings"
            onClick={() => navigate(`/Calendar/Schedule/${id}/settings`)}
          >
            <IconSettings />
          </ActionIcon>
        )}
      </Group>
      {mainContent}
    </Stack>
  );
}
