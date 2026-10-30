// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Input } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { BILLING_ORGANIZATION_IDENTIFIER_VALUE, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM } from '../../utils/billing';
import { BillingOrganizationOption } from './BillingOrganizationOption';

export interface CandidExistingOrganizationPickerProps {
  readonly onChange: (organization: WithId<Organization> | undefined) => void;
}

/**
 * Picks an organization already in the project that is not a billing organization yet, so it can be set up
 * for billing instead of being created twice. The search excludes organizations carrying the billing marker
 * server-side; payers still appear, since nothing but their type sets them apart.
 * @param props - The CandidExistingOrganizationPicker React props.
 * @returns The CandidExistingOrganizationPicker React node.
 */
export function CandidExistingOrganizationPicker(props: CandidExistingOrganizationPickerProps): JSX.Element {
  const { onChange } = props;
  return (
    <div>
      <ResourceInput<Organization>
        resourceType="Organization"
        name="existing-organization"
        label="Organization"
        placeholder="Search organizations already in this project"
        searchCriteria={{
          'identifier:not': `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
        }}
        itemComponent={BillingOrganizationOption}
        onChange={(organization) => onChange(organization?.id ? (organization as WithId<Organization>) : undefined)}
      />
      <Input.Description mt={4}>
        Only organizations that are not billing organizations yet are listed. The one you pick opens with what it has
        and asks for what Candid still needs.
      </Input.Description>
    </div>
  );
}
