import { Box, Button, Card, Flex, Group, Menu, Modal, Stack, Text, Textarea, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, HTTP_HL7_ORG } from '@medplum/core';
import {
  ChargeItem,
  Claim,
  ClaimDiagnosis,
  ClinicalImpression,
  Condition,
  Coverage,
  Encounter,
  Organization,
  Practitioner,
  Task,
} from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff, IconDownload, IconFileText, IconSend } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { useEncounterChart } from '../../hooks/useEncounterChart';
import { usePatient } from '../../hooks/usePatient';
import { ChargeItemList } from '../../components/ChargeItem/ChargeItemList';
import { createClaimFromEncounter, getCptChargeItems } from '../../utils/claims';
import { createSelfPayCoverage } from '../../utils/coverage';
import { showErrorNotification } from '../../utils/notifications';
import { EncounterHeader } from '../../components/Encounter/EncounterHeader';
import { VisitDetailsPanel } from '../../components/Encounter/VisitDetailsPanel';
import { TaskPanel } from '../../components/encountertasks/TaskPanel';
import classes from './EncounterChart.module.css';
import ConditionModal from '../../components/Conditions/ConditionModal';
import ConditionItem from '../../components/Conditions/ConditionItem';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { calculateTotalPrice } from '../../utils/chargeitems';

export const EncounterChart = (): JSX.Element => {
  const { patientId, encounterId } = useParams();
  const medplum = useMedplum();
  const patient = usePatient();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [activeTab, setActiveTab] = useState<string>('notes');
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [organization, setOrganization] = useState<Organization | undefined>();
  const [conditions, setConditions] = useState<Condition[] | undefined>();
  const {
    encounter,
    claim,
    practitioner,
    tasks,
    clinicalImpression,
    chargeItems,
    setEncounter,
    setClaim,
    setPractitioner,
    setTasks,
    setChargeItems,
  } = useEncounterChart(patientId, encounterId);
  const [chartNote, setChartNote] = useState<string | undefined>(clinicalImpression?.note?.[0]?.text);
  const [opened, setOpened] = useState(false);
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum, SAVE_TIMEOUT_MS);

  useEffect(() => {
    const fetchConditions = async (): Promise<void> => {
      if (!encounter) {
        return;
      }

      const diagnosisReferences = encounter.diagnosis?.map((d) => d.condition?.reference).filter(Boolean) || [];
      const conditionsResult = await Promise.all(
        diagnosisReferences.map((ref) => medplum.readReference({ reference: ref }))
      );

      if (conditionsResult.length > 0 && encounter?.diagnosis) {
        const diagnosisMap = new Map<string, number>();

        const diagnosisReferences = encounter.diagnosis?.map((d) => d.condition?.reference) || [];
        const conditionsInDiagnosis = conditionsResult.filter((condition) =>
          diagnosisReferences.includes(getReferenceString(condition))
        );

        encounter.diagnosis.forEach((diagnosis, index) => {
          if (diagnosis.condition?.reference) {
            diagnosisMap.set(diagnosis.condition.reference, diagnosis.rank || index);
          }
        });

        conditionsInDiagnosis.sort((a, b) => {
          const aRef = getReferenceString(a);
          const bRef = getReferenceString(b);

          if (diagnosisMap.has(aRef) && diagnosisMap.has(bRef)) {
            const aValue = diagnosisMap.get(aRef) ?? 0;
            const bValue = diagnosisMap.get(bRef) ?? 0;
            return aValue - bValue;
          }

          if (diagnosisMap.has(aRef)) {
            return -1;
          }

          if (diagnosisMap.has(bRef)) {
            return 1;
          }

          return 0;
        });

        setConditions(conditionsInDiagnosis as Condition[]);
      }
    };

    fetchConditions().catch((err) => showErrorNotification(err));
  }, [encounter, medplum]);

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

  useEffect(() => {
    const fetchOrganization = async (): Promise<void> => {
      if (coverage?.payor?.[0]?.reference && !coverage.payor[0].reference.includes('Patient/')) {
        const organizationResult = await medplum.readReference({ reference: coverage.payor[0].reference });
        setOrganization(organizationResult as Organization);
      }
    };

    fetchOrganization().catch((err) => showErrorNotification(err));
  }, [coverage, medplum]);

  const updateTaskList = useCallback(
    (updatedTask: Task): void => {
      setTasks(tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
    },
    [tasks, setTasks]
  );

  const handleEncounterStatusChange = useCallback(
    async (newStatus: Encounter['status']): Promise<void> => {
      if (!encounter) {
        return;
      }
      try {
        const updatedEncounter: Encounter = {
          ...encounter,
          status: newStatus,
          ...(newStatus === 'in-progress' &&
            !encounter.period?.start && {
              period: {
                ...encounter.period,
                start: new Date().toISOString(),
              },
            }),
          ...(newStatus === 'finished' &&
            !encounter.period?.end && {
              period: {
                ...encounter.period,
                end: new Date().toISOString(),
              },
            }),
        };
        await medplum.updateResource(updatedEncounter);
        setEncounter(updatedEncounter);
      } catch (err) {
        showErrorNotification(err);
      }
    },
    [encounter, medplum, setEncounter]
  );

  const handleTabChange = (tab: string): void => {
    setActiveTab(tab);
  };

  const handleChartNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setChartNote(e.target.value);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!clinicalImpression) {
        return;
      }

      try {
        if (!e.target.value || e.target.value === '') {
          const { note: _, ...restOfClinicalImpression } = clinicalImpression;
          const updatedClinicalImpression: ClinicalImpression = restOfClinicalImpression;
          await medplum.updateResource(updatedClinicalImpression);
        } else {
          const updatedClinicalImpression: ClinicalImpression = {
            ...clinicalImpression,
            note: [{ text: e.target.value }],
          };
          await medplum.updateResource(updatedClinicalImpression);
        }
      } catch (err) {
        showErrorNotification(err);
      }
    }, SAVE_TIMEOUT_MS);
  };

  const handleEncounterChange = (updatedEncounter: Encounter): void => {
    if (!updatedEncounter) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const savedEncounter = await medplum.updateResource(updatedEncounter);
        setEncounter(savedEncounter);

        if (savedEncounter?.participant?.[0]?.individual) {
          const practitionerResult = await medplum.readReference(savedEncounter.participant[0].individual);
          setPractitioner(practitionerResult as Practitioner);
        }

        if (!patient?.id || !encounter?.id || !practitioner?.id || chargeItems.length === 0) {
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
          setClaim(newClaim);
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
  };

  const handleConditionSubmit = async (condition: Condition): Promise<void> => {
    try {
      const newCondition = await medplum.createResource(condition);
      if (encounter) {
        const updatedEncounter: Encounter = {
          ...encounter,
          diagnosis: [
            ...(encounter.diagnosis || []),
            {
              condition: {
                reference: `Condition/${newCondition.id}`,
              },
              rank: encounter.diagnosis?.length ? encounter.diagnosis.length + 1 : 1,
            },
          ],
        };

        const savedEncounter = await medplum.updateResource(updatedEncounter);
        setEncounter(savedEncounter);
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setOpened(false);
    }
  };

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

  const createDiagnosisArray = (conditions: Condition[]): ClaimDiagnosis[] => {
    return conditions.map((condition, index) => {
      const icd10Coding = condition.code?.coding?.find((c) => c.system === `${HTTP_HL7_ORG}/fhir/sid/icd-10`);
      return {
        diagnosisCodeableConcept: {
          coding: icd10Coding ? [icd10Coding] : [],
        },
        sequence: index + 1,
        type: [{ coding: [{ code: index === 0 ? 'principal' : 'secondary' }] }],
      };
    });
  };

  /*
   * Re-orders the conditions in the conditions array and updates the encounter diagnosis.
   */
  const updateDiagnosis = async (condition: Condition, value: string): Promise<void> => {
    if (!conditions || conditions.length === 0 || !encounter) {
      return;
    }

    const newRank = Number(value);
    const maxAllowedRank = conditions.length;
    const validRank = Math.max(1, Math.min(newRank, maxAllowedRank));

    const updatedConditions = [...conditions];
    const conditionIndex = updatedConditions.findIndex((c) => getReferenceString(c) === getReferenceString(condition));

    if (conditionIndex === -1) {
      return;
    }

    const conditionToMove = updatedConditions.splice(conditionIndex, 1)[0];
    updatedConditions.splice(validRank - 1, 0, conditionToMove);
    setConditions(updatedConditions);

    const updatedEncounter: Encounter = {
      ...encounter,
      diagnosis: updatedConditions.map((c, index) => ({
        condition: { reference: `Condition/${c.id}` },
        rank: index + 1,
      })),
    };

    setEncounter(updatedEncounter);
    await debouncedUpdateResource(updatedEncounter);
  };

  const removeDiagnosis = async (condition: Condition): Promise<void> => {
    if (!encounter) {
      return;
    }

    setConditions(conditions?.filter((c) => c.id !== condition.id));
    const updatedDiagnosis = encounter.diagnosis?.filter(
      (d) => d.condition?.reference !== getReferenceString(condition)
    );
    const reindexedDiagnosis = updatedDiagnosis?.map((d, index) => ({
      ...d,
      rank: index + 1,
    }));

    const updatedEncounter: Encounter = {
      ...encounter,
      diagnosis: reindexedDiagnosis,
    };

    setEncounter(updatedEncounter);
    await medplum.deleteResource('Condition', condition.id as string);
    await debouncedUpdateResource(updatedEncounter);
  };

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

  if (!patient || !encounter) {
    return <Loading />;
  }

  const renderTabContent = (): JSX.Element => {
    if (activeTab === 'notes') {
      return (
        <Stack gap="md">
          {clinicalImpression && (
            <Card withBorder shadow="sm" mt="md">
              <Title>Fill chart note</Title>
              <Textarea
                defaultValue={clinicalImpression.note?.[0]?.text}
                value={chartNote}
                onChange={handleChartNoteChange}
                autosize
                minRows={4}
                maxRows={8}
              />
            </Card>
          )}

          {tasks.map((task: Task) => (
            <TaskPanel key={task.id} task={task} onUpdateTask={updateTaskList} />
          ))}
        </Stack>
      );
    } else {
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
            <Stack gap={0}>
              <Text fw={600} size="lg" mb="md">
                Insurance Overview
              </Text>
              <Card withBorder shadow="sm" p="md">
                <Stack gap="md">
                  {organization ? (
                    <>
                      {coverage?.status === 'active' && (
                        <Group gap={4}>
                          <IconCircleCheck size={16} className={classes.checkmark} />
                          <Text className={classes.active} fw={500} size="md">
                            Active
                          </Text>
                        </Group>
                      )}

                      <Text fw={600} size="lg">
                        {organization.name}
                      </Text>
                      <Stack gap={0}>
                        {coverage && (
                          <>
                            {coverage.class?.map((coverageClass, index) => (
                              <Text key={index} size="md">
                                {coverageClass.name || 'Not specified'}
                              </Text>
                            )) || <Text size="md">Not specified</Text>}
                          </>
                        )}
                      </Stack>

                      {coverage?.period && (
                        <Group grow>
                          <Box>
                            <Text size="sm" c="dimmed">
                              Effective Date
                            </Text>
                            <Text>
                              {coverage.period.start
                                ? new Date(coverage.period.start).toLocaleDateString()
                                : 'Not specified'}
                            </Text>
                          </Box>
                          <Box>
                            <Text size="sm" c="dimmed">
                              End Date
                            </Text>
                            <Text>
                              {coverage.period.end
                                ? new Date(coverage.period.end).toLocaleDateString()
                                : 'Not specified'}
                            </Text>
                          </Box>
                        </Group>
                      )}
                    </>
                  ) : (
                    <>
                      {coverage?.payor?.[0]?.reference?.includes('Patient/') ? (
                        <Text c="dimmed">
                          <IconCircleOff size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                          Self Pay
                        </Text>
                      ) : (
                        <Text c="dimmed">
                          <IconCircleOff size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                          No insurance information available
                        </Text>
                      )}
                    </>
                  )}
                </Stack>

                {coverage && (
                  <Button
                    variant="outline"
                    fullWidth
                    mt="md"
                    component="a"
                    href={`/Coverage/${coverage.id}`}
                    target="_blank"
                  >
                    View Coverage Information
                  </Button>
                )}
              </Card>
            </Stack>

            <VisitDetailsPanel
              practitioner={practitioner}
              encounter={encounter}
              onEncounterChange={handleEncounterChange}
            />
          </Group>

          {encounter && (
            <Stack gap={0}>
              <Text fw={600} size="lg" mb="md">
                Diagnosis
              </Text>

              <Card withBorder shadow="sm">
                <Stack gap="md">
                  {conditions &&
                    conditions.length > 0 &&
                    conditions.map((condition, idx) => (
                      <ConditionItem
                        key={condition.id ?? idx}
                        condition={condition}
                        rank={idx + 1}
                        total={conditions.length}
                        onChange={updateDiagnosis}
                        onRemove={removeDiagnosis}
                      />
                    ))}

                  <Flex>
                    <Button onClick={() => setOpened(true)}>Add Diagnosis</Button>
                  </Flex>
                </Stack>
              </Card>
            </Stack>
          )}

          <ChargeItemList chargeItems={chargeItems} updateChargeItems={updateChargeItems} />
        </Stack>
      );
    }
  };

  return (
    <>
      <Stack justify="space-between" gap={0}>
        <EncounterHeader
          encounter={encounter}
          practitioner={practitioner}
          onStatusChange={handleEncounterStatusChange}
          onTabChange={handleTabChange}
        />

        <Box p="md">
          {renderTabContent()}
          <Outlet />
        </Box>
      </Stack>
      <Modal opened={opened} onClose={() => setOpened(false)} title={'Add Diagnosis'}>
        <ConditionModal patient={patient} encounter={encounter} onSubmit={handleConditionSubmit} />
      </Modal>
    </>
  );
};
