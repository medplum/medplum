import { Textarea, Select, Button, Text, Paper, Stack, Group, Box, Menu, Card, useMantineTheme } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { useSearchResources } from '@medplum/react';
import { useParams } from 'react-router-dom';

export const EncounterChart = (): JSX.Element => {
  const theme = useMantineTheme();
  const { encounterId } = useParams();
  console.log('Encounter ID:', encounterId);

  const [tasks] = useSearchResources('Task', `encounter=Encounter/${encounterId}`);
  console.log('Task:', tasks);

  return (
    <Box p="md">
      <Text size="lg" color="dimmed" mb="lg">
        Encounters • Encounter 12.12.2024
      </Text>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Stack gap="md">
              <Text size="xl" fw={500}>
                FILL CHART NOTE
              </Text>

              <Stack gap="md">
                <div>
                  <Text fw={500} mb="xs">
                    Subjective evaluation
                  </Text>
                  <Textarea placeholder="What patient describes" minRows={3} />
                </div>

                <div>
                  <Text fw={500} mb="xs">
                    Objective evaluation
                  </Text>
                  <Textarea placeholder="What is being observed" minRows={3} />
                </div>

                <div>
                  <Text fw={500} mb="xs">
                    Assessment
                  </Text>
                  <Text size="sm" color="dimmed" mb="xs">
                    Necessary for insurance claim
                  </Text>
                  <Select placeholder="Select diagnostics code" data={[]} searchable />
                </div>

                <div>
                  <Text fw={500} mb="xs">
                    Treatment plan
                  </Text>
                  <Textarea placeholder="Plan for treatment" minRows={3} />
                </div>
              </Stack>
            </Stack>

            <Stack gap="md">
              {tasks &&
                tasks.map((task: Task) => (
                  <Card withBorder shadow="sm" p={0}>
                    <Stack gap="xs">
                      <Stack gap="xs" p="md">
                        {task.code?.text && (
                          <Text fw={500} size="lg">
                            {task.code.text}
                          </Text>
                        )}
                        <Text>{task.description}</Text>
                      </Stack>

                      <Group
                        justify="space-between"
                        align="center"
                        style={{
                          height: 70,
                          backgroundColor: task.status === 'completed' ? theme.colors.green[0] : theme.colors.gray[1],
                        }}
                        p="md"
                      >
                        <Stack gap={0}>
                          <Text color="black">Current status</Text>
                          <Text fw="bold" color="black">
                            {task.status}
                          </Text>
                        </Stack>

                        <Group gap={8}>
                          <Button variant="transparent" color={theme.colors.blue[6]}>
                            Task details
                          </Button>
                          <Menu>
                            <Menu.Target>
                              <Button>Edit task ▾</Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item>Edit</Menu.Item>
                              <Menu.Item>Delete</Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Group>
                    </Stack>
                  </Card>
                ))}
            </Stack>
          </Stack>
        </Paper>

        <Stack gap="lg">
          <Button variant="outline" color="blue" fullWidth>
            Add care template
          </Button>

          <Text size="sm" color="dimmed">
            Task groups predefined by care planner
          </Text>

          <div>
            <Text fw={500} mb="xs">
              Encounter status
            </Text>
            <Select placeholder="In-progress" data={['In-progress', 'Completed', 'Cancelled']} />
          </div>

          <div>
            <Text fw={500} mb="xs">
              Assigned practitioner
            </Text>
            <Select placeholder="Lisa Caddy" data={['Lisa Caddy', 'John Smith', 'Jane Doe']} />
          </div>

          <div>
            <Text fw={500} mb="xs">
              Encounter Time
            </Text>
            <Select placeholder="1 hour" data={['30 minutes', '1 hour', '2 hours']} />
          </div>

          <Stack gap="md">
            <Button color="blue" fullWidth>
              Save changes
            </Button>

            <Group gap="sm">
              <Button variant="light" color="gray" fullWidth>
                Mark as finished
              </Button>
            </Group>

            <Text size="sm">Complete all the tasks in encounter before finishing it</Text>
          </Stack>
        </Stack>
      </div>
    </Box>
  );
};
