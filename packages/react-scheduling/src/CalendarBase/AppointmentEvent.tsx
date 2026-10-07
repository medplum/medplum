// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventDisplayInfo } from '@fullcalendar/react';
import type { Appointment } from '@medplum/fhirtypes';
import cx from 'clsx';
import type { JSX } from 'react';
import { ServiceTypeDisplay } from '../ServiceTypeDisplay';
import { partitionServiceTypes } from '../serviceTypes';
// Its own sheet: importing CalendarBase's here would load it ahead of FullCalendar's theme,
// which its rules are written to override.
import classes from './AppointmentEvent.module.css';

export interface AppointmentEventProps {
  readonly appointment: Appointment;
  /** What FullCalendar hands its event content, to draw the event as it would. */
  readonly info: EventDisplayInfo;
}

/**
 * An appointment event, titled by its service type over its patient.
 *
 * @param props - The React props.
 * @returns The event's content.
 */
export function AppointmentEvent(props: AppointmentEventProps): JSX.Element {
  const { appointment, info } = props;
  const hasServiceType = !!partitionServiceTypes(appointment).visitType;
  // A time grid says when the visit is by where it is drawn, so there the line under the service
  // type names the patient; a month's row has room for the service type and its time alone.
  const inTimeGrid = info.view.type.startsWith('timeGrid');

  return (
    <div className={classes.eventContent} data-time-grid={inTimeGrid || undefined}>
      {inTimeGrid ? (
        <div className={info.timeClass}>{info.event.title}</div>
      ) : (
        info.timeText && <div className={cx(info.timeClass, classes.time)}>{info.timeText}</div>
      )}
      <div className={cx(info.titleClass, classes.title)}>
        {/* With no service type, a placeholder holds the title's place, so the patient stays under it. */}
        {hasServiceType ? (
          <ServiceTypeDisplay appointment={appointment} inherit />
        ) : (
          <span className={classes.untyped}>Appointment (no service type)</span>
        )}
      </div>
    </div>
  );
}
