// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { AsyncAutocomplete } from '@medplum/react';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useCallback } from 'react';
import type { BookableActorType } from '../actors';
import { getActorTypeLabel, isActorTypeRequired } from '../actors';
import type { ScheduleCandidate } from './AppointmentFinder.schedules';
import { getCandidateDisplay, searchScheduleCandidates } from './AppointmentFinder.schedules';
import { AppointmentOptionRow } from './AppointmentOptionRow';

export interface AppointmentActorSelectProps {
  readonly actorType: BookableActorType;
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
  /** Names the field. Defaults to the actor type's own label. */
  readonly label?: ReactNode;
  /** The line under the field. None by default. */
  readonly description?: ReactNode;
  /** What the empty field invites. Defaults to searching the actor type by name. */
  readonly placeholder?: string;
  /** Whether the field must be answered. Defaults to whether its actor type is required. */
  readonly required?: boolean;
}

/**
 * Chooses which actors of one type can hold an appointment.
 *
 * The names in one of these fields are **alternatives** to each other.
 * Several actors that all have to attend go in a field each - see {@link AppointmentActorSelections},
 * which arranges these into rows.
 *
 * The results are `Schedule` resources, bound to the actors that can hold the appointment.
 *
 * @param props - The React props.
 * @returns The field for one actor type.
 */
export function AppointmentActorSelect(props: AppointmentActorSelectProps): JSX.Element {
  const { actorType, service, location, defaultValue, onChange, error, disabled } = props;
  const medplum = useMedplum();
  const resolvedService = useResource<HealthcareService>(service);
  const locationReference = location && getReferenceString(location);
  const lowercaseLabel = getActorTypeLabel(actorType).toLowerCase();
  const label = props.label ?? getActorTypeLabel(actorType);
  const required = props.required ?? isActorTypeRequired(actorType);
  const placeholder = props.placeholder ?? `Search ${lowercaseLabel}s`;

  const search = useCallback(
    async (query: string, signal: AbortSignal): Promise<ScheduleCandidate[]> =>
      resolvedService
        ? searchScheduleCandidates(medplum, resolvedService, {
            actorType,
            query,
            location: locationReference ? { reference: locationReference } : undefined,
            signal,
          })
        : [],
    [medplum, resolvedService, locationReference, actorType]
  );

  const handleChange = useCallback((candidates: ScheduleCandidate[]) => onChange(candidates), [onChange]);

  return (
    <AsyncAutocomplete<ScheduleCandidate>
      name={actorType}
      label={label}
      required={required}
      description={props.description}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
      defaultValue={defaultValue ? [...defaultValue] : undefined}
      toOption={toOption}
      loadOptions={search}
      itemComponent={CandidateItem}
      emptyComponent={() => <>No {lowercaseLabel}s found</>}
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
