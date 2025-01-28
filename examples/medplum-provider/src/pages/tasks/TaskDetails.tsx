import { HumanName, Practitioner, Questionnaire, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { CodeInput, QuestionnaireForm, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Modal, Stack, Text, Textarea } from '@mantine/core';
import { usePatient } from '../../hooks/usePatient';
import { formatHumanName, getQuestionnaireAnswers } from '@medplum/core';
import { notifications } from '@mantine/notifications';
import { IconCircleOff } from '@tabler/icons-react';

export const TaskDetails = (): JSX.Element => {
  const { taskId } = useParams();
  const patient = usePatient();
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | undefined>(undefined);
  const [isOpened, setIsOpened] = useState(true);
  const [status, setStatus] = useState<
    | 'draft'
    | 'requested'
    | 'received'
    | 'accepted'
    | 'rejected'
    | 'ready'
    | 'cancelled'
    | 'in-progress'
    | 'on-hold'
    | 'failed'
    | 'completed'
    | 'entered-in-error'
  >('draft');
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>(undefined);

  const assignTaskQuestionnaire: Questionnaire = {
    resourceType: 'Questionnaire',
    status: 'active',
    id: 'assign-task',
    item: [
      {
        linkId: 'owner',
        text: 'Assigned to',
        type: 'reference',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
            valueCodeableConcept: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/fhir-types',
                  display: 'Practitioner',
                  code: 'Practitioner',
                },
              ],
            },
          },
        ],
      },
      {
        linkId: 'dueDate',
        text: 'Due Date',
        type: 'date',
      },
    ],
  };

  useEffect(() => {
    const fetchTask = async (): Promise<void> => {
      const task = await medplum.readResource('Task', taskId as string);
      setStatus(task.status as typeof status);
      setTask(task);
    };

    fetchTask().catch(console.error);
  }, [medplum, taskId]);

  const handleOnSubmit = async (): Promise<void> => {
    if (!task) {
      return;
    }

    const updatedTask: Task = {
      ...task,
    };

    if (task.status !== status) {
      updatedTask.status = status;
    }

    if (questionnaireResponse) {
      const owner = getQuestionnaireAnswers(questionnaireResponse)['owner']?.valueReference as Reference<Practitioner>;
      if (owner) {
        updatedTask.owner = owner;
      }
    }

    try {
      await medplum.updateResource(updatedTask);
      navigate(-1);
    } catch {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'Failed to update the task.',
      });
    }
  };

  return (
    <Modal
      opened={isOpened}
      onClose={() => {
        navigate(-1);
        setIsOpened(false);
      }}
      size="xl"
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Stack gap="sm">
            <Card p="md" radius="md" style={{ backgroundColor: '#F8F9FA' }}>
              <Stack gap="sm">
                <Text fz="lg" fw={700}>
                  Check insurance
                </Text>
                {task?.description && <Text>{task.description}</Text>}
                {patient?.name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Text>View Patient</Text>
                    <Button variant="subtle" component={Link} to={`/Patient/${patient.id}`}>
                      {formatHumanName(patient.name?.[0] as HumanName)}
                    </Button>
                  </div>
                )}
              </Stack>
            </Card>

            <QuestionnaireForm
              questionnaire={assignTaskQuestionnaire}
              excludeButtons
              onChange={setQuestionnaireResponse}
            />

            {task?.status && (
              <CodeInput
                name="status"
                label="Status"
                binding="http://hl7.org/fhir/ValueSet/encounter-status|4.0.1"
                maxValues={1}
                defaultValue={status}
                onChange={(value) => {
                  if (value) {
                    setStatus(value as typeof status);
                  }
                }}
              />
            )}
          </Stack>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Stack gap="sm">
            <Text>Note</Text>
            <Textarea placeholder="Add note" minRows={3} />
          </Stack>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '1rem',
        }}
      >
        <Button variant="filled" onClick={handleOnSubmit}>
          Save Changes
        </Button>
      </div>
    </Modal>
  );
};
