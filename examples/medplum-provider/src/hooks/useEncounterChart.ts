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
import { useCallback, useEffect, useState } from 'react';
import { getChargeItemsForEncounter } from '../utils/chargeitems';
import { createClaimFromEncounter } from '../utils/claims';
import { showErrorNotification } from '../utils/notifications';

export interface EncounterChartHook {
  // State values
  encounter: WithId<Encounter> | undefined;
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

export function useEncounterChart(
  encounter: WithId<Encounter> | Reference<Encounter> | undefined,
  patient?: Patient | Reference<Patient>
): EncounterChartHook {
  const medplum = useMedplum();
  const encounterResource = useResource(encounter);
  const patientResource = useResource(patient);
  const [encounterState, setEncounter] = useState<WithId<Encounter> | undefined>(encounterResource);
  const [claim, setClaim] = useState<WithId<Claim> | undefined>();
  const [practitioner, setPractitioner] = useState<WithId<Practitioner> | undefined>();
  const [tasks, setTasks] = useState<WithId<Task>[]>([]);
  const [clinicalImpression, setClinicalImpression] = useState<WithId<ClinicalImpression> | undefined>();
  const [chargeItems, setChargeItems] = useState<WithId<ChargeItem>[]>([]);
  const [appointment, setAppointment] = useState<WithId<Appointment> | undefined>();

  const encounterToUse = encounterResource ?? encounterState;

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

  // Fetch tasks related to the encounter
  const fetchTasks = useCallback(async (): Promise<void> => {
    if (!encounterResource) {
      return;
    }
    const taskResult = await medplum.searchResources('Task', `encounter=${getReferenceString(encounterResource)}`, {
      cache: 'no-cache',
    });

    taskResult.sort((a: Task, b: Task) => {
      const dateA = new Date(a.authoredOn || '').getTime();
      const dateB = new Date(b.authoredOn || '').getTime();
      return dateA - dateB;
    });

    setTasks(taskResult);
  }, [medplum, encounterResource]);

  // Fetch clinical impressions related to the encounter
  const fetchClinicalImpressions = useCallback(async (): Promise<void> => {
    if (!encounterResource) {
      return;
    }
    const clinicalImpressionResult = await medplum.searchResources(
      'ClinicalImpression',
      `encounter=${getReferenceString(encounterResource)}`
    );

    const result = clinicalImpressionResult?.[0];
    setClinicalImpression(result);
  }, [medplum, encounterResource]);

  // Fetch data on component mount or when encounter changes
  useEffect(() => {
    if (encounterResource) {
      fetchTasks().catch((err) => showErrorNotification(err));
      fetchClinicalImpressions().catch((err) => showErrorNotification(err));
    }
  }, [encounterResource, fetchTasks, fetchClinicalImpressions]);

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
    // State values - use resolved resource when available
    encounter: encounterToUse,
    claim,
    practitioner,
    tasks,
    clinicalImpression,
    chargeItems,
    appointment,
    // State setters
    setEncounter,
    setClaim,
    setPractitioner,
    setTasks,
    setClinicalImpression,
    setChargeItems,
    setAppointment,
  };
}
