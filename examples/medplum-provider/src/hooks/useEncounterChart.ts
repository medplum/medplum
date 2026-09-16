// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type {
  Appointment,
  ClinicalImpression,
  Encounter,
  Patient,
  Practitioner,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../utils/notifications';

export interface EncounterChartHook {
  // State values
  encounter: WithId<Encounter> | undefined;
  patient: WithId<Patient> | undefined;
  practitioner: WithId<Practitioner> | undefined;
  tasks: WithId<Task>[];
  clinicalImpression: WithId<ClinicalImpression> | undefined;
  appointment: WithId<Appointment> | undefined;
  // State setters
  setEncounter: Dispatch<SetStateAction<WithId<Encounter> | undefined>>;
  setPractitioner: Dispatch<SetStateAction<WithId<Practitioner> | undefined>>;
  setTasks: Dispatch<SetStateAction<WithId<Task>[]>>;
  setClinicalImpression: Dispatch<SetStateAction<WithId<ClinicalImpression> | undefined>>;
  setAppointment: Dispatch<SetStateAction<WithId<Appointment> | undefined>>;
}

export function useEncounterChart(encounter: WithId<Encounter> | Reference<Encounter> | undefined): EncounterChartHook {
  const medplum = useMedplum();
  const encounterResource = useResource(encounter);
  const patientReference = encounterResource?.subject as Reference<Patient> | undefined;
  const patientResource = useResource(patientReference);
  const [encounterState, setEncounter] = useState(encounterResource);
  const [practitioner, setPractitioner] = useState<WithId<Practitioner> | undefined>();
  const [tasks, setTasks] = useState<WithId<Task>[]>([]);
  const [clinicalImpression, setClinicalImpression] = useState<WithId<ClinicalImpression> | undefined>();
  const [appointment, setAppointment] = useState<WithId<Appointment> | undefined>();

  // Discard optimistic state from a previous encounter when the hook is reused across
  // selections without a remount.
  if (encounterState && encounterResource && encounterState.id !== encounterResource.id) {
    setEncounter(encounterResource);
  }

  // Prefer encounterState (explicitly set via setEncounter) for immediate optimistic updates.
  // Falls back to encounterResource on initial load before any explicit set.
  const encounterToUse = encounterState ?? encounterResource;

  // Fetch tasks and the clinical impression on mount or when encounter ID changes. An encounter
  // without a clinical impression gets one via conditional create so concurrent effect runs
  // (e.g. StrictMode) cannot persist duplicates; the ignore flag drops results from a stale run.
  useEffect(() => {
    if (!encounterResource) {
      return undefined;
    }
    const enc = encounterResource;
    let ignore = false;

    async function fetchTasks(): Promise<void> {
      const taskResult = await medplum.searchResources('Task', `encounter=${getReferenceString(enc)}`, {
        cache: 'no-cache',
      });
      if (ignore) {
        return;
      }
      taskResult.sort((a: Task, b: Task) => {
        const dateA = new Date(a.authoredOn || '').getTime();
        const dateB = new Date(b.authoredOn || '').getTime();
        return dateA - dateB;
      });
      setTasks(taskResult);
    }

    async function fetchClinicalImpressions(): Promise<void> {
      const query = `encounter=${getReferenceString(enc)}`;
      const clinicalImpressionResult = await medplum.searchResources('ClinicalImpression', query, {
        cache: 'no-cache',
      });
      if (ignore) {
        return;
      }
      const existing = clinicalImpressionResult?.[0];
      if (existing || !enc.subject) {
        setClinicalImpression(existing);
        return;
      }
      const created = await medplum.createResourceIfNoneExist<ClinicalImpression>(
        {
          resourceType: 'ClinicalImpression',
          status: 'in-progress',
          description: 'Initial clinical impression',
          subject: enc.subject,
          encounter: createReference(enc),
          date: new Date().toISOString(),
        },
        query
      );
      if (ignore) {
        return;
      }
      setClinicalImpression(created);
    }

    fetchTasks().catch((err) => showErrorNotification(err));
    fetchClinicalImpressions().catch((err) => showErrorNotification(err));

    return () => {
      ignore = true;
    };
  }, [encounterResource, medplum]);

  // Fetch practitioner related to the encounter
  useEffect(() => {
    const fetchPractitioner = async (): Promise<void> => {
      if (encounterResource?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(encounterResource.participant[0].individual);
        setPractitioner(practitionerResult as WithId<Practitioner>);
      }
    };

    if (encounterResource) {
      fetchPractitioner().catch((err) => showErrorNotification(err));
    }
  }, [encounterResource, medplum]);

  // Fetch appointment related to the encounter
  useEffect(() => {
    const fetchAppointment = async (): Promise<void> => {
      const appointmentRef = encounterResource?.appointment?.at(-1);
      if (appointmentRef) {
        const appointmentResult = await medplum.readReference(appointmentRef);
        setAppointment(appointmentResult);
      }
    };

    if (encounterResource) {
      fetchAppointment().catch((err) => showErrorNotification(err));
    }
  }, [encounterResource, medplum]);

  return {
    encounter: encounterToUse,
    patient: patientResource,
    practitioner,
    tasks,
    clinicalImpression,
    appointment,
    setEncounter,
    setPractitioner,
    setTasks,
    setClinicalImpression,
    setAppointment,
  };
}
