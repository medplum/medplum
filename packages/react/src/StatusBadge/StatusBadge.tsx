import { Badge, BadgeProps, DefaultMantineColor } from '@mantine/core';
import { JSX } from 'react';

/*
 * Request status: https://hl7.org/fhir/valueset-request-status.html
 * draft, active, on-hold, revoked, completed, entered-in-error, unknown
 *
 * Publication status: https://hl7.org/fhir/valueset-publication-status.html
 * draft, active, retired, unknown
 *
 * Observation status: https://www.hl7.org/fhir/valueset-observation-status.html
 * registered, preliminary, final, amended,  corrected, cancelled, entered-in-error, unknown
 *
 * DiagnosticReport status: https://hl7.org/fhir/valueset-diagnostic-report-status.html
 * registered, preliminary, final, amended, corrected, appended, cancelled, entered-in-error, unknown
 *
 * Task status: https://hl7.org/fhir/valueset-task-status.html
 * draft, requested, received, accepted, rejected, ready, cancelled, in-progress, on-hold, failed, completed, entered-in-error
 *
 * Appointment status: https://www.hl7.org/fhir/valueset-appointmentstatus.html
 * proposed, pending, booked, arrived, fulfilled, cancelled, noshow, entered-in-error, chcked-in, waitlist
 *
 * Immunization status: https://hl7.org/fhir/r4/valueset-immunization-status.html
 * completed, entered-in-error, not-done
 */

const statusToColor: Record<string, DefaultMantineColor> = {
  draft: 'blue',
  active: 'blue',
  'on-hold': 'yellow',
  revoked: 'red',
  completed: 'green',
  'entered-in-error': 'red',
  unknown: 'gray',
  retired: 'gray',
  registered: 'blue',
  preliminary: 'blue',
  final: 'green',
  amended: 'yellow',
  corrected: 'yellow',
  cancelled: 'red',
  requested: 'blue',
  received: 'blue',
  accepted: 'blue',
  rejected: 'red',
  ready: 'blue',
  'in-progress': 'blue',
  failed: 'red',
  proposed: 'blue',
  pending: 'blue',
  booked: 'blue',
  arrived: 'blue',
  fulfilled: 'green',
  noshow: 'red',
  'checked-in': 'blue',
  waitlist: 'gray',
  routine: 'gray',
  urgent: 'red',
  asap: 'red',
  stat: 'red',
  'not-done': 'red',
  connected: 'green',
  disconnected: 'red',
  finished: 'green',
  planned: 'gray',
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'children'> {
  readonly status: string;
}

export function StatusBadge(props: StatusBadgeProps): JSX.Element {
  const { status, ...badgeProps } = props;

  return (
    <Badge color={props.color || statusToColor[status]} {...badgeProps}>
      {status.replace(/-/g, ' ')}
    </Badge>
  );
}
