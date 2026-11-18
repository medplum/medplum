// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Tooltip } from '@mantine/core';
import { ResourceName } from '@medplum/react';
import type { CSSProperties, JSX } from 'react';
import { Fragment, useContext } from 'react';
import { formatZonedTime } from '../AppointmentFinder/AppointmentFinder.times';
import type { AvailabilityShade, AvailabilityShadeDetail } from '../availabilityShading';
// Its own sheet, for the same reason as AppointmentEvent's: CalendarBase's would load ahead of
// FullCalendar's theme.
import classes from './AvailabilityShadeEvent.module.css';
import { AvailabilityShadeHoverContext } from './useAvailabilityShadeHover';

export interface AvailabilityShadeEventProps {
  readonly shade: AvailabilityShade;
}

function times(start: Date, end: Date): string {
  return `${formatZonedTime(start)} – ${formatZonedTime(end)}`;
}

function ScheduleActors(props: { readonly detail: AvailabilityShadeDetail }): JSX.Element {
  return (
    <>
      {props.detail.schedule.actor.map((actor, index) => (
        <Fragment key={actor.reference ?? `actor-${index}`}>
          {index > 0 && ', '}
          <ResourceName value={actor} link={false} inherit />
        </Fragment>
      ))}
    </>
  );
}

interface ShadeDetailsProps extends AvailabilityShadeEventProps {
  /** The time under the pointer, in milliseconds. */
  readonly at?: number;
}

function ShadeDetails(props: ShadeDetailsProps): JSX.Element {
  const { shade, at } = props;
  const [first] = shade.details;
  // Only what holds at the time under the pointer, as a block can run through hours its lines do not
  // all cover. Every line when the time is not known, or none of them covers it.
  const covering =
    at === undefined ? [] : shade.details.filter((detail) => detail.start.getTime() <= at && at < detail.end.getTime());
  const details = covering.length > 0 ? covering : shade.details;
  const byService = shade.kind === 'service';
  let heading: JSX.Element | string = <ScheduleActors detail={first} />;
  if (byService) {
    heading = `${first.service.name} · ${times(shade.start, shade.end)}`;
  } else if (shade.kind === 'overflow') {
    heading = 'More visit types';
  }

  return (
    <Stack gap={2}>
      <Text size="xs" fw={600}>
        {heading}
      </Text>
      {details.map((detail, index) => (
        <Text key={index} size="xs">
          {byService ? <ScheduleActors detail={detail} /> : detail.service.name}
          {' · '}
          {times(detail.start, detail.end)}
          {' · '}
          {detail.serviceFacility?.display ?? 'Any facility'}
          {detail.inherited && ' · default hours'}
        </Text>
      ))}
    </Stack>
  );
}

/**
 * A block of availability, drawn behind a day's events in its visit type's color, across the share of the
 * day's column the shade names. Hovering says what the block is made of at the time under the pointer; the
 * calendar reports the hover, as the block sits behind the layer that would hear it (see
 * `useAvailabilityShadeHover`).
 * @param props - The React props.
 * @returns The block's content.
 */
export function AvailabilityShadeEvent(props: AvailabilityShadeEventProps): JSX.Element {
  const { shade } = props;
  const target = useContext(AvailabilityShadeHoverContext);
  const hovered = target?.id === shade.id;
  const style = {
    '--shade-left': shade.left,
    '--shade-width': shade.width,
    '--shade-color': shade.color && `var(--mantine-color-${shade.color}-6)`,
  } as CSSProperties;

  return (
    <Tooltip
      label={<ShadeDetails shade={shade} at={hovered ? target.at : undefined} />}
      position="right-start"
      opened={hovered}
      multiline
    >
      <div
        className={classes.shade}
        data-kind={shade.kind}
        data-testid="availability-shade"
        data-shade-id={shade.id}
        data-shade-start={shade.start.getTime()}
        data-shade-end={shade.end.getTime()}
        style={style}
      >
        {shade.label && <span className={classes.label}>{shade.label}</span>}
        {shade.tag && <span className={classes.tag}>{shade.tag}</span>}
      </div>
    </Tooltip>
  );
}
