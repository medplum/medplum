// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  JsonInput,
  Loader,
  NavLink,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getExtension, normalizeErrorString } from '@medplum/core';
import type { Bot, OperationDefinition, OperationDefinitionParameter, Parameters } from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import { IconExternalLink, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

const OPERATION_IMPLEMENTATION_EXTENSION =
  'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation';

interface OperationWithBot {
  operation: OperationDefinition;
  bot: Bot | undefined;
  botReference: string;
}

interface ParameterValue {
  name: string;
  value: string;
}

export function CustomOperationsPage(): JSX.Element {
  const medplum = useMedplum();
  const [operations, setOperations] = useState<OperationWithBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OperationWithBot | undefined>();
  const [paramValues, setParamValues] = useState<ParameterValue[]>([]);
  const [rawMode, setRawMode] = useState(false);
  const [rawBody, setRawBody] = useState('');
  const [invoking, setInvoking] = useState(false);
  const [result, setResult] = useState<string | undefined>();
  const [lastAuditEventId, setLastAuditEventId] = useState<string | undefined>();

  const loadOperations = useCallback(async () => {
    setLoading(true);
    try {
      const bundle = await medplum.searchResources('OperationDefinition', {
        _count: '200',
        status: 'active',
      });

      const withBot: OperationWithBot[] = [];
      for (const op of bundle) {
        const ext = getExtension(op, OPERATION_IMPLEMENTATION_EXTENSION);
        const botRef = ext?.valueReference?.reference;
        if (!botRef?.startsWith('Bot/')) {
          continue;
        }
        let bot: Bot | undefined;
        try {
          bot = await medplum.readReference({ reference: botRef });
        } catch {
          // bot may not be accessible
        }
        withBot.push({ operation: op, bot, botReference: botRef });
      }
      setOperations(withBot);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => {
    loadOperations().catch(console.error);
  }, [loadOperations]);

  const selectOperation = useCallback((item: OperationWithBot) => {
    setSelected(item);
    setResult(undefined);
    setLastAuditEventId(undefined);
    const inParams = (item.operation.parameter ?? []).filter((p) => p.use === 'in');
    setParamValues(inParams.map((p) => ({ name: p.name ?? '', value: '' })));
    setRawBody(JSON.stringify({ resourceType: 'Parameters', parameter: [] }, null, 2));
    setRawMode(false);
  }, []);

  const buildParameters = useCallback((): Parameters => {
    return {
      resourceType: 'Parameters',
      parameter: paramValues
        .filter((pv) => pv.value.trim() !== '')
        .map((pv) => {
          // Attempt to parse as JSON first (for complex types), fall back to string
          let parsed: unknown;
          try {
            parsed = JSON.parse(pv.value);
          } catch {
            parsed = undefined;
          }
          if (parsed !== undefined && typeof parsed === 'object') {
            return { name: pv.name, resource: parsed as any };
          }
          return { name: pv.name, valueString: pv.value };
        }),
    };
  }, [paramValues]);

  const invokeOperation = useCallback(async () => {
    if (!selected) {
      return;
    }
    setInvoking(true);
    setResult(undefined);
    setLastAuditEventId(undefined);
    try {
      const body: Parameters = rawMode ? JSON.parse(rawBody) : buildParameters();
      const op = selected.operation;
      const code = op.code ?? '';
      const url = medplum.fhirUrl(`$${code}`).toString();
      const response = await medplum.post(url, body, 'application/fhir+json');
      setResult(JSON.stringify(response, null, 2));

      // Find the most recent AuditEvent for this bot
      const botId = selected.botReference.split('/')[1];
      const auditBundle = await medplum.searchResources('AuditEvent', {
        entity: `Bot/${botId}`,
        _sort: '-_lastUpdated',
        _count: '1',
      });
      if (auditBundle.length > 0) {
        setLastAuditEventId(auditBundle[0].id);
      }

      showNotification({ color: 'green', message: 'Operation invoked successfully' });
    } catch (err) {
      setResult(normalizeErrorString(err));
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setInvoking(false);
    }
  }, [selected, medplum, rawMode, rawBody, buildParameters]);

  return (
    <Box style={{ display: 'flex', height: '100%', minHeight: 600 }}>
      {/* Left sidebar — operation list */}
      <Box w={260} style={{ borderRight: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}>
        <Group p="xs" justify="space-between">
          <Text fw={600} size="sm">
            Custom Operations
          </Text>
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" size="sm" onClick={() => loadOperations().catch(console.error)}>
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Divider />
        <ScrollArea h={550}>
          {loading && (
            <Box p="md" ta="center">
              <Loader size="sm" />
            </Box>
          )}
          {!loading && operations.length === 0 && (
            <Text size="sm" c="dimmed" p="md">
              No custom operations found. Create an OperationDefinition with the implementation extension pointing to a
              Bot.
            </Text>
          )}
          {operations.map((item) => (
            <NavLink
              key={item.operation.id}
              active={selected?.operation.id === item.operation.id}
              label={item.operation.title ?? item.operation.name ?? item.operation.code}
              description={`$${item.operation.code}`}
              onClick={() => selectOperation(item)}
              rightSection={
                item.bot ? (
                  <Badge size="xs" variant="light" color="blue">
                    Bot
                  </Badge>
                ) : undefined
              }
            />
          ))}
        </ScrollArea>
      </Box>

      {/* Main area */}
      <Box flex={1} p="md" style={{ overflow: 'auto' }}>
        {!selected && (
          <Box ta="center" mt={80}>
            <Text c="dimmed" size="sm">
              Select an operation from the left panel to get started.
            </Text>
          </Box>
        )}
        {selected && (
          <Stack gap="md">
            {/* Operation header */}
            <Group justify="space-between" align="flex-start">
              <Box>
                <Title order={4}>{selected.operation.title ?? selected.operation.name}</Title>
                <Group gap="xs" mt={4}>
                  <Badge variant="outline" color="violet">
                    ${selected.operation.code}
                  </Badge>
                  {selected.operation.system && <Badge color="gray">system</Badge>}
                  {selected.operation.type && <Badge color="gray">type</Badge>}
                  {selected.operation.instance && <Badge color="gray">instance</Badge>}
                </Group>
                {selected.operation.description && (
                  <Text size="sm" c="dimmed" mt={4}>
                    {selected.operation.description}
                  </Text>
                )}
              </Box>
              {selected.bot && (
                <MedplumLink to={`/Bot/${selected.bot.id}`}>
                  <Group gap={4}>
                    <Text size="sm">View Bot</Text>
                    <IconExternalLink size={14} />
                  </Group>
                </MedplumLink>
              )}
            </Group>

            <Divider />

            {/* Bot info */}
            {selected.bot && (
              <Card withBorder p="sm" radius="sm" bg="blue.0">
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    Bot:
                  </Text>
                  <Text size="sm">{selected.bot.name}</Text>
                  <MedplumLink to={`/Bot/${selected.bot.id}/editor`}>
                    <Text size="xs" c="blue">
                      Open editor →
                    </Text>
                  </MedplumLink>
                </Group>
              </Card>
            )}

            {/* Input parameters */}
            <Box>
              <Group justify="space-between" mb="xs">
                <Text fw={500} size="sm">
                  Input Parameters
                </Text>
                <Select
                  size="xs"
                  w={140}
                  value={rawMode ? 'raw' : 'structured'}
                  data={[
                    { label: 'Structured', value: 'structured' },
                    { label: 'Raw JSON', value: 'raw' },
                  ]}
                  onChange={(v) => setRawMode(v === 'raw')}
                />
              </Group>

              {rawMode ? (
                <JsonInput
                  value={rawBody}
                  onChange={setRawBody}
                  autosize
                  minRows={8}
                  formatOnBlur
                  placeholder='{"resourceType":"Parameters","parameter":[]}'
                />
              ) : (
                <ParameterForm
                  params={(selected.operation.parameter ?? []).filter((p) => p.use === 'in')}
                  values={paramValues}
                  onChange={setParamValues}
                />
              )}
            </Box>

            <Group>
              <Button
                leftSection={<IconPlayerPlay size={14} />}
                loading={invoking}
                onClick={() => invokeOperation().catch(console.error)}
              >
                Invoke
              </Button>
            </Group>

            {/* Result */}
            {result !== undefined && (
              <Box>
                <Group justify="space-between" mb="xs">
                  <Text fw={500} size="sm">
                    Response
                  </Text>
                  {lastAuditEventId && (
                    <MedplumLink to={`/AuditEvent/${lastAuditEventId}`}>
                      <Group gap={4}>
                        <Text size="xs">View AuditEvent</Text>
                        <IconExternalLink size={12} />
                      </Group>
                    </MedplumLink>
                  )}
                </Group>
                <JsonInput value={result} readOnly autosize minRows={6} />
              </Box>
            )}

            {/* Output parameter definitions */}
            {(selected.operation.parameter ?? []).filter((p) => p.use === 'out').length > 0 && (
              <Box>
                <Text fw={500} size="sm" mb="xs">
                  Output Schema
                </Text>
                <Stack gap={4}>
                  {(selected.operation.parameter ?? [])
                    .filter((p) => p.use === 'out')
                    .map((p) => (
                      <ParameterRow key={p.name} param={p} />
                    ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

interface ParameterFormProps {
  params: OperationDefinitionParameter[];
  values: ParameterValue[];
  onChange: (values: ParameterValue[]) => void;
}

function ParameterForm({ params, values, onChange }: ParameterFormProps): JSX.Element {
  if (params.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No input parameters defined.
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      {params.map((param) => {
        const pv = values.find((v) => v.name === param.name);
        const value = pv?.value ?? '';
        const required = (param.min ?? 0) > 0;
        const label = `${param.name}${required ? ' *' : ''}`;
        const description = param.documentation ?? (param.type ? `Type: ${param.type}` : undefined);

        return (
          <TextInput
            key={param.name}
            label={label}
            description={description}
            placeholder={param.type ?? 'string'}
            value={value}
            onChange={(e) => {
              const newValues = values.map((v) => (v.name === param.name ? { ...v, value: e.currentTarget.value } : v));
              onChange(newValues);
            }}
          />
        );
      })}
    </Stack>
  );
}

interface ParameterRowProps {
  param: OperationDefinitionParameter;
}

function ParameterRow({ param }: ParameterRowProps): JSX.Element {
  return (
    <Group gap="xs">
      <Badge variant="light" color="gray" size="sm">
        {param.name}
      </Badge>
      {param.type && (
        <Text size="xs" c="dimmed">
          {param.type}
        </Text>
      )}
      {(param.min ?? 0) > 0 && (
        <Text size="xs" c="red">
          required
        </Text>
      )}
      {param.documentation && (
        <Text size="xs" c="dimmed">
          — {param.documentation}
        </Text>
      )}
    </Group>
  );
}
