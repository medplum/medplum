// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Select, Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type {
  Coverage,
  CoverageEligibilityRequest,
  Organization,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import {
  Modal,
  ResourceInput,
  useMedplum,
  useMedplumProfile,
  useResource,
  useSearchOne,
  useSearchResources,
} from '@medplum/react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { BILLING_ORGANIZATION_IDENTIFIER_VALUE, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM } from '../../utils/billing';
import { isSelfPayCoverage } from '../../utils/coverage';
import { showErrorNotification } from '../../utils/notifications';
import { getErrorMessage } from './utils';

/**
 * Props for CheckEligibilityModal.
 * @param opened - Whether the modal is shown.
 * @param onClose - Called when the modal is dismissed or after a request was created.
 * @param patient - The patient whose coverages are offered and whose eligibility is checked.
 * @param defaultCoverageId - Coverage preselected when the modal opens, typically the one in the URL.
 * @param onCreated - Called with the new CoverageEligibilityRequest after it was created and submitted.
 */
export interface CheckEligibilityModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly patient: Reference<Patient>;
  readonly defaultCoverageId?: string;
  readonly onCreated: (request: WithId<CoverageEligibilityRequest>) => void;
}

/**
 * Picks one of the patient's active coverages and runs an eligibility check against it: creates a
 * CoverageEligibilityRequest and posts `$submit`. A failed `$submit` is reported but the request is kept.
 * The provider defaults to the organization on the signed-in practitioner's PractitionerRole and can be
 * changed to any billing organization or cleared, in which case the practitioner themselves is the provider.
 * The selections reset to their defaults every time the modal closes.
 * @param props - The CheckEligibilityModal React props.
 * @returns The CheckEligibilityModal React node.
 */
export function CheckEligibilityModal(props: CheckEligibilityModalProps): JSX.Element {
  const { opened, onClose, patient, defaultCoverageId, onCreated } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [chosenId, setChosenId] = useState<string>();
  const [chosenProvider, setChosenProvider] = useState<Organization>();
  const [providerEdited, setProviderEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const defaultCoverage = useResource<Coverage>(
    defaultCoverageId ? { reference: `Coverage/${defaultCoverageId}` } : undefined
  );
  const [activeCoverages] = useSearchResources(
    'Coverage',
    { beneficiary: patient.reference as string, status: 'active', _sort: '-_lastUpdated' },
    { enabled: opened }
  );
  const [practitionerRole, practitionerRoleLoading] = useSearchOne(
    'PractitionerRole',
    profile ? { practitioner: getReferenceString(profile) } : undefined,
    { enabled: opened && !!profile }
  );

  const coverages = useMemo(() => {
    const result = (activeCoverages ?? []).filter((c) => !isSelfPayCoverage(c));
    if (defaultCoverage && !result.some((c) => c.id === defaultCoverage.id)) {
      result.unshift(defaultCoverage);
    }
    return result;
  }, [activeCoverages, defaultCoverage]);

  const selectedId = chosenId ?? defaultCoverageId ?? coverages[0]?.id;
  const selectedCoverage = coverages.find((c) => c.id === selectedId);

  const defaultProvider = practitionerRole?.organization;
  const providerOrganization = providerEdited ? toReference(chosenProvider) : defaultProvider;

  const handleClose = (): void => {
    setChosenId(undefined);
    setChosenProvider(undefined);
    setProviderEdited(false);
    onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    if (!selectedCoverage || !profile) {
      return;
    }
    const provider: Reference<Organization | Practitioner> =
      providerOrganization ?? createReference(profile as Practitioner);
    setSubmitting(true);
    try {
      const savedRequest = await medplum.createResource<CoverageEligibilityRequest>({
        resourceType: 'CoverageEligibilityRequest',
        status: 'active',
        purpose: ['benefits'],
        created: new Date().toISOString(),
        patient,
        insurer: selectedCoverage.payor?.[0] as Reference<Organization>,
        provider,
        insurance: [{ focal: true, coverage: createReference(selectedCoverage) }],
      });
      try {
        await medplum.post(medplum.fhirUrl('CoverageEligibilityRequest', savedRequest.id, '$submit'));
      } catch (err) {
        showErrorNotification(getErrorMessage(err));
      }
      onCreated(savedRequest);
      handleClose();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Check Eligibility"
      actions={
        <Button
          loading={submitting}
          disabled={!selectedCoverage || practitionerRoleLoading}
          onClick={() => handleSubmit().catch(showErrorNotification)}
        >
          Check Eligibility
        </Button>
      }
    >
      <Stack>
        <Select
          label="Coverage"
          placeholder="Select coverage"
          data={coverages.map((c) => ({ value: c.id, label: formatCoverageLabel(c) }))}
          value={selectedId ?? null}
          onChange={(value) => setChosenId(value ?? undefined)}
          nothingFoundMessage="No active coverages"
          allowDeselect={false}
        />
        {!practitionerRoleLoading && (
          <ResourceInput<Organization>
            key={defaultProvider?.reference ?? 'none'}
            label="Provider"
            name="provider"
            resourceType="Organization"
            placeholder="Defaults to the practitioner when empty"
            searchCriteria={{
              identifier: `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
            }}
            defaultValue={defaultProvider}
            onChange={(value) => {
              setChosenProvider(value);
              setProviderEdited(true);
            }}
          />
        )}
      </Stack>
    </Modal>
  );
}

/**
 * Label for a coverage option: the payor name (or plan type) followed by the subscriber id when present.
 * @param coverage - The coverage to label.
 * @returns The option label.
 */
function formatCoverageLabel(coverage: Coverage): string {
  const payor = coverage.payor?.find((p) => p.display)?.display ?? coverage.type?.text ?? 'Coverage';
  return coverage.subscriberId ? `${payor} · ${coverage.subscriberId}` : payor;
}

/**
 * Reference to a billing organization the user picked, or undefined when the selection was cleared.
 * @param organization - The picked organization, or undefined once cleared.
 * @returns The reference, or undefined.
 */
function toReference(organization: Organization | undefined): Reference<Organization> | undefined {
  return organization ? createReference(organization) : undefined;
}
