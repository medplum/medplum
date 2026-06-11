// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Loader,
  NavLink,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getExtension, normalizeErrorString } from '@medplum/core';
import type { Bot, OperationDefinition, OperationDefinitionParameter, Parameters, ProjectMembership, Resource, ResourceType } from '@medplum/fhirtypes';
import { MedplumLink, ResourceInput, sendCommand, useMedplum } from '@medplum/react';
import { IconExternalLink, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeEditor } from '../resource/CodeEditor';

const OPERATION_IMPLEMENTATION_EXTENSION =
  'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation';

type InvokeLevel = 'system' | 'type' | 'instance';

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
  const [invokeLevel, setInvokeLevel] = useState<InvokeLevel>('system');
  const [resourceType, setResourceType] = useState<string>('');
  const [instanceResource, setInstanceResource] = useState<Resource | undefined>();
  const [paramValues, setParamValues] = useState<ParameterValue[]>([]);
  const [rawMode, setRawMode] = useState(false);
  const [onBehalfOf, setOnBehalfOf] = useState<ProjectMembership | undefined>();
  const [invoking, setInvoking] = useState(false);
  const [responseValue, setResponseValue] = useState<string | undefined>();
  const [lastAuditEventId, setLastAuditEventId] = useState<string | undefined>();

  const isAdmin = medplum.isProjectAdmin() || medplum.isSuperAdmin();

  const rawBodyRef = useRef<HTMLIFrameElement>(null);
  const responseRef = useRef<HTMLIFrameElement>(null);

  const baseUrl = useMemo(() => {
    return medplum.fhirUrl('').toString().replace(/\/$/, '');
  }, [medplum]);

  const materializedUrl = useMemo(() => {
    if (!selected) {
      return '';
    }
    const code = selected.operation.code ?? '';
    if (invokeLevel === 'system') {
      return `${baseUrl}/$${code}`;
    }
    const rt = resourceType || (selected.operation.resource?.[0] ?? 'Resource');
    if (invokeLevel === 'type') {
      return `${baseUrl}/${rt}/$${code}`;
    }
    const id = instanceResource?.id ?? '<id>';
    return `${baseUrl}/${rt}/${id}/$${code}`;
  }, [selected, invokeLevel, resourceType, instanceResource, baseUrl]);

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
    setResponseValue(undefined);
    setLastAuditEventId(undefined);
    setInstanceResource(undefined);
    const op = item.operation;
    const rt = op.resource?.[0] ?? '';
    setResourceType(rt);

    if (op.system) {
      setInvokeLevel('system');
    } else if (op.type) {
      setInvokeLevel('type');
    } else if (op.instance) {
      setInvokeLevel('instance');
    } else {
      setInvokeLevel('system');
    }

    const inParams = (op.parameter ?? []).filter((p) => p.use === 'in');
    setParamValues(inParams.map((p) => ({ name: p.name ?? '', value: '' })));
    setRawMode(false);
  }, []);

  const buildParameters = useCallback((): Parameters => {
    return {
      resourceType: 'Parameters',
      parameter: paramValues
        .filter((pv) => pv.value.trim() !== '')
        .map((pv) => {
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
    setResponseValue(undefined);
    setLastAuditEventId(undefined);
    try {
      let body: Parameters;
      if (rawMode) {
        const raw = await sendCommand<undefined, string>(rawBodyRef.current as HTMLIFrameElement, {
          command: 'getValue',
        });
        body = JSON.parse(raw ?? '{}');
      } else {
        body = buildParameters();
      }

      const op = selected.operation;
      const code = op.code ?? '';
      const rt = resourceType || (op.resource?.[0] ?? '');

      let url: string;
      if (invokeLevel === 'system') {
        url = medplum.fhirUrl(`$${code}`).toString();
      } else if (invokeLevel === 'type') {
        url = medplum.fhirUrl(rt, `$${code}`).toString();
      } else {
        url = medplum.fhirUrl(rt, instanceResource?.id ?? '', `$${code}`).toString();
      }

      const headers: HeadersInit = {};
      if (onBehalfOf) {
        headers['x-medplum-on-behalf-of'] = createReference(onBehalfOf).reference as string;
      }
      const response = await medplum.post(url, body, 'application/fhir+json', { headers });
      const responseStr = JSON.stringify(response, null, 2);
      setResponseValue(responseStr);
      await sendCommand(responseRef.current as HTMLIFrameElement, { command: 'setValue', value: responseStr });

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
      const msg = normalizeErrorString(err);
      setResponseValue(msg);
      await sendCommand(responseRef.current as HTMLIFrameElement, { command: 'setValue', value: msg });
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally {
      setInvoking(false);
    }
  }, [selected, medplum, rawMode, buildParameters, invokeLevel, resourceType, instanceResource, onBehalfOf]);

  const availableLevels = useMemo(() => {
    if (!selected) {
      return [];
    }
    const op = selected.operation;
    const levels: { label: string; value: InvokeLevel }[] = [];
    if (op.system) {
      levels.push({ label: 'System', value: 'system' });
    }
    if (op.type) {
      levels.push({ label: 'Type', value: 'type' });
    }
    if (op.instance) {
      levels.push({ label: 'Instance', value: 'instance' });
    }
    return levels;
  }, [selected]);

  const resourceTypeOptions = useMemo(() => {
    if (!selected?.operation.resource?.length) {
      return [];
    }
    return selected.operation.resource.map((r) => ({ label: r, value: r }));
  }, [selected]);

  const instanceResourceType = (resourceType || selected?.operation.resource?.[0]) as ResourceType | undefined;

  return (
    <Box style={{ display: 'flex', height: '100%', minHeight: 600 }}>
      {/* Left sidebar */}
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
            {/* Header */}
            <Group justify="space-between" align="flex-start">
              <Box>
                <Title order={4}>{selected.operation.title ?? selected.operation.name}</Title>
                {selected.operation.description && (
                  <Text size="sm" c="dimmed" mt={4}>
                    {selected.operation.description}
                  </Text>
                )}
              </Box>
              {selected.bot && (
                <MedplumLink to={`/Bot/${selected.bot.id}/editor`}>
                  <Group gap={4}>
                    <Text size="sm">{selected.bot.name}</Text>
                    <IconExternalLink size={13} />
                  </Group>
                </MedplumLink>
              )}
            </Group>

            {/* Level toggle */}
            {availableLevels.length > 1 && (
              <SegmentedControl
                size="xs"
                value={invokeLevel}
                onChange={(v) => {
                  setInvokeLevel(v as InvokeLevel);
                  setInstanceResource(undefined);
                }}
                data={availableLevels}
              />
            )}

            {/* Resource type selector */}
            {(invokeLevel === 'type' || invokeLevel === 'instance') && resourceTypeOptions.length > 1 && (
              <Select
                label="Resource type"
                size="xs"
                w={200}
                value={resourceType}
                data={resourceTypeOptions}
                onChange={(v) => {
                  setResourceType(v ?? '');
                  setInstanceResource(undefined);
                }}
              />
            )}

            {/* Instance resource typeahead */}
            {invokeLevel === 'instance' && instanceResourceType && (
              <ResourceInput
                resourceType={instanceResourceType}
                name="instanceId"
                label="Resource instance"
                placeholder={`Search ${instanceResourceType}…`}
                onChange={(r) => setInstanceResource(r ?? undefined)}
              />
            )}

            {/* Instance ID fallback when no resource type known */}
            {invokeLevel === 'instance' && !instanceResourceType && (
              <TextInput
                label="Resource ID"
                size="xs"
                w={300}
                placeholder="e.g. 2e27c71e-30c8-4ceb-8c1c-5641e066c0a4"
                onChange={(e) =>
                  setInstanceResource(e.currentTarget.value ? ({ id: e.currentTarget.value } as Resource) : undefined)
                }
              />
            )}

            {/* On-behalf-of (admins only) */}
            {isAdmin && (
              <Box>
                <ResourceInput<ProjectMembership>
                  resourceType="ProjectMembership"
                  name="onBehalfOf"
                  label="On behalf of (optional)"
                  placeholder="Search project membership…"
                  onChange={(m) => setOnBehalfOf(m ?? undefined)}
                />
                <Text size="xs" c="dimmed" mt={4}>
                  Sends <Code>x-medplum-on-behalf-of</Code> header. The operation runs as if invoked by that membership.
                </Text>
              </Box>
            )}

            {/* URL bar */}
            <Box>
              <Text size="xs" c="dimmed" mb={4} tt="uppercase" fw={600} style={{ letterSpacing: '0.05em' }}>
                Request URL
              </Text>
              <Group
                gap={0}
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-sm)',
                  overflow: 'hidden',
                  background: 'var(--mantine-color-default)',
                }}
              >
                <Box
                  px="sm"
                  py={6}
                  style={{
                    background: 'var(--mantine-color-violet-6)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: '0.05em',
                    flexShrink: 0,
                  }}
                >
                  POST
                </Box>
                <Code
                  flex={1}
                  px="sm"
                  py={6}
                  style={{
                    fontSize: 12,
                    background: 'transparent',
                    whiteSpace: 'nowrap',
                    overflow: 'auto',
                    display: 'block',
                  }}
                >
                  {materializedUrl}
                </Code>
              </Group>
            </Box>

            <Divider />

            {/* Input parameters */}
            <Box>
              <Group justify="space-between" mb="xs">
                <Text fw={500} size="sm">
                  Input Parameters
                </Text>
                <SegmentedControl
                  size="xs"
                  value={rawMode ? 'raw' : 'structured'}
                  onChange={(v) => setRawMode(v === 'raw')}
                  data={[
                    { label: 'Structured', value: 'structured' },
                    { label: 'Raw JSON', value: 'raw' },
                  ]}
                />
              </Group>

              {rawMode ? (
                <Box style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden' }}>
                  <CodeEditor
                    iframeRef={rawBodyRef}
                    language="json"
                    defaultValue={JSON.stringify({ resourceType: 'Parameters', parameter: [] }, null, 2)}
                    minHeight="240px"
                  />
                </Box>
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

            {/* Response */}
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
              <Box style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden', opacity: responseValue === undefined ? 0.4 : 1 }}>
                <CodeEditor
                  iframeRef={responseRef}
                  language="json"
                  defaultValue={responseValue ?? '// Response will appear here after invoking'}
                  minHeight="240px"
                />
              </Box>
            </Box>

            {/* Output schema */}
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
              const newValues = values.map((v) =>
                v.name === param.name ? { ...v, value: e.currentTarget.value } : v
              );
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
