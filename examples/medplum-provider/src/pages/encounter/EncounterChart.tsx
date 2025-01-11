import { Textarea, Select, Button, Text, Paper, Stack, Group, Box } from '@mantine/core';

export const EncounterChart = (): JSX.Element => {
  return (
    <Box p="md">
      <Text size="lg" color="dimmed" mb="lg">
        Encounters • Encounter 12.12.2024
      </Text>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
        <Paper p="lg" radius="md" withBorder>
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
        </Paper>

        <Stack gap="xl">
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

          <Stack gap="md" mt="auto">
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
