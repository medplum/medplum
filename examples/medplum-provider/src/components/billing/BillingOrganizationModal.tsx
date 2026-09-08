// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Input, Stack, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getIdentifier } from '@medplum/core';
import type { Address, Organization } from '@medplum/fhirtypes';
import { AddressInput, Modal } from '@medplum/react';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import type { BillingOrganizations } from '../../hooks/useBillingOrganizations';
import type { CandidProviderRegistration } from '../../hooks/useCandidProviderRegistration';
import { useCandidProviderRegistration } from '../../hooks/useCandidProviderRegistration';
import { EIN_SYSTEM, NPI_SYSTEM, isValidBillingPhone } from '../../utils/billing';
import { CandidRegistrationAlert } from './CandidRegistrationAlert';

/**
 * Links the Save button in the modal footer to the form in the modal body, which live in different
 * subtrees of the modal.
 */
const FORM_ID = 'billing-organization-form';

/** Props for the billing organization modal; `organization` is the one to edit, or undefined to create a new one. */
export interface BillingOrganizationModalProps {
  readonly billingOrganizations: BillingOrganizations;
  readonly organization: WithId<Organization> | undefined;
  readonly opened: boolean;
  readonly onClose: () => void;
}

/**
 * Modal for creating or editing a billing organization. The shell stays mounted while the page
 * toggles `opened`; the form inside mounts fresh on every open and remounts when the organization
 * changes, so its state is always seeded from the organization currently being edited. The form
 * reports what Candid knows about the NPI it holds, so the footer button can read Edit while the
 * provider is already registered and hold while a lookup is in flight.
 * @param props - The BillingOrganizationModal React props.
 * @returns The BillingOrganizationModal React node.
 */
export function BillingOrganizationModal(props: BillingOrganizationModalProps): JSX.Element {
  const { billingOrganizations, organization, opened, onClose } = props;
  const [registrationStatus, setRegistrationStatus] = useState<CandidProviderRegistration['status']>('unavailable');

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={organization ? 'Edit billing organization' : 'New billing organization'}
      actions={
        <Button type="submit" form={FORM_ID} loading={billingOrganizations.saving || registrationStatus === 'loading'}>
          {registrationStatus === 'registered' ? 'Edit' : 'Save'}
        </Button>
      }
    >
      {opened && (
        <BillingOrganizationForm
          key={organization?.id ?? 'new'}
          billingOrganizations={billingOrganizations}
          organization={organization}
          onRegistrationStatusChange={setRegistrationStatus}
          onSaved={onClose}
        />
      )}
    </Modal>
  );
}

/**
 * Props for the form inside the modal; `onRegistrationStatusChange` reports the state of the Candid
 * lookup for the NPI on the form, and resets it to unavailable when the form unmounts.
 */
interface BillingOrganizationFormProps {
  readonly billingOrganizations: BillingOrganizations;
  readonly organization: WithId<Organization> | undefined;
  readonly onRegistrationStatusChange: (status: CandidProviderRegistration['status']) => void;
  readonly onSaved: () => void;
}

/**
 * The server profile validates name, NPI, Tax ID and address on save. Only the phone format is checked
 * here: the profile requires a phone but cannot express the X12 rule on its digits.
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
  const { billingOrganizations, organization, onRegistrationStatusChange, onSaved } = props;

  const [name, setName] = useState(() => organization?.name ?? '');
  const [npi, setNpi] = useState(() => getIdentifierValue(organization, NPI_SYSTEM));
  const [ein, setEin] = useState(() => getIdentifierValue(organization, EIN_SYSTEM));
  const [phone, setPhone] = useState(() => getPhoneValue(organization));
  const [address, setAddress] = useState<Address | undefined>(() => organization?.address?.[0]);
  const [errors, setErrors] = useState<FormErrors>({});

  const registration = useCandidProviderRegistration('Organization', npi);

  useEffect(() => {
    onRegistrationStatusChange(registration.status);
  }, [registration.status, onRegistrationStatusChange]);

  useEffect(() => {
    return () => onRegistrationStatusChange('unavailable');
  }, [onRegistrationStatusChange]);

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
    const saved = await billingOrganizations.saveOrganization(
      organization,
      { name, npi: npi.trim(), ein: ein.trim(), phone, address },
      registration
    );
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
        <CandidRegistrationAlert
          registration={registration}
          registersAs={
            billingOrganizations.candidBotId
              ? 'this organization as an organization provider, billing under its own NPI'
              : undefined
          }
        />
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
