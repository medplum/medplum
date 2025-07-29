import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { logPatientChange, logMessage } from '../shared/audit-helpers';

/**
 * Patient Notification Bot
 * 
 * This bot demonstrates code reuse by using shared logging functions.
 * It sends notifications about patient changes and logs the events
 * for tracking purposes.
 * 
 * Key features:
 * - Uses shared logging functions from audit-helpers
 * - Sends notifications for different types of patient changes
 * - Logs all notification activities
 * - Supports configurable notification channels
 * 
 * @author Medplum Team
 * @version 1.0.0
 */

/**
 * Sends a notification about a patient change
 * 
 * @param patient - The patient that was changed
 * @param action - The action performed
 * @param channel - The notification channel to use
 */
async function sendNotification(
  patient: Patient,
  action: 'create' | 'update' | 'delete',
  channel: 'email' | 'sms' | 'slack' = 'email'
): Promise<void> {
  const patientName = patient.name?.[0]?.given?.[0] + ' ' + patient.name?.[0]?.family;
  const message = `Patient ${patientName} (ID: ${patient.id}) was ${action}d`;
  
  // In a real implementation, you would send the actual notification
  // For this example, we just log it
  logMessage('info', `Notification sent via ${channel}`, {
    patientId: patient.id,
    patientName,
    action,
    channel,
    message,
  });
}

/**
 * Main bot handler function
 * 
 * This bot sends notifications about patient changes using
 * shared logging functions. It determines the action type and
 * sends appropriate notifications.
 * 
 * @param _medplum - The Medplum client (unused in this implementation)
 * @param event - The bot event containing patient data and headers
 * @returns Promise that resolves to the patient unchanged
 */
export async function handler(_medplum: MedplumClient, event: BotEvent): Promise<Patient> {
  const patient = event.input as Patient;

  try {
    // Determine the action type based on headers
    let action: 'create' | 'update' | 'delete' = 'update';
    
    if (event.headers?.['X-Medplum-Deleted-Resource']) {
      action = 'delete';
    } else if (event.headers?.['X-Medplum-New-Resource']) {
      action = 'create';
    }

    // Log the patient change using shared function
    logPatientChange(patient, action, `Patient ${action} notification sent`);

    // Send notifications to different channels based on action type
    if (action === 'create') {
      // New patients get email notifications
      await sendNotification(patient, action, 'email');
    } else if (action === 'update') {
      // Updates get SMS notifications
      await sendNotification(patient, action, 'sms');
    } else if (action === 'delete') {
      // Deletions get Slack notifications
      await sendNotification(patient, action, 'slack');
    }

    // Return the patient unchanged
    return patient;
  } catch (error) {
    // Log any errors that occur during notification processing
    logMessage('error', 'Error in patient notification bot', {
      error: error instanceof Error ? error.message : String(error),
      patientId: patient.id,
    });
    
    // Return the patient even if notification fails to avoid blocking the main workflow
    return patient;
  }
} 