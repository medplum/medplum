// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, Flex, Group, Menu, Stack } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { getReferenceString, HTTP_HL7_ORG } from '@medplum/core';
import type {
  Bot,
  ChargeItem,
  Claim,
  ClaimDiagnosis,
  Condition,
  Coverage,
  Encounter,
  EncounterDiagnosis,
  Media,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconDownload, IconFileText, IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { calculateTotalPrice } from '../../utils/chargeitems';
import { createClaimFromEncounter, getCptChargeItems } from '../../utils/claims';
import { createSelfPayCoverage } from '../../utils/coverage';
import { showErrorNotification } from '../../utils/notifications';
import { ChargeItemList } from '../ChargeItem/ChargeItemList';
import { ConditionList } from '../Conditions/ConditionList';
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
  } = props;
  const medplum = useMedplum();
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [billingBot, setBillingBot] = useState<WithId<Bot> | null | undefined>(undefined);
  const conditionsRef = useRef<Condition[]>(conditions);
  conditionsRef.current = conditions;
  const claimRef = useRef<WithId<Claim> | undefined>(claim);
  claimRef.current = claim;
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum);

  useEffect(() => {
    const fetchCoverage = async (): Promise<void> => {
      if (!patient) {
        return;
      }
      const coverageResults = await medplum.searchResources(
        'Coverage',
        `patient=${getReferenceString(patient)}&status=active`
      );
      if (coverageResults.length > 0) {
        setCoverage(coverageResults[0]);
      } else {
        const selfPayCoverage = await createSelfPayCoverage(medplum, patient);
        setCoverage(selfPayCoverage);
      }
    };

    fetchCoverage().catch((err) => showErrorNotification(err));
  }, [medplum, patient]);

  useEffect(() => {
    medplum
      .searchOne('Bot', {
        identifier: 'https://medplum.com/integrations/candid-health|send-to-candid',
      })
      .then((bot) => setBillingBot(bot ?? null))
      .catch(() => setBillingBot(null));
  }, [medplum]);

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
        debouncedUpdateResource(updatedClaim).catch((err) => showErrorNotification(err));
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
    [chargeItems, coverage, debouncedUpdateResource, encounter, medplum, patient, practitioner, setClaim]
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

  const submitClaim = useCallback(async (): Promise<void> => {
    if (!claim) {
      return;
    }

    const currentConditions = conditionsRef.current;
    if (!currentConditions || currentConditions.length === 0) {
      showNotification({
        title: 'Missing Diagnosis',
        message: 'Please add at least one diagnosis before submitting a claim',
        color: 'red',
      });
      return;
    }

    if (!billingBot) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await medplum.executeBot(billingBot.id, claim, 'application/fhir+json');
      showNotification({
        title: 'Claim Submitted',
        message: result?.message || 'Claim successfully submitted to Candid Health',
        color: 'green',
      });
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSubmitting(false);
    }
  }, [billingBot, claim, medplum]);

  return (
    <Stack gap="md">
      {claim && (
        <Card withBorder shadow="sm">
          <Flex justify="space-between">
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button variant="outline" leftSection={<IconDownload size={16} />}>
                  Export Claim
                </Button>
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

            {billingBot && (
              <Button variant="outline" leftSection={<IconSend size={16} />} loading={submitting} onClick={submitClaim}>
                Submit Claim
              </Button>
            )}
            {billingBot === null && (
              <Button
                variant="outline"
                leftSection={<IconSend size={16} />}
                onClick={() => {
                  window.open('https://www.medplum.com/contact', '_blank');
                }}
              >
                Request to connect a billing service
              </Button>
            )}
          </Flex>
        </Card>
      )}

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
