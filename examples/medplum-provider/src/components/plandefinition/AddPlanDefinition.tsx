// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Box,
  Button,
  Card,
  Grid,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { PlanDefinition } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import cx from 'clsx';
import { JSX, useCallback, useEffect, useState } from 'react';
import classes from './AddPlanDefinition.module.css';

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
        title="Add Care Template"
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
        <Stack h="100%" justify="space-between" gap={0}>
          <Box flex={1} miw={0}>
            <Grid p="md">
              <Grid.Col span={6} pr="md">
                <Box>
                  <Title order={5} mb="xs">
                    Select care template
                  </Title>
                  <Text size="sm" c="dimmed" mb="md">
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

                  <ScrollArea style={{ height: 'calc(80vh - 250px)' }} type="scroll">
                    {planDefinitions.length > 0 &&
                      planDefinitions.map((plan) => (
                        <Card
                          key={plan.id}
                          p="md"
                          mb="xs"
                          className={cx(classes.planDefinition, {
                            [classes.selected]: selectedPlanDefinition?.id === plan.id,
                          })}
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

                    {planDefinitions.length === 0 && !isLoading && (
                      <Paper className={classes.notFound} h={40}>
                        <Text>Nothing found! Try searching for another name of the care plan.</Text>
                      </Paper>
                    )}
                  </ScrollArea>
                </Box>
              </Grid.Col>

              <Grid.Col span={6}>
                <Paper withBorder className={classes.preview}>
                  <ScrollArea style={{ height: 'calc(80vh - 110px)' }} type="scroll">
                    <Stack gap="sm" px="md" pt="md">
                      <Title order={5}>Preview</Title>
                      {selectedPlanDefinition ? (
                        <>
                          <Stack gap={0} p={0}>
                            <Text fz="md" fw={500}>
                              {selectedPlanDefinition.name}
                            </Text>
                            <Text fw={500} c="dimmed">
                              {selectedPlanDefinition.subtitle}
                            </Text>
                          </Stack>

                          <Stack gap="xs" pb="md">
                            {selectedPlanDefinition.action?.map((action, index) => (
                              <Card key={`${action.id}-task-${index}`} withBorder shadow="sm">
                                <Text fw={500}>{action.title}</Text>
                                {action.description && <Text c="dimmed">{action.description}</Text>}
                              </Card>
                            ))}
                          </Stack>
                        </>
                      ) : (
                        <Text c="dimmed">Select a template to see preview.</Text>
                      )}
                    </Stack>
                  </ScrollArea>
                </Paper>
              </Grid.Col>
            </Grid>
          </Box>

          <Box className={classes.footer} h={70} p="md">
            <Button onClick={handleApplyPlanDefinition}>Add care template</Button>
          </Box>
        </Stack>
      </Modal>
    </>
  );
};
