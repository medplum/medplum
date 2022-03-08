/**
 * AuditEvent outcome code.
 * See: https://www.hl7.org/fhir/valueset-audit-event-outcome.html
 */
export enum AuditEventOutcome {
  Success = '0',
  MinorFailure = '4',
  SeriousFailure = '8',
  MajorFailure = '12',
}
