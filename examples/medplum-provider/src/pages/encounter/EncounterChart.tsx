import { Stack, Box, Card, Text, Group } from '@mantine/core';
import {
  Task,
  ClinicalImpression,
  QuestionnaireResponse,
  Questionnaire,
  Practitioner,
  Encounter,
  ChargeItem,
} from '@medplum/fhirtypes';
import { Loading, QuestionnaireForm, useMedplum } from '@medplum/react';
import { Outlet, useLocation, useParams } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { deepEquals, getReferenceString, normalizeErrorString } from '@medplum/core';
import { IconCircleOff } from '@tabler/icons-react';
import { TaskPanel } from '../components/Task/TaskPanel';
import { EncounterHeader } from '../components/Encounter/EncounterHeader';
import { usePatient } from '../../hooks/usePatient';
import { useEncounter } from '../../hooks/useEncounter';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import ChageItemPanel from '../components/ChargeItem/ChageItemPanel';
import { VisitDetailsPanel } from '../components/Encounter/VisitDetailsPanel';

export const EncounterChart = (): JSX.Element => {
  const { encounterId } = useParams();
  const medplum = useMedplum();
  const patient = usePatient();
  const [encounter, setEncounter] = useState<Encounter | undefined>(useEncounter());
  const location = useLocation();
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clinicalImpression, setClinicalImpression] = useState<ClinicalImpression | undefined>();
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>();
  const [chargeItems, setChargeItems] = useState<ChargeItem[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [activeTab, setActiveTab] = useState<string>('notes');

  useEffect(() => {
    if (encounterId) {
      medplum.readResource('Encounter', encounterId).then(setEncounter).catch(console.error);
    }
  }, [encounterId, medplum]);

  const fetchTasks = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }
    const taskResult = await medplum.searchResources('Task', `encounter=${getReferenceString(encounter)}`, {
      cache: 'no-cache',
    });

    taskResult.sort((a: Task, b: Task) => {
      const dateA = new Date(a.authoredOn || '').getTime();
      const dateB = new Date(b.authoredOn || '').getTime();
      return dateA - dateB;
    });

    setTasks(taskResult);
  }, [medplum, encounter]);

  const fetchClinicalImpressions = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }
    const clinicalImpressionResult = await medplum.searchResources(
      'ClinicalImpression',
      `encounter=${getReferenceString(encounter)}`
    );

    const result = clinicalImpressionResult?.[0];
    setClinicalImpression(result);

    if (result?.supportingInfo?.[0]?.reference) {
      const response = await medplum.readReference({ reference: result.supportingInfo[0].reference });
      setQuestionnaireResponse(response as QuestionnaireResponse);
    }
  }, [medplum, encounter]);

  const fetchChargeItems = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }
    const chargeItems = await medplum.searchResources('ChargeItem', `context=${getReferenceString(encounter)}`);
    console.log('chargeItems', chargeItems);
    setChargeItems(chargeItems);
  }, [medplum, encounter]);

  useEffect(() => {
    fetchTasks().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
    fetchClinicalImpressions().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });

    fetchChargeItems().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [medplum, encounterId, fetchTasks, fetchClinicalImpressions, fetchChargeItems, location.pathname]);

  useEffect(() => {
    const fetchPractitioner = async (): Promise<void> => {
      if (encounter?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(encounter.participant[0].individual);
        setPractitioner(practitionerResult as Practitioner);
      }
    };

    fetchPractitioner().catch((err) => {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [encounter, medplum]);

  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (isUpdatingRef.current) {
      isUpdatingRef.current = false;
      return;
    }
    
    const fetchChargeItemDefinitions = async (): Promise<void> => {
      if (!chargeItems || chargeItems.length === 0) {
        return;
      }
      
      const updatedItems = [...chargeItems];
      let hasUpdates = false;
      
      for (const [index, chargeItem] of chargeItems.entries()) {
        if (chargeItem.definitionCanonical && chargeItem.definitionCanonical.length > 0) {
          try {
            const searchResult = await medplum.searchResources('ChargeItemDefinition', `url=${chargeItem.definitionCanonical[0]}`);
            if (searchResult.length > 0) {
              const chargeItemDefinition = searchResult[0];
              try {
                const applyResult = await medplum.post(
                  medplum.fhirUrl('ChargeItemDefinition', chargeItemDefinition.id as string, '$apply'),
                  {
                    resourceType: 'Parameters',
                    parameter: [
                      {
                        name: 'chargeItem',
                        valueReference: {
                          reference: `ChargeItem/${chargeItem.id}`,
                        },
                      },
                    ],
                  }
                );
                
                if (applyResult) {
                  const updatedChargeItem = applyResult as ChargeItem;
                  console.log('updatedChargeItem', updatedChargeItem);
                  updatedItems[index] = updatedChargeItem;
                  hasUpdates = true;
                }
              } catch (err) {
                console.error('Error applying ChargeItemDefinition:', err);
              }
            }
          } catch (err) {
            console.error('Error fetching ChargeItemDefinition:', err);
          }
        }
      }
      
      if (hasUpdates) {
        isUpdatingRef.current = true;
        setChargeItems(updatedItems);
      }
    };
    
    fetchChargeItemDefinitions()
      .catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });
  }, [chargeItems, medplum]);

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
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      }
    }, SAVE_TIMEOUT_MS);
  };

  const onChange = (response: QuestionnaireResponse): void => {
    if (!questionnaireResponse) {
      const updatedResponse: QuestionnaireResponse = { ...response, status: 'in-progress' };
      saveQuestionnaireResponse(updatedResponse).catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
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
          showNotification({
            color: 'red',
            icon: <IconCircleOff />,
            title: 'Error',
            message: normalizeErrorString(err),
          });
        });
      }
    }
  };

  const updateTaskList = useCallback(
    (updatedTask: Task): void => {
      setTasks(tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
    },
    [tasks]
  );

  const saveChargeItem = useCallback(
    async (chargeItem: ChargeItem): Promise<ChargeItem> => {
      try {
        return await medplum.updateResource(chargeItem);
      } catch (err) {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
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
    [chargeItems, saveChargeItem]
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
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      }
    },
    [encounter, medplum]
  );

  const handleTabChange = (tab: string): void => {
    setActiveTab(tab);
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
      } catch (err) {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      }
    }, SAVE_TIMEOUT_MS);
  };

  if (!patient || !encounter || (clinicalImpression?.supportingInfo?.[0]?.reference && !questionnaireResponse)) {
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
                <Stack gap="xs">
                  <Text>Primary Insurance: {patient?.contact?.[0]?.name?.text || 'Not available'}</Text>
                </Stack>
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
              </Stack>
            ) : (
              <Text c="dimmed">No charge items available</Text>
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
