// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, Flex, Group, Menu, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  ChargeItem,
  Claim,
  ClaimDiagnosis,
  Condition,
  Coverage,
  Encounter,
  EncounterDiagnosis,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';
import { IconDownload, IconFileText, IconSend } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useState } from 'react';
import { VisitDetailsPanel } from '../../components/encounter/VisitDetailsPanel';
import { getReferenceString, HTTP_HL7_ORG } from '@medplum/core';
import { showErrorNotification } from '../../utils/notifications';
import { useMedplum } from '@medplum/react';
import { createSelfPayCoverage } from '../../utils/coverage';
import { ConditionList } from '../../components/Conditions/ConditionList';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { ChargeItemList } from '../../components/ChargeItem/ChargeItemList';
import { createClaimFromEncounter, getCptChargeItems } from '../../utils/claims';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { calculateTotalPrice } from '../../utils/chargeitems';
import { useDebouncedCallback } from '@mantine/hooks';

interface BillingTabProps {
  patient: Patient;
  encounter: Encounter;
  setEncounter: (encounter: Encounter) => void;
  practitioner: Practitioner | undefined;
  setPractitioner: (practitioner: Practitioner) => void;
  chargeItems: ChargeItem[] | undefined;
  setChargeItems: (chargeItems: ChargeItem[]) => void;
  claim: Claim | undefined;
  setClaim: (claim: Claim) => void;
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
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum);

  useEffect(() => {
    const fetchCoverage = async (): Promise<void> => {
      if (!patient) {
        return;
      }
      const coverageResult = await medplum.searchResources('Coverage', `patient=${getReferenceString(patient)}`);
      if (coverageResult.length > 0) {
        setCoverage(coverageResult[0] as Coverage);
      }
    };

    fetchCoverage().catch((err) => showErrorNotification(err));
  }, [medplum, patient]);

  const exportClaimAsCMS1500 = async (): Promise<void> => {
    if (!claim?.id || !patient?.id) {
      return;
    }

    let coverageForClaim = coverage;
    if (!coverageForClaim) {
      const coverageResults = await medplum.searchResources(
        'Coverage',
        `patient=${getReferenceString(patient)}&status=active`
      );
      if (coverageResults === undefined) {
        showErrorNotification('Failed to fetch coverage information');
        return;
      }

      if (coverageResults.length > 0) {
        coverageForClaim = coverageResults[0];
      } else {
        coverageForClaim = await createSelfPayCoverage(medplum, patient.id);
      }
    }

    const diagnosisArray = createDiagnosisArray(conditions || []);
    const claimToExport: Claim = {
      ...claim,
      insurance: [
        {
          sequence: 1,
          focal: true,
          coverage: { reference: getReferenceString(coverageForClaim) },
        },
      ],
      diagnosis: diagnosisArray,
    };

    const response = await medplum.post(medplum.fhirUrl('Claim', '$export'), {
      resourceType: 'Parameters',
      parameter: [{ name: 'resource', resource: claimToExport }],
    });

    if (response.resourceType === 'Media' && response.content?.url) {
      const url = response.content.url;
      window.open(url, '_blank');
    } else {
      showErrorNotification('Failed to download PDF');
    }
  };

  const handleDiagnosisChange = useCallback(
    async (diagnosis: EncounterDiagnosis[]): Promise<void> => {
      const updatedEncounter = { ...encounter, diagnosis };
      setEncounter(updatedEncounter);
      await debouncedUpdateResource(updatedEncounter);
    },
    [encounter, setEncounter, debouncedUpdateResource]
  );

  const handleEncounterChange = useDebouncedCallback(async (updatedEncounter: Encounter): Promise<void> => {
    try {
      const savedEncounter = await medplum.updateResource(updatedEncounter);
      setEncounter(savedEncounter);

      if (savedEncounter?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(savedEncounter.participant[0].individual);
        setPractitioner(practitionerResult as Practitioner);
      }

      if (!patient?.id || !encounter?.id || !practitioner?.id || !chargeItems?.length) {
        return;
      }

      if (!claim) {
        const newClaim = await createClaimFromEncounter(
          medplum,
          patient.id,
          encounter.id,
          practitioner.id,
          chargeItems
        );
        if (newClaim) {
          setClaim(newClaim);
        }
      } else {
        const providerRefNeedsUpdate = claim.provider?.reference !== getReferenceString(practitioner);
        if (providerRefNeedsUpdate) {
          const updatedClaim: Claim = await medplum.updateResource({
            ...claim,
            provider: { reference: getReferenceString(practitioner) },
          });
          setClaim(updatedClaim);
        }
      }
    } catch (err) {
      showErrorNotification(err);
    }
  }, SAVE_TIMEOUT_MS);

  const updateChargeItems = useCallback(
    async (updatedChargeItems: ChargeItem[]): Promise<void> => {
      setChargeItems(updatedChargeItems);
      if (claim?.id && updatedChargeItems.length > 0 && encounter) {
        const updatedClaim: Claim = {
          ...claim,
          item: getCptChargeItems(updatedChargeItems, { reference: getReferenceString(encounter) }),
          total: { value: calculateTotalPrice(updatedChargeItems) },
        };
        setClaim(updatedClaim);
        await debouncedUpdateResource(updatedClaim);
      }
    },
    [setChargeItems, claim, encounter, setClaim, debouncedUpdateResource]
  );

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

            <Button variant="outline" leftSection={<IconSend size={16} />}>
              Request to connect a billing service
            </Button>
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
