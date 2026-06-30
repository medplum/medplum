// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { AgentSettingDef, AgentSettingsSchema } from '@medplum/core';
import { fetchAgentSettingsSchema, fetchLatestVersionString, normalizeErrorString } from '@medplum/core';
import type { Agent, AgentSetting, AgentSettingValue, Parameters } from '@medplum/fhirtypes';
import { Document, Loading, useMedplum } from '@medplum/react';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

type SettingValues = Record<string, AgentSettingValue | undefined>;

// Reads the value out of a stored AgentSetting, independent of any schema (used to seed the form so
// values survive switching the schema version, and so settings unknown to the selected schema are kept).
function readRawValue(setting: AgentSetting): AgentSettingValue | undefined {
  if (setting.valueBoolean !== undefined) {
    return setting.valueBoolean;
  }
  if (setting.valueInteger !== undefined) {
    return setting.valueInteger;
  }
  if (setting.valueDecimal !== undefined) {
    return setting.valueDecimal;
  }
  if (setting.valueString !== undefined) {
    return setting.valueString;
  }
  return undefined;
}

// A setting is visible only when ALL of its `visibleWhen` conditions hold against the current values.
function isVisible(def: AgentSettingDef, values: SettingValues): boolean {
  if (!def.visibleWhen?.length) {
    return true;
  }
  return def.visibleWhen.every((cond) => values[cond.setting] === cond.equals);
}

// Converts the edited values back into an `AgentSetting[]`. Settings the selected schema does not know
// about are preserved as-is, so validating against an older schema can never drop newer settings.
function toAgentSettings(schema: AgentSettingsSchema, values: SettingValues, agent: Agent): AgentSetting[] {
  const managed = new Set(schema.settings.map((s) => s.name));
  const result: AgentSetting[] = (agent.setting ?? []).filter((s) => !managed.has(s.name));
  for (const def of schema.settings) {
    if (!isVisible(def, values)) {
      continue;
    }
    const value = values[def.name];
    if (value === undefined || value === '') {
      continue;
    }
    switch (def.type) {
      case 'boolean':
        result.push({ name: def.name, valueBoolean: value as boolean });
        break;
      case 'integer':
        result.push({ name: def.name, valueInteger: value as number });
        break;
      case 'decimal':
        result.push({ name: def.name, valueDecimal: value as number });
        break;
      case 'string':
        result.push({ name: def.name, valueString: value as string });
        break;
    }
  }
  return result;
}

function SettingInput(props: {
  readonly def: AgentSettingDef;
  readonly value: AgentSettingValue | undefined;
  readonly onChange: (value: AgentSettingValue | undefined) => void;
}): JSX.Element {
  const { def, value, onChange } = props;
  const placeholder = def.default !== undefined ? String(def.default) : undefined;

  if (def.type === 'boolean') {
    return (
      <Checkbox
        label={def.label}
        description={def.description}
        checked={Boolean(value ?? def.default)}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    );
  }

  if (def.options?.length) {
    return (
      <Select
        label={def.label}
        description={def.description}
        required={def.required}
        placeholder={placeholder}
        data={def.options.map((o) => ({ value: String(o.value), label: o.label ?? String(o.value) }))}
        value={value !== undefined ? String(value) : null}
        onChange={(v) => onChange(v === null ? undefined : coerce(def, v))}
      />
    );
  }

  if (def.type === 'integer' || def.type === 'decimal') {
    return (
      <NumberInput
        label={def.label}
        description={def.description}
        required={def.required}
        placeholder={placeholder}
        min={def.min}
        max={def.max}
        step={def.step ?? (def.type === 'integer' ? 1 : undefined)}
        allowDecimal={def.type === 'decimal'}
        value={value === undefined ? '' : (value as number)}
        onChange={(v) => onChange(v === '' ? undefined : Number(v))}
      />
    );
  }

  return (
    <TextInput
      label={def.label}
      description={def.description}
      required={def.required}
      placeholder={placeholder}
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.currentTarget.value || undefined)}
    />
  );
}

// Coerces a string value (from a Select) back to the setting's declared type.
function coerce(def: AgentSettingDef, raw: string): AgentSettingValue {
  switch (def.type) {
    case 'boolean':
      return raw === 'true';
    case 'integer':
    case 'decimal':
      return Number(raw);
    default:
      return raw;
  }
}

export function AgentConfigPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };

  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<Agent>();
  const [values, setValues] = useState<SettingValues>({});
  const [agentVersion, setAgentVersion] = useState<string>();
  const [latestVersion, setLatestVersion] = useState<string>();
  const [selectedVersion, setSelectedVersion] = useState<string>();

  const [schema, setSchema] = useState<AgentSettingsSchema>();
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);

  // Phase 1: load the Agent resource, resolve its running version ($status), and fetch the latest
  // released version. Seed the form values from the resource, and default the schema version to the
  // agent's version (falling back to latest when the agent version is unknown).
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      const loadedAgent = await medplum.readResource('Agent', id);
      if (cancelled) {
        return;
      }
      setAgent(loadedAgent);
      const initial: SettingValues = {};
      for (const setting of loadedAgent.setting ?? []) {
        initial[setting.name] = readRawValue(setting);
      }
      setValues(initial);

      const [statusResult, latestResult] = await Promise.allSettled([
        medplum.get(medplum.fhirUrl('Agent', id, '$status'), { cache: 'reload' }) as Promise<Parameters>,
        fetchLatestVersionString('app-agent-config'),
      ]);
      if (cancelled) {
        return;
      }

      const resolvedAgentVersion =
        statusResult.status === 'fulfilled'
          ? statusResult.value.parameter?.find((p) => p.name === 'version')?.valueString
          : undefined;
      const resolvedLatest = latestResult.status === 'fulfilled' ? latestResult.value : undefined;
      setAgentVersion(resolvedAgentVersion);
      setLatestVersion(resolvedLatest);

      const usableAgentVersion =
        resolvedAgentVersion && resolvedAgentVersion !== 'unknown' ? resolvedAgentVersion : undefined;
      setSelectedVersion(usableAgentVersion ?? resolvedLatest);
    }

    load()
      .catch((err) => {
        if (!cancelled) {
          showError(normalizeErrorString(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [medplum, id]);

  // Phase 2: (re)fetch the settings schema whenever the selected version changes.
  useEffect(() => {
    let cancelled = false;
    if (!selectedVersion) {
      return undefined;
    }

    async function loadSchema(version: string): Promise<void> {
      setSchemaLoading(true);
      setSchemaError(undefined);
      try {
        const loadedSchema = await fetchAgentSettingsSchema('app-agent-config', version);
        if (!cancelled) {
          setSchema(loadedSchema);
        }
      } catch (_err) {
        if (!cancelled) {
          setSchema(undefined);
          setSchemaError(`No settings schema is published for agent version ${version}.`);
        }
      } finally {
        if (!cancelled) {
          setSchemaLoading(false);
        }
      }
    }

    loadSchema(selectedVersion).catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selectedVersion]);

  const setValue = useCallback((name: string, value: AgentSettingValue | undefined) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Dropdown options: the agent's version and the latest released version, deduped, each tagged.
  const versionOptions = useMemo(() => {
    const tags = new Map<string, string[]>();
    const addTag = (version: string | undefined, tag: string): void => {
      if (version && version !== 'unknown') {
        const existing = tags.get(version) ?? [];
        existing.push(tag);
        tags.set(version, existing);
      }
    };
    addTag(agentVersion, 'agent');
    addTag(latestVersion, 'latest');
    return [...tags.entries()].map(([value, ts]) => ({ value, label: `${value} (${ts.join(', ')})` }));
  }, [agentVersion, latestVersion]);

  const grouped = useMemo(() => {
    const groups = new Map<string, AgentSettingDef[]>();
    for (const def of schema?.settings ?? []) {
      const category = def.category ?? 'General';
      const list = groups.get(category) ?? [];
      list.push(def);
      groups.set(category, list);
    }
    return [...groups.entries()];
  }, [schema]);

  const handleSave = useCallback(() => {
    if (!schema || !agent) {
      return;
    }
    setSaving(true);
    medplum
      .updateResource<Agent>({ ...agent, setting: toAgentSettings(schema, values, agent) })
      .then((updated) => {
        setAgent(updated);
        showNotification({
          color: 'green',
          title: 'Success',
          icon: <IconCheck size="1rem" />,
          message: 'Agent settings saved. Use Reload Config to apply them to the running agent.',
        });
      })
      .catch((err) => showError(normalizeErrorString(err)))
      .finally(() => setSaving(false));
  }, [medplum, agent, schema, values]);

  // Applies the saved Agent resource to the running agent. Kept as a deliberate, manual action (not
  // automatic on save) so operators control when a config change takes effect on the live agent.
  const handleReloadConfig = useCallback(() => {
    setReloading(true);
    medplum
      .get(medplum.fhirUrl('Agent', id, '$reload-config'), { cache: 'reload' })
      .then(() => {
        showNotification({
          color: 'green',
          title: 'Success',
          icon: <IconCheck size="1rem" />,
          message: 'Agent config reloaded successfully.',
        });
      })
      .catch((err) => showError(normalizeErrorString(err)))
      .finally(() => setReloading(false));
  }, [medplum, id]);

  if (loading) {
    return <Loading />;
  }

  const noVersions = versionOptions.length === 0;

  return (
    <Document>
      <Title order={1}>Agent Configuration</Title>
      <Text c="dimmed" size="sm" mb="md">
        {agentVersion && agentVersion !== 'unknown'
          ? `Agent reports version ${agentVersion}.`
          : 'Could not determine the running agent version.'}
      </Text>

      {noVersions ? (
        <Alert color="yellow" icon={<IconAlertCircle size="1rem" />} title="Settings editor unavailable">
          Could not determine an agent or latest version to load a settings schema for. Edit settings directly on the{' '}
          <Anchor component={Link} to={`/Agent/${id}/edit`}>
            Edit tab
          </Anchor>
          .
        </Alert>
      ) : (
        <Stack gap="lg">
          <Select
            label="Schema version"
            description="The agent version whose settings schema is used to validate and render this form."
            data={versionOptions}
            value={selectedVersion ?? null}
            allowDeselect={false}
            onChange={(v) => v && setSelectedVersion(v)}
            maw={320}
          />

          {schemaLoading && <Loader size="sm" />}

          {!schemaLoading && schemaError && (
            <Alert color="yellow" icon={<IconAlertCircle size="1rem" />} title="No schema for this version">
              {schemaError} Select a different version, or edit settings on the{' '}
              <Anchor component={Link} to={`/Agent/${id}/edit`}>
                Edit tab
              </Anchor>
              .
            </Alert>
          )}

          {!schemaLoading &&
            schema &&
            grouped.map(([category, defs]) => {
              const visibleDefs = defs.filter((def) => isVisible(def, values));
              if (!visibleDefs.length) {
                return null;
              }
              return (
                <div key={category}>
                  <Title order={3} mb="sm">
                    {category}
                  </Title>
                  <Stack gap="sm">
                    {visibleDefs.map((def) => (
                      <SettingInput
                        key={def.name}
                        def={def}
                        value={values[def.name]}
                        onChange={(v) => setValue(def.name, v)}
                      />
                    ))}
                  </Stack>
                </div>
              );
            })}

          {!schemaLoading && schema && (
            <>
              <Divider />
              <Group>
                <Button onClick={handleSave} loading={saving} disabled={reloading} aria-label="Save settings">
                  Save Settings
                </Button>
                <Button
                  variant="default"
                  onClick={handleReloadConfig}
                  loading={reloading}
                  disabled={saving}
                  aria-label="Reload config"
                >
                  Reload Config
                </Button>
              </Group>
              <Text c="dimmed" size="xs">
                Save writes the settings to the Agent resource. Reload Config applies the saved settings to the running
                agent.
              </Text>
            </>
          )}
        </Stack>
      )}
    </Document>
  );
}

function showError(message: string): void {
  showNotification({ color: 'red', title: 'Error', message, autoClose: false });
}
