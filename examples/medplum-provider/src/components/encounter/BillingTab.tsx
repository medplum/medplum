// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, Flex, Group, Menu, Skeleton, Stack, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { notifications, showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { getReferenceString, HTTP_HL7_ORG } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  ClaimDiagnosis,
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
import { useCallback, useEffect, useRef, useState } from 'react';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { ChartNoteStatus } from '../../types/encounter';
import { calculateTotalPrice } from '../../utils/chargeitems';
import { createClaimFromEncounter, getCptChargeItems } from '../../utils/claims';
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
  chargeItems: WithId<ChargeItem>[] | undefined;
  setChargeItems: (chargeItems: WithId<ChargeItem>[]) => void;
  claim: WithId<Claim> | undefined;
  setClaim: (claim: WithId<Claim>) => void;
  chartNoteStatus: ChartNoteStatus;
}

export const BillingTab = (props: BillingTabProps): JSX.Element => {
  const {
    encounter,
    setEncounter,
    claim,
    patient,
    practitioner,
    setPractitioner,
    chargeItems,
    setChargeItems,
    setClaim,
    chartNoteStatus,
  } = props;
  const medplum = useMedplum();
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [coverages, setCoverages] = useState<WithId<Coverage>[]>([]);
  const [coverage, setCoverage] = useState<WithId<Coverage> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [claimResponse, setClaimResponse] = useState<WithId<ClaimResponse> | null | undefined>(undefined);
  const [claimResponseLoading, setClaimResponseLoading] = useState(false);

  const conditionsRef = useRef(conditions);
  conditionsRef.current = conditions;
  const claimRef = useRef(claim);
  claimRef.current = claim;
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum);
  const debouncedUpdateClaim = useDebouncedUpdateResource(medplum);

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

  useEffect(() => {
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

  // Creates the claim if it doesn't exist yet, otherwise updates it with the given patch.
  // Always folds in current diagnosis and insurance so every save is complete.
  // Pass creationArgs to override encounter/practitioner/items used at creation time.
  const syncClaim = useCallback(
    async (
      patch: Partial<Claim> = {},
      creationArgs?: { enc?: WithId<Encounter>; prac?: WithId<Practitioner>; items?: WithId<ChargeItem>[] }
    ): Promise<void> => {
      const currentClaim = claimRef.current;
      if (currentClaim) {
        const updatedClaim = {
          ...currentClaim,
          diagnosis: createDiagnosisArray(conditionsRef.current),
          ...(coverage && {
            insurance: [{ sequence: 1, focal: true, coverage: { reference: getReferenceString(coverage) } }],
          }),
          ...patch,
        };
        setClaim(updatedClaim);
        debouncedUpdateClaim(updatedClaim).catch((err) => showErrorNotification(err));
        return;
      }
      const enc = creationArgs?.enc ?? encounter;
      const prac = creationArgs?.prac ?? practitioner;
      const items = creationArgs?.items ?? chargeItems;
      if (!patient?.id || !enc?.id || !prac?.id || !items?.length) {
        return;
      }
      const newClaim = await createClaimFromEncounter(medplum, patient, enc, prac, items);
      if (newClaim) {
        setClaim(newClaim);
      }
    },
    [chargeItems, coverage, debouncedUpdateClaim, encounter, medplum, patient, practitioner, setClaim]
  );

  // Re-sync claim whenever conditions, coverage, or claim id changes.
  useEffect(() => {
    if (!claimRef.current) {
      return;
    }
    syncClaim().catch((err) => showErrorNotification(err));
  }, [conditions, coverage, claim?.id, syncClaim]);

  const handleEncounterChange = useDebouncedCallback(async (updatedEncounter: Encounter): Promise<void> => {
    try {
      const savedEncounter = await medplum.updateResource(updatedEncounter);
      setEncounter(savedEncounter);

      let currentPractitioner = practitioner;
      if (savedEncounter?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(savedEncounter.participant[0].individual);
        currentPractitioner = practitionerResult as WithId<Practitioner>;
        setPractitioner(currentPractitioner);
      }

      if (!patient?.id || !savedEncounter?.id || !currentPractitioner?.id || !chargeItems?.length) {
        return;
      }

      await syncClaim(
        { provider: { reference: getReferenceString(currentPractitioner) } },
        { enc: savedEncounter, prac: currentPractitioner }
      );
    } catch (err) {
      showErrorNotification(err);
    }
  }, SAVE_TIMEOUT_MS);

  const updateChargeItems = useCallback(
    async (updatedChargeItems: WithId<ChargeItem>[]): Promise<void> => {
      setChargeItems(updatedChargeItems);
      if (!patient?.id || !encounter?.id || !practitioner?.id || !updatedChargeItems.length) {
        return;
      }
      await syncClaim(
        {
          item: getCptChargeItems(updatedChargeItems, { reference: getReferenceString(encounter) }),
          total: { value: calculateTotalPrice(updatedChargeItems) },
        },
        { items: updatedChargeItems }
      );
    },
    [patient, encounter, practitioner, syncClaim, setChargeItems]
  );

  const exportClaimAsCMS1500 = async (): Promise<void> => {
    if (!claim?.id) {
      return;
    }

    const response = await medplum.post<Media>(medplum.fhirUrl('Claim', '$export'), {
      resourceType: 'Parameters',
      parameter: [{ name: 'resource', resource: claim }],
    });

    if (response.resourceType === 'Media' && response.content?.url) {
      window.open(response.content.url, '_blank');
    } else {
      showErrorNotification('Failed to download PDF');
    }
  };

  const runClaimSubmit = useCallback(
    async (
      coverageRefs: Reference<Coverage>[],
      operation: '$candid-submit-claim' | '$stedi-submit-claim',
      successTitle: string,
      successMessage: string
    ): Promise<void> => {
      if (!claim) {
        return;
      }
      setSubmitting(true);
      debouncedUpdateClaim.cancel();
      try {
        const updatedClaim = await medplum.updateResource({
          ...claim,
          insurance: coverageRefs.map((ref, index) => ({
            sequence: index + 1,
            focal: index === 0,
            coverage: ref,
          })),
        });
        setClaim(updatedClaim);
        const result = await medplum.post(medplum.fhirUrl('Claim', updatedClaim.id, operation), {
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
    [claim, debouncedUpdateClaim, fetchClaimResponse, medplum, setClaim]
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
    if (!claim) {
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

      {chargeItems && (
        <ChargeItemList
          patient={patient}
          encounter={encounter}
          chargeItems={chargeItems}
          updateChargeItems={updateChargeItems}
        />
      )}
    </Stack>
  );
};

const createDiagnosisArray = (conditions: Condition[]): ClaimDiagnosis[] => {
  return conditions.map((condition, index) => {
    const icd10Coding = condition.code?.coding?.find((c) => c.system === `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`);
    return {
      diagnosisCodeableConcept: {
        coding: icd10Coding
          ? [
              {
                ...icd10Coding,
                system: `${HTTP_HL7_ORG}/fhir/sid/icd-10`,
              },
            ]
          : [],
      },
      sequence: index + 1,
      type: [{ coding: [{ code: index === 0 ? 'principal' : 'secondary' }] }],
    };
  });
};
