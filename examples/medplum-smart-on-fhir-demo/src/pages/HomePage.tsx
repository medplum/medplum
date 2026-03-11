// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Button, Container, Divider, Group, List, Paper, Stack, Text, Title } from '@mantine/core';
import {
  IconApps,
  IconArrowUpRight,
  IconBook,
  IconDatabase,
  IconRocket,
  IconSettings,
  IconUser,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import {
  MEDPLUM_CLIENT_ID,
  MEDPLUM_FHIR_URL,
  SMART_HEALTH_IT_CLIENT_ID,
  SMART_HEALTH_IT_FHIR_URL,
  STANDALONE_SCOPE,
} from '../config';
import classes from './HomePage.module.css';

async function initiateLaunch(clientId: string, fhirUrl: string): Promise<void> {
  // Store the FHIR base URL so LaunchPage can find it after the redirect
  sessionStorage.setItem('smart_fhir_url', fhirUrl);

  // Generate and store state for CSRF protection
  const state = crypto.randomUUID();
  sessionStorage.setItem('smart_state', state);

  // Discover the authorization endpoint from the SMART configuration
  const response = await fetch(`${fhirUrl}/.well-known/smart-configuration`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch SMART configuration');
  }
  const config = await response.json();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: STANDALONE_SCOPE,
    redirect_uri: window.location.origin + '/launch',
    state,
    aud: fhirUrl,
  });

  window.location.href = `${config.authorization_endpoint}?${params.toString()}`;
}

export function HomePage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <Box className={classes.page} py="6rem">
      <Container size="md" className={classes.container}>
        {/* Header */}
        <Box mb="6rem">
          <Title order={2} fw={800}>
            Medplum SMART on FHIR Demo
          </Title>
          <Text size="lg" mt=".25rem" className={classes.textSecondary}>
            A demonstration of SMART on FHIR standalone and EHR launch. Connect to your Medplum project, launch from a
            patient's Apps tab, or use the public SMART Health IT Sandbox.
          </Text>
        </Box>

        <Stack gap="6rem">
          {/* Launch with Medplum */}
          <Box>
            <Group mb="xl" gap="sm" align="center">
              <img src="/medplum-logo.svg" width={48} height={48} alt="Medplum" style={{ flexShrink: 0 }} />
              <Stack gap={0} className={classes.flexOne}>
                <Text fw={800} size="xl">
                  Option 1: Launch with Medplum
                </Text>
                <Text size="sm" className={classes.textSecondary}>
                  Connect to your own Medplum project — launch standalone or directly from a patient's Apps tab.
                </Text>
              </Stack>
            </Group>
            <Stack gap="xl">
              {/* Step 1: Configure */}
              <Stack gap="md">
                <Group gap="xs" align="center">
                  <IconSettings size={18} color="var(--mantine-color-blue-6)" />
                  <Text fw={700} size="sm">
                    Step 1 — Configure a ClientApplication
                  </Text>
                </Group>
                <List size="sm">
                  <List.Item>
                    Sign up for a Medplum account at{' '}
                    <a href="https://app.medplum.com" target="_blank">
                      app.medplum.com
                    </a>
                  </List.Item>
                  <List.Item>
                    In your Medplum project, create a{' '}
                    <a href="https://app.medplum.com/ClientApplication" target="_blank">
                      ClientApplication
                    </a>{' '}
                    with redirect URI set to <code>http://localhost:8001/launch</code>
                  </List.Item>
                  <List.Item>
                    To use{' '}
                    <a href="https://www.medplum.com/docs/app/apps-tab" target="_blank">
                      EHR launch (Apps tab)
                    </a>
                    , also set the <strong>Launch URI</strong> to <code>http://localhost:8001/launch</code>
                  </List.Item>
                  <List.Item>
                    Copy the client ID and paste it into <code>MEDPLUM_CLIENT_ID</code> in <code>src/config.ts</code>
                  </List.Item>
                </List>
              </Stack>

              <Divider />

              {/* Step 2: Setup */}
              <Stack gap="md">
                <Stack>
                  <Group gap="xs" align="center">
                    <IconDatabase size={18} color="var(--mantine-color-blue-6)" />
                    <Text fw={700} size="sm">
                      Step 2 — Generate Sample Data
                    </Text>
                  </Group>
                  <Text size="sm" className={classes.textSecondary}>
                    If you already have data in your Medplum project, you can skip this step.
                  </Text>
                </Stack>
                <Box className={classes.launchGrid}>
                  <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.card}>
                    <Stack gap="md" className={classes.flexOne}>
                      <Group gap="sm" align="center">
                        <IconUser size={24} color="var(--mantine-color-gray-5)" />
                        <Stack gap={0}>
                          <Text size="11px" fw={500} c="dimmed" tt="uppercase">
                            Sample Patient
                          </Text>
                          <Text fw={600} size="lg">
                            James Wilson
                          </Text>
                        </Stack>
                      </Group>
                      <Divider />
                      <List size="sm" className={classes.flexOne}>
                        <List.Item>Male, born 1978-03-15</List.Item>
                        <List.Item>5 blood pressure readings</List.Item>
                        <List.Item>Weight &amp; BMI observations</List.Item>
                        <List.Item>5 risk factor conditions</List.Item>
                      </List>
                    </Stack>
                  </Paper>
                  <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.card}>
                    <Stack gap="md" className={classes.flexOne}>
                      <Group gap="sm" align="center">
                        <IconUser size={24} color="var(--mantine-color-gray-5)" />
                        <Stack gap={0}>
                          <Text size="11px" fw={500} c="dimmed" tt="uppercase">
                            Sample Patient
                          </Text>
                          <Text fw={600} size="lg">
                            Maria Garcia
                          </Text>
                        </Stack>
                      </Group>
                      <Divider />
                      <List size="sm" className={classes.flexOne}>
                        <List.Item>Female, born 1985-07-22</List.Item>
                        <List.Item>5 blood pressure readings</List.Item>
                        <List.Item>Weight &amp; BMI observations</List.Item>
                        <List.Item>5 risk factor conditions</List.Item>
                      </List>
                    </Stack>
                  </Paper>
                </Box>
                <Text size="sm" c="dimmed">
                  + 8 more patients generated with the same data structure. Resources are tagged with a demo tag for
                  easy identification.
                </Text>
                <Button variant="outline" onClick={() => navigate('/setup')} fullWidth>
                  Setup Demo Data
                </Button>
              </Stack>

              <Divider />

              {/* Step 3: Launch */}
              <Stack gap="md">
                <Group gap="xs" align="center">
                  <IconRocket size={18} color="var(--mantine-color-blue-6)" />
                  <Text fw={700} size="sm">
                    Step 3 — Launch the App
                  </Text>
                </Group>
                <Box className={classes.launchGrid}>
                  {/* Standalone launch card */}
                  <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.card}>
                    <Stack gap="md" className={classes.flexOne}>
                      <Stack>
                        <Group gap="xs" align="center">
                          <IconRocket size={16} color="var(--mantine-color-blue-6)" />
                          <Text fw={700} size="sm">
                            Standalone Launch
                          </Text>
                        </Group>
                        <Text size="sm" className={classes.textSecondary}>
                          You'll be redirected to Medplum to sign in, prompted to set your scopes, and select a patient.
                        </Text>
                      </Stack>
                      <Button
                        fullWidth
                        mt="auto"
                        onClick={() => initiateLaunch(MEDPLUM_CLIENT_ID, MEDPLUM_FHIR_URL).catch(console.error)}
                      >
                        Launch with Medplum
                      </Button>
                    </Stack>
                  </Paper>

                  {/* EHR launch card */}
                  <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.card}>
                    <Stack gap="md" className={classes.flexOne}>
                      <Stack>
                        <Group gap="xs" align="center">
                          <IconApps size={16} color="var(--mantine-color-blue-6)" />
                          <Text fw={700} size="sm">
                            EHR Launch (Apps Tab)
                          </Text>
                        </Group>
                        <Text size="sm" className={classes.textSecondary}>
                          Launch from within a patient's record — patient context is passed automatically.
                        </Text>
                      </Stack>
                      <List size="sm">
                        <List.Item>
                          Navigate to any{' '}
                          <a href="https://app.medplum.com/Patient" target="_blank">
                            patient in Medplum
                          </a>
                        </List.Item>
                        <List.Item>
                          Open the <strong>Apps</strong> tab and click on your ClientApplication to launch.
                        </List.Item>
                      </List>
                    </Stack>
                  </Paper>
                </Box>
              </Stack>
            </Stack>
          </Box>

          {/* Launch with Sandbox */}
          <Box>
            <Group mb="xl" gap="sm" align="center">
              <ActionIcon size={48} radius="xl" variant="light" className={classes.sectionIcon}>
                <IconRocket size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} className={classes.flexOne}>
                <Text fw={800} size="xl">
                  Option 2: Launch with SMART Health IT Sandbox
                </Text>
                <Text size="sm" className={classes.textSecondary}>
                  No account or setup required. Test the app with public synthetic patient data.
                </Text>
              </Stack>
            </Group>
            <Paper radius="md" withBorder p="lg" shadow="sm">
              <Text size="sm" className={classes.textSecondary} mb="md">
                A good way to explore the app without a Medplum account. Uses the public SMART Health IT Launcher
                pre-loaded with synthetic patients. You'll be redirected to the SMART Health IT Sandbox patient picker,
                and then back to the app.
              </Text>
              <Button
                fullWidth
                onClick={() => initiateLaunch(SMART_HEALTH_IT_CLIENT_ID, SMART_HEALTH_IT_FHIR_URL).catch(console.error)}
              >
                Launch with SMART Health IT Sandbox
              </Button>
            </Paper>
          </Box>

          {/* Documentation */}
          <Box>
            <Group mb="xl" gap="sm" align="center">
              <ActionIcon size={48} radius="xl" variant="light" className={classes.sectionIcon}>
                <IconBook size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} className={classes.flexOne}>
                <Text fw={800} size="xl">
                  Learn More
                </Text>
                <Text size="sm" className={classes.textSecondary}>
                  Explore SMART on FHIR documentation and Medplum developer resources.
                </Text>
              </Stack>
            </Group>
            <Paper radius="md" withBorder shadow="sm" p="lg">
              <Stack gap="xs">
                <Text
                  component="a"
                  href="https://www.medplum.com/docs/auth/smart-scopes"
                  target="_blank"
                  c="blue"
                  size="sm"
                  style={{ textDecoration: 'none' }}
                >
                  SMART on FHIR Authorization Guide <IconArrowUpRight size={12} style={{ verticalAlign: 'middle' }} />
                </Text>
                <Text
                  component="a"
                  href="https://docs.smarthealthit.org/"
                  target="_blank"
                  c="blue"
                  size="sm"
                  style={{ textDecoration: 'none' }}
                >
                  SMART Health IT Docs <IconArrowUpRight size={12} style={{ verticalAlign: 'middle' }} />
                </Text>
                <Text
                  component="a"
                  href="https://www.medplum.com/docs/api/fhir/medplum/clientapplication"
                  target="_blank"
                  c="blue"
                  size="sm"
                  style={{ textDecoration: 'none' }}
                >
                  Medplum ClientApplication Reference <IconArrowUpRight size={12} style={{ verticalAlign: 'middle' }} />
                </Text>
              </Stack>
            </Paper>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
