import { Stack, Box, Card, Text } from '@mantine/core';
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

      setChargeItems(chargeItems.map((item) => (item.id === updatedChargeItem.id ? updatedChargeItem : item)));
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

  if (!patient || !encounter || (clinicalImpression?.supportingInfo?.[0]?.reference && !questionnaireResponse)) {
    return <Loading />;
  }

  return (
    <>
      <Stack justify="space-between" gap={0}>
        <EncounterHeader
          encounter={encounter}
          practitioner={practitioner}
          onStatusChange={handleEncounterStatusChange}
        />

        <Box p="md">
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

            {chargeItems.length > 0 && (
              <Stack gap="md" pt="lg">
                <Text size="lg" fw={500}>
                  Charge Items
                </Text>
                {chargeItems.map((chargeItem: ChargeItem) => (
                  <ChageItemPanel key={chargeItem.id} chargeItem={chargeItem} onChange={updateChargeItemList} />
                ))}
              </Stack>
            )}
          </Stack>

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
