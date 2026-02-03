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
import classes from './GetStartedPage.module.css';

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

  const integrations = [
    { src: '/img/integrations/labcorp.png', alt: 'Labcorp', left: 20, top: 20, zIndex: 1, rotation: -2 },
    { src: '/img/integrations/quest.png', alt: 'Quest Diagnostics', left: 70, top: 0, zIndex: 2, rotation: 2 },
    { src: '/img/integrations/candid.png', alt: 'Candid Health', left: 115, top: 30, zIndex: 3, rotation: -1 },
    { src: '/img/integrations/okta.png', alt: 'Okta', left: 165, top: 10, zIndex: 4, rotation: 1 },
    { src: '/img/integrations/epic.png', alt: 'Epic Systems', left: 210, top: 40, zIndex: 5, rotation: -1.5 },
    { src: '/img/integrations/healthgorilla.png', alt: 'Health Gorilla', left: 260, top: 5, zIndex: 6, rotation: 1.5 },
  ];

  return (
    <Box className={classes.page} py="6rem">
      <Container size="md" className={classes.container}>
        {/* Header */}
        <Box mb="6rem">
          <Title order={2} fw={800}>
            Get Started with Medplum Provider
          </Title>
          <Text size="lg" mt=".25rem" className={classes.textSecondary}>
            Below are our recommended first steps to get set up and familiar with the available features and workflows
            in Provider. Please note: if you are using the free version of Provider, some services may not be
            available—lab ordering, prescriptions, billing, and access to code systems (such as CPT and ICD-10) require
            a paid plan.{' '}
            <Text
              component="a"
              href="https://www.medplum.com/pricing"
              target="_blank"
              c="blue.6"
              className={classes.link}
              span
            >
              Subscribe
            </Text>{' '}
            or{' '}
            <Text component="a" href="mailto:support@medplum.com" c="blue.6" className={classes.link} span>
              contact us
            </Text>{' '}
            to integrate these services.
          </Text>
        </Box>

        <Stack gap="6rem">
          {/* Sample Data */}
          <Box>
            <Group mb="xl" gap="sm" align="center">
              <ActionIcon size={48} radius="xl" variant="light" className={classes.sectionIcon}>
                <IconDatabase size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} className={classes.flexOne}>
                <Text fw={800} size="xl">
                  Import Sample Data
                </Text>
                <Text size="sm" className={classes.textSecondary}>
                  Add placeholder data for patients, visits, and more to practice with.
                </Text>
              </Stack>
            </Group>
            <Box className={classes.sampleDataGrid}>
              <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.card}>
                <Stack gap="md" className={classes.flexOne}>
                  <Group gap="sm" align="center">
                    <IconUser size={24} color="var(--icon-secondary)" />
                    <Stack gap={0}>
                      <Text size="11px" fw={500} className={classes.textLabel}>
                        Sample Patient
                      </Text>
                      <Text fw={600} size="lg">
                        David James Williams
                      </Text>
                    </Stack>
                  </Group>
                  <Divider />
                  <Text size="md" className={classes.textSecondary} mb="sm" style={{ flex: 1 }}>
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
              <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.card}>
                <Stack gap="md" className={classes.flexOne}>
                  <Group gap="sm" align="center">
                    <IconFileText size={24} color="var(--icon-secondary)" />
                    <Stack gap={0}>
                      <Text size="11px" fw={500} className={classes.textLabel}>
                        Sample Care Template
                      </Text>
                      <Text fw={600} size="lg">
                        Simple Initial Visit
                      </Text>
                    </Stack>
                  </Group>
                  <Divider />
                  <Text size="md" className={classes.textSecondary} style={{ flex: 1 }}>
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
              <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.card}>
                <Stack gap="md" className={classes.flexOne}>
                  <Group gap="sm" align="center">
                    <IconBuilding size={24} color="var(--icon-secondary)" />
                    <Stack gap={0}>
                      <Text size="11px" fw={500} className={classes.textLabel}>
                        Practice Demo
                      </Text>
                      <Text fw={600} size="lg">
                        Full Practice Demo
                      </Text>
                    </Stack>
                  </Group>
                  <Divider />
                  <Text size="md" className={classes.textSecondary} mb="sm" style={{ flex: 1 }}>
                    Complete dataset with patients, practitioners, and schedules.
                  </Text>
                </Stack>
                <Button variant="outline" size="sm" fullWidth disabled mt="sm">
                  Coming Soon
                </Button>
              </Paper>
              <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.card}>
                <Stack gap="md" className={classes.flexOne}>
                  <Group gap="sm" align="center">
                    <IconBuilding size={24} color="var(--icon-secondary)" />
                    <Stack gap={0}>
                      <Text size="11px" fw={500} className={classes.textLabel}>
                        Organization
                      </Text>
                      <Text fw={600} size="lg">
                        Sample Organization
                      </Text>
                    </Stack>
                  </Group>
                  <Divider />
                  <Text size="md" className={classes.textSecondary} mb="sm" style={{ flex: 1 }}>
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
              <ActionIcon size={48} radius="xl" variant="light" className={classes.sectionIcon}>
                <IconApps size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} className={classes.flexOne}>
                <Text fw={800} size="xl">
                  Integrate Your Services
                </Text>
                <Text size="sm" className={classes.textSecondary}>
                  Contact us to connect existing services or set up new ones.
                </Text>
              </Stack>
            </Group>
            <Paper radius="md" withBorder p="md" shadow="sm">
              <Grid gutter="lg" align="center">
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Box className={classes.integrationsContainer}>
                    <Box className={classes.integrationsInner}>
                      {integrations.map((integration) => (
                        <Box
                          key={integration.src}
                          className={classes.integrationCard}
                          style={{
                            left: integration.left,
                            top: integration.top,
                            zIndex: integration.zIndex,
                            transform: `rotate(${integration.rotation}deg)`,
                          }}
                        >
                          <img src={integration.src} alt={integration.alt} className={classes.integrationImage} />
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
              <ActionIcon size={48} radius="xl" variant="light" className={classes.sectionIcon}>
                <IconBook size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} className={classes.flexOne}>
                <Text fw={800} size="xl">
                  View Our User Guide
                </Text>
                <Text size="sm" className={classes.textSecondary}>
                  Follow step-by-step documentation to get the most out of Medplum Provider.
                </Text>
              </Stack>
            </Group>
            <Paper radius="md" withBorder shadow="sm" p={0} style={{ overflow: 'hidden' }}>
              <Grid gutter={0}>
                {/* Getting Started */}
                <Grid.Col span={{ base: 12, sm: 6 }} className={classes.gridCell}>
                  <Box p="lg" className={classes.gridCellContent}>
                    <Box className={classes.dividerRight} />
                    <Box className={classes.dividerBottom} />
                    <Text
                      component="a"
                      href="https://www.medplum.com/docs/provider/getting-started"
                      target="_blank"
                      fw={600}
                      size="lg"
                      className={classes.sectionTitle}
                      mb="xs"
                    >
                      Adding Practitioners & Data <IconArrowUpRight size={16} style={{ verticalAlign: 'middle' }} />
                    </Text>
                    <List size="md" spacing={2} className={classes.flexOne} c="blue">
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/getting-started#adding-practitioners"
                          target="_blank"
                          c="blue"
                          className={classes.link}
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
                          className={classes.link}
                        >
                          Importing Data
                        </Text>
                      </List.Item>
                    </List>
                  </Box>
                </Grid.Col>

                {/* Patient Profile */}
                <Grid.Col span={{ base: 12, sm: 6 }} className={classes.gridCell}>
                  <Box p="lg" className={classes.gridCellContent}>
                    <Box className={classes.dividerBottom} />
                    <Text
                      component="a"
                      href="https://www.medplum.com/docs/provider/patient-profile"
                      target="_blank"
                      fw={600}
                      size="lg"
                      className={classes.sectionTitle}
                      mb="xs"
                    >
                      Patient Profile <IconArrowUpRight size={16} style={{ verticalAlign: 'middle' }} />
                    </Text>
                    <List size="md" spacing={2} className={classes.flexOne} c="blue">
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/patient-profile#registering-patients"
                          target="_blank"
                          c="blue"
                          className={classes.link}
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
                          className={classes.link}
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
                          className={classes.link}
                        >
                          Updating Patient Summary
                        </Text>
                      </List.Item>
                    </List>
                  </Box>
                </Grid.Col>

                {/* Schedule */}
                <Grid.Col span={{ base: 12, sm: 6 }} className={classes.gridCell}>
                  <Box p="lg" className={classes.gridCellContent}>
                    <Box className={classes.dividerRight} />
                    <Text
                      component="a"
                      href="https://www.medplum.com/docs/provider/schedule"
                      target="_blank"
                      fw={600}
                      size="lg"
                      className={classes.sectionTitle}
                      mb="xs"
                    >
                      Schedule <IconArrowUpRight size={16} style={{ verticalAlign: 'middle' }} />
                    </Text>
                    <List size="sm" spacing={2} className={classes.flexOne} c="blue">
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/schedule#scheduling-a-visit"
                          target="_blank"
                          c="blue"
                          className={classes.link}
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
                          className={classes.link}
                        >
                          Setting Provider Availability
                        </Text>
                      </List.Item>
                    </List>
                  </Box>
                </Grid.Col>

                {/* Visits */}
                <Grid.Col span={{ base: 12, sm: 6 }} className={classes.gridCell}>
                  <Box p="lg" className={classes.gridCellContent}>
                    <Text
                      component="a"
                      href="https://www.medplum.com/docs/provider/visits"
                      target="_blank"
                      fw={600}
                      size="lg"
                      className={classes.sectionTitle}
                      mb="xs"
                    >
                      Visits <IconArrowUpRight size={16} style={{ verticalAlign: 'middle' }} />
                    </Text>
                    <List size="sm" spacing={2} className={classes.flexOne} c="blue">
                      <List.Item>
                        <Text
                          component="a"
                          href="https://www.medplum.com/docs/provider/visits#understanding-visits"
                          target="_blank"
                          c="blue"
                          className={classes.link}
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
                          className={classes.link}
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
                          className={classes.link}
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
              <ActionIcon size={48} radius="xl" variant="light" className={classes.sectionIcon}>
                <IconHelpCircle size={24} color="white" />
              </ActionIcon>
              <Stack gap={0} className={classes.flexOne}>
                <Text fw={800} size="xl">
                  Get Help
                </Text>
                <Text size="sm" className={classes.textSecondary}>
                  Join our community for discussion, or contact our team for support.
                </Text>
              </Stack>
            </Group>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, sm: 6 }} className={classes.gridCell}>
                <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.helpCard}>
                  <Stack gap="md" className={classes.flexOne}>
                    <Group gap="sm" align="center">
                      <IconBrandDiscord size={24} color="var(--icon-secondary)" />
                      <Text fw={600} size="lg">
                        Discord Community
                      </Text>
                    </Group>
                    <Divider />
                    <Text size="md" className={classes.textSecondary} mb="sm" style={{ flex: 1 }}>
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
              <Grid.Col span={{ base: 12, sm: 6 }} className={classes.gridCell}>
                <Paper radius="md" withBorder p="lg" shadow="sm" className={classes.helpCard}>
                  <Stack gap="md" className={classes.flexOne}>
                    <Group gap="sm" align="center">
                      <IconMail size={24} color="var(--icon-secondary)" />
                      <Text fw={600} size="lg">
                        Contact Us
                      </Text>
                    </Group>
                    <Divider />
                    <Text size="md" className={classes.textSecondary} mb="sm" style={{ flex: 1 }}>
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
