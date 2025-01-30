import { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Stack,
  Text,
  Modal,
  Box,
  ScrollArea,
  Card,
  TextInput,
  Title,
  Group,
  Loader,
  useMantineTheme,
  useMantineColorScheme,
  Paper,
} from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { PlanDefinition } from '@medplum/fhirtypes';
import { showNotification } from '@mantine/notifications';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { normalizeErrorString } from '@medplum/core';

interface AddPlanDefinitionProps {
  encounterId: string;
  patientId: string;
  onApply: () => void;
}

export const AddPlanDefinition = ({ encounterId, patientId, onApply }: AddPlanDefinitionProps): JSX.Element => {
  const [opened, setOpened] = useState(false);
  const [planDefinitions, setPlanDefinitions] = useState<PlanDefinition[]>([]);
  const [selectedPlanDefinition, setSelectedPlanDefinition] = useState<PlanDefinition | undefined>();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const medplum = useMedplum();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();

  const handleApplyPlanDefinition = async (): Promise<void> => {
    if (!selectedPlanDefinition) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'No plan definition selected',
      });
      return;
    }

    try {
      await medplum.post(medplum.fhirUrl('PlanDefinition', selectedPlanDefinition.id as string, '$apply'), {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: `Patient/${patientId}`,
          },
          {
            name: 'encounter',
            valueString: `Encounter/${encounterId}`,
          },
        ],
      });

      showNotification({
        color: 'green',
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Plan definition applied to the encounter',
      });

      onApply();
      handleClose();
    } catch (error) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }
  };

  const fetchPlanDefinitions = useCallback(
    (query?: string) => {
      setIsLoading(true);
      const searchParam = query ? `name=${query}` : undefined;
      medplum
        .searchResources('PlanDefinition', searchParam)
        .then((result) => {
          const filteredResult = result.filter((pd) => pd.name?.trim());
          setPlanDefinitions(filteredResult);
        })
        .catch((err) => {
          showNotification({
            color: 'red',
            icon: <IconCircleOff />,
            title: 'Error',
            message: normalizeErrorString(err),
          });
        })
        .finally(() => {
          setIsLoading(false);
        });
    },
    [medplum]
  );

  useEffect(() => {
    if (opened) {
      fetchPlanDefinitions();
    }
  }, [opened, fetchPlanDefinitions]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (opened) {
        fetchPlanDefinitions(searchQuery);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, opened, fetchPlanDefinitions]);

  const handleClose = (): void => {
    setOpened(false);
    setSelectedPlanDefinition(undefined);
    setSearchQuery('');
  };

  const getBackgroundColor = ({
    plan,
    selectedPlanDefinition,
  }: {
    plan: PlanDefinition;
    selectedPlanDefinition: PlanDefinition | undefined;
  }): string => {
    if (selectedPlanDefinition?.id === plan.id) {
      return theme.colors.blue[5];
    }
    if (colorScheme === 'dark') {
      return theme.colors.dark[8];
    }
    return theme.colors.gray[1];
  };

  return (
    <>
      <Stack gap="md">
        <Button variant="outline" color="blue" fullWidth onClick={() => setOpened(true)}>
          Add care template
        </Button>
        <Text size="sm">Task groups predefined by care planner</Text>
      </Stack>

      <Modal
        opened={opened}
        onClose={handleClose}
        title="Add care Template"
        size="75%"
        styles={{
          title: {
            fontSize: '1.2rem',
            fontWeight: 600,
          },
          body: {
            padding: '0',
            height: '80vh',
          },
        }}
      >
        <Box p="md">
          <Box style={{ display: 'flex', gap: '2rem' }}>
            <Box style={{ flex: 1 }}>
              <Title order={5} mb="xs">
                Select care template
              </Title>
              <Text size="sm" color="dimmed" mb="md">
                Care templates are predefined sets of actions that can be applied to encounters.
              </Text>

              <TextInput
                placeholder="Search by name"
                mb="md"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                rightSection={isLoading ? <Loader size={16} /> : null}
                styles={{
                  input: {
                    '&:focus': {
                      borderColor: '#228be6',
                    },
                  },
                }}
              />

              <ScrollArea.Autosize>
                {planDefinitions.map((plan) => (
                  <Card
                    key={plan.id}
                    p="md"
                    mb="xs"
                    style={{
                      cursor: 'pointer',
                      backgroundColor: getBackgroundColor({ plan, selectedPlanDefinition }),
                    }}
                    onClick={() => setSelectedPlanDefinition(plan)}
                  >
                    <Text fz="md" fw={500} c={selectedPlanDefinition?.id === plan.id ? 'white' : undefined}>
                      {plan.name}
                    </Text>
                    <Text fw={500} c={selectedPlanDefinition?.id === plan.id ? 'white' : 'dimmed'}>
                      {plan.subtitle}
                    </Text>
                  </Card>
                ))}
              </ScrollArea.Autosize>
            </Box>

            <Paper withBorder p="md" style={{ flex: '1', height: '100%' }}>
              {selectedPlanDefinition ? (
              <Stack gap="sm" style={{ height: '100%' }}>
                <Title order={5}>Preview</Title>

                <Stack gap={0}>
                <Text fz="md" fw={500}>
                  {selectedPlanDefinition.name}
                </Text>
                <Text fw={500} c="dimmed">
                  {selectedPlanDefinition.subtitle}
                </Text>
                </Stack>

                <ScrollArea style={{ flex: 1 }}>
                <Stack gap="xs">
                  {selectedPlanDefinition.action?.map((action, index) => (
                  <Card key={`${action.id}-task-${index}`} withBorder shadow="sm">
                    <Text fw={500}>{action.title}</Text>
                    {action.description && <Text c="dimmed">{action.description}</Text>}
                  </Card>
                  ))}
                </Stack>
                </ScrollArea>
              </Stack>
              ) : (
              <Text color="dimmed">Select a template to see preview</Text>
              )}
            </Paper>
          </Box>
        </Box>

        <Group
          mt="md"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            position: 'absolute',
            bottom: '1rem',
            right: '1rem',
          }}
        >
          <Button onClick={handleApplyPlanDefinition}>Add care template</Button>
        </Group>
      </Modal>
    </>
  );
};
