// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment, HealthcareServiceAvailableTime, Slot } from '@medplum/fhirtypes';
import cx from 'clsx';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { CalendarBase } from '../CalendarBase/CalendarBase';
import type { DateTimeRange } from '../types';
import classes from './Calendar.module.css';

export interface CalendarProps {
  slots?: Slot[];
  appointments?: Appointment[];
  onSelectInterval?: (slotInfo: DateTimeRange) => void;
  onSelectSlot?: (slot: Slot) => void;
  onSelectAppointment?: (appointment: Appointment) => void;
  onDoubleClickAppointment?: (appointment: Appointment) => void;
  onRangeChange?: (range: DateTimeRange) => void;
  className?: string;
  availableTime?: HealthcareServiceAvailableTime[];
}

export function Calendar(props: CalendarProps): JSX.Element {
  const { slots, appointments, ...baseProps } = props;

  const eventSources = useMemo(() => [{ appointments: appointments ?? [], slots: slots ?? [] }], [appointments, slots]);

  return (
    <CalendarBase
      eventSources={eventSources}
      {...baseProps}
      nowIndicator
      className={cx(props.className, classes.wrapper)}
      eventClass={classes.event}
      eventInnerClass={classes.eventInner}
      backgroundEventClass={classes.backgroundEvent}
      backgroundEventInnerClass={classes.backgroundEventInner}
      eventTitleClass={classes.eventTitle}
    />
  );
}
