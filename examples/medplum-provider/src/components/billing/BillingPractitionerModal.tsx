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
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  EIN_SYSTEM,
  MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
  NPI_SYSTEM,
  isCompleteBillingAddress,
  isValidNpi,
} from '../../utils/billing';
import { useCandidProviderRegistration } from '../../hooks/useCandidProviderRegistration';
import { CandidRegistrationAlert } from './CandidRegistrationAlert';

export interface BillingPractitionerModalProps {
  readonly billingPractitioners: BillingPractitioners;
  /** The practitioner to edit; undefined keeps the modal closed. */
  readonly practitioner: WithId<Practitioner> | undefined;
  /** The organization on the practitioner's active role, from the row that opened the modal. */
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
  // With a billing organization on their role, the organization is the billing provider on the
  // claim and supplies the tax ID and address; without one, the practitioner has to carry both.
  const billsIndividually = !organization;

  // The modal stays mounted between opens (the page only swaps the practitioner), so re-seed every
  // field whenever a different one is selected. This runs during render — before the
  // `{practitioner && ...}` form remounts — so the uncontrolled AddressInput picks up the fresh
  // defaultValue; a useEffect would fire too late for it.
  // Ask Candid directly rather than trusting the identifier a past registration stamped locally.
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
          // The lookup decides whether saving registers or edits in Candid, so wait for its answer
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
              // Only the organizations the Billing Organizations tab manages; the project's payers
              // and facilities are Organizations too.
              searchCriteria={{
                identifier: `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
              }}
              defaultValue={billingOrganization}
              onChange={setOrganization}
            />
            <Input.Description mt={4}>
              Claims name this organization as the billing provider. Leave it empty to bill under the practitioner's
              own NPI.
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
