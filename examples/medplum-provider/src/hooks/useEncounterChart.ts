// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
import { useCallback, useEffect, useState } from 'react';
import { getChargeItemsForEncounter } from '../utils/chargeitems';
import { createClaimFromEncounter } from '../utils/claims';
import { showErrorNotification } from '../utils/notifications';

export interface EncounterChartHook {
  // State values
  encounter: Encounter | undefined;
  claim: Claim | undefined;
  practitioner: Practitioner | undefined;
  tasks: Task[];
  clinicalImpression: ClinicalImpression | undefined;
  chargeItems: ChargeItem[];
  appointment: Appointment | undefined;
  // State setters
  setEncounter: React.Dispatch<React.SetStateAction<Encounter | undefined>>;
  setClaim: React.Dispatch<React.SetStateAction<Claim | undefined>>;
  setPractitioner: React.Dispatch<React.SetStateAction<Practitioner | undefined>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setClinicalImpression: React.Dispatch<React.SetStateAction<ClinicalImpression | undefined>>;
  setChargeItems: React.Dispatch<React.SetStateAction<ChargeItem[]>>;
  setAppointment: React.Dispatch<React.SetStateAction<Appointment | undefined>>;
}

export function useEncounterChart(
  encounter: Encounter | Reference<Encounter> | undefined,
  patient?: Patient | Reference<Patient>
): EncounterChartHook {
  const medplum = useMedplum();
  const encounterResource = useResource(encounter);
  const patientResource = useResource(patient);
  const [encounterState, setEncounter] = useState<Encounter | undefined>(encounterResource);
  const [claim, setClaim] = useState<Claim | undefined>();
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clinicalImpression, setClinicalImpression] = useState<ClinicalImpression | undefined>();
  const [chargeItems, setChargeItems] = useState<ChargeItem[]>([]);
  const [appointment, setAppointment] = useState<Appointment | undefined>();

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
        setPractitioner(practitionerResult as Practitioner);
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
        setAppointment(appointmentResult as Appointment);
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
        patientId,
        encounterResource.id,
        practitioner.id,
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
