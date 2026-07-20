// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
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

  // Prefer encounterState (explicitly set via setEncounter) for immediate optimistic updates.
  // Falls back to encounterResource on initial load before any explicit set.
  const encounterToUse = encounterState ?? encounterResource;

  // Fetch tasks and clinical impressions on mount or when encounter ID changes
  useEffect(() => {
    if (!encounterResource) {
      return;
    }
    const enc = encounterResource;

    async function fetchTasks(): Promise<void> {
      const taskResult = await medplum.searchResources('Task', `encounter=${getReferenceString(enc)}`, {
        cache: 'no-cache',
      });
      taskResult.sort((a: Task, b: Task) => {
        const dateA = new Date(a.authoredOn || '').getTime();
        const dateB = new Date(b.authoredOn || '').getTime();
        return dateA - dateB;
      });
      setTasks(taskResult);
    }

    async function fetchClinicalImpressions(): Promise<void> {
      const clinicalImpressionResult = await medplum.searchResources(
        'ClinicalImpression',
        `encounter=${getReferenceString(enc)}`
      );
      setClinicalImpression(clinicalImpressionResult?.[0]);
    }

    fetchTasks().catch((err) => showErrorNotification(err));
    fetchClinicalImpressions().catch((err) => showErrorNotification(err));
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
