// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { AsyncAutocomplete } from '@medplum/react';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback } from 'react';
import type { SchedulingRole } from './AppointmentFinder.roles';
import { ROLE_LABELS, isRoleRequired } from './AppointmentFinder.roles';
import type { ScheduleCandidate } from './AppointmentFinder.schedules';
import { getCandidateDisplay, searchScheduleCandidates } from './AppointmentFinder.schedules';
import { AppointmentOptionRow } from './AppointmentOptionRow';

export interface AppointmentActorSelectProps {
  /** The role being filled. */
  readonly role: SchedulingRole;
  /** The service being booked. Nothing is offered until it resolves. */
  readonly service: Reference<HealthcareService> | WithId<HealthcareService> | undefined;
  /**
   * The site being booked at. Actors sited elsewhere are left out: a room or a
   * device anywhere inside it counts, a provider only if one of their
   * PractitionerRoles names it.
   */
  readonly location?: Reference<Location> | WithId<Location>;
  readonly defaultValue?: readonly ScheduleCandidate[];
  readonly onChange: (candidates: readonly ScheduleCandidate[]) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

/**
 * Chooses the actors an appointment is held on, for one role.
 *
 * Everything chosen attends: `$find` intersects the schedules behind them,
 * so naming a second actor narrows the times to the ones both are free for.
 *
 * Schedules are searched for as the name is typed (via `AsyncAutocomplete`).
 *
 * @param props - The React props.
 * @returns The field for one role.
 */
export function AppointmentActorSelect(props: AppointmentActorSelectProps): JSX.Element {
  const { role, service, location, defaultValue, onChange, error, disabled } = props;
  const medplum = useMedplum();
  const resolvedService = useResource<HealthcareService>(service);
  const locationReference = location && getReferenceString(location);
  const label = ROLE_LABELS[role];
  const noun = label.toLowerCase();
  const required = isRoleRequired(role);

  const search = useCallback(
    async (query: string, signal: AbortSignal): Promise<ScheduleCandidate[]> =>
      resolvedService
        ? searchScheduleCandidates(medplum, resolvedService, {
            role,
            query,
            location: locationReference ? { reference: locationReference } : undefined,
            signal,
          })
        : [],
    [medplum, resolvedService, locationReference, role]
  );

  const handleChange = useCallback((candidates: ScheduleCandidate[]) => onChange(candidates), [onChange]);

  return (
    <AsyncAutocomplete<ScheduleCandidate>
      name={role}
      label={label}
      required={required}
      description={required ? undefined : `Optional. Leave empty to search without holding a ${noun}.`}
      placeholder={`Search ${noun}s`}
      error={error}
      disabled={disabled}
      defaultValue={defaultValue ? [...defaultValue] : undefined}
      toOption={toOption}
      loadOptions={search}
      itemComponent={CandidateItem}
      emptyComponent={() => <>No {noun}s found</>}
      onChange={handleChange}
    />
  );
}

function toOption(candidate: ScheduleCandidate): AsyncAutocompleteOption<ScheduleCandidate> {
  // Keyed by schedule id, not actor id: a schedule is what `$find` is asked for,
  // and the actor is only how it is named on screen.
  return { value: candidate.schedule.id, label: getCandidateDisplay(candidate), resource: candidate };
}

/**
 * One actor on the list, over the schedule it was found through.
 * @param props - The option to render.
 * @returns The row.
 */
function CandidateItem(props: Readonly<AsyncAutocompleteOption<ScheduleCandidate>>): JSX.Element {
  return <AppointmentOptionRow label={props.label} detail={props.resource.schedule.comment} />;
}
