// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventDisplayInfo } from '@fullcalendar/react';
import type { WithId } from '@medplum/core';
import type { Schedule, Slot } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import { IconSquareRoundedXFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment } from 'react';
// Its own sheet, for the same reason as AppointmentEvent's: CalendarBase's would load ahead of
// FullCalendar's theme.
import classes from './SlotEvent.module.css';

export interface SlotEventProps {
  readonly slot: Slot;
  /** The slot's schedule, when its calendar knows it, to name whose time the slot holds. */
  readonly schedule?: WithId<Schedule>;
  /** What FullCalendar hands its event content, to draw the event as it would. */
  readonly info: EventDisplayInfo;
}

/**
 * A slot event, with blocked time marked by an icon before its title so it stands apart from a
 * booked appointment.
 *
 * A time grid says when the slot is by where it is drawn, so there the line under the title names
 * whose time it is, when the schedule is known; elsewhere that line is the slot's time.
 *
 * @param props - The React props.
 * @returns The event's content.
 */
export function SlotEvent(props: SlotEventProps): JSX.Element {
  const { slot, schedule, info } = props;
  const blocked = ['busy', 'busy-unavailable', 'busy-tentative'].includes(slot.status);
  const actors = info.view.type.startsWith('timeGrid') ? schedule?.actor : undefined;

  return (
    <>
      {actors ? (
        <div className={info.timeClass}>
          {actors.map((actor, index) => (
            <Fragment key={actor.reference ?? `actor-${index}`}>
              {index > 0 && ', '}
              <ResourceName value={actor} inherit />
            </Fragment>
          ))}
        </div>
      ) : (
        info.timeText && <div className={info.timeClass}>{info.timeText}</div>
      )}
      <div className={info.titleClass}>
        {blocked ? (
          <span className={classes.blocked}>
            <IconSquareRoundedXFilled size="1em" className={classes.icon} aria-hidden />
            {info.event.title}
          </span>
        ) : (
          info.event.title
        )}
      </div>
    </>
  );
}
