// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Badge,
  Box,
  Button,
  Divider,
  Grid,
  Group,
  List,
  Modal,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconCheck,
  IconCircleCheck,
  IconCreditCard,
  IconDatabase,
  IconEye,
  IconFileAnalytics,
  IconHeartbeat,
  IconKey,
  IconLock,
  IconShieldCheck,
  IconStethoscope,
  IconUsers,
  IconVaccine,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { useAppsPanel } from '../components/AppsPanel';
import { useMarketplace } from './useMarketplace';

// ─── Setup flow configuration per listing ───────────────────────────────────

interface SetupFlowConfig {
  appPanelId: string;
  steps: { label: string; description: string }[];
  successChecklist: string[];
}

const SETUP_FLOWS: Record<string, SetupFlowConfig> = {
  'carebridge-dashboard': {
    appPanelId: 'carebridge-dashboard',
    steps: [
      { label: 'Connect Account', description: 'Authenticate' },
      { label: 'Permissions', description: 'Review access' },
    ],
    successChecklist: ['Account connected', 'Permissions granted', 'Data sync initialized'],
  },
  'dosespot-eprescribing': {
    appPanelId: 'dosespot',
    steps: [
      { label: 'API Credentials', description: 'Connect to DoseSpot' },
      { label: 'Encryption', description: 'Configure security' },
    ],
    successChecklist: ['API credentials verified', 'Encryption configured', 'EPCS module activated'],
  },
  'telehealth-bridge': {
    appPanelId: 'telehealth',
    steps: [
      { label: 'Plan', description: 'Choose your plan' },
      { label: 'Payment', description: 'Add payment method' },
      { label: 'Configure', description: 'Video settings' },
    ],
    successChecklist: [
      'Professional plan activated',
      'Payment method saved',
      'Video service provisioned',
      'Patient scheduling link generated',
    ],
  },
};

// ─── Main modal ─────────────────────────────────────────────────────────────

interface InstallModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly listingId: string;
  readonly listingName: string;
}

export function InstallModal({ opened, onClose, listingId, listingName }: InstallModalProps): JSX.Element {
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const { install } = useMarketplace();
  const { openApp } = useAppsPanel();
  const flow = SETUP_FLOWS[listingId];

  const handleClose = useCallback((): void => {
    setStep(0);
    setCompleted(false);
    onClose();
  }, [onClose]);

  const handleNext = useCallback((): void => {
    setStep((s) => s + 1);
  }, []);

  const handleBack = useCallback((): void => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const handleComplete = useCallback((): void => {
    install(listingId);
    setCompleted(true);
  }, [install, listingId]);

  const handleOpenApp = useCallback((): void => {
    handleClose();
    if (flow) {
      openApp(flow.appPanelId);
    }
  }, [handleClose, openApp, flow]);

  const totalSteps = flow?.steps.length ?? 2;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size={900}
      title={
        <Text fw={600} size="lg">
          Set up {listingName}
        </Text>
      }
      centered
      padding={0}
      styles={{
        header: { padding: 'var(--mantine-spacing-lg)' },
        body: { height: 700, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
      }}
    >
      <Divider />
      <Group gap={0} align="flex-start" wrap="nowrap" style={{ flex: 1, minHeight: 0 }}>
        <Box p="lg" style={{ flexShrink: 0, width: '33%' }}>
          <Stepper
            active={completed ? totalSteps : step}
            orientation="vertical"
            size="sm"
            completedIcon={<IconCheck size={20} />}
          >
            {flow?.steps.map((s, i) => (
              <Stepper.Step key={i} label={s.label} description={s.description} />
            ))}
          </Stepper>
        </Box>
        <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto', height: '100%' }} p="lg">
          {completed ? (
            <SuccessContent
              listingName={listingName}
              checklist={flow?.successChecklist ?? []}
              onOpenApp={handleOpenApp}
              onBack={handleClose}
            />
          ) : (
            <StepContent
              listingId={listingId}
              listingName={listingName}
              stepIndex={step}
              onNext={step < totalSteps - 1 ? handleNext : handleComplete}
              onBack={step > 0 ? handleBack : undefined}
            />
          )}
        </Box>
      </Group>
    </Modal>
  );
}

// ─── Step content router ────────────────────────────────────────────────────

function StepContent({
  listingId,
  listingName,
  stepIndex,
  onNext,
  onBack,
}: {
  readonly listingId: string;
  readonly listingName: string;
  readonly stepIndex: number;
  readonly onNext: () => void;
  readonly onBack?: () => void;
}): JSX.Element {
  if (listingId === 'carebridge-dashboard') {
    return stepIndex === 0 ? (
      <CareBridgeOAuthStep onNext={onNext} />
    ) : (
      <CareBridgePermissionsStep listingName={listingName} onNext={onNext} onBack={onBack} />
    );
  }

  if (listingId === 'dosespot-eprescribing') {
    return stepIndex === 0 ? (
      <DoseSpotCredentialsStep onNext={onNext} />
    ) : (
      <DoseSpotEncryptionStep onNext={onNext} onBack={onBack} />
    );
  }

  if (listingId === 'telehealth-bridge') {
    if (stepIndex === 0) {
      return <TelehealthPlanStep onNext={onNext} />;
    }
    if (stepIndex === 1) {
      return <TelehealthPaymentStep onNext={onNext} onBack={onBack} />;
    }
    return <TelehealthConfigStep onNext={onNext} onBack={onBack} />;
  }

  return <Text>Unknown step</Text>;
}

// ─── Shared: step wrapper with nav buttons ──────────────────────────────────

function StepLayout({
  children,
  nextLabel,
  nextIcon,
  onNext,
  onBack,
}: {
  readonly children: ReactNode;
  readonly nextLabel: string;
  readonly nextIcon?: ReactNode;
  readonly onNext: () => void;
  readonly onBack?: () => void;
}): JSX.Element {
  return (
    <Stack gap="lg">
      {children}
      <Stack gap="sm">
        <Button fullWidth size="md" leftSection={nextIcon} onClick={onNext}>
          {nextLabel}
        </Button>
        {onBack && (
          <Button fullWidth size="md" variant="default" onClick={onBack}>
            Back
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CareBridge steps
// ═══════════════════════════════════════════════════════════════════════════

const CAREBRIDGE_PERMISSIONS = [
  { icon: IconUsers, label: 'Read patient demographics', description: 'Names, DOB, contact information' },
  { icon: IconStethoscope, label: 'Read clinical observations', description: 'Vitals, lab results, assessments' },
  { icon: IconHeartbeat, label: 'Read conditions and diagnoses', description: 'Active and resolved conditions' },
  { icon: IconFileAnalytics, label: 'Read care plans and goals', description: 'Treatment plans and patient goals' },
  { icon: IconVaccine, label: 'Read immunization records', description: 'Vaccination history and schedules' },
  {
    icon: IconDatabase,
    label: 'Generate population health reports',
    description: 'Aggregate analytics and quality measures',
  },
];

function GoogleLogo(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z" />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

function GoogleSignInButton({ onClick }: { readonly onClick: () => void }): JSX.Element {
  return (
    <UnstyledButton
      onClick={onClick}
      w="100%"
      h={40}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: 'var(--mantine-radius-sm)',
        backgroundColor: 'white',
        fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
        fontSize: 14,
        fontWeight: 500,
        color: '#3c4043',
        cursor: 'pointer',
        transition: 'background-color 150ms ease, box-shadow 150ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = '#f8f9fa';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'white';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      <GoogleLogo />
      <span>Sign in with Google</span>
    </UnstyledButton>
  );
}

function CareBridgeOAuthStep({ onNext }: { readonly onNext: () => void }): JSX.Element {
  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        Sign in to your CareBridge Analytics account to connect it with your Medplum workspace.
      </Text>

      <GoogleSignInButton onClick={onNext} />

      <Divider label="or sign in with email" labelPosition="center" />

      <Stack gap="sm">
        <TextInput label="Email" placeholder="you@organization.com" />
        <PasswordInput label="Password" placeholder="Your password" />
        <Button fullWidth size="md" onClick={onNext}>
          Sign In
        </Button>
      </Stack>

      <Text size="xs" c="dimmed" ta="center">
        Don&apos;t have a CareBridge account?{' '}
        <Text component="span" size="xs" c="blue" style={{ cursor: 'pointer' }}>
          Create one
        </Text>
      </Text>
    </Stack>
  );
}

function CareBridgePermissionsStep({
  listingName,
  onNext,
  onBack,
}: {
  readonly listingName: string;
  readonly onNext: () => void;
  readonly onBack?: () => void;
}): JSX.Element {
  return (
    <StepLayout nextLabel="Allow Connection" nextIcon={<IconShieldCheck size={16} />} onNext={onNext} onBack={onBack}>
      <Box>
        <Title order={4}>{listingName}</Title>
        <Text size="sm" c="dimmed">
          wants to connect to your Medplum workspace
        </Text>
      </Box>

      <Paper withBorder p="md" radius="md">
        <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="sm">
          This will allow the app to:
        </Text>
        <List spacing="sm" size="sm" center icon={<></>}>
          {CAREBRIDGE_PERMISSIONS.map((perm) => (
            <List.Item
              key={perm.label}
              icon={
                <ThemeIcon size={28} radius="xl" color="green" variant="light">
                  <perm.icon size={14} />
                </ThemeIcon>
              }
            >
              <Text size="sm" fw={500}>
                {perm.label}
              </Text>
              <Text size="xs" c="dimmed">
                {perm.description}
              </Text>
            </List.Item>
          ))}
        </List>
      </Paper>

      <Paper withBorder p="sm" radius="md" bg="blue.0">
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon size={20} radius="xl" color="blue" variant="light">
            <IconEye size={12} />
          </ThemeIcon>
          <Text size="xs" c="dimmed">
            This app will have <strong>read-only</strong> access to your data. No clinical records will be modified.
          </Text>
        </Group>
      </Paper>
    </StepLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DoseSpot steps
// ═══════════════════════════════════════════════════════════════════════════

function DoseSpotCredentialsStep({ onNext }: { readonly onNext: () => void }): JSX.Element {
  return (
    <StepLayout nextLabel="Validate & Continue" nextIcon={<IconKey size={16} />} onNext={onNext}>
      <Box>
        <Title order={4}>DoseSpot API Credentials</Title>
        <Text size="sm" c="dimmed">
          Enter your DoseSpot API credentials to connect e-prescribing services.
        </Text>
      </Box>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <TextInput
            label="Clinic ID"
            placeholder="e.g. 12345"
            description="Your DoseSpot Clinic ID from the admin portal"
            required
          />
          <TextInput
            label="API Key (Client ID)"
            placeholder="e.g. ds_live_abc123def456"
            description="Found under Settings → API Access in your DoseSpot account"
            required
          />
          <PasswordInput
            label="Client Secret"
            placeholder="Enter your client secret"
            description="Keep this value confidential — it will be stored encrypted"
            required
          />
        </Stack>
      </Paper>

      <Paper withBorder p="sm" radius="md" bg="blue.0">
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon size={20} radius="xl" color="blue" variant="light">
            <IconLock size={12} />
          </ThemeIcon>
          <Text size="xs" c="dimmed">
            Credentials are encrypted at rest and transmitted over TLS. They are never exposed in logs or client-side
            code.
          </Text>
        </Group>
      </Paper>
    </StepLayout>
  );
}

function DoseSpotEncryptionStep({
  onNext,
  onBack,
}: {
  readonly onNext: () => void;
  readonly onBack?: () => void;
}): JSX.Element {
  return (
    <StepLayout nextLabel="Save & Install" nextIcon={<IconShieldCheck size={16} />} onNext={onNext} onBack={onBack}>
      <Box>
        <Title order={4}>Encryption Configuration</Title>
        <Text size="sm" c="dimmed">
          Configure encryption settings for EPCS-compliant electronic prescribing of controlled substances.
        </Text>
      </Box>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Select
            label="Encryption Standard"
            placeholder="Select standard"
            data={['AES-256-GCM (Recommended)', 'AES-256-CBC', 'AES-128-GCM']}
            defaultValue="AES-256-GCM (Recommended)"
            description="Encryption algorithm for prescription payload data"
            required
          />
          <Select
            label="Key Rotation Policy"
            placeholder="Select policy"
            data={['Every 90 days (Recommended)', 'Every 60 days', 'Every 30 days', 'Manual rotation']}
            defaultValue="Every 90 days (Recommended)"
            description="How frequently encryption keys are automatically rotated"
            required
          />
          <TextInput
            label="EPCS Signing Certificate Thumbprint"
            placeholder="e.g. A1:B2:C3:D4:E5:F6:78:90:AB:CD"
            description="SHA-1 thumbprint of your DEA-issued EPCS signing certificate"
            required
          />
          <Select
            label="Two-Factor Authentication Provider"
            placeholder="Select provider"
            data={['Exostar (Recommended)', 'ID.me', 'Imprivata', 'Login.gov']}
            defaultValue="Exostar (Recommended)"
            description="Identity proofing provider for EPCS two-factor authentication"
            required
          />
        </Stack>
      </Paper>

      <Paper withBorder p="sm" radius="md" bg="violet.0">
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon size={20} radius="xl" color="violet" variant="light">
            <IconShieldCheck size={12} />
          </ThemeIcon>
          <Text size="xs" c="dimmed">
            These settings satisfy DEA 21 CFR Part 1311 requirements for electronic prescribing of controlled
            substances.
          </Text>
        </Group>
      </Paper>
    </StepLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TelehealthBridge steps
// ═══════════════════════════════════════════════════════════════════════════

const TELEHEALTH_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$0',
    period: '/mo',
    description: 'Try video visits with basic features',
    features: ['5 video visits/month', '1 provider', '720p video', 'Standard support'],
    badge: undefined,
    color: 'gray',
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$149',
    period: '/mo',
    description: 'For growing practices',
    features: [
      'Unlimited video visits',
      'Up to 10 providers',
      '1080p HD video',
      'Screen sharing & multi-party',
      'Patient self-scheduling',
      'Priority support',
    ],
    badge: 'Most Popular',
    color: 'blue',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: undefined,
    description: 'For large organizations',
    features: [
      'Everything in Professional',
      'Unlimited providers',
      'Custom branding',
      'SSO & advanced security',
      'Dedicated account manager',
      'SLA guarantee',
    ],
    badge: undefined,
    color: 'violet',
  },
] as const;

function TelehealthPlanStep({ onNext }: { readonly onNext: () => void }): JSX.Element {
  const [selected, setSelected] = useState('professional');

  return (
    <Stack gap="lg">
      <Box>
        <Title order={4}>Choose Your Plan</Title>
        <Text size="sm" c="dimmed">
          Select a plan that fits your practice. You can upgrade or downgrade anytime.
        </Text>
      </Box>

      <SimpleGrid cols={3} spacing="sm">
        {TELEHEALTH_PLANS.map((plan) => (
          <UnstyledButton key={plan.id} onClick={() => setSelected(plan.id)} style={{ display: 'block' }}>
            <Paper
              withBorder
              p="md"
              radius="md"
              h="100%"
              style={{
                cursor: 'pointer',
                borderColor: selected === plan.id ? `var(--mantine-color-${plan.color}-5)` : undefined,
                borderWidth: selected === plan.id ? 2 : 1,
                position: 'relative',
              }}
            >
              {plan.badge && (
                <Badge size="xs" color={plan.color} style={{ position: 'absolute', top: 8, right: 8 }}>
                  {plan.badge}
                </Badge>
              )}
              <Text size="sm" fw={600} mb={2}>
                {plan.name}
              </Text>
              <Group gap={2} align="baseline" mb={4}>
                <Text size="xl" fw={700} lh={1}>
                  {plan.price}
                </Text>
                {plan.period && (
                  <Text size="xs" c="dimmed">
                    {plan.period}
                  </Text>
                )}
              </Group>
              <Text size="xs" c="dimmed" mb="xs">
                {plan.description}
              </Text>
              <Stack gap={4}>
                {plan.features.map((f) => (
                  <Group key={f} gap={6} wrap="nowrap">
                    <IconCheck size={12} color="var(--mantine-color-green-6)" style={{ flexShrink: 0 }} />
                    <Text size="xs">{f}</Text>
                  </Group>
                ))}
              </Stack>
            </Paper>
          </UnstyledButton>
        ))}
      </SimpleGrid>

      <Button fullWidth size="md" onClick={onNext}>
        Continue with {TELEHEALTH_PLANS.find((p) => p.id === selected)?.name}
      </Button>
    </Stack>
  );
}

function CardBrandIcon({ brand }: { readonly brand?: string }): JSX.Element {
  if (brand === 'visa') {
    return (
      <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
        <rect width="32" height="20" rx="3" fill="#1A1F71" />
        <text x="16" y="13" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial">
          VISA
        </text>
      </svg>
    );
  }
  if (brand === 'mastercard') {
    return (
      <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
        <rect width="32" height="20" rx="3" fill="#252525" />
        <circle cx="13" cy="10" r="6" fill="#EB001B" />
        <circle cx="19" cy="10" r="6" fill="#F79E1B" />
      </svg>
    );
  }
  return (
    <ThemeIcon size={20} radius="sm" color="gray" variant="light">
      <IconCreditCard size={12} />
    </ThemeIcon>
  );
}

function TelehealthPaymentStep({
  onNext,
  onBack,
}: {
  readonly onNext: () => void;
  readonly onBack?: () => void;
}): JSX.Element {
  const [cardNumber, setCardNumber] = useState('');

  const formatCardNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  let detectedBrand: string | undefined;
  if (cardNumber.startsWith('4')) {
    detectedBrand = 'visa';
  } else if (cardNumber.startsWith('5')) {
    detectedBrand = 'mastercard';
  }

  return (
    <StepLayout nextLabel="Subscribe & Install" nextIcon={<IconLock size={16} />} onNext={onNext} onBack={onBack}>
      <Box>
        <Title order={4}>Payment Details</Title>
        <Text size="sm" c="dimmed">
          Professional plan — $149/month
        </Text>
      </Box>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <TextInput
            label="Cardholder Name"
            placeholder="Name on card"
            required
            styles={{ input: { fontFamily: 'inherit' } }}
          />
          <TextInput
            label="Card Number"
            placeholder="1234 1234 1234 1234"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.currentTarget.value))}
            required
            rightSection={<CardBrandIcon brand={detectedBrand} />}
            styles={{
              input: {
                fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace",
                fontSize: 14,
                letterSpacing: 1,
              },
            }}
          />
          <Grid gutter="sm">
            <Grid.Col span={6}>
              <TextInput
                label="Expiration"
                placeholder="MM / YY"
                required
                styles={{
                  input: {
                    fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace",
                    fontSize: 14,
                    letterSpacing: 1,
                  },
                }}
              />
            </Grid.Col>
            <Grid.Col span={6}>
              <TextInput
                label="CVC"
                placeholder="CVC"
                required
                styles={{
                  input: {
                    fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace",
                    fontSize: 14,
                    letterSpacing: 1,
                  },
                }}
              />
            </Grid.Col>
          </Grid>
          <Select
            label="Country"
            placeholder="Select country"
            data={['United States', 'Canada', 'United Kingdom', 'Australia']}
            defaultValue="United States"
          />
          <TextInput label="ZIP / Postal Code" placeholder="12345" required />
        </Stack>
      </Paper>

      <Paper withBorder p="sm" radius="md" bg="gray.0">
        <Group justify="space-between" mb={4}>
          <Text size="xs" c="dimmed">
            Professional plan
          </Text>
          <Text size="xs" fw={500}>
            $149.00/mo
          </Text>
        </Group>
        <Group justify="space-between" mb={4}>
          <Text size="xs" c="dimmed">
            14-day free trial
          </Text>
          <Text size="xs" fw={500} c="green">
            −$149.00
          </Text>
        </Group>
        <Divider my={6} />
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            Due today
          </Text>
          <Text size="sm" fw={600}>
            $0.00
          </Text>
        </Group>
      </Paper>

      <Group gap="xs" justify="center">
        <IconLock size={12} color="var(--mantine-color-gray-5)" />
        <Text size="xs" c="dimmed">
          Secured by Stripe. Your card info is encrypted end-to-end.
        </Text>
      </Group>
    </StepLayout>
  );
}

function TelehealthConfigStep({
  onNext,
  onBack,
}: {
  readonly onNext: () => void;
  readonly onBack?: () => void;
}): JSX.Element {
  return (
    <StepLayout nextLabel="Finish Setup" nextIcon={<IconShieldCheck size={16} />} onNext={onNext} onBack={onBack}>
      <Box>
        <Title order={4}>Video Configuration</Title>
        <Text size="sm" c="dimmed">
          Configure your video visit defaults. These can be changed later.
        </Text>
      </Box>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Select
            label="Default Video Quality"
            data={['1080p HD (Recommended)', '720p Standard', '480p Low Bandwidth']}
            defaultValue="1080p HD (Recommended)"
            description="Patients can adjust quality during the visit"
          />
          <Select
            label="Waiting Room"
            data={['Enabled (Recommended)', 'Disabled — patients join immediately']}
            defaultValue="Enabled (Recommended)"
            description="Hold patients in a waiting room until the provider admits them"
          />
          <Select
            label="Auto-Create Encounter"
            data={['On call start (Recommended)', 'On call end', 'Disabled']}
            defaultValue="On call start (Recommended)"
            description="Automatically create a FHIR Encounter when the video visit begins"
          />
          <Switch
            label="Enable screen sharing"
            defaultChecked
            description="Allow providers and patients to share their screen"
          />
          <Switch label="Enable recording" description="Record visits for documentation (requires patient consent)" />
        </Stack>
      </Paper>
    </StepLayout>
  );
}

// ─── Success ────────────────────────────────────────────────────────────────

function SuccessContent({
  listingName,
  checklist,
  onOpenApp,
  onBack,
}: {
  readonly listingName: string;
  readonly checklist: string[];
  readonly onOpenApp: () => void;
  readonly onBack: () => void;
}): JSX.Element {
  return (
    <Stack gap="lg">
      <Box>
        <IconCircleCheck size={32} stroke={1.5} color="var(--mantine-color-green-6)" />
        <Title order={4}>Successfully Installed</Title>
        <Text size="sm" c="dimmed">
          {listingName} has been connected and is ready to use.
        </Text>
      </Box>

      <Paper withBorder p="md" radius="md">
        <List
          size="sm"
          spacing="xs"
          icon={
            <ThemeIcon size={18} radius="xl" color="green" variant="light">
              <IconCheck size={11} />
            </ThemeIcon>
          }
        >
          {checklist.map((item) => (
            <List.Item key={item}>{item}</List.Item>
          ))}
        </List>
      </Paper>

      <Stack gap="sm">
        <Button fullWidth size="md" onClick={onOpenApp}>
          Open App
        </Button>
        <Button fullWidth size="md" variant="light" onClick={onBack}>
          Back to Marketplace
        </Button>
      </Stack>
    </Stack>
  );
}
