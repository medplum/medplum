// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  JsonInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { normalizeErrorString, resolveId } from '@medplum/core';
import type {
  AccessPolicy,
  ProjectMembership,
  ProjectMembershipAccess,
  ProjectMembershipAccessParameter,
} from '@medplum/fhirtypes';
import { ResourceInput, useMedplum } from '@medplum/react';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import type { ExplorerOptions, PolicyRowState } from '../lib/rows';
import { makeRow } from '../lib/rows';
import { MembershipPicker } from './MembershipPicker';
import { PolicyJson } from './PolicyJson';

export interface PolicySetPanelProps {
  readonly rows: PolicyRowState[];
  readonly onRowsChange: (rows: PolicyRowState[]) => void;
  readonly options: ExplorerOptions;
  readonly onOptionsChange: (options: ExplorerOptions) => void;
}

export function PolicySetPanel({ rows, onRowsChange, options, onOptionsChange }: PolicySetPanelProps): JSX.Element {
  const medplum = useMedplum();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [pasted, setPasted] = useState('');
  const [inputKey, setInputKey] = useState(0);

  async function loadMembership(membership: ProjectMembership): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      const access: ProjectMembershipAccess[] = [];
      if (membership.accessPolicy) {
        access.push({ policy: membership.accessPolicy });
      }
      access.push(...(membership.access ?? []));
      const policies = await Promise.all(access.map((a) => medplum.readReference(a.policy)));
      onRowsChange(policies.map((policy, i) => makeRow(policy, structuredClone(access[i].parameter ?? []))));
      onOptionsChange({
        ...options,
        profile: membership.profile?.reference ?? '',
        projectId: resolveId(membership.project) ?? options.projectId,
        admin: Boolean(membership.admin),
      });
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(false);
    }
  }

  function addPasted(): void {
    try {
      const parsed = JSON.parse(pasted) as AccessPolicy;
      if (parsed.resourceType !== 'AccessPolicy') {
        throw new Error('JSON must be an AccessPolicy resource');
      }
      // A pasted policy may carry an id, but it's still a draft rather than the stored resource
      onRowsChange([...rows, { ...makeRow(parsed), reference: undefined }]);
      setPasted('');
      setError(undefined);
    } catch (err) {
      setError(normalizeErrorString(err));
    }
  }

  function updateRow(index: number, row: PolicyRowState): void {
    onRowsChange(rows.map((r, i) => (i === index ? row : r)));
  }

  function moveRow(index: number, delta: number): void {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row);
    onRowsChange(next);
  }

  return (
    <Stack>
      <Title order={3}>Policy set</Title>
      <MembershipPicker onSelect={(m) => loadMembership(m).catch(console.error)} />
      {loading && <Text size="sm">Loading policies…</Text>}
      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(undefined)}>
          {error}
        </Alert>
      )}

      {rows.length === 0 && (
        <Text size="sm" c="dimmed">
          No policies. The server treats a membership with no policy as full access to every non-admin type.
        </Text>
      )}
      {rows.map((row, index) => (
        <Card key={row.id} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap" mb={4}>
            <Text fw={600} size="sm">
              {index + 1}. {row.label}
            </Text>
            <Group gap={2} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => moveRow(index, -1)}
              >
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                aria-label="Move down"
                disabled={index === rows.length - 1}
                onClick={() => moveRow(index, 1)}
              >
                <IconArrowDown size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Remove policy"
                onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Group>
          <Text size="xs" c="dimmed" mb={4}>
            {row.reference ?? 'pasted, unsaved'}
            {row.original && ' (edited here, not saved)'} · {row.policy.resource?.length ?? 0} resource entries
            {row.policy.compartment?.reference && ` · compartment ${row.policy.compartment.reference}`}
          </Text>
          <ParameterEditor
            parameters={row.parameters}
            onChange={(parameters) => updateRow(index, { ...row, parameters })}
          />
          <PolicyJson row={row} onChange={(next) => updateRow(index, next)} />
        </Card>
      ))}

      <ResourceInput<AccessPolicy>
        key={`policy-${inputKey}`}
        resourceType="AccessPolicy"
        name="policy"
        label="Add a stored policy"
        placeholder="Search access policies"
        onChange={(policy) => {
          if (policy) {
            onRowsChange([...rows, makeRow(policy)]);
            setInputKey((k) => k + 1);
          }
        }}
      />
      <JsonInput
        label="Or paste a policy to try before saving it"
        placeholder='{ "resourceType": "AccessPolicy", "resource": [ ... ] }'
        value={pasted}
        onChange={setPasted}
        autosize
        minRows={3}
        maxRows={12}
        validationError="Invalid JSON"
      />
      <Button variant="light" leftSection={<IconPlus size={16} />} disabled={!pasted.trim()} onClick={addPasted}>
        Add pasted policy
      </Button>

      <Title order={4}>Membership context</Title>
      <TextInput
        label="Profile"
        description="Fills %profile, and %patient unless a parameter sets it"
        placeholder="Practitioner/123"
        value={options.profile}
        onChange={(e) => onOptionsChange({ ...options, profile: e.currentTarget.value })}
      />
      <TextInput
        label="Project ID"
        description="Used in the project admin rules"
        value={options.projectId}
        onChange={(e) => onOptionsChange({ ...options, projectId: e.currentTarget.value })}
      />
      <Checkbox
        label="Project admin"
        checked={options.admin}
        onChange={(e) => onOptionsChange({ ...options, admin: e.currentTarget.checked })}
      />
      <Checkbox
        label="Make Bot.system read-only (all non-super-admin projects)"
        checked={options.botSystemReadonly}
        onChange={(e) => onOptionsChange({ ...options, botSystemReadonly: e.currentTarget.checked })}
      />
    </Stack>
  );
}

function ParameterEditor({
  parameters,
  onChange,
}: {
  readonly parameters: ProjectMembershipAccessParameter[];
  readonly onChange: (parameters: ProjectMembershipAccessParameter[]) => void;
}): JSX.Element {
  function update(index: number, name: string, kind: string, value: string): void {
    const param: ProjectMembershipAccessParameter =
      kind === 'reference' ? { name, valueReference: { reference: value } } : { name, valueString: value };
    onChange(parameters.map((p, i) => (i === index ? param : p)));
  }

  return (
    <Stack gap={4}>
      {parameters.map((p, index) => {
        const kind = p.valueString !== undefined ? 'string' : 'reference';
        const value = p.valueString ?? p.valueReference?.reference ?? '';
        return (
          <Group key={index} gap={4} wrap="nowrap">
            <TextInput
              size="xs"
              aria-label="Parameter name"
              leftSection="%"
              value={p.name}
              onChange={(e) => update(index, e.currentTarget.value, kind, value)}
              w={110}
            />
            <Select
              size="xs"
              aria-label="Parameter type"
              data={['reference', 'string']}
              value={kind}
              onChange={(k) => update(index, p.name, k ?? 'reference', value)}
              w={100}
              allowDeselect={false}
            />
            <TextInput
              size="xs"
              aria-label="Parameter value"
              value={value}
              onChange={(e) => update(index, p.name, kind, e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Remove parameter"
              onClick={() => onChange(parameters.filter((_, i) => i !== index))}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        );
      })}
      <Button
        size="compact-xs"
        variant="subtle"
        leftSection={<IconPlus size={12} />}
        onClick={() => onChange([...parameters, { name: '', valueReference: { reference: '' } }])}
        style={{ alignSelf: 'flex-start' }}
      >
        Add parameter
      </Button>
    </Stack>
  );
}
