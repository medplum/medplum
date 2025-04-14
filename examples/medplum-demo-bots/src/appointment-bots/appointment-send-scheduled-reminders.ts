import { BotEvent, MedplumClient } from '@medplum/core';

/**
 * This bot is used to send a reminder for an appointment.
 * It will send a reminder to the patient and the provider.
 * It will also send a reminder to the patient's phone.
 * 
 * You could schedule to run this bot every day at 7:00AM to 
 * send reminders for appointments starting in the next 24 hours.
 * @param medplum - The Medplum client.
 * @param _event - The event object
 * @returns The appointment.
 */
export async function handler(medplum: MedplumClient, _event: BotEvent): Promise<any> {
  // Get the appointment reminder bot
  const reminderBot = await medplum.searchOne('Bot', 'name=appointment-reminder');
  if (!reminderBot?.id) {
    throw new Error('Appointment Reminder Bot not found. Please create a bot named "appointment-reminder" first.');
  }

  // Get current time and 24 hours from now. You could change this to run at a different time or different time intervals.
  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  // Search for appointments starting within the next 24 hours
  const appointments = await medplum.searchResources('Appointment', {
    _filter: `date ge ${now.toISOString()} and date lt ${twentyFourHoursFromNow.toISOString()}`,
    status: 'booked'
  });
    
  // Trigger reminder bot for each appointment
  for (const appointment of appointments) {
    try {
      await medplum.executeBot(reminderBot.id, appointment);
      console.log(`Triggered reminder for appointment ${appointment.id}`);
    } catch (err) {
      console.error(`Failed to trigger reminder for appointment ${appointment.id}:`, err);
    }
  }
  
  return true;
} 