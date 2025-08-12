// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import { Appointment, ChargeItem, Claim, ClinicalImpression, Encounter, Practitioner, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
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

export function useEncounterChart(patientId?: string, encounterId?: string): EncounterChartHook {
  const medplum = useMedplum();

  // States
  const [encounter, setEncounter] = useState<Encounter | undefined>();
  const [claim, setClaim] = useState<Claim | undefined>();
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clinicalImpression, setClinicalImpression] = useState<ClinicalImpression | undefined>();
  const [chargeItems, setChargeItems] = useState<ChargeItem[]>([]);
  const [appointment, setAppointment] = useState<Appointment | undefined>();

  // Load encounter data
  useEffect(() => {
    async function loadEncounter(): Promise<void> {
      if (encounterId && !encounter) {
        const encounterResult = await medplum.readResource('Encounter', encounterId);
        if (encounterResult) {
          setEncounter(encounterResult);
          const chargeItems = await getChargeItemsForEncounter(medplum, encounterResult);
          setChargeItems(chargeItems);
        }
      }
    }

    async function fetchClaim(): Promise<void> {
      if (!encounter?.id) {
        return;
      }
      const response = await medplum.searchResources('Claim', `encounter=${getReferenceString(encounter)}`);
      if (response.length !== 0) {
        setClaim(response[0]);
      }
    }

    loadEncounter().catch(showErrorNotification);
    fetchClaim().catch(showErrorNotification);
  }, [encounterId, encounter, medplum]);

  // Fetch tasks related to the encounter
  const fetchTasks = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }
    const taskResult = await medplum.searchResources('Task', `encounter=${getReferenceString(encounter)}`, {
      cache: 'no-cache',
    });

    taskResult.sort((a: Task, b: Task) => {
      const dateA = new Date(a.authoredOn || '').getTime();
      const dateB = new Date(b.authoredOn || '').getTime();
      return dateA - dateB;
    });

    setTasks(taskResult);
  }, [medplum, encounter]);

  // Fetch clinical impressions related to the encounter
  const fetchClinicalImpressions = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }
    const clinicalImpressionResult = await medplum.searchResources(
      'ClinicalImpression',
      `encounter=${getReferenceString(encounter)}`
    );

    const result = clinicalImpressionResult?.[0];
    setClinicalImpression(result);
  }, [medplum, encounter]);

  // Fetch data on component mount or when encounter changes
  useEffect(() => {
    if (encounter) {
      fetchTasks().catch((err) => showErrorNotification(err));
      fetchClinicalImpressions().catch((err) => showErrorNotification(err));
    }
  }, [encounter, fetchTasks, fetchClinicalImpressions]);

  // Fetch practitioner related to the encounter
  useEffect(() => {
    const fetchPractitioner = async (): Promise<void> => {
      if (encounter?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(encounter.participant[0].individual);
        setPractitioner(practitionerResult as Practitioner);
      }
    };

    if (encounter) {
      fetchPractitioner().catch((err) => showErrorNotification(err));
    }
  }, [encounter, medplum]);

  // Fetch appointment related to the encounter
  useEffect(() => {
    const fetchAppointment = async (): Promise<void> => {
      if (encounter?.appointment) {
        const appointmentResult = await medplum.readReference(encounter.appointment[encounter.appointment.length - 1]);
        setAppointment(appointmentResult as Appointment);
      }
    };

    if (encounter) {
      fetchAppointment().catch((err) => showErrorNotification(err));
    }
  }, [encounter, medplum]);

  useEffect(() => {
    const createClaim = async (): Promise<void> => {
      if (claim) {
        // If a claim already exists, don't create a new one
        return;
      }

      if (!patientId || !encounter?.id || !practitioner?.id || chargeItems.length === 0) {
        return;
      }
      const newClaim = await createClaimFromEncounter(medplum, patientId, encounter.id, practitioner.id, chargeItems);
      if (newClaim) {
        setClaim(newClaim);
      }
    };
    createClaim().catch((err) => showErrorNotification(err));
  }, [patientId, encounter, medplum, claim, practitioner, chargeItems]);

  return {
    // State values
    encounter,
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
