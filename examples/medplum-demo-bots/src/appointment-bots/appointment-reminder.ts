import { BotEvent, MedplumClient, getDisplayString } from '@medplum/core';
import { Appointment, Reference, Patient, Practitioner } from '@medplum/fhirtypes';

/**
 * This bot is used to send a reminder for an appointment.
 * It will send a reminder to the patient and the provider.
 * It will also send a reminder to the patient's phone.
 * @param medplum - The Medplum client.
 * @param event - The event object.
 * @returns The appointment.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<Appointment> {
  const appointment = event.input as Appointment;
  
  // Get patient details from the appointment participant field
  const patientRef = appointment.participant.find(p => p.actor?.reference?.startsWith('Patient/'))?.actor;
  if (!patientRef) {
    throw new Error('Patient not found on appointment');
  }
  const patient = await medplum.readReference(patientRef as Reference<Patient>);
  const firstName = patient.name?.[0]?.given?.[0];
  
  // Get practitioner details from the appointment participant field
  const practitionerRef = appointment.participant.find(p => p.actor?.reference?.startsWith('Practitioner/'))?.actor;
  if (!practitionerRef) {
    throw new Error('Practitioner not found on appointment');
  }
  const practitioner = await medplum.readReference(practitionerRef as Reference<Practitioner>);
  const providerName = getDisplayString(practitioner) || 'your provider';
  
  // Format appointment time
  const appointmentTime = new Date(appointment.start || '').toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
  
  // Optional: if you are using the zoom-create-meeting bot, you can get the zoom link from the extension
  const zoomLink = appointment.extension?.find(e => e.url === 'https://medplum.com/zoom-meeting-join-url')?.valueString;
  
  let message = `Hi ${firstName}, this is a friendly reminder that you have an appointment with ${providerName} at ${appointmentTime}.`
  
  if (zoomLink) { 
    message += `\n\nHere's your Zoom link: ${zoomLink}`;
  }
  
  // Send SMS or other notification
  // This is a placeholder - you'll need to implement the actual notification logic
  console.log('Sending appointment reminder:', message);
  
  return appointment;
} 