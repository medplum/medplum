// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Input } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { Modal, ResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { BILLING_ORGANIZATION_IDENTIFIER_VALUE, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM } from '../../utils/billing';
import { BillingOrganizationOption } from './BillingOrganizationOption';

/**
 * Props for the existing organization modal. `onSelect` receives the organization the user chose to add to
 * billing; the caller opens it for set-up.
 */
export interface CandidExistingOrganizationModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onSelect: (organization: WithId<Organization>) => void;
}

/**
 * Picks an organization already in the project that is not a billing organization yet, so it can be set up
 * for billing instead of being created twice. The search excludes organizations carrying the billing marker
 * server-side; payers still appear, since nothing but their type sets them apart. The picker mounts only while
 * the modal is open, so the selection resets on every open.
 * @param props - The CandidExistingOrganizationModal React props.
 * @returns The CandidExistingOrganizationModal React node.
 */
export function CandidExistingOrganizationModal(props: CandidExistingOrganizationModalProps): JSX.Element {
  const { opened, onClose, onSelect } = props;
  const [selected, setSelected] = useState<WithId<Organization> | undefined>(undefined);

  const close = (): void => {
    setSelected(undefined);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      size="lg"
      title="Add existing organization"
      actions={
        <Button
          disabled={!selected}
          onClick={() => {
            if (selected) {
              setSelected(undefined);
              onSelect(selected);
            }
          }}
        >
          Continue
        </Button>
      }
    >
      {opened && (
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
            onChange={(organization) =>
              setSelected(organization?.id ? (organization as WithId<Organization>) : undefined)
            }
          />
          <Input.Description mt={4}>
            Only organizations that are not billing organizations yet are listed. The one you pick opens with what it
            has and asks for what Candid still needs.
          </Input.Description>
        </div>
      )}
    </Modal>
  );
}
