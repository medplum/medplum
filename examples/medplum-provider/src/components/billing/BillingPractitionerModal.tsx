// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Input, Stack, Text, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, formatAddress, getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Address, Organization, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { AddressInput, Modal, ResourceAvatar, ResourceInput, useMedplum, useResource } from '@medplum/react';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import { useCandidProviderContracts } from '../../hooks/useCandidProviderContracts';
import type { CandidProviderRegistration } from '../../hooks/useCandidProviderRegistration';
import { useCandidProviderRegistration } from '../../hooks/useCandidProviderRegistration';
import type { BillingPractitionerFormValues } from '../../utils/billing';
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  EIN_SYSTEM,
  MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
  NPI_SYSTEM,
  buildUpdatedPractitioner,
  isCompleteBillingAddress,
  isValidNpi,
  withCandidPractitionerExtensions,
  withCandidProviderId,
} from '../../utils/billing';
import { CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM } from '../../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { CandidContractAlert } from './CandidContractAlert';
import { CandidRegistrationAlert } from './CandidRegistrationAlert';

const FORM_ID = 'billing-practitioner-form';

function OrganizationItem(props: AsyncAutocompleteOption<Organization>): JSX.Element {
  const { label, resource } = props;
  const address = resource.address?.[0];
  return (
    <Group wrap="nowrap">
      <ResourceAvatar value={resource} />
      <div>
        <Text>{label}</Text>
        {address && (
          <Text size="xs" c="dimmed">
            {formatAddress(address)}
          </Text>
        )}
      </div>
    </Group>
  );
}

/**
 * Props for the practitioner billing modal. `practitioner` is the one to edit (undefined keeps the modal
 * closed); `roles` contains their active roles, from the row that opened it.
 */
export interface BillingPractitionerModalProps {
  readonly candidBotId: string | undefined;
  readonly candidEditBotId: string | undefined;
  readonly practitioner: WithId<Practitioner> | undefined;
  readonly roles: WithId<PractitionerRole>[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

type FormErrors = Partial<Record<'npi' | 'ein' | 'address', string>>;

export function BillingPractitionerModal(props: BillingPractitionerModalProps): JSX.Element {
  const { candidBotId, candidEditBotId, practitioner, roles, onClose, onSaved } = props;
  const medplum = useMedplum();
  const [saving, setSaving] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<CandidProviderRegistration['status']>('unavailable');

  const handleSave = async (
    fields: BillingPractitionerFormValues,
    organization: Reference<Organization> | undefined,
    registration: CandidProviderRegistration,
    role: WithId<PractitionerRole> | undefined
  ): Promise<void> => {
    if (!practitioner) {
      return;
    }
    setSaving(true);
    try {
      let built = buildUpdatedPractitioner(practitioner, fields);
      built = withCandidProviderId(
        built,
        registration.status === 'registered' ? registration.candidProviderId : undefined
      );
      const candidProviderId = getIdentifier(built, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM);
      const botId = candidProviderId ? candidEditBotId : candidBotId;
      if (botId) {
        const billsIndividually = !organization || roles.some((other) => other.id !== role?.id && !other.organization);
        built = withCandidPractitionerExtensions(built, billsIndividually);
      }
      const saved = await medplum.updateResource(built as WithId<Practitioner>);
      if (organization) {
        if (role) {
          await medplum.patchResource('PractitionerRole', role.id, [
            { op: role.organization ? 'replace' : 'add', path: '/organization', value: organization },
          ]);
        } else {
          await medplum.createResource<PractitionerRole>({
            resourceType: 'PractitionerRole',
            active: true,
            practitioner: createReference(saved),
            organization,
          });
        }
      } else if (role?.organization) {
        // Keep the role active to preserve its unrelated authorizations.
        await medplum.patchResource('PractitionerRole', role.id, [{ op: 'remove', path: '/organization' }]);
      }
      showSuccessNotification({ title: 'Success', message: 'Billing details updated' });
      if (botId) {
        try {
          await medplum.executeBot(botId, saved, 'application/fhir+json');
          showSuccessNotification({
            title: 'Success',
            message: candidProviderId ? 'Updated in Candid' : 'Registered with Candid',
          });
        } catch (error) {
          showErrorNotification(
            new Error(
              `Practitioner saved, but ${candidProviderId ? 'updating them in' : 'registering them with'} Candid failed: ${normalizeErrorString(error)}. ` +
                'Save the practitioner again to retry.'
            )
          );
        }
      }
      onSaved();
      onClose();
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={practitioner !== undefined}
      onClose={onClose}
      size="lg"
      title="Billing details"
      actions={
        <Button type="submit" form={FORM_ID} loading={saving || registrationStatus === 'loading'}>
          {registrationStatus === 'registered' ? 'Edit' : 'Save'}
        </Button>
      }
    >
      {practitioner && (
        <BillingPractitionerForm
          key={practitioner.id}
          candidBotId={candidBotId}
          practitioner={practitioner}
          roles={roles}
          onRegistrationStatusChange={setRegistrationStatus}
          onSave={handleSave}
        />
      )}
    </Modal>
  );
}

interface BillingPractitionerFormProps {
  readonly candidBotId: string | undefined;
  readonly practitioner: WithId<Practitioner>;
  readonly roles: WithId<PractitionerRole>[];
  readonly onRegistrationStatusChange: (status: CandidProviderRegistration['status']) => void;
  readonly onSave: (
    fields: BillingPractitionerFormValues,
    organization: Reference<Organization> | undefined,
    registration: CandidProviderRegistration,
    role: WithId<PractitionerRole> | undefined
  ) => Promise<void>;
}

function BillingPractitionerForm(props: BillingPractitionerFormProps): JSX.Element {
  const { candidBotId, practitioner, roles, onRegistrationStatusChange, onSave } = props;

  const [npi, setNpi] = useState(() => getIdentifier(practitioner, NPI_SYSTEM) ?? '');
  const [ein, setEin] = useState(() => getIdentifier(practitioner, EIN_SYSTEM) ?? '');
  const [address, setAddress] = useState<Address | undefined>(() => practitioner.address?.[0]);
  const selectedRole = roles[0];
  const [organization, setOrganization] = useState<Reference<Organization> | Organization | undefined>(
    selectedRole?.organization
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const billsIndividually = !organization || roles.some((role) => role.id !== selectedRole?.id && !role.organization);

  const registration = useCandidProviderRegistration('Practitioner', npi);
  const billingOrg = useResource<Organization>(
    organization && 'resourceType' in organization ? createReference(organization) : organization
  );
  const registeredProviderId = registration.status === 'registered' ? registration.candidProviderId : undefined;
  const contractingProviderId = billsIndividually
    ? registeredProviderId
    : billingOrg && getIdentifier(billingOrg, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM);
  const contracts = useCandidProviderContracts(contractingProviderId);

  useEffect(() => {
    onRegistrationStatusChange(registration.status);
  }, [registration.status, onRegistrationStatusChange]);

  useEffect(() => {
    return () => onRegistrationStatusChange('unavailable');
  }, [onRegistrationStatusChange]);

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
    await onSave(
      { npi: npi.trim(), ein: ein.trim(), address },
      organization && 'resourceType' in organization ? createReference(organization) : organization,
      registration,
      selectedRole
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    handleSave().catch(console.error);
  };

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
      <Stack gap="md">
        <CandidRegistrationAlert
          registration={registration}
          registersAs={candidBotId ? 'this practitioner as a rendering provider' : undefined}
        />
        <CandidContractAlert
          contracts={contracts}
          subject={billsIndividually ? 'this practitioner' : (billingOrg?.name ?? 'the billing organization')}
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
          <ResourceInput<Organization>
            resourceType="Organization"
            name="billing-organization"
            label="Bills under"
            placeholder="The practitioner (individual billing)"
            searchCriteria={{
              identifier: `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
            }}
            defaultValue={selectedRole?.organization}
            itemComponent={OrganizationItem}
            onChange={setOrganization}
          />
          <Input.Description mt={4}>
            The billing organization for this role. Leave it empty to bill under the practitioner's own NPI.
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
    </form>
  );
}
