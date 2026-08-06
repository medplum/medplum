// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Reference } from '@medplum/fhirtypes';
import { ResourceName } from '@medplum/react';
import type { JSX } from 'react';

export interface ActorNameProps {
  readonly actor: Reference;
}

/**
 * Names an actor the way the search named it.
 *
 * Prefers the display the reference carries, which `$find` fills from the
 * Schedule's actor. That matters for a PractitionerRole — how a practitioner
 * carrying a role and a specialty is booked — because formatting the resource
 * itself yields the role rather than the person, and would call every surgeon
 * "Doctor". Falls back to the resource for a reference with no display of its
 * own, such as one a caller assembled itself.
 *
 * @param props - The React props.
 * @returns The actor's name.
 */
export function ActorName(props: ActorNameProps): JSX.Element {
  if (props.actor.display) {
    return <>{props.actor.display}</>;
  }
  return <ResourceName value={props.actor} />;
}
