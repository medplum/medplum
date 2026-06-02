// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, Flex, Group, Menu, Skeleton, Stack, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { notifications, showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { CPT, getReferenceString } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  ClaimResponse,
  Condition,
  Coverage,
  Encounter,
  EncounterDiagnosis,
  Media,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleOff, IconDownload, IconFileText, IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { ChartNoteStatus } from '../../types/encounter';
import { getChargeItemsForEncounter } from '../../utils/chargeitems';
import { buildClaimFromEncounter } from '../../utils/claims';
import { createSelfPayCoverage, isSelfPayCoverage } from '../../utils/coverage';
import { showErrorNotification } from '../../utils/notifications';
import { ChargeItemList } from '../ChargeItem/ChargeItemList';
import { ConditionList } from '../Conditions/ConditionList';
import { ClaimSubmittedPanel } from './ClaimSubmittedPanel';
import { SubmitClaimModal } from './SubmitClaimModal';
import { VisitDetailsPanel } from './VisitDetailsPanel';

export interface BillingTabProps {
  patient: WithId<Patient>;
  encounter: WithId<Encounter>;
  setEncounter: (encounter: WithId<Encounter>) => void;
  practitioner: WithId<Practitioner> | undefined;
  setPractitioner: (practitioner: WithId<Practitioner>) => void;
  chartNoteStatus: ChartNoteStatus;
}

export const BillingTab = (props: BillingTabProps): JSX.Element => {
  const { encounter, setEncounter, patient, practitioner, setPractitioner, chartNoteStatus } = props;
  const medplum = useMedplum();
  const [claim, setClaim] = useState<WithId<Claim> | undefined>();
  const [chargeItems, setChargeItems] = useState<WithId<ChargeItem>[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [coverages, setCoverages] = useState<WithId<Coverage>[]>([]);
  const [coverage, setCoverage] = useState<WithId<Coverage> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [claimResponse, setClaimResponse] = useState<WithId<ClaimResponse> | null | undefined>(undefined);
  const [claimResponseLoading, setClaimResponseLoading] = useState(false);

  const debouncedUpdateResource = useDebouncedUpdateResource(medplum);

  useEffect(() => {
    const fetchClaim = async (): Promise<void> => {
      const response = await medplum.searchOne(
        'Claim',
        { encounter: getReferenceString(encounter), status: 'active,draft' },
        { cache: 'no-cache' }
      );
      if (response) {
        setClaim(response);
      }
    };

    fetchClaim().catch((err) => showErrorNotification(err));
  }, [encounter, medplum]);

  useEffect(() => {
    const loadChargeItems = async (): Promise<void> => {
      const chargeItemsResult = await getChargeItemsForEncounter(medplum, encounter);
      setChargeItems(chargeItemsResult);
    };

    loadChargeItems().catch((err) => showErrorNotification(err));
  }, [encounter, medplum]);

  useEffect(() => {
    const fetchCoverage = async (): Promise<void> => {
      if (!patient) {
        return;
      }
      const results = await medplum.searchResources(
        'Coverage',
        `patient=${getReferenceString(patient)}&status=active&_sort=-_lastUpdated`
      );
      if (results.length > 0) {
        setCoverages(results);
        setCoverage(results.find((c) => !isSelfPayCoverage(c)) ?? results[0]);
      } else {
        const selfPay = await createSelfPayCoverage(medplum, patient);
        const selfPayWithId = selfPay as WithId<Coverage>;
        setCoverages([selfPayWithId]);
        setCoverage(selfPayWithId);
      }
    };

    fetchCoverage().catch((err) => showErrorNotification(err));
  }, [medplum, patient]);

  const fetchClaimResponse = useCallback(async (): Promise<void> => {
    if (!claim?.id) {
      setClaimResponse(null);
      return;
    }
    setClaimResponseLoading(true);
    try {
      const result = await medplum.searchOne(
        'ClaimResponse',
        { request: getReferenceString(claim) },
        { cache: 'no-cache' }
      );
      setClaimResponse(result ?? null);
    } finally {
      setClaimResponseLoading(false);
    }
  }, [claim, medplum]);

  // Refetch the ClaimResponse whenever the resolved claim changes (e.g. after the claim loads or is
  // (re)persisted). The synchronous clear in fetchClaimResponse is intentional, so suppress the rule.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchClaimResponse().catch((err) => showErrorNotification(err));
  }, [fetchClaimResponse]);

  const handleDiagnosisChange = useCallback(
    async (diagnosis: EncounterDiagnosis[]): Promise<void> => {
      const updatedEncounter = { ...encounter, diagnosis };
      setEncounter(updatedEncounter);
      await debouncedUpdateResource(updatedEncounter);
    },
    [encounter, setEncounter, debouncedUpdateResource]
  );

  const generateClaim = useCallback(
    async (insuranceRefs?: Reference<Coverage>[]): Promise<WithId<Claim>> => {
      if (!practitioner) {
        throw new Error('A practitioner is required to create a claim');
      }
      const insurance = insuranceRefs ?? (coverage ? [{ reference: getReferenceString(coverage) }] : undefined);
      const built = buildClaimFromEncounter({
        patient,
        encounter,
        practitioner,
        chargeItems,
        conditions,
        insurance,
      });

      const existingClaim = await medplum.searchOne(
        'Claim',
        { encounter: getReferenceString(encounter), status: 'active,draft' },
        { cache: 'no-cache' }
      );

      const saved = existingClaim?.id
        ? await medplum.updateResource({
            ...existingClaim,
            ...built,
            status: existingClaim.status ?? built.status,
            created: existingClaim.created ?? built.created,
          })
        : await medplum.createResource(built);
      setClaim(saved);
      return saved;
    },
    [patient, encounter, practitioner, chargeItems, conditions, coverage, medplum, setClaim]
  );

  const handleEncounterChange = useDebouncedCallback(async (updatedEncounter: Encounter): Promise<void> => {
    try {
      const savedEncounter = await medplum.updateResource(updatedEncounter);
      setEncounter(savedEncounter);

      if (savedEncounter?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(savedEncounter.participant[0].individual);
        setPractitioner(practitionerResult as WithId<Practitioner>);
      }
    } catch (err) {
      showErrorNotification(err);
    }
  }, SAVE_TIMEOUT_MS);

  const exportClaimAsCMS1500 = useCallback(async (): Promise<void> => {
    try {
      const saved = await generateClaim();
      const response = await medplum.post<Media>(medplum.fhirUrl('Claim', '$export'), {
        resourceType: 'Parameters',
        parameter: [{ name: 'resource', resource: saved }],
      });

      if (response.resourceType === 'Media' && response.content?.url) {
        window.open(response.content.url, '_blank');
      } else {
        showErrorNotification('Failed to download PDF');
      }
    } catch (err) {
      showErrorNotification(err);
    }
  }, [generateClaim, medplum]);

  const runClaimSubmit = useCallback(
    async (
      coverageRefs: Reference<Coverage>[],
      operation: '$candid-submit-claim' | '$stedi-submit-claim',
      successTitle: string,
      successMessage: string
    ): Promise<void> => {
      setSubmitting(true);
      try {
        const saved = await generateClaim(coverageRefs);
        const result = await medplum.post(medplum.fhirUrl('Claim', saved.id, operation), {
          resourceType: 'Parameters',
          parameter: [],
        });
        showNotification({ title: successTitle, message: successMessage, color: 'green' });
        if (result?.resourceType === 'ClaimResponse') {
          setClaimResponse(result as WithId<ClaimResponse>);
        } else {
          await fetchClaimResponse();
        }
      } catch (err) {
        try {
          const parsed = JSON.parse((err as Error).message);
          notifications.show({
            color: 'red',
            icon: <IconCircleOff />,
            title: 'Error',
            message: parsed?.errorMessage,
          });
        } catch {
          showErrorNotification(err);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [generateClaim, fetchClaimResponse, medplum]
  );

  const submitToCandid = useCallback(
    async (insurance: Reference<Coverage>[]): Promise<void> => {
      await runClaimSubmit(
        insurance,
        '$candid-submit-claim',
        'Claim Submitted',
        'Claim successfully submitted to Candid Health'
      );
    },
    [runClaimSubmit]
  );

  const submitToStedi = useCallback(
    async (insurance: Reference<Coverage>[]): Promise<void> => {
      await runClaimSubmit(
        insurance,
        '$stedi-submit-claim',
        'Submitted to Stedi',
        'Claim successfully submitted to Stedi'
      );
    },
    [runClaimSubmit]
  );

  const ensureSelfPayCoverage = useCallback(async (): Promise<WithId<Coverage>> => {
    const existing = coverages.find(isSelfPayCoverage);
    if (existing) {
      return existing;
    }
    const created = (await createSelfPayCoverage(medplum, patient)) as WithId<Coverage>;
    setCoverages((prev) => [...prev, created]);
    return created;
  }, [coverages, medplum, patient]);

  const LOCKED_TOOLTIP = 'Sign and Lock the encounter in order to enable this action';

  const exportClaimMenu = (disabled?: boolean): JSX.Element => (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <Tooltip label={LOCKED_TOOLTIP} disabled={!disabled}>
          <Button
            component="div"
            variant="outline"
            leftSection={<IconDownload size={16} />}
            disabled={disabled}
            data-disabled={disabled || undefined}
          >
            Export Claim
          </Button>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Export Options</Menu.Label>
        <Menu.Item
          leftSection={<IconFileText size={14} />}
          onClick={async () => {
            await exportClaimAsCMS1500();
          }}
        >
          CMS 1500 Form
        </Menu.Item>
        <Menu.Item
          leftSection={<IconFileText size={14} />}
          onClick={() => {
            showNotification({
              title: 'EDI X12',
              message: 'Please contact sales to enable EDI X12 export',
              color: 'blue',
            });
          }}
        >
          EDI X12
        </Menu.Item>
        <Menu.Item
          leftSection={<IconFileText size={14} />}
          onClick={() => {
            showNotification({
              title: 'NUCC Crosswalk',
              message: 'Please contact sales to enable NUCC Crosswalk export',
              color: 'blue',
            });
          }}
        >
          NUCC Crosswalk CSV
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const handleSubmitClaimClick = useCallback(async (): Promise<void> => {
    if (!conditions.length) {
      showNotification({
        title: 'Missing Diagnosis',
        message: 'Please add at least one diagnosis before submitting a claim',
        color: 'red',
      });
      return;
    }
    if (!coverages.find(isSelfPayCoverage)) {
      const created = (await createSelfPayCoverage(medplum, patient)) as WithId<Coverage>;
      setCoverages((prev) => [...prev, created]);
    }
    setConfirmModalOpen(true);
  }, [conditions, coverages, medplum, patient]);

  const renderClaimCard = (): JSX.Element | null => {
    const hasCptItems = chargeItems.some((item) => item.code?.coding?.some((c) => c.system === CPT));
    if (!hasCptItems && !claim && !claimResponse) {
      return null;
    }

    if (claimResponseLoading) {
      return (
        <Card withBorder shadow="sm" p="md">
          <Skeleton height={20} width="60%" mb="sm" />
          <Skeleton height={14} width="40%" />
        </Card>
      );
    }

    if (claimResponse) {
      return <ClaimSubmittedPanel claimResponse={claimResponse} exportMenu={exportClaimMenu()} />;
    }
    return (
      <Card withBorder shadow="sm">
        <Flex justify="space-between">
          {exportClaimMenu(chartNoteStatus !== ChartNoteStatus.SignedAndLocked)}

          <SubmitClaimModal
            opened={confirmModalOpen}
            coverages={coverages}
            selectedCoverage={coverage}
            patient={patient}
            conditions={conditions}
            practitioner={practitioner}
            onClose={() => setConfirmModalOpen(false)}
            onSubmitClaim={submitToCandid}
            onSubmitToStedi={submitToStedi}
            ensureSelfPayCoverage={ensureSelfPayCoverage}
          />
          <Tooltip label={LOCKED_TOOLTIP} disabled={chartNoteStatus === ChartNoteStatus.SignedAndLocked}>
            <Button
              component="div"
              variant="outline"
              leftSection={<IconSend size={16} />}
              loading={submitting}
              onClick={chartNoteStatus === ChartNoteStatus.SignedAndLocked ? handleSubmitClaimClick : undefined}
              disabled={chartNoteStatus !== ChartNoteStatus.SignedAndLocked || submitting}
              data-disabled={chartNoteStatus !== ChartNoteStatus.SignedAndLocked || undefined}
            >
              Submit Claim
            </Button>
          </Tooltip>
        </Flex>
      </Card>
    );
  };

  return (
    <Stack gap="md">
      {renderClaimCard()}

      <Group grow align="flex-start">
        <VisitDetailsPanel
          practitioner={practitioner}
          encounter={encounter}
          onEncounterChange={handleEncounterChange}
        />
      </Group>

      {encounter && (
        <ConditionList
          patient={patient}
          encounter={encounter}
          conditions={conditions}
          setConditions={setConditions}
          onDiagnosisChange={handleDiagnosisChange}
        />
      )}

      <ChargeItemList
        patient={patient}
        encounter={encounter}
        chargeItems={chargeItems}
        updateChargeItems={setChargeItems}
      />
    </Stack>
  );
};
