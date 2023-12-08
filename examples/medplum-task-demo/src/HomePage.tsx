import { Button, Group, Loader, Modal, NativeSelect, Paper, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { Location, PractitionerRole, Task, TaskRestriction } from '@medplum/fhirtypes';
import { convertLocalToIso, DateTimeInput, Form, FormSection, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { TaskList } from './TaskList';

/*
 * Demonstrate:
 *
 * Create a task
 *
 * Sort by priority
 * Sort by due date
 *
 * Filter with search parameters:
 * Filter by task type (code)
 * Filter by performer type (performer)
 *
 * Filter on client:
 * Filter by location (task.location)
 * Filter by practitioner.role (task.restriction.recipient.where(resolve() is PractitionerRole))
 */

export function HomePage(): JSX.Element {
  const medplum = useMedplum();
  const [createOpened, setCreateOpened] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locations, setLocations] = useState<Location[]>();
  const [roles, setRoles] = useState<PractitionerRole[]>();
  const [tasks, setTasks] = useState<Task[]>();

  const loadTasks = useCallback(async () => {
    setTasks(await medplum.searchResources('Task', '_count=1000'));
  }, [medplum]);

  const createTask = useCallback(
    async (task: Task) => {
      await medplum.createResource(task);
      loadTasks().catch(console.error);
    },
    [medplum, loadTasks]
  );

  useEffect(() => {
    medplum.searchResources('Location', '_count=1000').then(setLocations).catch(console.error);
    medplum.searchResources('PractitionerRole', '_count=1000').then(setRoles).catch(console.error);
    loadTasks().catch(console.error);
  }, [medplum, loadTasks]);

  if (!locations || !roles || !tasks) {
    return <Loader />;
  }

  return (
    <>
      <Paper mb="xl">
        <Button variant="outline" onClick={() => setCreateOpened(true)}>
          Create task...
        </Button>
      </Paper>
      <SimpleGrid cols={3}>
        <div>
          <TaskList
            title="Unassigned"
            tasks={tasks}
            onChange={loadTasks}
            filter={(t) => t.status === 'requested'}
            withDueDate
            withActions
          />
        </div>
        <div>
          <TaskList
            title="Active"
            tasks={tasks}
            onChange={loadTasks}
            filter={(t) => ['accepted', 'ready', 'received'].includes(t.status as string)}
            withDueDate
            withOwner
            withActions
          />
        </div>
        <div>
          <TaskList
            title="Recent"
            tasks={tasks}
            onChange={loadTasks}
            filter={(t) => ['cancelled', 'completed'].includes(t.status as string)}
            withOwner
            withLastUpdated
          />
        </div>
      </SimpleGrid>
      <Modal opened={createOpened} onClose={() => setCreateOpened(false)} title="Create Task">
        <Form
          onSubmit={(formData: Record<string, string>) => {
            console.log('formData', formData);

            let restriction: TaskRestriction | undefined = undefined;
            if (formData.dueDate || formData.role) {
              restriction = {};
              if (formData.dueDate) {
                restriction.period = { end: convertLocalToIso(formData.dueDate) };
              }
              if (formData.role) {
                restriction.recipient = [{ reference: formData.role }];
              }
            }

            setSubmitting(true);
            createTask({
              resourceType: 'Task',
              status: 'requested',
              intent: 'order',
              priority: formData.priority as Task['priority'],
              code: { coding: [{ code: formData.code }] },
              description: formData.description,
              authoredOn: new Date().toISOString(),
              location: { reference: formData.location },
              restriction,
            })
              .then(() => {
                setCreateOpened(false);
              })
              .catch(() => {
                alert('Error creating task');
              })
              .finally(() => {
                setSubmitting(false);
              });
          }}
        >
          <Stack>
            <TextInput name="code" label="Code" required withAsterisk />
            <TextInput name="location" label="Location" />
            <NativeSelect name="priority" label="Priority" data={['routine', 'urgent', 'asap', 'stat']} />
            <FormSection title="Due Date">
              <DateTimeInput name="dueDate" />
            </FormSection>
            <TextInput name="description" label="Description" />
            <Group grow align="right" mt="xl">
              {submitting ? <Button disabled>Submitting...</Button> : <Button type="submit">Create Task</Button>}
            </Group>
          </Stack>
        </Form>
      </Modal>
    </>
  );
}
