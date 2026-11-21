// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import type { PatchOperation } from '@medplum/core';
import { createReference } from '@medplum/core';
import type {
  Encounter,
  Location,
  Organization,
  Practitioner,
  Reference,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { AsyncAutocomplete, ResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { BILLING_ORGANIZATION_IDENTIFIER } from '../../utils/billing';
import { getPlaceOfService, PLACE_OF_SERVICE_CODES, withPlaceOfService } from '../../utils/placeOfService';
import { BillingOrganizationOption } from '../billing/BillingOrganizationOption';
import { CodeNamePill, makeCodeOption } from '../billing/ClaimEditor';
import { DetailSection } from '../billing/DetailSection';
import sectionClasses from '../billing/DetailSection.module.css';
import { ServiceFacilityOption } from '../billing/ServiceFacilityOption';
import { VisitTimeInput } from './VisitTimeInput';

// Laid out like the claim's procedure and diagnosis codes: the two-digit code, then what it means.
const PlaceOfServiceOption = makeCodeOption('1.5rem');

function toPlaceOfServiceOption(place: ValueSetExpansionContains): AsyncAutocompleteOption<ValueSetExpansionContains> {
  return { value: place.code ?? '', label: place.display ?? place.code ?? '', resource: place };
}

// The list is short, so match the code or its meaning in any case.
async function loadPlacesOfService(input: string): Promise<ValueSetExpansionContains[]> {
  const search = input.trim().toLowerCase();
  return PLACE_OF_SERVICE_CODES.filter(
    (c) => !search || [c.code, c.display].some((text) => text?.toLowerCase().includes(search))
  );
}

interface VisitDetailsPanelProps {
  practitioner?: Practitioner;
  encounter: Encounter;
  billingOrganization?: Reference<Organization>;
  /** Whether the note is signed and locked, which locks what it attests to: who saw the patient, and when. */
  locked?: boolean;
  /** Whether a claim for the visit was already submitted, so changes here won't reach it. */
  hasSubmittedClaim?: boolean;
  onEncounterChange: (ops: PatchOperation[]) => void;
  onBillingOrganizationChange: (organization: Organization | undefined) => void;
}

export const VisitDetailsPanel = (props: VisitDetailsPanelProps): JSX.Element => {
  const {
    practitioner,
    encounter,
    billingOrganization,
    locked,
    hasSubmittedClaim,
    onEncounterChange,
    onBillingOrganizationChange,
  } = props;

  const placeOfService = getPlaceOfService(encounter);

  const handlePractitionerChange = async (practitioner: Practitioner | undefined): Promise<void> => {
    if (!encounter || !practitioner) {
      return;
    }

    onEncounterChange([{ op: 'add', path: '/participant', value: [{ individual: createReference(practitioner) }] }]);
  };

  // Clearing the picker removes the whole location list; BillingTab drops the remove when there is none.
  const handleServiceFacilityChange = (location: Location | undefined): void => {
    if (!location) {
      onEncounterChange([{ op: 'remove', path: '/location' }]);
      return;
    }
    onEncounterChange([{ op: 'add', path: '/location', value: [{ location: createReference(location) }] }]);
  };

  const handlePlaceOfServiceChange = (values: ValueSetExpansionContains[]): void => {
    onEncounterChange([{ op: 'add', path: '/extension', value: withPlaceOfService(encounter, values[0]?.code) }]);
  };

  const handleCheckinChange = async (checkin: string): Promise<void> => {
    if (!encounter || !checkin) {
      return;
    }

    onEncounterChange([{ op: 'add', path: '/period/start', value: checkin }]);
  };

  const handleCheckoutChange = async (checkout: string): Promise<void> => {
    if (!encounter || !checkout) {
      return;
    }

    onEncounterChange([{ op: 'add', path: '/period/end', value: checkout }]);
  };

  return (
    <DetailSection
      gap="sm"
      title="Visit Details"
      description={
        hasSubmittedClaim ? 'Changes apply to open claims. Submitted claims need a corrected claim.' : undefined
      }
    >
      <ResourceInput
        resourceType="Practitioner"
        name="practitioner"
        label="Practitioner"
        placeholder="Search for practitioner"
        defaultValue={practitioner}
        disabled={locked}
        onChange={handlePractitionerChange}
      />

      <div className={sectionClasses.pair}>
        <VisitTimeInput
          name="checkin"
          label="Check In"
          defaultValue={encounter.period?.start}
          disabled={locked}
          onChange={handleCheckinChange}
        />

        <VisitTimeInput
          name="checkout"
          label="Check Out"
          defaultValue={encounter.period?.end}
          disabled={locked}
          onChange={handleCheckoutChange}
        />
      </div>

      {/* ResourceInput is uncontrolled; remount when the async-resolved default arrives */}
      <ResourceInput<Organization>
        key={billingOrganization?.reference ?? 'no-billing-organization'}
        resourceType="Organization"
        name="billingOrganization"
        label="Billing Organization"
        placeholder="Search for organization"
        defaultValue={billingOrganization}
        searchCriteria={{ identifier: BILLING_ORGANIZATION_IDENTIFIER }}
        itemComponent={BillingOrganizationOption}
        onChange={onBillingOrganizationChange}
      />

      <Stack gap={4}>
        <ResourceInput<Location>
          resourceType="Location"
          name="serviceFacility"
          label="Service Facility"
          placeholder="Search for location"
          defaultValue={encounter.location?.[0]?.location}
          itemComponent={ServiceFacilityOption}
          onChange={handleServiceFacilityChange}
        />
        <Text size="xs" c="dimmed">
          Defaults to the billing organization when empty.
        </Text>
      </Stack>

      <AsyncAutocomplete<ValueSetExpansionContains>
        name="placeOfService"
        label="Place of Service"
        placeholder="Search place of service"
        maxValues={1}
        creatable={false}
        clearable
        toOption={toPlaceOfServiceOption}
        loadOptions={loadPlacesOfService}
        itemComponent={PlaceOfServiceOption}
        pillComponent={CodeNamePill}
        defaultValue={placeOfService ? [placeOfService] : undefined}
        onChange={handlePlaceOfServiceChange}
      />
    </DetailSection>
  );
};
