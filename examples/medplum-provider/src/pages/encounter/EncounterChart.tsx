import { Stack, Box, Card, Text, Group, Flex, TextInput, Button } from '@mantine/core';
import {
  Task,
  ClinicalImpression,
  QuestionnaireResponse,
  Questionnaire,
  Encounter,
  ChargeItem,
  Claim,
  Coverage,
  Organization,
} from '@medplum/fhirtypes';
import { Loading, QuestionnaireForm, useMedplum } from '@medplum/react';
import { Outlet, useParams } from 'react-router';
import { showNotification } from '@mantine/notifications';
import { createReference, deepEquals, getReferenceString } from '@medplum/core';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { TaskPanel } from '../components/Task/TaskPanel';
import { EncounterHeader } from '../components/Encounter/EncounterHeader';
import { usePatient } from '../../hooks/usePatient';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import ChageItemPanel from '../components/ChargeItem/ChageItemPanel';
import { VisitDetailsPanel } from '../components/Encounter/VisitDetailsPanel';
import { useEncounterChart } from '../../hooks/useEncounterChart';
import { useState, useCallback, useRef, useEffect } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import classes from './EncounterChart.module.css';

export const EncounterChart = (): JSX.Element => {
  const { encounterId } = useParams();
  const medplum = useMedplum();
  const patient = usePatient();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [activeTab, setActiveTab] = useState<string>('notes');
  const [isLoadingEncounter, setIsLoadingEncounter] = useState<boolean>(false);
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [organization, setOrganization] = useState<Organization | undefined>();
  const {
    encounter,
    claim,
    practitioner,
    tasks,
    clinicalImpression,
    questionnaireResponse,
    chargeItems,
    setEncounter,
    setClaim,
    setTasks,
    setClinicalImpression,
    setQuestionnaireResponse,
    setChargeItems,
  } = useEncounterChart(encounterId);

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
      if (coverage?.payor?.[0]?.reference) {
        const organizationResult = await medplum.readReference({ reference: coverage.payor[0].reference });
        setOrganization(organizationResult as Organization);
      }
    };

    fetchOrganization().catch((err) => showErrorNotification(err));
  }, [coverage, medplum]);

  const saveQuestionnaireResponse = async (response: QuestionnaireResponse): Promise<void> => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (!response.id) {
          const savedResponse = await medplum.createResource(response);
          setQuestionnaireResponse(savedResponse);

          if (clinicalImpression) {
            const updatedClinicalImpression: ClinicalImpression = {
              ...clinicalImpression,
              supportingInfo: [{ reference: `QuestionnaireResponse/${savedResponse.id}` }],
            };
            await medplum.updateResource(updatedClinicalImpression);
            setClinicalImpression(updatedClinicalImpression);
          }
        } else {
          const updatedResponse = await medplum.updateResource(response);
          setQuestionnaireResponse(updatedResponse);
        }
      } catch (err) {
        showErrorNotification(err);
      }
    }, SAVE_TIMEOUT_MS);
  };

  const onChange = (response: QuestionnaireResponse): void => {
    if (!questionnaireResponse) {
      const updatedResponse: QuestionnaireResponse = { ...response, status: 'in-progress' };
      saveQuestionnaireResponse(updatedResponse).catch((err) => {
        showErrorNotification(err);
      });
    } else {
      const equals = deepEquals(response.item, questionnaireResponse?.item);
      if (!equals) {
        const updatedResponse: QuestionnaireResponse = {
          ...questionnaireResponse,
          item: response.item,
          status: 'in-progress',
        };
        saveQuestionnaireResponse(updatedResponse).catch((err) => {
          showErrorNotification(err);
        });
      }
    }
  };

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
        setChargeItems(chargeItems.map((item) => (item.id === savedChargeItem.id ? savedChargeItem : item)));
      }, SAVE_TIMEOUT_MS);
    },
    [chargeItems, saveChargeItem, setChargeItems]
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

  const handleEncounterChange = (updatedEncounter: Encounter): void => {
    if (!updatedEncounter) {
      return;
    }

    setIsLoadingEncounter(true);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const savedEncounter = await medplum.updateResource(updatedEncounter);
        setEncounter(savedEncounter);
      } catch (err) {
        showErrorNotification(err);
      } finally {
        setIsLoadingEncounter(false);
      }
    }, SAVE_TIMEOUT_MS);
  };

  const createClaimFromEncounter = useCallback(async (): Promise<void> => {
    if (!encounter || !patient) {
      return;
    }

    if (!practitioner) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'Practitioner information is required to create a claim.',
      });
      return;
    }

    const claim: Claim = {
      resourceType: 'Claim',
      status: 'draft',
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      created: new Date().toISOString(),
      patient: createReference(patient),
      provider: { reference: getReferenceString(practitioner), type: 'Practitioner' },
      priority: { coding: [{ code: 'normal' }] },
      insurance: [
        {
          sequence: 1,
          focal: true,
          coverage: { reference: 'Coverage/unknown' },
        },
      ], // TODO: Add coverage
      item: chargeItems.map((chargeItem, index) => ({
        sequence: index + 1,
        encounter: [{ reference: getReferenceString(encounter) }],
        productOrService: chargeItem.code,
        net: chargeItem.priceOverride,
      })),
      total: { value: calculateTotalPrice(chargeItems) },
    };

    try {
      const createdClaim = await medplum.createResource(claim);
      setClaim(createdClaim);
    } catch (err) {
      showErrorNotification(err);
    }
  }, [encounter, medplum, chargeItems, patient, practitioner, setClaim]);

  const calculateTotalPrice = (chargeItems: ChargeItem[]): number => {
    return chargeItems.reduce((sum, item) => sum + (item.priceOverride?.value || 0), 0);
  };

  if (!patient || !encounter) {
    return <Loading />;
  }

  const renderTabContent = (): JSX.Element => {
    if (activeTab === 'notes') {
      return (
        <Stack gap="md">
          {clinicalImpression && (
            <Card withBorder shadow="sm">
              <QuestionnaireForm
                questionnaire={questionnaire}
                questionnaireResponse={questionnaireResponse}
                excludeButtons={true}
                onChange={onChange}
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

                      <Stack gap={0}>
                        <Text fw={600} size="lg">
                          {organization.name}
                        </Text>
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
                    <Text c="dimmed">
                      <IconCircleOff size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                      No insurance information available
                    </Text>
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
                    View Insurance Information
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

          <Stack gap={0}>
            <Text fw={600} size="lg" mb="md">
              Charge Items
            </Text>
            {chargeItems.length > 0 ? (
              <Stack gap="md">
                {chargeItems.map((chargeItem: ChargeItem) => (
                  <ChageItemPanel key={chargeItem.id} chargeItem={chargeItem} onChange={updateChargeItemList} />
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

                  {claim && (
                    <Box mt="md">
                      <Group grow align="flex-start">
                        <Text>
                          Claim submitted for ${claim.total?.value || 0} on{' '}
                          {new Date(claim.created || '').toLocaleDateString()}
                        </Text>
                        <Box>
                          <Button component="a" href={`/Claim/${claim.id}`} target="_blank" fullWidth variant="outline">
                            View Claim Details
                          </Button>
                        </Box>
                      </Group>
                    </Box>
                  )}

                  {!claim && encounter.status === 'finished' && (
                    <Box mt="md">
                      <Button
                        fullWidth
                        loading={isLoadingEncounter}
                        onClick={async () => {
                          await createClaimFromEncounter();
                        }}
                      >
                        Submit Claim
                      </Button>
                    </Box>
                  )}
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

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  identifier: [
    {
      value: 'SOAPNOTE',
    },
  ],
  name: 'Fill chart note',
  title: 'Fill chart note',
  status: 'active',
  item: [
    {
      id: 'id-1',
      linkId: 'q1',
      type: 'text',
      text: 'Subjective evaluation',
    },
    {
      id: 'id-2',
      linkId: 'q2',
      type: 'text',
      text: 'Objective evaluation',
    },
    {
      id: 'id-3',
      linkId: 'q3',
      type: 'text',
      text: 'Assessment',
    },
    {
      id: 'id-4',
      linkId: 'q4',
      type: 'text',
      text: 'Treatment plan',
    },
  ],
};
