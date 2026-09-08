// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Input, Stack, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, getIdentifier } from '@medplum/core';
import type { Address, Organization, Practitioner, Reference } from '@medplum/fhirtypes';
import { AddressInput, Modal, ResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { BillingPractitioners } from '../../hooks/useBillingPractitioners';
import { useCandidProviderRegistration } from '../../hooks/useCandidProviderRegistration';
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  EIN_SYSTEM,
  MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
  NPI_SYSTEM,
  isCompleteBillingAddress,
  isValidNpi,
} from '../../utils/billing';
import { CandidRegistrationAlert } from './CandidRegistrationAlert';

/**
 * Props for the practitioner billing modal. `practitioner` is the one to edit (undefined keeps the modal
 * closed); `billingOrganization` is the organization on their active role, from the row that opened it.
 */
export interface BillingPractitionerModalProps {
  readonly billingPractitioners: BillingPractitioners;
  readonly practitioner: WithId<Practitioner> | undefined;
  readonly billingOrganization: Reference<Organization> | undefined;
  readonly onClose: () => void;
}

type FormErrors = Partial<Record<'npi' | 'ein' | 'address', string>>;

export function BillingPractitionerModal(props: BillingPractitionerModalProps): JSX.Element {
  const { billingPractitioners, practitioner, billingOrganization, onClose } = props;

  const [npi, setNpi] = useState('');
  const [ein, setEin] = useState('');
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [organization, setOrganization] = useState<Reference<Organization> | Organization | undefined>(undefined);
  const [errors, setErrors] = useState<FormErrors>({});
  const billsIndividually = !organization;

  const registration = useCandidProviderRegistration(practitioner && 'Practitioner', npi);

  const [seededFor, setSeededFor] = useState<string | undefined>(undefined);
  if (practitioner?.id !== seededFor) {
    setSeededFor(practitioner?.id);
    setNpi(practitioner ? (getIdentifier(practitioner, NPI_SYSTEM) ?? '') : '');
    setEin(practitioner ? (getIdentifier(practitioner, EIN_SYSTEM) ?? '') : '');
    setAddress(practitioner?.address?.[0]);
    setOrganization(billingOrganization);
    setErrors({});
  }

  const handleSave = async (): Promise<void> => {
    const validationErrors: FormErrors = {};
    if (!isValidNpi(npi.trim())) {
      validationErrors.npi = 'NPI must be 10 digits';
    }
    if (billsIndividually) {
      if (!/^\d{2}-?\d{7}$/.test(ein.trim())) {
        validationErrors.ein = 'Tax ID (EIN) must be 9 digits, e.g. 12-3456789';
      }
      if (!isCompleteBillingAddress(address)) {
        validationErrors.address = 'Address needs a street, city, two-letter state, and ZIP';
      }
    }
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }
    const saved = await billingPractitioners.savePractitioner(
      practitioner as WithId<Practitioner>,
      { npi: npi.trim(), ein: ein.trim(), address },
      organization && 'resourceType' in organization ? createReference(organization) : organization,
      registration
    );
    if (saved) {
      onClose();
    }
  };

  return (
    <Modal
      opened={practitioner !== undefined}
      onClose={onClose}
      size="lg"
      title="Billing details"
      actions={
        <Button
          onClick={() => handleSave().catch(console.error)}
          loading={billingPractitioners.saving || registration.status === 'loading'}
        >
          {registration.status === 'registered' ? 'Edit' : 'Save'}
        </Button>
      }
    >
      {practitioner && (
        <Stack gap="md">
          <CandidRegistrationAlert
            registration={registration}
            registersAs={billingPractitioners.candidBotId ? 'this practitioner as a rendering provider' : undefined}
          />
          <TextInput
            label="NPI"
            required
            description="10 digits"
            value={npi}
            error={errors.npi}
            onChange={(event) => setNpi(event.currentTarget.value)}
          />
          <div>
            <ResourceInput
              resourceType="Organization"
              name="billing-organization"
              label="Bills under"
              placeholder="The practitioner (individual billing)"
              searchCriteria={{
                identifier: `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
              }}
              defaultValue={billingOrganization}
              onChange={setOrganization}
            />
            <Input.Description mt={4}>
              Claims name this organization as the billing provider. Leave it empty to bill under the practitioner's own
              NPI.
            </Input.Description>
          </div>
          <TextInput
            label="Tax ID (EIN)"
            required={billsIndividually}
            description="Billed in box 25 when the practitioner bills individually; an organization supplies its own"
            value={ein}
            error={errors.ein}
            onChange={(event) => setEin(event.currentTarget.value)}
          />
          <div>
            <Input.Label required={billsIndividually} mb={4}>
              Address
            </Input.Label>
            <Input.Description mb={4}>
              Billed in box 33 when the practitioner bills individually; an organization supplies its own
            </Input.Description>
            <AddressInput name="address" path="Practitioner.address" defaultValue={address} onChange={setAddress} />
            {errors.address && <Input.Error mt={4}>{errors.address}</Input.Error>}
          </div>
        </Stack>
      )}
    </Modal>
  );
}
