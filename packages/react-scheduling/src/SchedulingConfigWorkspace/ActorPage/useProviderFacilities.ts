// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Location, PractitionerRole, Reference, Resource } from '@medplum/fhirtypes';
import { useState } from 'react';
import type { ConfigurableActorResource } from '../../configSearch';
import type { ConfigChange } from '../ConfigPage/configSave';
import type { ServiceFacilitiesConfirmation } from '../serviceFacilitiesConfirmation';
import { getServiceFacilitiesConfirmation } from '../serviceFacilitiesConfirmation';
import type { ProviderFacilitiesFieldsProps } from './ProviderFacilitiesFields';
import { buildRoleChanges, providerFacilitiesOf } from './roleDraft';
import { useProviderRoles } from './useProviderRoles';

export interface ProviderFacilitiesState {
  /** The field's props. Absent for a room, a device, or an actor not stored yet. */
  readonly field?: ProviderFacilitiesFieldsProps;
  /** The role writes that leave the provider at the service facilities as edited, for the page's save bundle. */
  readonly changes: ConfigChange<PractitionerRole>[];
  /** What to ask before saving, when the save moves the provider between every service facility and a list. */
  readonly confirmation?: ServiceFacilitiesConfirmation;
  /** Drops the edits. */
  readonly discard: () => void;
  /**
   * Lays the roles a save stored over what was read, and drops the edits, since a save changing only roles
   * changes no version the page is keyed on.
   */
  readonly store: (saved: readonly WithId<Resource>[]) => void;
  /** Reads the roles again. */
  readonly reload: () => Promise<void>;
}

/**
 * A provider's service facilities, which are the locations of their roles, edited on their page and saved with
 * the rest of it.
 * @param actor - The actor whose page is open, as stored. Absent for one being created.
 * @param actorName - The actor's name, for the question asked on save.
 * @returns The field, the role writes, and what the page calls on save, Discard, and reload.
 */
export function useProviderFacilities(
  actor: ConfigurableActorResource | undefined,
  actorName: string
): ProviderFacilitiesState {
  const providerRoles = useProviderRoles(actor);
  const [edits, setEdits] = useState<Reference<Location>[]>();
  const read = providerRoles?.value;
  const stored = read && providerFacilitiesOf(read.roles);

  const isLinked = (facility: Reference<Location>): boolean => !!stored?.locked.has(facility.reference ?? '');
  const named = (facility: Reference<Location>): Reference<Location> => ({
    ...facility,
    display: read?.names.get(facility.reference ?? '') ?? facility.display ?? facility.reference,
  });
  const linked = (stored?.facilities.filter(isLinked) ?? []).map(named);
  const editable = edits ?? stored?.facilities.filter((facility) => !isLinked(facility));
  const wanted = editable && [...linked, ...editable.map(named)];

  return {
    field: providerRoles && { value: editable, linked, error: providerRoles.error, onChange: setEdits },
    changes:
      actor?.resourceType === 'Practitioner' && read && wanted ? buildRoleChanges(read.roles, actor, wanted) : [],
    confirmation: stored && wanted && getServiceFacilitiesConfirmation(actorName, stored.facilities, wanted),
    discard: () => setEdits(undefined),
    store: (saved) => {
      const roles = saved.filter(
        (resource): resource is WithId<PractitionerRole> => resource.resourceType === 'PractitionerRole'
      );
      if (roles.length > 0) {
        providerRoles?.store(roles);
        setEdits(undefined);
      }
    },
    reload: async () => {
      await providerRoles?.reload();
    },
  };
}
