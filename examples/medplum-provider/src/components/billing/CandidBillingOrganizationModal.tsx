// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Input, Stack, TextInput, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Address, Organization } from '@medplum/fhirtypes';
import { AddressInput, Modal, useMedplum } from '@medplum/react';
import { IconInfoCircle } from '@tabler/icons-react';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import { useCandidProviderContracts } from '../../hooks/useCandidProviderContracts';
import type { CandidProviderRegistration } from '../../hooks/useCandidProviderRegistration';
import { useCandidProviderRegistration } from '../../hooks/useCandidProviderRegistration';
import {
  EIN_SYSTEM,
  NPI_SYSTEM,
  buildUpdatedOrganization,
  getMissingBillingOrganizationFields,
  isBillingOrganization,
  isValidBillingPhone,
  withCandidProviderExtensions,
  withCandidProviderId,
} from '../../utils/billing';
import { CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM } from '../../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { CandidContractAlert } from './CandidContractAlert';
import { CandidRegistrationAlert } from './CandidRegistrationAlert';

/**
 * Links the Save button in the modal footer to the form in the modal body, which live in different
 * subtrees of the modal.
 */
const FORM_ID = 'billing-organization-form';

/**
 * Props for the billing organization modal. `organization` is the one to edit, or undefined to create a new one;
 * an organization without the billing marker is one from elsewhere in the project being set up for billing.
 */
export interface CandidBillingOrganizationModalProps {
  readonly candidCreateBotId: string | undefined;
  readonly candidEditBotId: string | undefined;
  readonly organization: WithId<Organization> | undefined;
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

/**
 * Modal for creating or editing a billing organization. The shell stays mounted while the page
 * toggles `opened`; the form inside mounts fresh on every open and remounts when the organization
 * changes, so its state is always seeded from the organization currently being edited. The form
 * reports what Candid knows about the NPI it holds, so the footer button can read Edit while the
 * provider is already registered and hold while a lookup is in flight.
 * @param props - The CandidBillingOrganizationModal React props.
 * @returns The CandidBillingOrganizationModal React node.
 */
export function CandidBillingOrganizationModal(props: CandidBillingOrganizationModalProps): JSX.Element {
  const { candidCreateBotId, candidEditBotId, organization, opened, onClose, onSaved } = props;
  const [saving, setSaving] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<CandidProviderRegistration['status']>('unavailable');
  const registered = registrationStatus === 'registered';
  const missingBotMessage = registered
    ? candidEditBotId === undefined && EDIT_BOT_MISSING_MESSAGE
    : candidCreateBotId === undefined && CREATE_BOT_MISSING_MESSAGE;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={getModalTitle(organization)}
      actions={
        <Tooltip label={missingBotMessage} disabled={!missingBotMessage} multiline w={300}>
          <Button
            type="submit"
            form={FORM_ID}
            loading={saving || registrationStatus === 'loading'}
            data-disabled={missingBotMessage ? true : undefined}
            onClick={missingBotMessage ? (e) => e.preventDefault() : undefined}
          >
            {registered ? 'Edit' : 'Save'}
          </Button>
        </Tooltip>
      }
    >
      {opened && (
        <CandidBillingOrganizationForm
          key={organization?.id ?? 'new'}
          candidCreateBotId={candidCreateBotId}
          candidEditBotId={candidEditBotId}
          organization={organization}
          onRegistrationStatusChange={setRegistrationStatus}
          onSavingChange={setSaving}
          onSaved={() => {
            onSaved();
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

function getModalTitle(organization: Organization | undefined): string {
  if (!organization) {
    return 'New billing organization';
  }
  return isBillingOrganization(organization) ? 'Edit billing organization' : 'Set up billing organization';
}

/**
 * Props for the form inside the modal; `onRegistrationStatusChange` reports the state of the Candid
 * lookup for the NPI on the form, and resets it to unavailable when the form unmounts.
 */
interface CandidBillingOrganizationFormProps {
  readonly candidCreateBotId: string | undefined;
  readonly candidEditBotId: string | undefined;
  readonly organization: WithId<Organization> | undefined;
  readonly onRegistrationStatusChange: (status: CandidProviderRegistration['status']) => void;
  readonly onSavingChange: (saving: boolean) => void;
  readonly onSaved: () => void;
}

/**
 * The server profile validates name, NPI, Tax ID and address on save. Only the phone format is checked
 * here: the profile requires a phone but cannot express the X12 rule on its digits.
 */
/** Shown on the disabled Save button when a provider cannot be registered with Candid. */
const CREATE_BOT_MISSING_MESSAGE =
  'The Candid create-provider bot is not deployed in this project, so billing organizations cannot be saved here.';

/** Shown on the disabled Edit button when a registered provider cannot be pushed to Candid. */
const EDIT_BOT_MISSING_MESSAGE =
  'The Candid edit-provider bot is not deployed in this project, so registered providers cannot be edited here.';

type FormErrors = Partial<Record<'phone', string>>;

/**
 * The billing organization fields, seeded from the organization at mount.
 * @param props - The CandidBillingOrganizationForm React props.
 * @returns The CandidBillingOrganizationForm React node.
 */
function CandidBillingOrganizationForm(props: CandidBillingOrganizationFormProps): JSX.Element {
  const { candidCreateBotId, candidEditBotId, organization, onRegistrationStatusChange, onSavingChange, onSaved } =
    props;
  const medplum = useMedplum();

  const [name, setName] = useState(() => organization?.name ?? '');
  const [npi, setNpi] = useState(() => getIdentifierValue(organization, NPI_SYSTEM));
  const [ein, setEin] = useState(() => getIdentifierValue(organization, EIN_SYSTEM));
  const [phone, setPhone] = useState(() => getPhoneValue(organization));
  const [address, setAddress] = useState<Address | undefined>(() => organization?.address?.[0]);
  const [errors, setErrors] = useState<FormErrors>({});

  const registration = useCandidProviderRegistration('Organization', npi);
  const contracts = useCandidProviderContracts(
    registration.status === 'registered' ? registration.candidProviderId : undefined
  );

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
    onSavingChange(true);
    try {
      let built = buildUpdatedOrganization(organization ?? { resourceType: 'Organization' }, {
        name,
        npi: npi.trim(),
        ein: ein.trim(),
        phone,
        address,
      });
      built = withCandidProviderId(
        built,
        registration.status === 'registered' ? registration.candidProviderId : undefined
      );
      const candidProviderId = getIdentifier(built, CANDID_ORGANIZATION_PROVIDER_ID_SYSTEM);
      const botId = candidProviderId ? candidEditBotId : candidCreateBotId;
      if (botId) {
        built = withCandidProviderExtensions(built);
      }
      const saved = organization
        ? await medplum.updateResource(built as WithId<Organization>)
        : await medplum.createResource(built);
      showSuccessNotification({
        title: 'Success',
        message: getSavedMessage(organization),
      });
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
              `Billing organization saved, but ${candidProviderId ? 'updating it in' : 'registering it with'} Candid failed: ${normalizeErrorString(error)}. ` +
                'Save the organization again to retry.'
            )
          );
        }
      }
      onSaved();
    } catch (error) {
      showErrorNotification(error);
    } finally {
      onSavingChange(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    handleSave().catch(console.error);
  };

  return (
    <form id={FORM_ID} onSubmit={handleSubmit}>
      <Stack gap="md">
        {organization && !isBillingOrganization(organization) && (
          <MissingBillingFieldsAlert organization={organization} />
        )}
        <CandidRegistrationAlert
          registration={registration}
          registersAs={
            candidCreateBotId ? 'this organization as an organization provider, billing under its own NPI' : undefined
          }
        />
        <CandidContractAlert contracts={contracts} subject="this organization" />
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

function getSavedMessage(organization: Organization | undefined): string {
  if (!organization) {
    return 'Billing organization created';
  }
  return isBillingOrganization(organization) ? 'Billing organization updated' : 'Organization set up for billing';
}

interface MissingBillingFieldsAlertProps {
  readonly organization: Organization;
}

/**
 * Tells the user an organization from elsewhere in the project is about to become a billing organization, and
 * which billing fields it still lacks; the fields below are empty and required, so the save cannot proceed
 * without them.
 * @param props - The MissingBillingFieldsAlert React props.
 * @returns The MissingBillingFieldsAlert React node.
 */
function MissingBillingFieldsAlert(props: MissingBillingFieldsAlertProps): JSX.Element {
  const missing = getMissingBillingOrganizationFields(props.organization);
  return (
    <Alert icon={<IconInfoCircle size={16} />} color={missing.length > 0 ? 'yellow' : 'blue'} variant="light">
      {missing.length > 0
        ? `This organization is not set up for billing yet. Enter its ${formatList(missing)} to make it available for billing.`
        : 'This organization is not set up for billing yet. Check its details and save to make it available for billing.'}
    </Alert>
  );
}

function formatList(items: string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function getIdentifierValue(organization: Organization | undefined, system: string): string {
  return (organization && getIdentifier(organization, system)) ?? '';
}

function getPhoneValue(organization: Organization | undefined): string {
  return organization?.telecom?.find((t) => t.system === 'phone')?.value ?? '';
}
