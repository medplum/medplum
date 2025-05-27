import { Box, Button, Card, Flex, Group, Menu, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString } from '@medplum/core';
import {
  ChargeItem,
  Claim,
  ClaimDiagnosis,
  ClinicalImpression,
  CodeableConcept,
  Coding,
  Coverage,
  Encounter,
  Organization,
  Practitioner,
  Task,
} from '@medplum/fhirtypes';
import { CodeableConceptInput, Loading, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff, IconDownload, IconFileText, IconSend } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { useEncounterChart } from '../../hooks/useEncounterChart';
import { usePatient } from '../../hooks/usePatient';
import { calculateTotalPrice, fetchAndApplyChargeItemDefinitions, getCptChargeItems } from '../../utils/chargeitems';
import { createClaimFromEncounter } from '../../utils/claims';
import { createSelfPayCoverage } from '../../utils/coverage';
import { showErrorNotification } from '../../utils/notifications';
import { EncounterHeader } from '../components/Encounter/EncounterHeader';
import { VisitDetailsPanel } from '../components/Encounter/VisitDetailsPanel';
import { TaskPanel } from '../components/Task/TaskPanel';
import classes from './EncounterChart.module.css';
import ChargeItemPanel from '../components/ChargeItem/ChageItemPanel';

export const EncounterChart = (): JSX.Element => {
  const { patientId, encounterId } = useParams();
  const medplum = useMedplum();
  const patient = usePatient();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [activeTab, setActiveTab] = useState<string>('notes');
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [organization, setOrganization] = useState<Organization | undefined>();
  const [diagnosis, setDiagnosis] = useState<CodeableConcept | undefined>();
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

  useEffect(() => {
    if (claim?.diagnosis) {
      const mergedCoding = claim.diagnosis.reduce<Coding[]>((acc, diag) => {
        if (diag.diagnosisCodeableConcept?.coding) {
          return [...acc, ...diag.diagnosisCodeableConcept.coding];
        }
        return acc;
      }, []);

      setDiagnosis(mergedCoding.length > 0 ? { coding: mergedCoding } : undefined);
    } else {
      setDiagnosis({ coding: [] });
    }
  }, [claim]);

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

  const saveChargeItem = useCallback(
    async (chargeItem: ChargeItem): Promise<ChargeItem> => {
      try {
        return await medplum.updateResource(chargeItem);
      } catch (err) {
        showErrorNotification(err);
        return chargeItem;
      }
    },
    [medplum]
  );

  const updateChargeItemList = useCallback(
    (updatedChargeItem: ChargeItem): void => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        const savedChargeItem = await saveChargeItem(updatedChargeItem);
        const updatedChargeItems = await fetchAndApplyChargeItemDefinitions(
          medplum,
          chargeItems.map((item) => (item.id === savedChargeItem.id ? savedChargeItem : item))
        );
        setChargeItems(updatedChargeItems);

        if (claim?.id && updatedChargeItems.length > 0 && encounter) {
          const updatedClaim: Claim = {
            ...claim,
            item: getCptChargeItems(updatedChargeItems, { reference: getReferenceString(encounter) }),
            total: { value: calculateTotalPrice(updatedChargeItems) },
          };
          const savedClaim = await medplum.updateResource(updatedClaim);
          setClaim(savedClaim);
        }
      }, SAVE_TIMEOUT_MS);
    },
    [chargeItems, saveChargeItem, setChargeItems, medplum, claim, setClaim, encounter]
  );

  const deleteChargeItem = useCallback(
    async (chargeItem: ChargeItem): Promise<void> => {
      const updatedChargeItems = chargeItems.filter((item) => item.id !== chargeItem.id);
      setChargeItems(updatedChargeItems);

      if (chargeItem.id) {
        await medplum.deleteResource('ChargeItem', chargeItem.id);
      }

      if (claim?.id && updatedChargeItems.length > 0 && encounter) {
        const updatedClaim: Claim = {
          ...claim,
          item: getCptChargeItems(updatedChargeItems, { reference: getReferenceString(encounter) }),
          total: { value: calculateTotalPrice(updatedChargeItems) },
        };
        const savedClaim = await medplum.updateResource(updatedClaim);
        setClaim(savedClaim);
      }
    },
    [chargeItems, setChargeItems, claim, setClaim, encounter, medplum]
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

  const handleDiagnosisChange = (value: CodeableConcept | undefined): void => {
    setDiagnosis(value ? value : { coding: [] });

    if (!claim) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const diagnosisArray = createDiagnosisArray(value);
        const savedClaim = await medplum.updateResource({ ...claim, diagnosis: diagnosisArray });
        setClaim(savedClaim as Claim);
      } catch (err) {
        showErrorNotification(err);
      }
    }, SAVE_TIMEOUT_MS);
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

    const diagnosisArray = createDiagnosisArray(diagnosis);
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

  const createDiagnosisArray = (value?: CodeableConcept): ClaimDiagnosis[] | undefined => {
    return value?.coding
      ? value.coding.map((coding, index) => ({
          diagnosisCodeableConcept: {
            coding: [coding],
          },
          sequence: index + 1,
          type: [{ coding: [{ code: index === 0 ? 'principal' : 'secondary' }] }],
        }))
      : undefined;
  };

  if (!patient || !encounter || !clinicalImpression) {
    return <Loading />;
  }

  const renderTabContent = (): JSX.Element => {
    if (activeTab === 'notes') {
      return (
        <Stack gap="md">
          <Card withBorder shadow="sm" mt="md">
            <Text fw={600} size="lg" mb="md">
              Fill chart note
            </Text>
            <Textarea
              defaultValue={clinicalImpression.note?.[0]?.text}
              value={chartNote}
              onChange={handleChartNoteChange}
              autosize
              minRows={4}
              maxRows={8}
            />
          </Card>

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

          {diagnosis && (
            <Stack gap={0}>
              <Text fw={600} size="lg" mb="md">
                Diagnosis
              </Text>

              <Card withBorder shadow="sm">
                <CodeableConceptInput
                  binding="http://hl7.org/fhir/ValueSet/icd-10"
                  placeholder="Search to add a diagnosis"
                  name="diagnosis"
                  path="diagnosis"
                  clearable
                  defaultValue={diagnosis}
                  onChange={handleDiagnosisChange}
                />
              </Card>
            </Stack>
          )}

          <Stack gap={0}>
            <Text fw={600} size="lg" mb="md">
              Charge Items
            </Text>
            {chargeItems.length > 0 ? (
              <Stack gap="md">
                {chargeItems.map((chargeItem: ChargeItem) => (
                  <ChargeItemPanel
                    key={chargeItem.id}
                    chargeItem={chargeItem}
                    onChange={updateChargeItemList}
                    onDelete={deleteChargeItem}
                  />
                ))}

                <Card withBorder shadow="sm">
                  <Flex justify="space-between" align="center">
                    <Text size="lg" fw={500}>
                      Total Calculated Price to Bill
                    </Text>
                    <Box>
                      <TextInput w={300} value={`$${calculateTotalPrice(chargeItems)}`} readOnly />
                    </Box>
                  </Flex>
                </Card>
              </Stack>
            ) : (
              <Card withBorder shadow="sm">
                <Text c="dimmed">No charge items available</Text>
              </Card>
            )}
          </Stack>
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
    </>
  );
};
