// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Collapse,
  Divider,
  Group,
  Input,
  Loader,
  NavLink,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatSearchQuery, getExtension, normalizeErrorString, Operator } from '@medplum/core';
import type { SearchRequest } from '@medplum/core';
import type { Bot, OperationDefinition, OperationDefinitionParameter, Parameters, Resource, ResourceType } from '@medplum/fhirtypes';
import { DateTimeInput, MedplumLink, ReferenceInput, ResourceInput, sendCommand, useMedplum } from '@medplum/react';
import { IconChevronRight, IconCode, IconExternalLink, IconHistory, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BotCodePanel } from './BotCodePanel';
import { BotLogsPanel } from './BotLogsPanel';
import { CodeEditor } from '../resource/CodeEditor';

const OPERATIONS_PATH = '/admin/operations';

const OPERATION_IMPLEMENTATION_EXTENSION =
  'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation';

const HL7_SD_PREFIX = 'http://hl7.org/fhir/StructureDefinition/';
const MEDPLUM_SD_PREFIX = 'https://medplum.com/fhir/StructureDefinition/';

/**
 * Resolves the resource types a reference parameter can point to, derived from
 * its OperationDefinition `targetProfile` canonicals. Returns undefined when no
 * targets are declared so the reference lookup can offer a resource-type picker.
 * @param param - The operation parameter.
 * @returns The list of target resource type names, or undefined.
 */
function getReferenceTargetTypes(param: OperationDefinitionParameter): string[] | undefined {
  const profiles = param.targetProfile;
  if (!profiles?.length) {
    return undefined;
  }
  return profiles.map((profile) => {
    for (const prefix of [HL7_SD_PREFIX, MEDPLUM_SD_PREFIX]) {
      if (profile.startsWith(prefix)) {
        return profile.slice(prefix.length);
      }
    }
    return profile;
  });
}

/**
 * Determines whether a parameter should be filled via the standard reference
 * lookup. Covers both `Reference`-typed parameters and string search parameters
 * declared with `searchType: 'reference'` (as the scheduling operations use).
 * @param param - The operation parameter.
 * @returns True if the parameter is a reference.
 */
function isReferenceParam(param: OperationDefinitionParameter): boolean {
  return param.type === 'Reference' || param.searchType === 'reference';
}

const DATE_TIME_TYPES = new Set(['dateTime', 'instant']);
const NUMERIC_TYPES = new Set(['integer', 'positiveInt', 'unsignedInt', 'decimal']);

// Extension whose valueString names the group an OperationDefinition is
// displayed under in the Operations UI (e.g. "Scheduling"). Operations without
// this extension are only shown if they are Bot-backed (grouped as "Custom").
const OPERATION_GROUP_EXTENSION = 'https://medplum.com/fhir/StructureDefinition/operationDefinition-group';

// Bot-backed operations are always grouped here, regardless of any group extension.
const CUSTOM_GROUP = 'Custom';

type InvokeLevel = 'system' | 'type' | 'instance';

type HttpMethod = 'GET' | 'POST';

interface OperationWithBot {
  operation: OperationDefinition;
  bot: Bot | undefined;
  botReference?: string;
  group: string;
  httpMethod: HttpMethod;
}

interface ParameterValue {
  name: string;
  value: string;
}

const EDITOR_COMMAND_TIMEOUT_MS = 10_000;

/**
 * Sends a command to a code editor iframe but rejects if the iframe does not
 * respond within a timeout. The editor is hosted in a cross-origin iframe whose
 * reply we cannot guarantee, so an un-timed `sendCommand` can hang forever.
 * @param frame - The target iframe (may be null if not yet mounted).
 * @param command - The command to send to the editor.
 * @returns The command result.
 */
async function sendCommandWithTimeout<R = unknown>(
  frame: HTMLIFrameElement | null,
  command: { command: string; value?: unknown }
): Promise<R> {
  if (!frame) {
    throw new Error('Editor is not ready');
  }
  return Promise.race([
    sendCommand<unknown, R>(frame, command),
    new Promise<R>((_resolve, reject) =>
      setTimeout(() => reject(new Error('Timed out communicating with the editor')), EDITOR_COMMAND_TIMEOUT_MS)
    ),
  ]);
}

/**
 * Pushes a value into a code editor iframe without blocking the caller. The
 * value is already held in React state, so a failed/slow iframe round-trip must
 * never stall the invoke lifecycle.
 * @param frame - The target iframe (may be null if not yet mounted).
 * @param value - The value to display in the editor.
 */
function pushToEditor(frame: HTMLIFrameElement | null, value: string): void {
  if (!frame) {
    return;
  }
  sendCommandWithTimeout(frame, { command: 'setValue', value }).catch(console.error);
}

export function CustomOperationsPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { operationId } = useParams() as { operationId?: string };
  const [operations, setOperations] = useState<OperationWithBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OperationWithBot | undefined>();
  const [invokeLevel, setInvokeLevel] = useState<InvokeLevel>('system');
  const [resourceType, setResourceType] = useState<string>('');
  const [instanceResource, setInstanceResource] = useState<Resource | undefined>();
  const [paramValues, setParamValues] = useState<ParameterValue[]>([]);
  const [rawMode, setRawMode] = useState(false);
  const [invoking, setInvoking] = useState(false);
  const [responseValue, setResponseValue] = useState<string | undefined>();
  const [lastAuditEventId, setLastAuditEventId] = useState<string | undefined>();

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
    let path: string;
    if (invokeLevel === 'system') {
      path = `${baseUrl}/$${code}`;
    } else {
      const rt = resourceType || (selected.operation.resource?.[0] ?? 'Resource');
      if (invokeLevel === 'type') {
        path = `${baseUrl}/${rt}/$${code}`;
      } else {
        const id = instanceResource?.id ?? '<id>';
        path = `${baseUrl}/${rt}/${id}/$${code}`;
      }
    }
    // GET operations (e.g. $find) carry their inputs as query parameters, so reflect them in the preview.
    if (selected.httpMethod === 'GET') {
      const query = paramValues
        .filter((pv) => pv.value.trim() !== '')
        .map((pv) => `${encodeURIComponent(pv.name)}=${encodeURIComponent(pv.value)}`)
        .join('&');
      if (query) {
        path += `?${query}`;
      }
    }
    return path;
  }, [selected, invokeLevel, resourceType, instanceResource, baseUrl, paramValues]);

  // Link to the AuditEvent search filtered to this operation's Bot — these are the bot's execution logs.
  const botLogsUrl = useMemo(() => {
    if (!selected?.bot?.id) {
      return undefined;
    }
    const search: SearchRequest = {
      resourceType: 'AuditEvent',
      fields: ['outcomeDesc', 'severity', '_lastUpdated'],
      filters: [{ code: 'entity', operator: Operator.EQUALS, value: `Bot/${selected.bot.id}` }],
      sortRules: [{ code: '_lastUpdated', descending: true }],
    };
    return `/AuditEvent${formatSearchQuery(search)}`;
  }, [selected]);

  const loadOperations = useCallback(async () => {
    setLoading(true);
    try {
      const bundle = await medplum.searchResources('OperationDefinition', {
        _count: '200',
        status: 'active',
      });

      const entries: OperationWithBot[] = [];
      for (const op of bundle) {
        const botRef = getExtension(op, OPERATION_IMPLEMENTATION_EXTENSION)?.valueReference?.reference;
        const isBot = botRef?.startsWith('Bot/');
        const groupExt = getExtension(op, OPERATION_GROUP_EXTENSION)?.valueString;

        // Only display operations that resolve to a group: Bot-backed ones are
        // "Custom"; everything else must declare a group via the group extension.
        let group: string;
        let bot: Bot | undefined;
        if (isBot) {
          group = CUSTOM_GROUP;
          try {
            bot = await medplum.readReference<Bot>({ reference: botRef as string });
          } catch {
            // bot may not be accessible
          }
        } else if (groupExt) {
          group = groupExt;
        } else {
          continue;
        }

        // Read-only operations (affectsState === false, e.g. $find) are invoked via GET.
        const httpMethod: HttpMethod = op.affectsState === false ? 'GET' : 'POST';
        entries.push({ operation: op, bot, botReference: isBot ? botRef : undefined, group, httpMethod });
      }
      setOperations(entries);
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
    if (!item.operation.id) {
      return;
    }
    navigate(`${OPERATIONS_PATH}/${item.operation.id}`);
  }, [navigate]);

  const applySelection = useCallback((item: OperationWithBot) => {
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

  // Sync the selected operation from the URL permalink (/admin/operations/:operationId).
  // The URL is the source of truth so each operation has a shareable link.
  useEffect(() => {
    if (operations.length === 0) {
      return;
    }
    if (!operationId) {
      setSelected(undefined);
      return;
    }
    if (selected?.operation.id === operationId) {
      return;
    }
    const match = operations.find((item) => item.operation.id === operationId);
    if (match) {
      applySelection(match);
    }
  }, [operationId, operations, selected?.operation.id, applySelection]);

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
      const op = selected.operation;
      const code = op.code ?? '';
      const rt = resourceType || (op.resource?.[0] ?? '');

      let url: URL;
      if (invokeLevel === 'system') {
        url = medplum.fhirUrl(`$${code}`);
      } else if (invokeLevel === 'type') {
        url = medplum.fhirUrl(rt, `$${code}`);
      } else {
        url = medplum.fhirUrl(rt, instanceResource?.id ?? '', `$${code}`);
      }

      let response: unknown;
      if (selected.httpMethod === 'GET') {
        // GET operations (e.g. $find) take their inputs as query parameters.
        for (const pv of paramValues) {
          if (pv.value.trim() !== '') {
            url.searchParams.append(pv.name, pv.value);
          }
        }
        response = await medplum.get(url);
      } else {
        let body: Parameters;
        if (rawMode) {
          const raw = await sendCommandWithTimeout<string>(rawBodyRef.current, { command: 'getValue' });
          body = JSON.parse(raw ?? '{}');
        } else {
          body = buildParameters();
        }
        response = await medplum.post(url.toString(), body, 'application/fhir+json');
      }

      const responseStr = JSON.stringify(response, null, 2);
      setResponseValue(responseStr);
      // Push the value into the editor iframe without blocking the invoke lifecycle;
      // the iframe round-trip can hang if the editor is slow/unreachable.
      pushToEditor(responseRef.current, responseStr);

      // Only Bot-backed operations produce AuditEvent execution logs.
      if (selected.bot?.id) {
        const auditBundle = await medplum.searchResources('AuditEvent', {
          entity: `Bot/${selected.bot.id}`,
          _sort: '-_lastUpdated',
          _count: '1',
        });
        if (auditBundle.length > 0) {
          setLastAuditEventId(auditBundle[0].id);
        }
      }

      showNotification({ color: 'green', message: 'Operation invoked successfully' });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setResponseValue(msg);
      pushToEditor(responseRef.current, msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally {
      setInvoking(false);
    }
  }, [selected, medplum, rawMode, buildParameters, invokeLevel, resourceType, instanceResource, paramValues]);

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

  // Group operations by their resolved group label, with "Custom" pinned first
  // and remaining groups sorted alphabetically.
  const groupedOps = useMemo(() => {
    const map = new Map<string, OperationWithBot[]>();
    for (const item of operations) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === CUSTOM_GROUP) {
        return -1;
      }
      if (b === CUSTOM_GROUP) {
        return 1;
      }
      return a.localeCompare(b);
    });
  }, [operations]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);

  const renderNavLink = (item: OperationWithBot): JSX.Element => (
    <NavLink
      key={item.operation.id}
      active={selected?.operation.id === item.operation.id}
      label={item.operation.title ?? item.operation.name ?? item.operation.code}
      description={`$${item.operation.code}`}
      onClick={() => selectOperation(item)}
      rightSection={
        <Badge size="xs" variant="light" color={item.httpMethod === 'GET' ? 'teal' : 'violet'}>
          {item.httpMethod}
        </Badge>
      }
    />
  );

  return (
    <Box style={{ display: 'flex', height: '100%', minHeight: 600 }}>
      {/* Left sidebar */}
      <Box
        w={260}
        style={{
          borderRight: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <Group p="xs" justify="space-between" style={{ flexShrink: 0 }}>
          <Text fw={600} size="sm">
            Operations
          </Text>
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" size="sm" onClick={() => loadOperations().catch(console.error)}>
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Divider style={{ flexShrink: 0 }} />
        <ScrollArea type="auto" style={{ flex: 1, minHeight: 0 }}>
          {loading && (
            <Box p="md" ta="center">
              <Loader size="sm" />
            </Box>
          )}
          {!loading && groupedOps.length === 0 && (
            <Text size="sm" c="dimmed" p="md">
              No operations to display. Bot-backed operations appear under “Custom”; other operations must declare a
              group via the {OPERATION_GROUP_EXTENSION} extension.
            </Text>
          )}
          {!loading &&
            groupedOps.map(([group, items]) => {
              const collapsed = collapsedGroups.has(group);
              return (
                <Box key={group}>
                  <UnstyledButton
                    onClick={() => toggleGroup(group)}
                    w="100%"
                    px="sm"
                    py={6}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <IconChevronRight
                      size={12}
                      style={{
                        transition: 'transform 150ms ease',
                        transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                      }}
                    />
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.05em', flex: 1 }}>
                      {group}
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                      {items.length}
                    </Badge>
                  </UnstyledButton>
                  <Collapse in={!collapsed}>{items.map(renderNavLink)}</Collapse>
                </Box>
              );
            })}
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
                <Tooltip label="Open the backing Bot in the full editor">
                  <MedplumLink to={`/Bot/${selected.bot.id}/editor`}>
                    <Group gap={4}>
                      <Text size="sm">{selected.bot.name}</Text>
                      <IconExternalLink size={13} />
                    </Group>
                  </MedplumLink>
                </Tooltip>
              )}
            </Group>

            <Tabs defaultValue="invoke" keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab value="invoke" leftSection={<IconPlayerPlay size={14} />}>
                  Invoke
                </Tabs.Tab>
                {selected.bot && (
                  <Tabs.Tab value="logs" leftSection={<IconHistory size={14} />}>
                    Logs
                  </Tabs.Tab>
                )}
                {selected.bot && (
                  <Tabs.Tab value="code" leftSection={<IconCode size={14} />}>
                    Code
                  </Tabs.Tab>
                )}
              </Tabs.List>

              <Tabs.Panel value="invoke" pt="md">
                <Stack gap="md">
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
                    background:
                      selected.httpMethod === 'GET'
                        ? 'var(--mantine-color-teal-6)'
                        : 'var(--mantine-color-violet-6)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: '0.05em',
                    flexShrink: 0,
                  }}
                >
                  {selected.httpMethod}
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
                {selected.httpMethod === 'POST' && (
                  <SegmentedControl
                    size="xs"
                    value={rawMode ? 'raw' : 'structured'}
                    onChange={(v) => setRawMode(v === 'raw')}
                    data={[
                      { label: 'Structured', value: 'structured' },
                      { label: 'Raw JSON', value: 'raw' },
                    ]}
                  />
                )}
              </Group>

              {selected.httpMethod === 'POST' && rawMode ? (
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
                  key={selected.operation.id}
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
                <Group gap="md">
                  {lastAuditEventId && (
                    <MedplumLink to={`/AuditEvent/${lastAuditEventId}`}>
                      <Group gap={4}>
                        <Text size="xs">Latest AuditEvent</Text>
                        <IconExternalLink size={12} />
                      </Group>
                    </MedplumLink>
                  )}
                  {botLogsUrl && (
                    <MedplumLink to={botLogsUrl}>
                      <Group gap={4}>
                        <IconHistory size={12} />
                        <Text size="xs">All bot logs</Text>
                      </Group>
                    </MedplumLink>
                  )}
                </Group>
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
              </Tabs.Panel>

              {selected.bot && (
                <Tabs.Panel value="logs" pt="md">
                  <BotLogsPanel bot={selected.bot} />
                </Tabs.Panel>
              )}

              {selected.bot && (
                <Tabs.Panel value="code" pt="md">
                  <BotCodePanel bot={selected.bot} />
                </Tabs.Panel>
              )}
            </Tabs>
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

  const setValue = (name: string, value: string): void => {
    onChange(values.map((v) => (v.name === name ? { ...v, value } : v)));
  };

  return (
    <Stack gap="sm">
      {params.map((param) => (
        <ParameterField
          key={param.name}
          param={param}
          value={values.find((v) => v.name === param.name)?.value ?? ''}
          onChange={(value) => setValue(param.name ?? '', value)}
        />
      ))}
    </Stack>
  );
}

interface ParameterFieldProps {
  param: OperationDefinitionParameter;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Renders the best-fit input primitive for a single operation parameter:
 * a datetime picker for dateTime/instant, the standard reference lookup for
 * references, a numeric input for integer/decimal types, and a plain text input
 * (accepting JSON for complex types) otherwise. All values are normalized to the
 * string representation stored in the invoke form's parameter state.
 */
function ParameterField({ param, value, onChange }: ParameterFieldProps): JSX.Element {
  const required = (param.min ?? 0) > 0;
  const label = param.name ?? '';
  const type = param.type ?? '';
  const description = param.documentation ?? (type ? `Type: ${type}` : undefined);

  if (isReferenceParam(param)) {
    const targetTypes = getReferenceTargetTypes(param);
    return (
      <Input.Wrapper label={label} description={description} required={required}>
        <ReferenceInput
          name={param.name ?? ''}
          required={required}
          targetTypes={targetTypes}
          defaultValue={value ? { reference: value } : undefined}
          onChange={(ref) => onChange(ref?.reference ?? '')}
        />
      </Input.Wrapper>
    );
  }

  if (DATE_TIME_TYPES.has(type)) {
    return (
      <DateTimeInput
        name={param.name ?? ''}
        label={label}
        required={required}
        defaultValue={value || undefined}
        onChange={(v) => onChange(v ?? '')}
      />
    );
  }

  if (NUMERIC_TYPES.has(type)) {
    return (
      <NumberInput
        label={label}
        description={description}
        required={required}
        allowDecimal={type === 'decimal'}
        value={value === '' ? '' : Number(value)}
        onChange={(v) => onChange(v === '' ? '' : String(v))}
      />
    );
  }

  return (
    <TextInput
      label={label}
      description={description}
      required={required}
      placeholder={type || 'string'}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
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
