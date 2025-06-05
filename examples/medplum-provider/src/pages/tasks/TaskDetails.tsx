import { Box, Button, Card, Grid, Modal, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference, formatHumanName, getReferenceString, normalizeErrorString } from '@medplum/core';
import { HumanName, Practitioner, Reference, Task } from '@medplum/fhirtypes';
import { CodeInput, DateTimeInput, Loading, ResourceInput, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { usePatient } from '../../hooks/usePatient';
import classes from './TaskDetails.module.css';

export const TaskDetails = (): JSX.Element => {
  const { patientId, encounterId, taskId } = useParams();
  const patient = usePatient();
  const medplum = useMedplum();
  const navigate = useNavigate();
  const author = useMedplumProfile();
  const [task, setTask] = useState<Task | undefined>(undefined);
  const [isOpened, setIsOpened] = useState(true);
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [status, setStatus] = useState<Task['status'] | undefined>();
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    const fetchTask = async (): Promise<void> => {
      const task = await medplum.readResource('Task', taskId as string);
      setStatus(task.status as typeof status);
      setTask(task);
      setDueDate(task.restriction?.period?.end);
    };

    fetchTask().catch((err) => {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    });
  }, [medplum, taskId]);

  const handleOnSubmit = async (): Promise<void> => {
    if (!task) {
      return;
    }

    const updatedTask: Task = {
      ...task,
    };

    const trimmedNote = note.trim();
    if (trimmedNote !== '') {
      updatedTask.note = [
        ...(task.note || []),
        {
          text: trimmedNote,
          authorReference: author && createReference(author),
          time: new Date().toISOString(),
        },
      ];
    }

    if (status) {
      updatedTask.status = status;
    }

    if (dueDate) {
      updatedTask.restriction = {
        ...updatedTask.restriction,
        period: {
          ...updatedTask.restriction?.period,
          end: dueDate,
        },
      };
    }

    if (practitioner) {
      updatedTask.owner = { reference: getReferenceString(practitioner) } as Reference<Practitioner>;
    }

    try {
      await medplum.updateResource(updatedTask);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task updated',
      });
      setTask(updatedTask);
      navigate(`/Patient/${patientId}/Encounter/${encounterId}`)?.catch(console.error);
    } catch {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'Failed to update the task.',
      });
    }
  };

  if (!task) {
    return <Loading />;
  }

  return (
    <Modal
      opened={isOpened}
      onClose={() => {
        navigate(-1)?.catch(console.error);
        setIsOpened(false);
      }}
      size="xl"
      styles={{
        body: {
          padding: 0,
          height: '60vh',
        },
      }}
    >
      <Stack h="100%" justify="space-between" gap={0}>
        <Box flex={1} miw={0}>
          <Grid p="md" h="100%">
            <Grid.Col span={6} pr="lg">
              <Stack gap="sm">
                <Card p="md" radius="md" className={classes.taskDetails}>
                  <Stack gap="sm">
                    <Text fz="lg" fw={700}>
                      {task?.code?.text}
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

                <ResourceInput
                  name="practitioner"
                  resourceType="Practitioner"
                  label="Assigned to"
                  defaultValue={task?.owner ? { reference: task.owner.reference } : undefined}
                  onChange={(value) => {
                    setPractitioner(value as Practitioner);
                  }}
                />

                <DateTimeInput
                  name="Due Date"
                  placeholder="End"
                  label="Due Date"
                  defaultValue={dueDate}
                  onChange={setDueDate}
                />

                {task?.status && (
                  <CodeInput
                    name="status"
                    label="Status"
                    binding="http://hl7.org/fhir/ValueSet/task-status|4.0.1"
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
            </Grid.Col>

            <Grid.Col span={6} pr="md">
              <Stack gap="sm">
                <Text>Note</Text>
                <Text c="dimmed">Optional free form details about this task</Text>
                <Textarea
                  placeholder="Add note to this task"
                  minRows={3}
                  value={note}
                  onChange={(event) => setNote(event.currentTarget.value)}
                />
              </Stack>
            </Grid.Col>
          </Grid>
        </Box>

        <Box className={classes.footer} h={70} p="md">
          <Button variant="filled" onClick={handleOnSubmit}>
            Save Changes
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
};
