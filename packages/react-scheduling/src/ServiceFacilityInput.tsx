// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Location, Reference } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { ResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { AppointmentOptionRow } from './AppointmentFinder/AppointmentOptionRow';
import { SERVICE_FACILITY_SEARCH_CRITERIA } from './constants';

export interface ServiceFacilityInputProps {
  readonly label: string;
  readonly placeholder: string;
  /** Narrows which sites to offer. Defaults to every site, inactive ones included. */
  readonly searchCriteria?: Record<string, string>;
  /** Read once, at mount. */
  readonly defaultValue?: WithId<Location> | Reference<Location>;
  readonly onChange: (location: WithId<Location> | undefined) => void;
  /** Whether to show a button that clears the choice. Defaults to false. */
  readonly clearable?: boolean;
}

/**
 * Chooses one of the sites scheduling offers, listed by name alone.
 * @param props - The React props.
 * @returns The field.
 */
export function ServiceFacilityInput(props: Readonly<ServiceFacilityInputProps>): JSX.Element {
  return (
    <ResourceInput<WithId<Location>>
      resourceType="Location"
      name="serviceFacility"
      label={props.label}
      placeholder={props.placeholder}
      searchCriteria={props.searchCriteria ?? SERVICE_FACILITY_SEARCH_CRITERIA}
      defaultValue={props.defaultValue as WithId<Location> | Reference<WithId<Location>> | undefined}
      itemComponent={ServiceFacilityItem}
      onChange={props.onChange}
      clearable={props.clearable ?? false}
    />
  );
}

export function ServiceFacilityItem(props: Readonly<AsyncAutocompleteOption<Location>>): JSX.Element {
  // Undefined rather than false, so rows not chosen keep no room for the check.
  return <AppointmentOptionRow label={props.label} active={props.active || undefined} />;
}
