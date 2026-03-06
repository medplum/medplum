// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Box,
  Button,
  Center,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconCircleCheck, IconId, IconLock, IconPill, IconShieldCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';

const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
];

function ProviderSetupForm({ onComplete }: { readonly onComplete: () => void }): JSX.Element {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback((): void => {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      onComplete();
    }, 1200);
  }, [onComplete]);

  return (
    <Box p="md" style={{ overflowY: 'auto', flex: 1 }}>
      <Stack gap="md">
        <Box ta="center">
          <ThemeIcon size={48} radius="xl" color="blue" variant="light" mx="auto" mb="xs">
            <IconId size={28} />
          </ThemeIcon>
          <Title order={4}>Provider Enrollment</Title>
          <Text size="sm" c="dimmed">
            Complete your prescriber profile to start writing prescriptions.
          </Text>
        </Box>

        <Paper withBorder p="md" radius="md">
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="sm">
            Provider Information
          </Text>
          <Stack gap="sm">
            <Group grow>
              <TextInput label="First Name" placeholder="e.g. Jane" required />
              <TextInput label="Last Name" placeholder="e.g. Smith" required />
            </Group>
            <TextInput label="Suffix / Credentials" placeholder="e.g. MD, DO, NP, PA" />
            <TextInput
              label="NPI Number"
              placeholder="e.g. 1234567890"
              description="Your 10-digit National Provider Identifier"
              required
              maxLength={10}
              styles={{
                input: {
                  fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                  fontSize: 14,
                  letterSpacing: 1,
                },
              }}
            />
          </Stack>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="sm">
            DEA Registration
          </Text>
          <Stack gap="sm">
            <TextInput
              label="DEA Number"
              placeholder="e.g. AB1234563"
              description="Required for prescribing controlled substances (Schedule II–V)"
              styles={{
                input: {
                  fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                  fontSize: 14,
                  letterSpacing: 1,
                },
              }}
            />
            <Select
              label="DEA Schedule Authorization"
              placeholder="Select schedules"
              data={[
                'Schedule II–V (Full)',
                'Schedule III–V (No Schedule II)',
                'Schedule V only',
                'No controlled substances',
              ]}
              defaultValue="Schedule II–V (Full)"
              description="Which controlled substance schedules you are authorized to prescribe"
            />
          </Stack>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="sm">
            State Licensure
          </Text>
          <Stack gap="sm">
            <Select
              label="Primary State"
              placeholder="Select state"
              data={US_STATES}
              description="The state where you are primarily licensed to practice"
              required
              searchable
            />
            <TextInput
              label="State License Number"
              placeholder="e.g. MD-123456"
              description="Your medical license number for the selected state"
              required
            />
            <Select
              label="Prescriber Role"
              placeholder="Select role"
              data={[
                'Physician (MD/DO)',
                'Nurse Practitioner (NP)',
                'Physician Assistant (PA)',
                'Dentist (DDS/DMD)',
                'Optometrist (OD)',
                'Supervised Prescriber',
              ]}
              defaultValue="Physician (MD/DO)"
              required
            />
          </Stack>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="sm">
            EPCS Identity Proofing
          </Text>
          <Stack gap="sm">
            <Select
              label="Identity Proofing Provider"
              placeholder="Select provider"
              data={['Exostar (Recommended)', 'ID.me', 'Imprivata', 'Login.gov']}
              defaultValue="Exostar (Recommended)"
              description="Required for electronic prescribing of controlled substances"
            />
            <Text size="xs" c="dimmed">
              You will be redirected to complete identity verification after enrollment. This typically takes 5–10
              minutes and requires a government-issued photo ID.
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder p="sm" radius="md" bg="blue.0">
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon size={20} radius="xl" color="blue" variant="light">
              <IconLock size={12} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">
              Your credentials are encrypted at rest and verified against the NPPES NPI Registry and DEA NTIS database.
              No data is shared with third parties.
            </Text>
          </Group>
        </Paper>

        <Button
          fullWidth
          size="md"
          leftSection={<IconShieldCheck size={16} />}
          onClick={handleSubmit}
          loading={submitting}
        >
          {submitting ? 'Submitting...' : 'Submit for Verification'}
        </Button>
      </Stack>
    </Box>
  );
}

function SubmissionConfirmation(): JSX.Element {
  return (
    <Center style={{ flex: 1 }}>
      <Stack align="center" gap="lg" mx="xl">
        <ThemeIcon size={64} radius="xl" color="blue" variant="light">
          <IconCircleCheck size={36} />
        </ThemeIcon>
        <div style={{ textAlign: 'center' }}>
          <Title order={4} mb={4}>
            Submitted for Verification
          </Title>
          <Text size="sm" c="dimmed">
            Your provider enrollment has been submitted. DoseSpot will verify your credentials against the NPPES
            registry, DEA database, and state licensing boards.
          </Text>
        </div>
        <Paper withBorder p="md" radius="md" w="100%">
          <Stack gap="sm">
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <ThemeIcon size={22} radius="xl" color="blue" variant="light" mt={2}>
                <IconPill size={12} />
              </ThemeIcon>
              <div>
                <Text size="sm" fw={500}>
                  Basic Prescribing: 1–2 Business Days
                </Text>
                <Text size="xs" c="dimmed">
                  Non-controlled substance prescribing will be verified within 1–2 business days once your NPI and state
                  license are verified and approved.
                </Text>
              </div>
            </Group>
            <Divider />
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <ThemeIcon size={22} radius="xl" color="violet" variant="light" mt={2}>
                <IconShieldCheck size={12} />
              </ThemeIcon>
              <div>
                <Text size="sm" fw={500}>
                  Full EPCS Capabilities: 1–2 Weeks
                </Text>
                <Text size="xs" c="dimmed">
                  Controlled substance prescribing (Schedule II–V) requires DEA verification and EPCS identity proofing,
                  which typically takes 1–2 weeks to complete.
                </Text>
              </div>
            </Group>
          </Stack>
        </Paper>
        <Paper withBorder p="sm" radius="md" bg="blue.0" w="100%">
          <Text size="xs" c="dimmed" ta="center">
            You&apos;ll receive an email notification at each stage of verification. No action is needed until then.
          </Text>
        </Paper>
      </Stack>
    </Center>
  );
}

export function DoseSpotProviderContent(): JSX.Element {
  const [enrolled, setEnrolled] = useState(false);

  const handleComplete = useCallback((): void => {
    setEnrolled(true);
  }, []);

  if (enrolled) {
    return <SubmissionConfirmation />;
  }

  return <ProviderSetupForm onComplete={handleComplete} />;
}
