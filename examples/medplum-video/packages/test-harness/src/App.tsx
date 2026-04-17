// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { JSX } from 'react';
import {
  MantineProvider,
  createTheme,
  AppShell,
  Group,
  Stack,
  Paper,
  Title,
  TextInput,
  Button,
  Badge,
  Divider,
  Text,
  Alert,
  Center,
  Loader,
  ScrollArea,
  CopyButton,
  ActionIcon,
  Tooltip,
  Anchor,
} from '@mantine/core';
import '@mantine/core/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider, ResourceInput, SignInForm, useMedplum, useMedplumProfile } from '@medplum/react';
import '@medplum/react/styles.css';
import type { Encounter, Patient, Practitioner } from '@medplum/fhirtypes';
import { BrowserRouter, Routes, Route, useParams, Link, useNavigate } from 'react-router';
import { VideoRoom, useVideoVisit } from '@medplum-video/react';

import { config, resolveMedplumBaseUrl } from './config';

// ─── Config ──────────────────────────────────────────────────────────
const BASE_URL = resolveMedplumBaseUrl();

const BOT = {
  generateToken: config.generateTokenBotId,
  admitPatient: config.admitPatientBotId,
  startAdHocVisit: config.startAdHocVisitBotId,
};

const theme = createTheme({ primaryColor: 'blue' });

// Shared MedplumClient for dashboard & provider (requires interactive login)
const dashboardClient = new MedplumClient({
  baseUrl: BASE_URL,
  onUnauthenticated: () => console.log('Not authenticated'),
});

// ─── Helpers ─────────────────────────────────────────────────────────
function encounterColor(status?: string): string {
  switch (status) {
    case 'planned':
    case 'arrived':
      return 'blue';
    case 'in-progress':
      return 'green';
    case 'finished':
    case 'cancelled':
      return 'gray';
    default:
      return 'violet';
  }
}

function waitingColor(status?: string): string {
  switch (status) {
    case 'waiting':
      return 'orange';
    case 'admitted':
      return 'green';
    default:
      return 'gray';
  }
}

function buildUrl(path: string): string {
  return `${globalThis.location.protocol}//${globalThis.location.host}${path}`;
}

function envBadgeColor(label?: string): string {
  switch (label) {
    case 'prod':
    case 'production':
      return 'red';
    case 'staging':
      return 'orange';
    case 'dev':
    case 'development':
      return 'blue';
    default:
      return 'gray';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Dashboard Page  (/)
// ═══════════════════════════════════════════════════════════════════════
function DashboardPage(): JSX.Element {
  const profile = useMedplumProfile();
  if (!profile) {
    return (
      <Center mih="100vh">
        <Paper p="xl" maw={420} w="100%" withBorder shadow="sm" radius="md">
          <Title order={3} mb="md" ta="center">
            Video Visit — Test Harness
          </Title>
          {config.environmentLabel && (
            <Center mb="sm">
              <Badge color={envBadgeColor(config.environmentLabel)} radius="sm">
                {config.environmentLabel}
              </Badge>
            </Center>
          )}
          <SignInForm onSuccess={() => globalThis.location.reload()} />
        </Paper>
      </Center>
    );
  }
  return <Dashboard />;
}

function Dashboard(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { startAdHocVisit } = useVideoVisit('', BOT.generateToken, BOT.admitPatient, BOT.startAdHocVisit);

  // ── Selected participants (drive the Create Ad-Hoc button) ──────────
  const [patient, setPatient] = useState<Patient | undefined>(undefined);
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>(undefined);
  const [seedLoaded, setSeedLoaded] = useState(false);

  const [encounterId, setEncounterId] = useState('');
  const [activeEncounter, setActiveEncounter] = useState<string | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-49), `${new Date().toLocaleTimeString()} ${msg}`]);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  // Seed the selectors with the configured defaults (only once on mount).
  useEffect(() => {
    if (seedLoaded) return;
    const seed = async (): Promise<void> => {
      try {
        if (config.defaultPatientId) {
          const p = await medplum.readResource('Patient', config.defaultPatientId, { cache: 'force-cache' });
          setPatient(p);
        }
        if (config.defaultPractitionerId) {
          const p = await medplum.readResource('Practitioner', config.defaultPractitionerId, { cache: 'force-cache' });
          setPractitioner(p);
        }
      } catch {
        /* optional seed – ignore if the defaults don't exist in this project */
      } finally {
        setSeedLoaded(true);
      }
    };
    seed();
  }, [medplum, seedLoaded]);

  // Poll encounter state
  useEffect(() => {
    if (!activeEncounter) return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const enc = await medplum.readResource('Encounter', activeEncounter, { cache: 'no-cache' });
        if (!cancelled) setEncounter(enc);
      } catch {
        /* ignore */
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeEncounter, medplum]);

  const waitingStatus = encounter?.extension?.find((e) => e.url?.endsWith('waiting-room-status'))?.valueCode;

  const handleCreateAdHoc = async (): Promise<void> => {
    if (!patient?.id || !practitioner?.id) {
      addLog('ERROR: select a Patient and a Practitioner first');
      return;
    }
    setBusy('Creating visit…');
    addLog(`Creating ad-hoc visit for ${patient.id} × ${practitioner.id}…`);
    try {
      const enc = await startAdHocVisit(patient.id, practitioner.id, {
        reason: 'Test video visit',
        gracePeriodMinutes: 30,
      });
      if (enc?.id) {
        setActiveEncounter(enc.id);
        setEncounterId(enc.id);
        addLog(`Encounter created: ${enc.id} (status: ${enc.status})`);
      }
    } catch (err: any) {
      addLog(`Create error: ${err.message}`);
    }
    setBusy('');
  };

  const handleLoad = (): void => {
    const id = encounterId.trim();
    if (!id) return;
    setActiveEncounter(id);
    addLog(`Loaded encounter: ${id}`);
  };

  const handleAdmitPatient = async (): Promise<void> => {
    if (!activeEncounter) return;
    setBusy('Admitting…');
    addLog('Admitting patient…');
    try {
      await medplum.executeBot(BOT.admitPatient, { encounterId: activeEncounter }, 'application/json');
      addLog('Patient admitted → in-progress');
    } catch (err: any) {
      addLog(`Admit error: ${err.message}`);
    }
    setBusy('');
  };

  const handleEndVisit = async (): Promise<void> => {
    if (!activeEncounter) return;
    setBusy('Ending…');
    addLog('Ending visit…');
    try {
      const enc = await medplum.readResource('Encounter', activeEncounter);
      await medplum.updateResource({
        ...enc,
        status: 'finished',
        period: { ...enc.period, end: new Date().toISOString() },
      });
      addLog('Encounter finished');
    } catch (err: any) {
      addLog(`End error: ${err.message}`);
    }
    setBusy('');
  };

  const handleReset = (): void => {
    setActiveEncounter(null);
    setEncounter(null);
    setEncounterId('');
    setLog([]);
  };

  const providerUrl = activeEncounter ? `/provider/${activeEncounter}` : '';
  const patientUrl = activeEncounter ? `/patient/${activeEncounter}` : '';

  return (
    <AppShell padding="md" styles={{ main: { background: '#f8f9fa', minHeight: '100vh' } }}>
      <Stack gap="md" maw={900} mx="auto">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <Title order={2}>Video Visit — Control Panel</Title>
            {config.environmentLabel && (
              <Badge color={envBadgeColor(config.environmentLabel)} radius="sm" size="md">
                {config.environmentLabel}
              </Badge>
            )}
          </Group>
          {busy && (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                {busy}
              </Text>
            </Group>
          )}
        </Group>

        {/* ── Participant selectors ───────────────────────────── */}
        <Paper withBorder p="md" radius="md" shadow="xs">
          <Stack gap="sm">
            <Text size="sm" fw={600}>
              Participants
            </Text>
            <Group align="end" gap="md" grow>
              <ResourceInput<Patient>
                resourceType="Patient"
                name="patient"
                label="Patient"
                placeholder="Search patients by name…"
                defaultValue={patient}
                onChange={(value) => setPatient(value ?? undefined)}
              />
              <ResourceInput<Practitioner>
                resourceType="Practitioner"
                name="practitioner"
                label="Practitioner"
                placeholder="Search practitioners by name…"
                defaultValue={practitioner}
                onChange={(value) => setPractitioner(value ?? undefined)}
              />
            </Group>
            <Group gap="xs">
              <Button
                size="sm"
                variant="gradient"
                gradient={{ from: 'blue', to: 'cyan' }}
                onClick={handleCreateAdHoc}
                disabled={!patient?.id || !practitioner?.id}
              >
                Create Ad-Hoc Visit
              </Button>
              {(patient || practitioner) && (
                <Text size="xs" c="dimmed">
                  {patient ? `Patient ${patient.id?.slice(0, 8)}…` : 'No patient'} ·{' '}
                  {practitioner ? `Practitioner ${practitioner.id?.slice(0, 8)}…` : 'No practitioner'}
                </Text>
              )}
            </Group>
          </Stack>
        </Paper>

        {/* ── Create / Load ────────────────────────────────────── */}
        <Paper withBorder p="md" radius="md" shadow="xs">
          <Stack gap="sm">
            <Group gap="md" align="end">
              <TextInput
                label="Or load existing Encounter"
                placeholder="Paste an existing Encounter ID"
                value={encounterId}
                onChange={(e) => setEncounterId(e.currentTarget.value)}
                style={{ flex: 1 }}
                size="sm"
              />
              <Button size="sm" onClick={handleLoad} disabled={!encounterId.trim()}>
                Load
              </Button>
            </Group>

            {/* ── Active encounter controls ───────────────────────── */}
            {activeEncounter && (
              <>
                <Divider />
                <Group gap="xs" wrap="wrap">
                  <Badge size="lg" variant="light" radius="sm" tt="none">
                    {activeEncounter.slice(0, 8)}…
                  </Badge>
                  <Badge size="lg" color={encounterColor(encounter?.status)} radius="sm">
                    {encounter?.status ?? '…'}
                  </Badge>
                  {waitingStatus && (
                    <Badge size="lg" color={waitingColor(waitingStatus)} radius="sm">
                      patient: {waitingStatus}
                    </Badge>
                  )}
                  <Divider orientation="vertical" />
                  <Button size="xs" color="teal" onClick={handleAdmitPatient} disabled={waitingStatus !== 'waiting'}>
                    Admit Patient
                  </Button>
                  <Button
                    size="xs"
                    color="red"
                    variant="outline"
                    onClick={handleEndVisit}
                    disabled={encounter?.status === 'finished'}
                  >
                    End Visit
                  </Button>
                  <Button size="xs" variant="subtle" color="gray" onClick={handleReset}>
                    Reset
                  </Button>
                </Group>

                {/* ── Shareable links ─────────────────────────────── */}
                <Divider />
                <Stack gap={6}>
                  <Text size="xs" fw={600} c="dimmed">
                    Open in separate windows / devices:
                  </Text>
                  <LinkRow
                    label="Provider"
                    url={buildUrl(providerUrl)}
                    path={providerUrl}
                    color="#228be6"
                    navigate={navigate}
                  />
                  <LinkRow
                    label="Patient"
                    url={buildUrl(patientUrl)}
                    path={patientUrl}
                    color="#15aabf"
                    navigate={navigate}
                  />
                </Stack>
              </>
            )}
          </Stack>
        </Paper>

        {/* ── Ended banner ───────────────────────────────────── */}
        {activeEncounter && encounter?.status === 'finished' && (
          <Alert color="gray" title="Visit Ended" radius="md">
            Encounter {activeEncounter} is finished. Click <strong>Reset</strong> to start a new visit.
          </Alert>
        )}

        {/* ── Activity Log ───────────────────────────────────── */}
        {log.length > 0 && (
          <Paper withBorder p="xs" radius="md" shadow="xs">
            <Text size="xs" fw={600} mb={4}>
              Activity Log
            </Text>
            <ScrollArea h={120} viewportRef={logRef}>
              <Stack gap={2}>
                {log.map((entry) => (
                  <Text key={entry} size="xs" ff="monospace" c="dimmed">
                    {entry}
                  </Text>
                ))}
              </Stack>
            </ScrollArea>
          </Paper>
        )}

        {/* ── Config (idle state) ─────────────────────────────── */}
        {!activeEncounter && (
          <Paper withBorder p="md" radius="md" shadow="xs">
            <Text size="sm" fw={600} mb="xs">
              Configuration
            </Text>
            <Stack gap={4}>
              <CfgLine label="MEDPLUM_BASE_URL" value={BASE_URL} />
              <CfgLine label="generate-token" value={BOT.generateToken} />
              <CfgLine label="admit-patient" value={BOT.admitPatient} />
              <CfgLine label="start-adhoc-visit" value={BOT.startAdHocVisit} />
              <CfgLine
                label="Client ID"
                value={config.medplumClientId ? `${config.medplumClientId.slice(0, 8)}…` : undefined}
              />
            </Stack>
          </Paper>
        )}
      </Stack>
    </AppShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Provider Page  (/provider/:encounterId)
// ═══════════════════════════════════════════════════════════════════════
function ProviderPage(): JSX.Element {
  const profile = useMedplumProfile();
  if (!profile) {
    return (
      <Center mih="100vh">
        <Paper p="xl" maw={420} w="100%" withBorder shadow="sm" radius="md">
          <Title order={3} mb="md" ta="center">
            Provider — Sign In
          </Title>
          <SignInForm onSuccess={() => globalThis.location.reload()} />
        </Paper>
      </Center>
    );
  }
  return <ProviderView />;
}

function ProviderView(): JSX.Element {
  const { encounterId } = useParams<{ encounterId: string }>();
  const medplum = useMedplum();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [admitting, setAdmitting] = useState(false);

  // Poll encounter for live status/waiting-room badges
  useEffect(() => {
    if (!encounterId) return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const enc = await medplum.readResource('Encounter', encounterId, { cache: 'no-cache' });
        if (!cancelled) setEncounter(enc);
      } catch {
        /* ignore */
      }
    };
    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [encounterId, medplum]);

  if (!encounterId) {
    return (
      <Center mih="100vh">
        <Text c="red">Missing encounter ID in URL</Text>
      </Center>
    );
  }

  const waitingStatus = encounter?.extension?.find((e) => e.url?.endsWith('waiting-room-status'))?.valueCode;

  const handleAdmit = async (): Promise<void> => {
    setAdmitting(true);
    try {
      await medplum.executeBot(BOT.admitPatient, { encounterId }, 'application/json');
    } catch (err: any) {
      console.error('Admit failed:', err);
    }
    setAdmitting(false);
  };

  const handleEnd = async (): Promise<void> => {
    if (!encounter) return;
    await medplum.updateResource({
      ...encounter,
      status: 'finished',
      period: { ...encounter.period, end: new Date().toISOString() },
    });
  };

  const patientUrl = buildUrl(`/patient/${encounterId}`);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1b1e' }}>
      {/* ── Provider toolbar ─────────────────────────────────── */}
      <div
        style={{
          padding: '6px 12px',
          background: '#228be6',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>PROVIDER</span>
        {config.environmentLabel && (
          <Badge
            size="sm"
            variant="light"
            radius="sm"
            tt="none"
            style={{ color: '#fff', background: 'rgba(255,255,255,0.2)' }}
          >
            {config.environmentLabel}
          </Badge>
        )}
        <Badge
          size="sm"
          variant="light"
          radius="sm"
          tt="none"
          style={{ color: '#fff', background: 'rgba(255,255,255,0.15)' }}
        >
          {encounterId.slice(0, 8)}…
        </Badge>
        {encounter?.status && (
          <Badge size="sm" color={encounterColor(encounter.status)} radius="sm">
            {encounter.status}
          </Badge>
        )}
        {waitingStatus && (
          <Badge size="sm" color={waitingColor(waitingStatus)} radius="sm">
            patient: {waitingStatus}
          </Badge>
        )}

        {waitingStatus === 'waiting' && (
          <Button size="compact-xs" color="teal" loading={admitting} onClick={handleAdmit}>
            Admit Patient
          </Button>
        )}
        {encounter?.status && encounter.status !== 'finished' && (
          <Button size="compact-xs" color="red" variant="light" onClick={handleEnd}>
            End Visit
          </Button>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CopyButton value={patientUrl}>
            {({ copied, copy }) => (
              <Button
                size="compact-xs"
                variant="light"
                color={copied ? 'teal' : 'white'}
                onClick={copy}
                style={{ color: '#fff' }}
              >
                {copied ? 'Copied!' : 'Copy Patient Link'}
              </Button>
            )}
          </CopyButton>
          <Anchor component={Link} to="/" size="xs" c="white">
            ← Dashboard
          </Anchor>
        </span>
      </div>

      {/* ── Video ────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <VideoRoom
          encounterId={encounterId}
          role="provider"
          generateTokenBotId={BOT.generateToken}
          admitPatientBotId={BOT.admitPatient}
          encounterEnded={encounter?.status === 'finished'}
          onDismissEnd={() => globalThis.location.assign('/')}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Patient Page  (/patient/:encounterId)
//
// Auto-authenticates via client credentials so the link is shareable
// to any device on the network without manual login.
// ═══════════════════════════════════════════════════════════════════════
function PatientPage(): JSX.Element {
  const { encounterId } = useParams<{ encounterId: string }>();
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState('');

  const patientClient = useMemo(() => new MedplumClient({ baseUrl: BASE_URL }), []);

  useEffect(() => {
    if (!config.medplumClientId || !config.medplumClientSecret) {
      setAuthError('Client credentials not configured');
      return;
    }
    patientClient
      .startClientLogin(config.medplumClientId, config.medplumClientSecret)
      .then(() => setReady(true))
      .catch((err) => setAuthError(`Auth failed: ${err.message}`));
  }, [patientClient]);

  if (!encounterId) {
    return (
      <Center mih="100vh">
        <Text c="red">Missing encounter ID in URL</Text>
      </Center>
    );
  }

  if (authError) {
    return (
      <Center mih="100vh" style={{ background: '#1a1b1e' }}>
        <Stack align="center" gap="sm">
          <Text c="red" fw={600}>
            Connection Error
          </Text>
          <Text size="sm" c="dimmed">
            {authError}
          </Text>
          <Text size="xs" c="dimmed">
            Base URL: {BASE_URL}
          </Text>
        </Stack>
      </Center>
    );
  }

  if (!ready) {
    return (
      <Center mih="100vh" style={{ background: '#1a1b1e' }}>
        <Stack align="center" gap="sm">
          <Loader size="lg" color="cyan" />
          <Text c="dimmed">Connecting…</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <MedplumProvider medplum={patientClient}>
      <PatientView encounterId={encounterId} />
    </MedplumProvider>
  );
}

function PatientView({ encounterId }: { readonly encounterId: string }): JSX.Element {
  const medplum = useMedplum();
  const [status, setStatus] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const enc = await medplum.readResource('Encounter', encounterId, { cache: 'no-cache' });
        if (!cancelled) setStatus(enc.status);
      } catch {
        /* ignore */
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [encounterId, medplum]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1b1e' }}>
      <div
        style={{
          padding: '8px 16px',
          background: '#15aabf',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>PATIENT</span>
        {config.environmentLabel && (
          <Badge
            size="sm"
            variant="light"
            radius="sm"
            tt="none"
            style={{ color: '#fff', background: 'rgba(255,255,255,0.2)' }}
          >
            {config.environmentLabel}
          </Badge>
        )}
        <span style={{ fontSize: 12, opacity: 0.8 }}>{encounterId.slice(0, 8)}…</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <VideoRoom
          encounterId={encounterId}
          role="patient"
          generateTokenBotId={BOT.generateToken}
          encounterEnded={status === 'finished'}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Small UI components
// ═══════════════════════════════════════════════════════════════════════
function LinkRow({
  label,
  url,
  path,
  color,
  navigate,
}: {
  readonly label: string;
  readonly url: string;
  readonly path: string;
  readonly color: string;
  readonly navigate: (path: string) => void;
}): JSX.Element {
  return (
    <Group gap="xs">
      <Badge size="sm" radius="sm" style={{ background: color, color: '#fff', minWidth: 70 }}>
        {label}
      </Badge>
      <Text size="xs" ff="monospace" style={{ flex: 1, wordBreak: 'break-all' }}>
        {url}
      </Text>
      <CopyButton value={url}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied' : 'Copy URL'}>
            <ActionIcon size="sm" variant="subtle" onClick={copy}>
              <Text size="xs">{copied ? '✓' : '⎘'}</Text>
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
      <Button size="compact-xs" variant="light" onClick={() => navigate(path)}>
        Open
      </Button>
      <Button size="compact-xs" variant="subtle" component="a" href={url} target="_blank" rel="noopener">
        New Tab ↗
      </Button>
    </Group>
  );
}

function CfgLine({ label, value }: { readonly label: string; readonly value?: string }): JSX.Element {
  return (
    <Group gap="xs">
      <Text size="xs" ff="monospace" fw={600} c="dimmed" w={160}>
        {label}:
      </Text>
      <Text size="xs" ff="monospace" c={value ? undefined : 'red'}>
        {value || 'NOT SET'}
      </Text>
    </Group>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// App root — Router
// ═══════════════════════════════════════════════════════════════════════
export default function App(): JSX.Element {
  return (
    <MantineProvider theme={theme}>
      <BrowserRouter>
        <Routes>
          {/* Dashboard & Provider share the interactive-login client */}
          <Route
            path="/"
            element={
              <MedplumProvider medplum={dashboardClient}>
                <DashboardPage />
              </MedplumProvider>
            }
          />
          <Route
            path="/provider/:encounterId"
            element={
              <MedplumProvider medplum={dashboardClient}>
                <ProviderPage />
              </MedplumProvider>
            }
          />
          {/* Patient page has its own auto-auth client — no login needed */}
          <Route path="/patient/:encounterId" element={<PatientPage />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}
