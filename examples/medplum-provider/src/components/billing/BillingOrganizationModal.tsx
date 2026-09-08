// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Input, Stack, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getIdentifier } from '@medplum/core';
import type { Address, Organization } from '@medplum/fhirtypes';
import { AddressInput, Modal } from '@medplum/react';
import { IconInfoCircle } from '@tabler/icons-react';
import type { FormEvent, JSX } from 'react';
import { useState } from 'react';
import type { BillingOrganizations } from '../../hooks/useBillingOrganizations';
import { EIN_SYSTEM, NPI_SYSTEM, isValidBillingPhone } from '../../utils/billing';
import { CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM } from '../../utils/candid';

/**
 * Links the Save button in the modal footer to the form in the modal body, which live in different
 * subtrees of the modal.
 */
const FORM_ID = 'billing-organization-form';

export interface BillingOrganizationModalProps {
  readonly billingOrganizations: BillingOrganizations;
  /** The organization to edit, or undefined to create a new one. */
  readonly organization: WithId<Organization> | undefined;
  readonly opened: boolean;
  readonly onClose: () => void;
}

/**
 * Modal for creating or editing a billing organization. The shell stays mounted while the page
 * toggles `opened`; the form inside mounts fresh on every open and remounts when the organization
 * changes, so its state is always seeded from the organization currently being edited.
 * @param props - The BillingOrganizationModal React props.
 * @returns The BillingOrganizationModal React node.
 */
export function BillingOrganizationModal(props: BillingOrganizationModalProps): JSX.Element {
  const { billingOrganizations, organization, opened, onClose } = props;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={organization ? 'Edit billing organization' : 'New billing organization'}
      actions={
        <Button type="submit" form={FORM_ID} loading={billingOrganizations.saving}>
          Save
        </Button>
      }
    >
      {opened && (
        <BillingOrganizationForm
          key={organization?.id ?? 'new'}
          billingOrganizations={billingOrganizations}
          organization={organization}
          onSaved={onClose}
        />
      )}
    </Modal>
  );
}

interface BillingOrganizationFormProps {
  readonly billingOrganizations: BillingOrganizations;
  readonly organization: WithId<Organization> | undefined;
  readonly onSaved: () => void;
}

/**
 * Field errors reported by the form itself. The billing organization profile the server validates
 * against covers name, NPI, Tax ID and address, so a bad value there is reported by the save. Only
 * the phone format is checked here: the profile requires a phone to exist but cannot express the
 * X12 rule on its digits.
 */
type FormErrors = Partial<Record<'phone', string>>;

/**
 * The billing organization fields, seeded from the organization at mount. On a failed save the
 * hook has already shown the error notification, so the form stays open with the entered values
 * for the user to fix and retry; `onSaved` fires only after a successful save.
 * @param props - The BillingOrganizationForm React props.
 * @returns The BillingOrganizationForm React node.
 */
function BillingOrganizationForm(props: BillingOrganizationFormProps): JSX.Element {
  const { billingOrganizations, organization, onSaved } = props;

  const [name, setName] = useState(() => organization?.name ?? '');
  const [npi, setNpi] = useState(() => getIdentifierValue(organization, NPI_SYSTEM));
  const [ein, setEin] = useState(() => getIdentifierValue(organization, EIN_SYSTEM));
  const [phone, setPhone] = useState(() => getPhoneValue(organization));
  const [address, setAddress] = useState<Address | undefined>(() => organization?.address?.[0]);
  const [errors, setErrors] = useState<FormErrors>({});

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
      onSaved();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    handleSave().catch(console.error);
  };

  return (
    <form id={FORM_ID} onSubmit={handleSubmit}>
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
    </form>
  );
}

function getIdentifierValue(organization: Organization | undefined, system: string): string {
  return (organization && getIdentifier(organization, system)) ?? '';
}

function getPhoneValue(organization: Organization | undefined): string {
  return organization?.telecom?.find((t) => t.system === 'phone')?.value ?? '';
}
