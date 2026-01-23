// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Box,
  Button,
  Container,
  Divider,
  Grid,
  Group,
  List,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { convertToTransactionBundle } from '@medplum/core';
import type { Bundle, BundleEntry } from '@medplum/fhirtypes';
import { showNotification } from '@mantine/notifications';
import { MedplumLink, useMedplum } from '@medplum/react';
import {
  IconApps,
  IconArrowUpRight,
  IconBook,
  IconBrandDiscord,
  IconBuilding,
  IconDatabase,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconHelpCircle,
  IconMail,
  IconUser,
} from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import patientBundleData from '../../data/patient-david-james-williams.json';
import visitBundleData from '../../data/simple-initial-visit-bundle.json';
import { showErrorNotification } from '../../utils/notifications';

export function GetStartedPage(): JSX.Element {
  const medplum = useMedplum();
  const [importingPatient, setImportingPatient] = useState(false);
  const [importingVisit, setImportingVisit] = useState(false);

  const handleImportPatient = useCallback(async () => {
    setImportingPatient(true);
    try {
      // Convert searchset bundle to transaction bundle
      const transactionBundle = convertToTransactionBundle(patientBundleData as Bundle);
      const result = await medplum.executeBatch(transactionBundle);

      const resourceCount =
        result.entry?.filter((entry: BundleEntry) => entry.response?.status?.startsWith('2')).length || 0;

      showNotification({
        color: 'green',
        title: 'Success',
        message: `Imported ${resourceCount} resources for patient David James Williams`,
      });
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setImportingPatient(false);
    }
  }, [medplum]);

  const handleImportVisit = useCallback(async () => {
    setImportingVisit(true);
    try {
      // The visit bundle is already a transaction bundle
      const result = await medplum.executeBatch(visitBundleData as Bundle);

      const resourceCount =
        result.entry?.filter((entry: BundleEntry) => entry.response?.status?.startsWith('2')).length || 0;

      showNotification({
        color: 'green',
        title: 'Success',
        message: `Imported ${resourceCount} resources for Simple Initial Visit template`,
      });
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setImportingVisit(false);
    }
  }, [medplum]);

  return (
    <Box
      className="get-started-page"
      style={{ minHeight: '100vh', backgroundColor: 'var(--mantine-color-body)' }}
      py="6rem"
    >
      <style>{`
        .provider-link:hover {
          text-decoration: underline !important;
        }
        .get-started-page {
          --text-secondary: var(--mantine-color-gray-7);
          --text-label: var(--mantine-color-gray-6);
          --icon-secondary: var(--mantine-color-gray-5);
        }
        [data-mantine-color-scheme="dark"] .get-started-page {
          --text-secondary: var(--mantine-color-gray-5);
          --text-label: var(--mantine-color-gray-5);
          --icon-secondary: var(--mantine-color-gray-6);
        }
      `}</style>
      <Container size="md" style={{ maxWidth: 800 }}>
        {/* Header */}
        <Box mb="6rem">
          <Title order={2} fw={800}>
            Get Started with Medplum Provider
          </Title>
          <Text size="lg" mt=".25rem" style={{ color: 'var(--text-secondary)' }}>
            Below are our recommended first steps to get set up and familiar with the available features and workflows
            in Provider. Please note: if you are using the free version of Provider, some services may not be
            available—lab ordering, prescriptions, billing, and access to code systems (such as CPT and ICD-10) require
            a paid plan.{' '}
            <Text
              component="a"
              href="https://www.medplum.com/pricing"
              target="_blank"
              c="blue.6"
              style={{ textDecoration: 'none' }}
              span
            >
              Subscribe
            </Text>{' '}
            or{' '}
            <Text component="a" href="mailto:support@medplum.com" c="blue.6" style={{ textDecoration: 'none' }} span>
              contact us
            </Text>{' '}
            to integrate these services.
          </Text>
        </Box>

        <Stack gap="6rem">
          {/* Sample Data */}
          <Box>
            <Group mb="xl" gap="sm" align="center">
              <ActionIcon
                size={48}
                radius="xl"
                variant="light"
                style={{
                  backgroundColor: 'var(--mantine-color-yellow-8)',
                  border: 'none',
                }}
              >
                <IconDatabase size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} style={{ flex: 1 }}>
                <Text fw={800} size="xl">
                  Import Sample Data
                </Text>
                <Text size="sm" style={{ color: 'var(--text-secondary)' }}>
                  Add placeholder data for patients, visits, and more to practice with.
                </Text>
              </Stack>
            </Group>
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gridAutoRows: '1fr',
                gap: 'var(--mantine-spacing-md)',
              }}
            >
              <Paper radius="md" withBorder p="lg" shadow="sm" style={{ display: 'flex', flexDirection: 'column' }}>
                <Stack gap="md" style={{ flex: 1 }}>
                  <Group gap="sm" align="center">
                    <IconUser size={24} color="var(--icon-secondary)" />
                    <Stack gap={0}>
                      <Text size="11px" fw={500} style={{ color: 'var(--text-label)' }}>
                        Sample Patient
                      </Text>
                      <Text fw={600} size="lg">
                        David James Williams
                      </Text>
                    </Stack>
                  </Group>
                  <Divider />
                  <Text size="md" style={{ flex: 1, color: 'var(--text-secondary)' }} mb="sm">
                    Includes a sample patient with demographics and basic clinical data.
                  </Text>
                </Stack>
                <Button
                  variant="filled"
                  size="sm"
                  fullWidth
                  onClick={handleImportPatient}
                  loading={importingPatient}
                  disabled={importingPatient}
                  leftSection={<IconDownload size={14} />}
                  mt="sm"
                >
                  {importingPatient ? 'Importing...' : 'Import Patient'}
                </Button>
              </Paper>
              <Paper radius="md" withBorder p="lg" shadow="sm" style={{ display: 'flex', flexDirection: 'column' }}>
                <Stack gap="md" style={{ flex: 1 }}>
                  <Group gap="sm" align="center">
                    <IconFileText size={24} color="var(--icon-secondary)" />
                    <Stack gap={0}>
                      <Text size="11px" fw={500} style={{ color: 'var(--text-label)' }}>
                        Sample Care Template
                      </Text>
                      <Text fw={600} size="lg">
                        Simple Initial Visit
                      </Text>
                    </Stack>
                  </Group>
                  <Divider />
                  <Text size="md" style={{ flex: 1, color: 'var(--text-secondary)' }}>
                    A simple note template for a first patient visit that includes tasks and questionnaires.
                  </Text>
                  <Text size="xs" c="dimmed" mb="sm">
                    Note: a Care Template (aka PlanDefinition FHIR resource) is required for creating visits.
                  </Text>
                </Stack>
                <Button
                  variant="filled"
                  size="sm"
                  fullWidth
                  onClick={handleImportVisit}
                  loading={importingVisit}
                  disabled={importingVisit}
                  leftSection={<IconDownload size={14} />}
                  mt="sm"
                >
                  {importingVisit ? 'Importing...' : 'Import Care Template'}
                </Button>
              </Paper>
              <Paper radius="md" withBorder p="lg" shadow="sm" style={{ display: 'flex', flexDirection: 'column' }}>
                <Stack gap="md" style={{ flex: 1 }}>
                  <Group gap="sm" align="center">
                    <IconBuilding size={24} color="var(--icon-secondary)" />
                    <Stack gap={0}>
                      <Text size="11px" fw={500} style={{ color: 'var(--text-label)' }}>
                        Practice Demo
                      </Text>
                      <Text fw={600} size="lg">
                        Full Practice Demo
                      </Text>
                    </Stack>
                  </Group>
                  <Divider />
                  <Text size="md" style={{ flex: 1, color: 'var(--text-secondary)' }} mb="sm">
                    Complete dataset with patients, practitioners, and schedules.
                  </Text>
                </Stack>
                <Button variant="outline" size="sm" fullWidth disabled mt="sm">
                  Coming Soon
                </Button>
              </Paper>
              <Paper radius="md" withBorder p="lg" shadow="sm" style={{ display: 'flex', flexDirection: 'column' }}>
                <Stack gap="md" style={{ flex: 1 }}>
                  <Group gap="sm" align="center">
                    <IconBuilding size={24} color="var(--icon-secondary)" />
                    <Stack gap={0}>
                      <Text size="11px" fw={500} style={{ color: 'var(--text-label)' }}>
                        Organization
                      </Text>
                      <Text fw={600} size="lg">
                        Sample Organization
                      </Text>
                    </Stack>
                  </Group>
                  <Divider />
                  <Text size="md" style={{ flex: 1, color: 'var(--text-secondary)' }} mb="sm">
                    Sample organization data with practitioners and locations.
                  </Text>
                </Stack>
                <Button variant="outline" size="sm" fullWidth disabled mt="sm">
                  Coming Soon
                </Button>
              </Paper>
            </Box>
          </Box>

          {/* Integrate Your Services */}
          <Box>
            <Group mb="xl" gap="sm" align="center">
              <ActionIcon
                size={48}
                radius="xl"
                variant="light"
                style={{
                  backgroundColor: 'var(--mantine-color-yellow-8)',
                  border: 'none',
                }}
              >
                <IconApps size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} style={{ flex: 1 }}>
                <Text fw={800} size="xl">
                  Integrate Your Services
                </Text>
                <Text size="sm" style={{ color: 'var(--text-secondary)' }}>
                  Contact us to connect existing services or set up new ones.
                </Text>
              </Stack>
            </Group>
            <Paper radius="md" withBorder p="md" shadow="sm">
              <Grid gutter="lg" align="center">
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Box
                    style={{
                      position: 'relative',
                      minHeight: '120px',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                    }}
                  >
                    <Box style={{ position: 'relative', width: '100%', height: '110px' }}>
                      {[
                        {
                          src: '/img/integrations/labcorp.png',
                          alt: 'Labcorp',
                          left: '20px',
                          top: '20px',
                          zIndex: 1,
                          rotation: '-2deg',
                        },
                        {
                          src: '/img/integrations/quest.png',
                          alt: 'Quest Diagnostics',
                          left: '70px',
                          top: '0px',
                          zIndex: 2,
                          rotation: '2deg',
                        },
                        {
                          src: '/img/integrations/candid.png',
                          alt: 'Candid Health',
                          left: '115px',
                          top: '30px',
                          zIndex: 3,
                          rotation: '-1deg',
                        },
                        {
                          src: '/img/integrations/okta.png',
                          alt: 'Okta',
                          left: '165px',
                          top: '10px',
                          zIndex: 4,
                          rotation: '1deg',
                        },
                        {
                          src: '/img/integrations/epic.png',
                          alt: 'Epic Systems',
                          left: '210px',
                          top: '40px',
                          zIndex: 5,
                          rotation: '-1.5deg',
                        },
                        {
                          src: '/img/integrations/healthgorilla.png',
                          alt: 'Health Gorilla',
                          left: '260px',
                          top: '5px',
                          zIndex: 6,
                          rotation: '1.5deg',
                        },
                      ].map((integration) => (
                        <Box
                          key={integration.src}
                          style={{
                            position: 'absolute',
                            left: integration.left,
                            top: integration.top,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '64px',
                            boxShadow: 'var(--mantine-shadow-xs)',
                            height: '64px',
                            padding: '4px',
                            backgroundColor: 'var(--mantine-color-white)',
                            borderRadius: 'var(--mantine-radius-md)',
                            border: '1px solid var(--mantine-color-gray-3)',
                            zIndex: integration.zIndex,
                            transform: `rotate(${integration.rotation})`,
                          }}
                        >
                          <img
                            src={integration.src}
                            alt={integration.alt}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="md" style={{ display: 'flex', justifyContent: 'center', height: '100%' }}>
                    <Box>
                      <Text size="sm" my="md">
                        Integrate with partners for…
                      </Text>
                      <List size="sm" spacing="0">
                        <List.Item>
                          <Text span size="sm" fw={600}>
                            Labs:
                          </Text>{' '}
                          Labcorp, Quest, & Health Gorilla
                        </List.Item>
                        <List.Item>
                          <Text span size="sm" fw={600}>
                            Pharmacies:
                          </Text>{' '}
                          Surescripts & DoseSpot
                        </List.Item>
                        <List.Item>
                          <Text span size="sm" fw={600}>
                            Billing:
                          </Text>{' '}
                          Candid Health & Stedi
                        </List.Item>
                        <List.Item>
                          <Text span size="sm" fw={600}>
                            Utilities:
                          </Text>{' '}
                          eFax, OpenAI, Okta, and more
                        </List.Item>
                      </List>
                    </Box>
                    <Box mb="sm">
                      <MedplumLink to="/integrations" c="blue" fw={500}>
                        View All Integrations →
                      </MedplumLink>
                    </Box>
                  </Stack>
                </Grid.Col>
              </Grid>
            </Paper>
          </Box>

          {/* How to Use Provider */}
          <Box>
            <Group mb="xl" gap="sm" align="center">
              <ActionIcon
                size={48}
                radius="xl"
                variant="light"
                style={{
                  backgroundColor: 'var(--mantine-color-yellow-8)',
                  border: 'none',
                }}
              >
                <IconBook size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} style={{ flex: 1 }}>
                <Text fw={800} size="xl">
                  View Our User Guide
                </Text>
                <Text size="sm" style={{ color: 'var(--text-secondary)' }}>
                  Follow step-by-step documentation to get the most out of Medplum Provider.
                </Text>
              </Stack>
            </Group>
            <Paper radius="md" withBorder shadow="sm" p={0} style={{ overflow: 'hidden' }}>
              <Grid gutter={0}>
                {/* Getting Started */}
                <Grid.Col span={{ base: 12, sm: 6 }} style={{ display: 'flex' }}>
                  <Box p="lg" style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'var(--mantine-spacing-md)',
                        bottom: 'var(--mantine-spacing-md)',
                        width: '1px',
                        backgroundColor: 'var(--mantine-color-default-border)',
                      }}
                    />
                    <Box
                      style={{
                        position: 'absolute',
                        left: 'var(--mantine-spacing-md)',
                        right: 'var(--mantine-spacing-md)',
                        bottom: 0,
                        height: '1px',
                        backgroundColor: 'var(--mantine-color-default-border)',
                      }}
                    />
                    <Text
                      component="a"
                      href="https://www.medplum.com/docs/provider/getting-started"
                      target="_blank"
                      fw={600}
                      size="lg"
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                      mb="xs"
                    >
                      Adding Practitioners & Data <IconArrowUpRight size={16} style={{ verticalAlign: 'middle' }} />
                    </Text>
                    <List size="md" spacing={2} style={{ flex: 1 }} c="blue">
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/getting-started#adding-practitioners"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Adding Practitioners
                        </Text>
                      </List.Item>
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/getting-started#importing-data"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Importing Data
                        </Text>
                      </List.Item>
                    </List>
                  </Box>
                </Grid.Col>

                {/* Patient Profile */}
                <Grid.Col span={{ base: 12, sm: 6 }} style={{ display: 'flex' }}>
                  <Box p="lg" style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box
                      style={{
                        position: 'absolute',
                        left: 'var(--mantine-spacing-md)',
                        right: 'var(--mantine-spacing-md)',
                        bottom: 0,
                        height: '1px',
                        backgroundColor: 'var(--mantine-color-default-border)',
                      }}
                    />
                    <Text
                      component="a"
                      href="https://www.medplum.com/docs/provider/patient-profile"
                      target="_blank"
                      fw={600}
                      size="lg"
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                      mb="xs"
                    >
                      Patient Profile <IconArrowUpRight size={16} style={{ verticalAlign: 'middle' }} />
                    </Text>
                    <List size="md" spacing={2} style={{ flex: 1 }} c="blue">
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/patient-profile#registering-patients"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Registering Patients
                        </Text>
                      </List.Item>
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/patient-profile#editing-patient-demographics"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Editing Patient Demographics
                        </Text>
                      </List.Item>
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/patient-profile#updating-the-patient-summary-sidebar"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Updating Patient Summary
                        </Text>
                      </List.Item>
                    </List>
                  </Box>
                </Grid.Col>

                {/* Schedule */}
                <Grid.Col span={{ base: 12, sm: 6 }} style={{ display: 'flex' }}>
                  <Box p="lg" style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'var(--mantine-spacing-md)',
                        bottom: 'var(--mantine-spacing-md)',
                        width: '1px',
                        backgroundColor: 'var(--mantine-color-default-border)',
                      }}
                    />
                    <Text
                      component="a"
                      href="https://www.medplum.com/docs/provider/schedule"
                      target="_blank"
                      fw={600}
                      size="lg"
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                      mb="xs"
                    >
                      Schedule <IconArrowUpRight size={16} style={{ verticalAlign: 'middle' }} />
                    </Text>
                    <List size="sm" spacing={2} style={{ flex: 1 }} c="blue">
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/schedule#scheduling-a-visit"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Scheduling a Visit
                        </Text>
                      </List.Item>
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/schedule#setting-provider-availability"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Setting Provider Availability
                        </Text>
                      </List.Item>
                    </List>
                  </Box>
                </Grid.Col>

                {/* Visits */}
                <Grid.Col span={{ base: 12, sm: 6 }} style={{ display: 'flex' }}>
                  <Box p="lg" style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Text
                      component="a"
                      href="https://www.medplum.com/docs/provider/visits"
                      target="_blank"
                      fw={600}
                      size="lg"
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                      mb="xs"
                    >
                      Visits <IconArrowUpRight size={16} style={{ verticalAlign: 'middle' }} />
                    </Text>
                    <List size="sm" spacing={2} style={{ flex: 1 }} c="blue">
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/visits#understanding-visits"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Understanding Visits
                        </Text>
                      </List.Item>
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/visits#documenting-visits"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Documenting Visits
                        </Text>
                      </List.Item>
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/visits#setting-up-care-templates-via-medplum-app"
                          target="_blank"
                          c="blue"
                          className="provider-link"
                          style={{ textDecoration: 'none' }}
                        >
                          Setting Up Care Templates
                        </Text>
                      </List.Item>
                    </List>
                  </Box>
                </Grid.Col>
              </Grid>
            </Paper>
          </Box>

          {/* Further Support */}
          <Box>
            <Group mb="xl" gap="sm" align="center">
              <ActionIcon
                size={48}
                radius="xl"
                variant="light"
                style={{
                  backgroundColor: 'var(--mantine-color-yellow-8)',
                  border: 'none',
                }}
              >
                <IconHelpCircle size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} style={{ flex: 1 }}>
                <Text fw={800} size="xl">
                  Get Help
                </Text>
                <Text size="sm" style={{ color: 'var(--text-secondary)' }}>
                  Join our community for discussion, or contact our team for support.
                </Text>
              </Stack>
            </Group>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, sm: 6 }} style={{ display: 'flex' }}>
                <Paper
                  radius="md"
                  withBorder
                  p="lg"
                  shadow="sm"
                  style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
                >
                  <Stack gap="md" style={{ flex: 1 }}>
                    <Group gap="sm" align="center">
                      <IconBrandDiscord size={24} color="var(--icon-secondary)" />
                      <Text fw={600} size="lg">
                        Discord Community
                      </Text>
                    </Group>
                    <Divider />
                    <Text size="md" style={{ flex: 1, color: 'var(--text-secondary)' }} mb="sm">
                      Join our active community for questions and discussions.
                    </Text>
                  </Stack>
                  <Button
                    component="a"
                    href="https://discord.gg/medplum"
                    target="_blank"
                    variant="filled"
                    size="sm"
                    mt="sm"
                    fullWidth
                    rightSection={<IconExternalLink size={14} />}
                  >
                    Join Medplum Discord
                  </Button>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }} style={{ display: 'flex' }}>
                <Paper
                  radius="md"
                  withBorder
                  p="lg"
                  shadow="sm"
                  style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
                >
                  <Stack gap="md" style={{ flex: 1 }}>
                    <Group gap="sm" align="center">
                      <IconMail size={24} color="var(--icon-secondary)" />
                      <Text fw={600} size="lg">
                        Contact Us
                      </Text>
                    </Group>
                    <Divider />
                    <Text size="md" style={{ flex: 1, color: 'var(--text-secondary)' }} mb="sm">
                      Get in touch with product questions, feedback, or for enterprise support.
                    </Text>
                  </Stack>
                  <Button
                    component="a"
                    href="mailto:support@medplum.com"
                    variant="filled"
                    size="sm"
                    mt="sm"
                    fullWidth
                    rightSection={<IconExternalLink size={14} />}
                  >
                    Contact Support
                  </Button>
                </Paper>
              </Grid.Col>
            </Grid>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
