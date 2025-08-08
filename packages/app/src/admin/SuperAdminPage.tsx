// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Button,
  Divider,
  Grid,
  Modal,
  NativeSelect,
  NumberInput,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { forbidden, normalizeErrorString } from '@medplum/core';
import { Parameters } from '@medplum/fhirtypes';
import {
  DateTimeInput,
  Document,
  Form,
  FormSection,
  OperationOutcomeAlert,
  convertLocalToIso,
  useMedplum,
} from '@medplum/react';
import { JSX, ReactNode, useState } from 'react';
import { startAsyncJob } from './SuperAdminStartAsyncJob';

export function SuperAdminPage(): JSX.Element {
  const medplum = useMedplum();
  const [opened, { open, close }] = useDisclosure(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<ReactNode | undefined>();

  if (!medplum.isLoading() && !medplum.isSuperAdmin()) {
    return <OperationOutcomeAlert outcome={forbidden} />;
  }

  function rebuildStructureDefinitions(): void {
    startAsyncJob(medplum, 'Rebuilding Structure Definitions', 'admin/super/structuredefinitions');
  }

  function rebuildSearchParameters(): void {
    startAsyncJob(medplum, 'Rebuilding Search Parameters', 'admin/super/searchparameters');
  }

  function rebuildValueSets(): void {
    startAsyncJob(medplum, 'Rebuilding Value Sets', 'admin/super/valuesets');
  }

  function reindexResourceType(formData: Record<string, string>): void {
    startAsyncJob(medplum, 'Reindexing Resources', 'admin/super/reindex', formData);
  }

  function reloadCron(): void {
    startAsyncJob(medplum, 'Reload Cron Resources', 'admin/super/reloadcron');
  }

  function runPendingDataMigration(): void {
    startAsyncJob(medplum, 'Run Pending Data Migration', 'admin/super/migrate');
  }

  function removeBotIdJobsFromQueue(formData: Record<string, string>): void {
    medplum
      .post('admin/super/removebotidjobsfromqueue', formData)
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  function purgeResources(formData: Record<string, string>): void {
    medplum
      .post('admin/super/purge', { ...formData, before: convertLocalToIso(formData.before) })
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  function forceSetPassword(formData: Record<string, string>): void {
    medplum
      .post('admin/super/setpassword', formData)
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  function getDatabaseStats(formData: Record<string, string>): void {
    medplum
      .post(
        'fhir/R4/$db-stats',
        formData.tableNames
          ? {
              resourceType: 'Parameters',
              parameter: [{ name: 'tableNames', valueString: formData.tableNames }],
            }
          : undefined
      )
      .then((params: Parameters) => {
        setModalTitle('Database Stats');
        setModalContent(<pre>{params.parameter?.find((p) => p.name === 'tableString')?.valueString}</pre>);
        open();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  function getDatabaseInvalidIndexes(): void {
    medplum
      .post('fhir/R4/$db-invalid-indexes')
      .then((params: Parameters) => {
        setModalTitle('Database Invalid Indexes');
        setModalContent(
          <pre>
            {params.parameter
              ?.filter((p) => p.name === 'invalidIndex')
              .map((p) => p.valueString)
              .join('\n')}
          </pre>
        );
        open();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  function getSchemaDiff(): void {
    medplum
      .post('fhir/R4/$db-schema-diff')
      .then((params: Parameters) => {
        setModalTitle('Schema Diff');
        setModalContent(<pre>{params.parameter?.find((p) => p.name === 'migrationString')?.valueString}</pre>);
        open();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  function reconcileSchemaDiff(): void {
    startAsyncJob(medplum, 'Reconcile Schema Diff', 'admin/super/reconcile-db-schema-drift');
  }

  return (
    <Document width={600}>
      <Title order={1}>Super Admin</Title>
      <Divider my="lg" />
      <Title order={2}>Structure Definitions</Title>
      <p>
        StructureDefinition resources contain the metadata about resource types. They are provided with the FHIR
        specification. Medplum also includes some custom StructureDefinition resources for internal data types. Press
        this button to update the database StructureDefinitions from the FHIR specification.
      </p>
      <Form>
        <Button onClick={rebuildStructureDefinitions}>Rebuild StructureDefinitions</Button>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Search Parameters</Title>
      <p>
        SearchParameter resources contain the metadata about filters and sorting. They are provided with the FHIR
        specification. Medplum also includes some custom SearchParameter resources for internal data types. Press this
        button to update the database SearchParameters from the FHIR specification.
      </p>
      <Form>
        <Button onClick={rebuildSearchParameters}>Rebuild SearchParameters</Button>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Value Sets</Title>
      <p>
        ValueSet resources enum values for a wide variety of use cases. Press this button to update the database
        ValueSets from the FHIR specification.
      </p>
      <Form>
        <Button onClick={rebuildValueSets}>Rebuild ValueSets</Button>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Run Pending Data Migration</Title>
      <p>
        When a Medplum version releases with data migrations to apply, you can run them here. Press this button to kick
        off the background data migration process.
      </p>
      <Form onSubmit={runPendingDataMigration}>
        <Stack>
          <Button type="submit">Start Migration</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Reindex Resources</Title>
      <p>
        When Medplum changes how resources are indexed, the system may require a reindex for old resources to be indexed
        properly.
      </p>
      <Form onSubmit={reindexResourceType}>
        <Stack>
          <FormSection title="Resource Type" htmlFor="resourceType">
            <TextInput id="resourceType" name="resourceType" placeholder="Reindex Resource Type" />
          </FormSection>
          <FormSection title="Search Filter" htmlFor="filter">
            <TextInput id="filter" name="filter" placeholder="e.g. name=Sam&birthdate=lt2000-01-01" />
          </FormSection>
          <FormSection title="Max Resource Version" htmlFor="maxResourceVersion">
            <MaxResourceVersionInput />
          </FormSection>
          <Button type="submit">Reindex</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Purge Resources</Title>
      <p>As system generated resources accumulate, the system may require a purge to remove old resources.</p>
      <Form onSubmit={purgeResources}>
        <Stack>
          <FormSection title="Purge Resource Type" htmlFor="purgeResourceType">
            <NativeSelect id="purgeResourceType" name="resourceType" data={['', 'AuditEvent', 'Login']} />
          </FormSection>
          <FormSection title="Purge Before" htmlFor="before">
            <DateTimeInput name="before" placeholder="Before Date" />
          </FormSection>
          <Button type="submit">Purge</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Remove Bot ID Jobs from Queue</Title>
      <p>Remove all queued jobs for a Bot ID</p>
      <Form onSubmit={removeBotIdJobsFromQueue}>
        <Stack>
          <FormSection title="Bot ID">
            <TextInput name="botId" placeholder="Bot Id" />
          </FormSection>
          <Button type="submit">Remove Jobs by Bot ID</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Force Set Password</Title>
      <p>
        Note that this applies to all projects for the user. Therefore, this should only be used in extreme
        circumstances. Always prefer to use the "Forgot Password" flow first.
      </p>
      <Form onSubmit={forceSetPassword}>
        <Stack>
          <TextInput name="email" label="Email" required />
          <PasswordInput name="password" label="Password" required />
          <TextInput name="projectId" label="Project ID" />
          <Button type="submit">Force Set Password</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Database Stats</Title>
      <p>Query current table statistics from the database.</p>
      <Form onSubmit={getDatabaseStats}>
        <Stack>
          <FormSection title="Table Names (comma-delimited)" htmlFor="tableNames">
            <TextInput id="tableNames" name="tableNames" placeholder="Observation,Observation_History" />
          </FormSection>
          <Button type="submit">Get Database Stats</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Database Invalid Indexes</Title>
      <p>Query invalid indexes from the database.</p>
      <Form onSubmit={getDatabaseInvalidIndexes}>
        <Stack>
          <Button type="submit">Get Database Invalid Indexes</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Database Schema Drift</Title>
      <p>Show the schema migration needed to match the expected database schema.</p>
      <Grid>
        <Grid.Col span={6}>
          <Form onSubmit={getSchemaDiff}>
            <Stack>
              <Button type="submit">Get Schema Drift</Button>
            </Stack>
          </Form>
        </Grid.Col>
        <Grid.Col span={6}>
          <Form onSubmit={reconcileSchemaDiff}>
            <Stack>
              <Button type="submit">Reconcile Schema Drift</Button>
            </Stack>
          </Form>
        </Grid.Col>
      </Grid>
      <Divider my="lg" />
      <Title order={2}>Reload Cron Resources</Title>
      <p>Obliterates the cron queue and rebuilds all the cron job schedulers for cron resources (eg. cron bots).</p>
      <Form onSubmit={reloadCron}>
        <Stack>
          <Button type="submit">Reload Cron Resources</Button>
        </Stack>
      </Form>

      <Modal opened={opened} onClose={close} title={modalTitle} centered size="auto">
        {modalContent}
      </Modal>
    </Document>
  );
}

function MaxResourceVersionInput(): JSX.Element {
  const [value, setValue] = useState<'outdated' | 'all' | 'specific'>('outdated');
  return (
    <>
      <NativeSelect
        id="reindexType"
        name="reindexType"
        value={value}
        onChange={(e) => setValue(e.target.value as 'outdated' | 'all' | 'specific')}
        data={[
          { label: 'Outdated resources', value: 'outdated' },
          { label: 'All resources', value: 'all' },
          { label: 'Less than or equal to a specific version', value: 'specific' },
        ]}
      />
      {value === 'specific' && (
        <NumberInput required name="maxResourceVersion" placeholder="Max Resource Version" min={0} />
      )}
    </>
  );
}
