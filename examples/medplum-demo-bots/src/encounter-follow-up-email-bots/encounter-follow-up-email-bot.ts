// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { BotEvent, MedplumClient } from '@medplum/core';
import { Encounter, Patient, Practitioner, Reference } from '@medplum/fhirtypes';

const PATIENT_APP_URL =  'https://example.com';
export async function handler(medplum: MedplumClient, event: BotEvent<Encounter>): Promise<void>{  
  const encounter = event.input as Encounter;
  if (encounter.status !== 'finished') {
    return;
  }

  const previousEncounters = await medplum.readHistory('Encounter', encounter.id as string, { count: 2 } );
  const previousEncounter = previousEncounters?.entry?.[1]?.resource;
  if (previousEncounter && previousEncounter.status === 'finished') {
    return;
  }
  if (!encounter.subject) {
    console.log('Encounter has no subject reference, skipping email');
    return;
  }

  const subjectReference = encounter.subject as Reference<Patient>;
  let patient: Patient;
  try {
    patient = await medplum.readReference(subjectReference);
  } catch (error) {
    console.log(`Failed to read patient reference:`, error);
    return;
  }

  const patientEmail = patient.telecom?.find((telecom) => telecom.system === 'email')?.value;
  if (!patientEmail) {
    console.log('Patient has no email address, skipping email');
    return;
  }

  let providerName = '';
  let providerParticipant = encounter.participant
    ?.find((participant) =>
      participant.type?.some((type) =>
        type.coding?.some((coding) => 
          coding.code === 'PPRF' || 
          coding.system === 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType' ||
          coding.display?.toLowerCase().includes('primary performer')
        )
      )
    );

  if (!providerParticipant) {
    providerParticipant = encounter.participant?.find((participant) => 
      participant.individual?.reference?.includes('Practitioner')
    );
  }

  if (providerParticipant?.individual?.display) {
    providerName = providerParticipant.individual.display;
  } else if (providerParticipant?.individual?.reference) {
    try {
      const practitioner = await medplum.readReference(providerParticipant.individual as Reference<Practitioner>);
      if (practitioner.name?.[0]?.text) {
        providerName = practitioner.name[0].text;
      } else if (practitioner.name?.[0]?.family) {
        const prefix = practitioner.name[0].prefix?.join(' ') || '';
        const given = practitioner.name[0].given?.join(' ') || '';
        const family = practitioner.name[0].family || '';
        const parts = [prefix, given, family].filter(part => part.trim() !== '');
        providerName = parts.join(' ') || 'Provider';
      }
    } catch (error) {
      console.log(`Failed to read provider reference:`, error);
    }
  }

  let encounterDate = '';
  if (encounter.period?.start) {
    const date = new Date(encounter.period.start);
    if (!isNaN(date.getTime())) {
      encounterDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }
  }

  let patientName = patient.name?.[0]?.text;
  if (!patientName) {
    const given = patient.name?.[0]?.given?.join(' ') || '';
    const family = patient.name?.[0]?.family || '';
    patientName = (given + ' ' + family).trim();
  }
  if (!patientName) {
    patientName = encounter.subject?.display || 'Patient';
  }

  const appointmentId = encounter.appointment?.[0]?.reference?.split('/').pop() || '';
  await medplum.sendEmail({
    to: patientEmail,
    subject: `Follow up from your appointment with ${providerName} - ${encounterDate}`,
    html:`
      <p>Hello ${patientName},</p>
      <p>Following up from your appointment with ${providerName} today.</p>
      <p><a href="${PATIENT_APP_URL}/Appointment/${appointmentId}">View your visit summary</a></p>
      <p>Remember to <a href="${PATIENT_APP_URL}/get-care">schedule a follow up</a></p>
    `,
  });
}