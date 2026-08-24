// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Card, Stack, Text } from '@mantine/core';
import type { PatchOperation } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Encounter, Organization, Practitioner, Reference } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { DateTimeInput, ResourceInput } from '@medplum/react';
import type { JSX } from 'react';

const NPI_SYSTEM = 'http://hl7.org/fhir/sid/us-npi';
const ORGANIZATION_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/organization-type';
const PROVIDER_ORGANIZATION_TYPE = 'prov';

const OrganizationItem = (props: AsyncAutocompleteOption<Organization>): JSX.Element => {
  const npi = props.resource.identifier?.find((id) => id.system === NPI_SYSTEM)?.value;
  return (
    <div>
      <Text>{props.label}</Text>
      <Text size="xs" c="dimmed">
        NPI {npi}
      </Text>
    </div>
  );
};

interface VisitDetailsPanelProps {
  practitioner?: Practitioner;
  encounter: Encounter;
  billingOrganization?: Reference<Organization>;
  onEncounterChange: (ops: PatchOperation[]) => void;
  onBillingOrganizationChange: (organization: Organization | undefined) => void;
}

export const VisitDetailsPanel = (props: VisitDetailsPanelProps): JSX.Element => {
  const { practitioner, encounter, billingOrganization, onEncounterChange, onBillingOrganizationChange } = props;

  const handlePractitionerChange = async (practitioner: Practitioner | undefined): Promise<void> => {
    if (!encounter || !practitioner) {
      return;
    }

    onEncounterChange([{ op: 'add', path: '/participant', value: [{ individual: createReference(practitioner) }] }]);
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
    <Stack gap={0}>
      <Text fw={600} size="lg" mb="md">
        Visit Details
      </Text>
      <Card withBorder shadow="sm" p="md">
        <Stack gap="md">
          <ResourceInput
            resourceType="Practitioner"
            name="practitioner"
            label="Practitioner"
            placeholder="Search for practitioner"
            defaultValue={practitioner}
            onChange={handlePractitionerChange}
          />

          {/* ResourceInput is uncontrolled; remount when the async-resolved default arrives */}
          <ResourceInput<Organization>
            key={billingOrganization?.reference ?? 'no-billing-organization'}
            resourceType="Organization"
            name="billingOrganization"
            label="Billing organization"
            placeholder="Search for organization"
            defaultValue={billingOrganization}
            searchCriteria={{
              type: `${ORGANIZATION_TYPE_SYSTEM}|${PROVIDER_ORGANIZATION_TYPE}`,
              identifier: `${NPI_SYSTEM}|`,
            }}
            itemComponent={OrganizationItem}
            onChange={onBillingOrganizationChange}
          />

          <DateTimeInput
            name="checkin"
            label="Check in"
            defaultValue={encounter.period?.start}
            onChange={handleCheckinChange}
          />

          <DateTimeInput
            name="checkout"
            label="Check out"
            defaultValue={encounter.period?.end}
            onChange={handleCheckoutChange}
          />
        </Stack>
      </Card>
    </Stack>
  );
};
