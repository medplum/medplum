import { Patient } from '@medplum/fhirtypes';

/**
 * Shared audit helpers for CI/CD bots
 * 
 * This module contains reusable audit and logging functions that can be used
 * across multiple bots to ensure consistent audit trail and logging.
 */

export interface AuditContext {
  userId?: string;
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
}

/**
 * Creates a simple audit event for patient data changes
 * 
 * @param patient - The patient resource that was changed
 * @param action - The action performed (create, update, delete)
 * @param context - Additional context about who performed the action
 * @returns Simple audit event object
 */
export function createPatientAuditEvent(
  patient: Patient,
  action: 'create' | 'update' | 'delete',
  context: AuditContext = {}
): Record<string, any> {
  const now = new Date().toISOString();
  
  return {
    resourceType: 'AuditEvent',
    recorded: now,
    type: {
      system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
      code: action === 'create' ? '110114' : action === 'update' ? '110112' : '110110',
      display: action === 'create' ? 'User Authentication' : action === 'update' ? 'Query' : 'Application Activity',
    },
    action: action === 'create' ? 'C' : action === 'update' ? 'U' : 'D',
    outcome: '0', // Success
    outcomeDesc: `Patient ${action} successful`,
    agent: [{
      type: {
        system: 'http://terminology.hl7.org/CodeSystem/security-role-type',
        code: 'humanuser',
        display: 'Human User',
      },
      requestor: true,
      ...(context.userId && { who: { reference: `Practitioner/${context.userId}` } }),
    }],
    entity: [{
      what: { reference: `Patient/${patient.id}` },
      type: {
        system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
        code: '2',
        display: 'System Object',
      },
      role: {
        system: 'http://terminology.hl7.org/CodeSystem/object-role',
        code: '1',
        display: 'Patient',
      },
      lifecycle: {
        system: 'http://terminology.hl7.org/CodeSystem/dicom-audit-lifecycle',
        code: action === 'create' ? '1' : action === 'update' ? '6' : '7',
        display: action === 'create' ? 'Creation' : action === 'update' ? 'Access' : 'Deletion',
      },
    }],
    source: {
      observer: { reference: 'Device/medplum-bot' },
    },
  };
}

/**
 * Logs a message with consistent formatting
 * 
 * @param level - Log level (info, warn, error)
 * @param message - The message to log
 * @param context - Additional context data
 */
export function logMessage(
  level: 'info' | 'warn' | 'error',
  message: string,
  context: Record<string, any> = {}
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    context,
  };
  
  console.log(JSON.stringify(logEntry));
}

/**
 * Logs patient validation results
 * 
 * @param patient - The patient that was validated
 * @param validationResult - The validation result
 */
export function logValidationResult(
  patient: Patient,
  validationResult: { isValid: boolean; errors: string[]; warnings: string[] }
): void {
  logMessage('info', 'Patient validation completed', {
    patientId: patient.id,
    isValid: validationResult.isValid,
    errorCount: validationResult.errors.length,
    warningCount: validationResult.warnings.length,
    errors: validationResult.errors,
    warnings: validationResult.warnings,
  });
}

/**
 * Logs patient data changes
 * 
 * @param patient - The patient that was changed
 * @param action - The action performed
 * @param changes - Description of what changed
 */
export function logPatientChange(
  patient: Patient,
  action: 'create' | 'update' | 'delete',
  changes?: string
): void {
  logMessage('info', `Patient ${action}`, {
    patientId: patient.id,
    action,
    changes,
    patientName: patient.name?.[0]?.given?.[0] + ' ' + patient.name?.[0]?.family,
  });
}

/**
 * Creates a standardized error log entry
 * 
 * @param error - The error that occurred
 * @param context - Additional context about the error
 */
export function logError(
  error: Error | string,
  context: Record<string, any> = {}
): void {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? undefined : error.stack;
  
  logMessage('error', errorMessage, {
    ...context,
    stack: errorStack,
  });
} 