import { HumanName, Practitioner, Reference, Task } from '@medplum/fhirtypes';
import { CodeInput, DateTimeInput, ResourceInput, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Modal, Stack, Text, Textarea } from '@mantine/core';
import { usePatient } from '../../hooks/usePatient';
import { formatHumanName, getReferenceString, normalizeErrorString } from '@medplum/core';
import { notifications } from '@mantine/notifications';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

export const TaskDetails = (): JSX.Element => {
  const { taskId } = useParams();
  const patient = usePatient();
  const medplum = useMedplum();
  const navigate = useNavigate();
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
        },
      ];
    }

    if (status) {
      updatedTask.status = status;
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
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Stack gap="sm">
            <Text>Note</Text>
            <Textarea
              placeholder="Add note"
              minRows={3}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
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
