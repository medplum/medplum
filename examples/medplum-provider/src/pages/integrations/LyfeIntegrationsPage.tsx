// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useMedplum } from '@medplum/react';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleOff,
  IconLock,
  IconNetwork,
  IconPlugConnected,
  IconRefresh,
  IconSettings,
  IconStethoscope,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LyfePageHeader } from '../../components/brand/LyfePageHeader';
import type {
  IntegrationActionResult,
  IntegrationConnectionStatus,
  IntegrationId,
  IntegrationStatus,
  IntegrationsSnapshot,
} from '../../services/integrations';
import {
  IntegrationsBackendUnavailableError,
  getIntegrationStatus,
  saveIntegrationCredentials,
  testIntegration,
} from '../../services/integrations';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

/** Uppercase micro-label, matching the Lyfe roster's filter labels. */
const MICRO_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  color: 'var(--mantine-color-gray-5)',
} as const;

interface FieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly description?: string;
}

interface IntegrationDefinition {
  readonly id: IntegrationId;
  readonly name: string;
  readonly vendor: string;
  readonly description: string;
  readonly icon: ReactNode;
  /** Non-secret settings — shown on the card and editable in the modal. */
  readonly configFields: readonly FieldDefinition[];
  /** Write-only credentials — never rendered back, only ever "configured" or not. */
  readonly secretFields: readonly FieldDefinition[];
}

/**
 * What each integration is and which settings it takes. Kept here rather than in
 * the service because it is presentation: labels, order and help text.
 */
const CATALOG: readonly IntegrationDefinition[] = [
  {
    id: 'drchrono',
    name: 'DrChrono',
    vendor: 'EHR · OAuth 2.0',
    description:
      'Sync patients, appointments and clinical notes from the clinic’s DrChrono practice. Requires an OAuth application registered in the DrChrono developer portal.',
    icon: <IconStethoscope size={20} />,
    configFields: [{ key: 'apiUrl', label: 'API URL', placeholder: 'https://drchrono.com/api' }],
    secretFields: [
      { key: 'clientId', label: 'Client ID', description: 'From the DrChrono API management page.' },
      { key: 'clientSecret', label: 'Client secret' },
      { key: 'refreshToken', label: 'Refresh token', description: 'Issued by the OAuth authorization step.' },
    ],
  },
  {
    id: 'zus',
    name: 'Lyfe Data Network (ZUS)',
    vendor: 'Health data network · FHIR R4',
    description:
      'Bidirectional record exchange across the Lyfe Data Network. Pulls the longitudinal record for a patient and pushes encounters back as FHIR R4.',
    icon: <IconNetwork size={20} />,
    configFields: [
      { key: 'apiUrl', label: 'API URL', placeholder: 'https://api.zusapi.com' },
      { key: 'builderId', label: 'Builder ID', placeholder: 'builder-...' },
      { key: 'packageId', label: 'Package ID', placeholder: 'package-...' },
      { key: 'practitionerNpi', label: 'Practitioner NPI', placeholder: '1234567890' },
      { key: 'practiceName', label: 'Practice name', placeholder: 'Lyfe Health Clinic' },
    ],
    secretFields: [
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client secret' },
    ],
  },
];

const STATUS_DISPLAY: Record<IntegrationConnectionStatus, { readonly label: string; readonly color: string }> = {
  connected: { label: 'Connected', color: 'green' },
  'not-connected': { label: 'Not connected', color: 'gray' },
  error: { label: 'Error', color: 'red' },
};

interface StatusBadgeProps {
  readonly status: IntegrationConnectionStatus;
}

/**
 * The coloured connection pill shown beside an integration's name.
 * @param props - Component props.
 * @param props.status - The connection state to render.
 * @returns The status badge.
 */
function StatusBadge(props: StatusBadgeProps): JSX.Element {
  const display = STATUS_DISPLAY[props.status];
  return (
    <Badge variant="light" color={display.color} radius="sm" size="sm" style={{ fontWeight: 600 }}>
      {display.label}
    </Badge>
  );
}

interface ConfigRowProps {
  readonly label: string;
  readonly value?: string;
}

/**
 * One non-secret setting: an uppercase label above its value, or a muted
 * placeholder when the clinic has not set it yet.
 * @param props - Component props.
 * @param props.label - The setting's display name.
 * @param props.value - The configured value, if any.
 * @returns The label/value pair.
 */
function ConfigRow(props: ConfigRowProps): JSX.Element {
  return (
    <Box style={{ minWidth: 0 }}>
      <Text style={MICRO_LABEL}>{props.label.toUpperCase()}</Text>
      <Text size="sm" c={props.value ? 'gray.8' : 'gray.4'} style={{ wordBreak: 'break-all' }}>
        {props.value ?? 'Not set'}
      </Text>
    </Box>
  );
}

interface SecretRowProps {
  readonly label: string;
  readonly configured: boolean;
}

/**
 * A credential's state. The value itself is never sent to the browser, so this
 * only ever renders a masked "configured" marker or "Not configured".
 * @param props - Component props.
 * @param props.label - The credential's display name.
 * @param props.configured - Whether the backend holds a value for it.
 * @returns The masked credential row.
 */
function SecretRow(props: SecretRowProps): JSX.Element {
  return (
    <Group gap={6} wrap="nowrap">
      <IconLock size={13} color="var(--mantine-color-gray-4)" />
      <Text size="sm" c="gray.6" style={{ whiteSpace: 'nowrap' }}>
        {props.label}
      </Text>
      <Text size="sm" c={props.configured ? 'gray.8' : 'gray.4'} fw={props.configured ? 600 : 400}>
        {props.configured ? '•••• configured' : 'Not configured'}
      </Text>
    </Group>
  );
}

interface IntegrationCardProps {
  readonly definition: IntegrationDefinition;
  readonly status: IntegrationStatus;
  readonly testing: boolean;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly result?: IntegrationActionResult;
  readonly onConfigure: (id: IntegrationId) => void;
  readonly onTest: (id: IntegrationId) => void;
}

/**
 * One integration, as a card: status, non-secret configuration, masked
 * credential state, and the Configure / Test connection actions.
 * @param props - Component props.
 * @param props.definition - Static description of the integration and its fields.
 * @param props.status - The backend's reported status and configuration.
 * @param props.testing - Whether a connection test is currently running.
 * @param props.disabled - Whether the actions are unavailable (no backend).
 * @param props.disabledReason - Tooltip explaining why the actions are unavailable.
 * @param props.result - The most recent test result to display inline.
 * @param props.onConfigure - Called with the integration id to open its form.
 * @param props.onTest - Called with the integration id to run a connection test.
 * @returns The integration card.
 */
function IntegrationCard(props: IntegrationCardProps): JSX.Element {
  const { definition, status } = props;

  return (
    <Paper shadow="xs" radius="md" p="md" style={{ border: '1px solid var(--mantine-color-gray-2)' }}>
      <Stack gap="md" h="100%">
        <Group align="flex-start" gap="md" wrap="nowrap">
          <Box
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 'var(--mantine-radius-md)',
              background: 'var(--mantine-color-primary-0)',
              color: 'var(--mantine-primary-color-filled)',
            }}
          >
            {definition.icon}
          </Box>
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Group gap="sm" align="center" wrap="nowrap">
              <Text fw={600} size="md" c="gray.9" style={{ lineHeight: 1.3 }}>
                {definition.name}
              </Text>
              <StatusBadge status={status.status} />
            </Group>
            <Text style={MICRO_LABEL}>{definition.vendor.toUpperCase()}</Text>
          </Stack>
        </Group>

        <Text size="sm" c="gray.6" style={{ lineHeight: 1.6 }}>
          {definition.description}
        </Text>

        {status.status === 'error' && status.message && (
          <Alert
            variant="light"
            color="red"
            radius="md"
            icon={<IconAlertTriangle size={16} />}
            title="Last check failed"
          >
            <Text size="sm">{status.message}</Text>
          </Alert>
        )}

        <Box
          p="md"
          style={{
            border: '1px solid var(--mantine-color-gray-2)',
            borderRadius: 'var(--mantine-radius-md)',
            background: 'var(--mantine-color-gray-0)',
          }}
        >
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" verticalSpacing="sm">
              {definition.configFields.map((field) => (
                <ConfigRow key={field.key} label={field.label} value={status.config[field.key]} />
              ))}
            </SimpleGrid>

            <Divider color="var(--mantine-color-gray-2)" />

            <Stack gap={4}>
              {definition.secretFields.map((field) => (
                <SecretRow
                  key={field.key}
                  label={field.label}
                  configured={status.configuredSecrets.includes(field.key)}
                />
              ))}
            </Stack>
          </Stack>
        </Box>

        {props.result && (
          <Alert
            variant="light"
            color={props.result.ok ? 'green' : 'red'}
            radius="md"
            icon={props.result.ok ? <IconCircleCheck size={16} /> : <IconCircleOff size={16} />}
          >
            <Text size="sm">{props.result.message}</Text>
          </Alert>
        )}

        <Group gap="xs" mt="auto">
          <Tooltip label={props.disabledReason} disabled={!props.disabled} withArrow>
            <Button
              radius="md"
              leftSection={<IconSettings size={16} />}
              data-disabled={props.disabled || undefined}
              disabled={props.disabled}
              onClick={() => props.onConfigure(definition.id)}
            >
              Configure
            </Button>
          </Tooltip>
          <Tooltip label={props.disabledReason} disabled={!props.disabled} withArrow>
            <Button
              variant="default"
              radius="md"
              leftSection={<IconPlugConnected size={16} />}
              loading={props.testing}
              disabled={props.disabled}
              onClick={() => props.onTest(definition.id)}
            >
              Test connection
            </Button>
          </Tooltip>
        </Group>
      </Stack>
    </Paper>
  );
}

interface ConfigureModalProps {
  readonly definition: IntegrationDefinition;
  readonly status: IntegrationStatus;
  readonly saving: boolean;
  readonly onClose: () => void;
  readonly onSave: (config: Record<string, string>, secrets: Record<string, string>) => void;
}

/**
 * The credential form. Non-secret settings are pre-filled from the backend;
 * secret fields always start empty, because the backend does not return them —
 * leaving one blank keeps whatever is already stored.
 * @param props - Component props.
 * @param props.definition - Static description of the integration and its fields.
 * @param props.status - The current status, used to pre-fill non-secret settings.
 * @param props.saving - Whether a save is in flight.
 * @param props.onClose - Called when the modal should close.
 * @param props.onSave - Called with the non-secret config and the secrets being set.
 * @returns The configuration modal.
 */
function ConfigureModal(props: ConfigureModalProps): JSX.Element {
  const { definition, status } = props;

  const [config, setConfig] = useState<Record<string, string>>(() =>
    Object.fromEntries(definition.configFields.map((field) => [field.key, status.config[field.key] ?? '']))
  );
  const [secrets, setSecrets] = useState<Record<string, string>>(() =>
    Object.fromEntries(definition.secretFields.map((field) => [field.key, '']))
  );

  const submit = useCallback((): void => {
    // Only non-empty secrets are sent; an untouched field must not blank out a
    // credential the clinic already has stored.
    const changedSecrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(secrets)) {
      if (value.trim() !== '') {
        changedSecrets[key] = value.trim();
      }
    }
    props.onSave(config, changedSecrets);
  }, [config, secrets, props]);

  return (
    <Modal
      opened
      onClose={props.onClose}
      radius="md"
      size="lg"
      title={
        <Group gap="xs">
          <IconSettings size={18} color="var(--mantine-primary-color-filled)" />
          <Text fw={600} c="gray.9">
            Configure {definition.name}
          </Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm" c="gray.6" style={{ lineHeight: 1.6 }}>
          Credentials are stored on the server and never sent back to this page. Leave a credential blank to keep the
          value that is already stored.
        </Text>

        <Stack gap="sm">
          <Text style={MICRO_LABEL}>SETTINGS</Text>
          {definition.configFields.map((field) => (
            <TextInput
              key={field.key}
              label={field.label}
              description={field.description}
              placeholder={field.placeholder}
              radius="md"
              value={config[field.key] ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.currentTarget.value }))}
            />
          ))}
        </Stack>

        <Divider color="var(--mantine-color-gray-2)" />

        <Stack gap="sm">
          <Text style={MICRO_LABEL}>CREDENTIALS</Text>
          {definition.secretFields.map((field) => (
            <PasswordInput
              key={field.key}
              label={field.label}
              description={field.description}
              radius="md"
              autoComplete="new-password"
              placeholder={
                status.configuredSecrets.includes(field.key)
                  ? '•••• configured — leave blank to keep'
                  : 'Not configured'
              }
              value={secrets[field.key] ?? ''}
              onChange={(e) => setSecrets((s) => ({ ...s, [field.key]: e.currentTarget.value }))}
            />
          ))}
        </Stack>

        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="default" radius="md" onClick={props.onClose} disabled={props.saving}>
            Cancel
          </Button>
          <Button radius="md" loading={props.saving} onClick={submit}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * The clinic's integrations settings: DrChrono and the Lyfe Data Network (ZUS),
 * each with its connection status, non-secret configuration, a write-only
 * credential form and a live connection test.
 *
 * Every call goes through `services/integrations`, which degrades to a
 * "backend not yet deployed" state when the bot behind it is missing, so this
 * page renders even against a project where nothing has been deployed yet.
 * @returns The integrations settings page.
 */
export function LyfeIntegrationsPage(): JSX.Element {
  const medplum = useMedplum();

  const [snapshot, setSnapshot] = useState<IntegrationsSnapshot>();
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [configuring, setConfiguring] = useState<IntegrationId>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<IntegrationId>();
  const [results, setResults] = useState<Partial<Record<IntegrationId, IntegrationActionResult>>>({});

  // `loading` is raised by whoever asks for a reload rather than here, so the
  // effect never sets state synchronously during a render pass.
  useEffect(() => {
    let cancelled = false;
    getIntegrationStatus(medplum)
      .then((next) => {
        if (!cancelled) {
          setSnapshot(next);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [medplum, reloadKey]);

  const reload = useCallback((): void => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const statuses = useMemo(() => {
    const byId = new Map<IntegrationId, IntegrationStatus>();
    for (const status of snapshot?.integrations ?? []) {
      byId.set(status.id, status);
    }
    return byId;
  }, [snapshot]);

  const backendAvailable = snapshot?.backendAvailable === true;

  /** Fold one action's refreshed status back into the snapshot in place. */
  const applyStatus = useCallback((updated: IntegrationStatus): void => {
    setSnapshot((current) =>
      current
        ? { ...current, integrations: current.integrations.map((s) => (s.id === updated.id ? updated : s)) }
        : current
    );
  }, []);

  const handleTest = useCallback(
    (id: IntegrationId): void => {
      setTesting(id);
      setResults((r) => ({ ...r, [id]: undefined }));
      testIntegration(medplum, id)
        .then((result) => {
          setResults((r) => ({ ...r, [id]: result }));
          if (result.status) {
            applyStatus(result.status);
          }
        })
        .catch((err: unknown) => {
          if (err instanceof IntegrationsBackendUnavailableError) {
            setSnapshot((current) =>
              current ? { ...current, backendAvailable: false, backendMessage: err.message } : current
            );
          }
          showErrorNotification(err);
        })
        .finally(() => setTesting(undefined));
    },
    [medplum, applyStatus]
  );

  const handleSave = useCallback(
    (id: IntegrationId, config: Record<string, string>, secrets: Record<string, string>): void => {
      setSaving(true);
      saveIntegrationCredentials(medplum, { id, config, secrets })
        .then((result) => {
          if (result.status) {
            applyStatus(result.status);
          } else {
            reload();
          }
          setConfiguring(undefined);
          showSuccessNotification({ title: 'Integration updated', message: result.message });
        })
        .catch((err: unknown) => {
          if (err instanceof IntegrationsBackendUnavailableError) {
            setSnapshot((current) =>
              current ? { ...current, backendAvailable: false, backendMessage: err.message } : current
            );
          }
          showErrorNotification(err);
        })
        .finally(() => setSaving(false));
    },
    [medplum, applyStatus, reload]
  );

  const activeDefinition = CATALOG.find((entry) => entry.id === configuring);
  const activeStatus = configuring ? statuses.get(configuring) : undefined;

  const connectedCount = CATALOG.filter((entry) => statuses.get(entry.id)?.status === 'connected').length;

  return (
    <Stack gap="md" m="xs">
      <LyfePageHeader
        icon={<IconPlugConnected size={20} />}
        eyebrow="Settings"
        title="Integrations"
        count={loading ? undefined : connectedCount}
        description="Connect this clinic to the systems it already runs on. Credentials are stored server-side and never shown again."
        actions={
          <Button
            variant="default"
            radius="md"
            leftSection={<IconRefresh size={16} />}
            loading={loading}
            onClick={reload}
          >
            Refresh
          </Button>
        }
      />

      {!loading && !backendAvailable && (
        <Alert
          variant="light"
          color="yellow"
          radius="md"
          icon={<IconAlertTriangle size={18} />}
          title="Integrations backend not yet deployed"
        >
          <Stack gap={4}>
            <Text size="sm">
              The{' '}
              <Text span ff="monospace">
                lyfe-integrations
              </Text>{' '}
              bot was not found in this project, so saved settings cannot be read or written yet. The page below shows
              the configuration each integration expects.
            </Text>
            {snapshot?.backendMessage && (
              <Text size="xs" c="gray.5">
                {snapshot.backendMessage}
              </Text>
            )}
          </Stack>
        </Alert>
      )}

      {loading && !snapshot ? (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Skeleton height={340} radius="md" />
          <Skeleton height={340} radius="md" />
        </SimpleGrid>
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          {CATALOG.map((definition) => (
            <IntegrationCard
              key={definition.id}
              definition={definition}
              status={
                statuses.get(definition.id) ?? {
                  id: definition.id,
                  status: 'not-connected',
                  config: {},
                  configuredSecrets: [],
                }
              }
              testing={testing === definition.id}
              disabled={!backendAvailable}
              disabledReason="Requires the integrations backend to be deployed."
              result={results[definition.id]}
              onConfigure={setConfiguring}
              onTest={handleTest}
            />
          ))}
        </SimpleGrid>
      )}

      {loading && snapshot && (
        <Group gap="xs" justify="center">
          <Loader size="xs" />
          <Text size="sm" c="gray.5">
            Refreshing…
          </Text>
        </Group>
      )}

      {activeDefinition && activeStatus && (
        <ConfigureModal
          key={activeDefinition.id}
          definition={activeDefinition}
          status={activeStatus}
          saving={saving}
          onClose={() => setConfiguring(undefined)}
          onSave={(config, secrets) => handleSave(activeDefinition.id, config, secrets)}
        />
      )}
    </Stack>
  );
}
