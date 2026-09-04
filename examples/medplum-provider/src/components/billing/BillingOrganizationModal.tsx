// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Input, Stack, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getIdentifier } from '@medplum/core';
import type { Address, Organization } from '@medplum/fhirtypes';
import { AddressInput, Modal } from '@medplum/react';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { BillingOrganizations } from '../../hooks/useBillingOrganizations';
import { EIN_SYSTEM, NPI_SYSTEM, isValidBillingPhone } from '../../utils/billing';
import { CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM } from '../../utils/candid';

export interface BillingOrganizationModalProps {
  readonly billingOrganizations: BillingOrganizations;
  /** The organization to edit, or undefined to create a new one. */
  readonly organization: WithId<Organization> | undefined;
  readonly opened: boolean;
  readonly onClose: () => void;
}

// The billing organization profile the server validates against covers name, NPI, Tax ID and
// address, so a bad value there is reported by the save. Only the phone format is checked here:
// the profile requires a phone to exist but cannot express the X12 rule on its digits.
type FormErrors = Partial<Record<'phone', string>>;

export function BillingOrganizationModal(props: BillingOrganizationModalProps): JSX.Element {
  const { billingOrganizations, organization, opened, onClose } = props;

  const [name, setName] = useState(() => organization?.name ?? '');
  const [npi, setNpi] = useState(() => getIdentifierValue(organization, NPI_SYSTEM));
  const [ein, setEin] = useState(() => getIdentifierValue(organization, EIN_SYSTEM));
  const [phone, setPhone] = useState(() => getPhoneValue(organization));
  const [address, setAddress] = useState<Address | undefined>(() => organization?.address?.[0]);
  const [errors, setErrors] = useState<FormErrors>({});

  // The modal stays mounted between opens (the page only toggles `opened`), so re-seed every field
  // from the organization each time it opens. This runs during render — before the
  // `{opened && ...}` form remounts — so the uncontrolled AddressInput picks up the fresh
  // defaultValue; a useEffect would fire too late for it.
  const [prevOpened, setPrevOpened] = useState(opened);
  if (opened !== prevOpened) {
    setPrevOpened(opened);
    if (opened) {
      setName(organization?.name ?? '');
      setNpi(getIdentifierValue(organization, NPI_SYSTEM));
      setEin(getIdentifierValue(organization, EIN_SYSTEM));
      setPhone(getPhoneValue(organization));
      setAddress(organization?.address?.[0]);
      setErrors({});
    }
  }

  const validate = (): FormErrors => {
    const result: FormErrors = {};
    if (!isValidBillingPhone(phone)) {
      result.phone = 'Phone must be 10 digits and not start with 0 or 1';
    }
    return result;
  };

  const handleSave = async (): Promise<void> => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }
    const saved = await billingOrganizations.saveOrganization(organization, {
      name,
      npi: npi.trim(),
      ein: ein.trim(),
      phone,
      address,
    });
    if (saved) {
      onClose();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={organization ? 'Edit billing organization' : 'New billing organization'}
      actions={
        <Button onClick={() => handleSave().catch(console.error)} loading={billingOrganizations.saving}>
          Save
        </Button>
      }
    >
      {opened && (
        <Stack gap="md">
          <TextInput label="Name" required value={name} onChange={(event) => setName(event.currentTarget.value)} />
          <TextInput
            label="NPI"
            required
            description="10 digits"
            value={npi}
            onChange={(event) => setNpi(event.currentTarget.value)}
          />
          <TextInput
            label="Tax ID (EIN)"
            required
            description="9 digits; stored without the dash"
            value={ein}
            onChange={(event) => setEin(event.currentTarget.value)}
          />
          <TextInput
            label="Phone"
            required
            description="Used as the claim submitter phone; must not start with 0 or 1"
            value={phone}
            error={errors.phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
          />
          <div>
            <Input.Label required mb={4}>
              Address
            </Input.Label>
            <AddressInput name="address" path="Organization.address" defaultValue={address} onChange={setAddress} />
          </div>
          {!!billingOrganizations.candidBotId &&
            !getIdentifierValue(organization, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM) && (
              <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                Saving registers this organization with Candid as an organization provider, billing under its own NPI.
              </Alert>
            )}
        </Stack>
      )}
    </Modal>
  );
}

function getIdentifierValue(organization: Organization | undefined, system: string): string {
  return (organization && getIdentifier(organization, system)) ?? '';
}

function getPhoneValue(organization: Organization | undefined): string {
  return organization?.telecom?.find((t) => t.system === 'phone')?.value ?? '';
}
