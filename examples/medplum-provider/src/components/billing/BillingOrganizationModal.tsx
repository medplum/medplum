// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Address, Organization } from '@medplum/fhirtypes';
import { AddressInput, Modal, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { BillingOrganizationFormValues } from '../../utils/billing';
import { EIN_SYSTEM, NPI_SYSTEM, buildUpdatedOrganization, isValidBillingPhone, isValidNpi } from '../../utils/billing';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

interface BillingOrganizationModalProps {
  /** The organization to edit; omit to create a new one. */
  organization?: WithId<Organization>;
  opened: boolean;
  onClose: () => void;
  onSaved: (organization: WithId<Organization>) => void;
}

type FormErrors = Partial<Record<'name' | 'npi' | 'ein' | 'phone', string>>;

export function BillingOrganizationModal(props: BillingOrganizationModalProps): JSX.Element {
  const { organization, opened, onClose, onSaved } = props;
  const medplum = useMedplum();

  const [name, setName] = useState(() => organization?.name ?? '');
  const [npi, setNpi] = useState(() => getIdentifierValue(organization, NPI_SYSTEM));
  const [ein, setEin] = useState(() => getIdentifierValue(organization, EIN_SYSTEM));
  const [phone, setPhone] = useState(() => getPhoneValue(organization));
  const [address, setAddress] = useState<Address | undefined>(() => organization?.address?.[0]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // The modal stays mounted between opens (the parent only toggles `opened`), so re-seed every
  // field from the organization each time it opens. This runs during render — before the
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
    if (!name.trim()) {
      result.name = 'Name is required';
    }
    if (!isValidNpi(npi.trim())) {
      result.npi = 'NPI must be 10 digits with a valid check digit';
    }
    if (!/^\d{2}-?\d{7}$/.test(ein.trim())) {
      result.ein = 'Tax ID (EIN) must be 9 digits, e.g. 12-3456789';
    }
    if (phone.trim() && !isValidBillingPhone(phone)) {
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

    setSaving(true);
    try {
      const fields: BillingOrganizationFormValues = { name, npi: npi.trim(), ein: ein.trim(), phone, address };
      const built = buildUpdatedOrganization(organization ?? { resourceType: 'Organization' }, fields);
      const saved = organization
        ? await medplum.updateResource(built as WithId<Organization>)
        : await medplum.createResource(built);
      showSuccessNotification({
        title: 'Success',
        message: organization ? 'Billing organization updated' : 'Billing organization created',
      });
      onSaved(saved);
      onClose();
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={organization ? 'Edit billing organization' : 'New billing organization'}
      actions={
        <Button onClick={() => handleSave().catch(console.error)} loading={saving}>
          Save
        </Button>
      }
    >
      {opened && (
        <Stack gap="md">
          <TextInput
            label="Name"
            required
            value={name}
            error={errors.name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextInput
            label="NPI"
            required
            description="10 digits; the check digit is verified"
            value={npi}
            error={errors.npi}
            onChange={(event) => setNpi(event.currentTarget.value)}
          />
          <TextInput
            label="Tax ID (EIN)"
            required
            description="9 digits; stored without the dash"
            value={ein}
            error={errors.ein}
            onChange={(event) => setEin(event.currentTarget.value)}
          />
          <TextInput
            label="Phone"
            description="Used as the claim submitter phone; must not start with 0 or 1"
            value={phone}
            error={errors.phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              Address
            </Text>
            <AddressInput
              name="address"
              path="Organization.address"
              defaultValue={address}
              onChange={(value) => setAddress(value)}
            />
          </div>
        </Stack>
      )}
    </Modal>
  );
}

function getIdentifierValue(organization: Organization | undefined, system: string): string {
  return organization?.identifier?.find((id) => id.system === system)?.value ?? '';
}

function getPhoneValue(organization: Organization | undefined): string {
  return organization?.telecom?.find((t) => t.system === 'phone')?.value ?? '';
}
