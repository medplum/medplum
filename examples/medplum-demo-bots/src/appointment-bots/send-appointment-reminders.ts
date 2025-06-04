import { BotEvent, MedplumClient, createReference, getDisplayString } from '@medplum/core';
import { Appointment, Reference, Patient, Practitioner, Bundle } from '@medplum/fhirtypes';

/**
 * Helper function to send an appointment reminder.
 * It will send a reminder to the patient and the provider.
 * It will also send a reminder to the patient's phone.
 * @param medplum - The Medplum client.
 * @param appointment - The appointment to send a reminder for.
 * @returns The appointment.
 */
async function sendAppointmentReminder(medplum: MedplumClient, appointment: Appointment): Promise<Appointment> {
  // Get patient details from the appointment participant field
  const patientRef = appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'))?.actor;
  if (!patientRef) {
    throw new Error('Patient not found on appointment');
  }
  const patient = await medplum.readReference(patientRef as Reference<Patient>);
  const firstName = patient.name?.[0]?.given?.[0] || 'there';

  // Get practitioner details from the appointment participant field
  const practitionerRef = appointment.participant.find((p) => p.actor?.reference?.startsWith('Practitioner/'))?.actor;
  if (!practitionerRef) {
    throw new Error('Practitioner not found on appointment');
  }
  const practitioner = await medplum.readReference(practitionerRef as Reference<Practitioner>);
  const providerName = getDisplayString(practitioner) || 'your provider';

  // Format appointment time in Pacific Time
  const appointmentTime = new Date(appointment.start || '').toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: 'America/Los_Angeles', // Explicitly set to Pacific Time
  });

  // Optional: if you are using the zoom-create-meeting bot from /medplum-demo-bots/zoom-bots, you can get the zoom link from the extension
  const zoomLink = appointment.extension?.find(
    (e) => e.url === 'https://medplum.com/zoom-meeting-join-url'
  )?.valueString;

  let message = `Hi ${firstName}, this is a friendly reminder that you have an appointment with ${providerName} at ${appointmentTime}, PST.`;

  if (zoomLink) {
    message += `\n\nHere's your Zoom link: ${zoomLink}`;
  }

  // Send Communication. You can handle the SMS by creating another bot subscribed to the Communication resource
  // that sends an SMS via Twilio or another SMS provider and updates the status to 'completed'.
  await medplum.createResource({
    resourceType: 'Communication',
    status: 'in-progress',
    subject: createReference(patient),
    sender: createReference(practitioner),
    payload: [
      {
        contentString: message,
      },
    ],
    extension: [
      {
        url: 'https://medplum.com/appointment-reminder-sent',
        valueBoolean: true,
      },
    ],
    basedOn: [createReference(appointment)],
  });

  return appointment;
}

/**
 * This bot is used to send reminders for upcoming appointments.
 * It will send reminders to patients and providers for appointments starting in the next 24 hours.
 *
 * You should schedule to run this bot every day at 7:00AM to
 * send reminders for appointments starting in the next 24 hours.
 * @param medplum - The Medplum client.
 * @param _event - The event object
 * @returns A Bundle containing the appointments that were processed
 */
export async function handler(medplum: MedplumClient, _event: BotEvent): Promise<Bundle> {
  // Get current time and 24 hours from now. You could change this to run at a different time or different time intervals.
  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Search for appointments starting within the next 24 hours
  const appointments = await medplum.searchResources('Appointment', {
    _filter: `date ge ${now.toISOString()} and date lt ${twentyFourHoursFromNow.toISOString()}`,
    status: 'booked',
  });

  // Send reminders for each appointment
  for (const appointment of appointments) {
    try {
      await sendAppointmentReminder(medplum, appointment);
      console.log(`Sent reminder for appointment ${appointment.id}`);
    } catch (err) {
      console.error(`Failed to send reminder for appointment ${appointment.id}:`, err);
    }
  }

  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: appointments.length,
    entry: appointments.map((appointment) => ({ resource: appointment })),
  };
}
