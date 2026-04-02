// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type {
  Appointment,
  ChargeItem,
  Claim,
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
import { getChargeItemsForEncounter } from '../utils/chargeitems';
import { createClaimFromEncounter } from '../utils/claims';
import { showErrorNotification } from '../utils/notifications';

export interface EncounterChartHook {
  // State values
  encounter: WithId<Encounter> | undefined;
  patient: WithId<Patient> | undefined;
  claim: WithId<Claim> | undefined;
  practitioner: WithId<Practitioner> | undefined;
  tasks: WithId<Task>[];
  clinicalImpression: WithId<ClinicalImpression> | undefined;
  chargeItems: WithId<ChargeItem>[];
  appointment: WithId<Appointment> | undefined;
  // State setters
  setEncounter: Dispatch<SetStateAction<WithId<Encounter> | undefined>>;
  setClaim: Dispatch<SetStateAction<WithId<Claim> | undefined>>;
  setPractitioner: Dispatch<SetStateAction<WithId<Practitioner> | undefined>>;
  setTasks: Dispatch<SetStateAction<WithId<Task>[]>>;
  setClinicalImpression: Dispatch<SetStateAction<WithId<ClinicalImpression> | undefined>>;
  setChargeItems: Dispatch<SetStateAction<WithId<ChargeItem>[]>>;
  setAppointment: Dispatch<SetStateAction<WithId<Appointment> | undefined>>;
}

export function useEncounterChart(encounter: WithId<Encounter> | Reference<Encounter> | undefined): EncounterChartHook {
  const medplum = useMedplum();
  const encounterResource = useResource(encounter);
  const patientReference = encounterResource?.subject as Reference<Patient> | undefined;
  const patientResource = useResource(patientReference);
  const [encounterState, setEncounter] = useState(encounterResource);
  const [claim, setClaim] = useState<WithId<Claim> | undefined>();
  const [practitioner, setPractitioner] = useState<WithId<Practitioner> | undefined>();
  const [tasks, setTasks] = useState<WithId<Task>[]>([]);
  const [clinicalImpression, setClinicalImpression] = useState<WithId<ClinicalImpression> | undefined>();
  const [chargeItems, setChargeItems] = useState<WithId<ChargeItem>[]>([]);
  const [appointment, setAppointment] = useState<WithId<Appointment> | undefined>();

  // Prefer encounterState (explicitly set via setEncounter) for immediate optimistic updates.
  // Falls back to encounterResource on initial load before any explicit set.
  const encounterToUse = encounterState ?? encounterResource;

  useEffect(() => {
    async function loadChargeItems(): Promise<void> {
      if (encounterResource) {
        const chargeItemsResult = await getChargeItemsForEncounter(medplum, encounterResource);
        setChargeItems(chargeItemsResult);
      }
    }

    async function fetchClaim(): Promise<void> {
      if (!encounterResource?.id) {
        return;
      }
      const response = await medplum.searchResources('Claim', `encounter=${getReferenceString(encounterResource)}`);
      if (response.length !== 0) {
        setClaim(response[0]);
      }
    }

    loadChargeItems().catch(showErrorNotification);
    fetchClaim().catch(showErrorNotification);
  }, [encounterResource, medplum]);

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

  useEffect(() => {
    const createClaim = async (): Promise<void> => {
      if (claim) {
        // If a claim already exists, don't create a new one
        return;
      }

      const patientId = patientResource?.id;
      if (!patientId || !encounterResource?.id || !practitioner?.id || chargeItems.length === 0) {
        return;
      }
      const newClaim = await createClaimFromEncounter(
        medplum,
        patientResource,
        encounterResource,
        practitioner,
        chargeItems
      );
      if (newClaim) {
        setClaim(newClaim);
      }
    };
    createClaim().catch((err) => showErrorNotification(err));
  }, [patientResource, encounterResource, medplum, claim, practitioner, chargeItems]);

  return {
    encounter: encounterToUse,
    patient: patientResource,
    claim,
    practitioner,
    tasks,
    clinicalImpression,
    chargeItems,
    appointment,
    setEncounter,
    setClaim,
    setPractitioner,
    setTasks,
    setClinicalImpression,
    setChargeItems,
    setAppointment,
  };
}
