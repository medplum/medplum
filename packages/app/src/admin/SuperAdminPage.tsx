import { Button, Divider, NativeSelect, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { convertLocalToIso, DateTimeInput, Document, Form, FormSection, useMedplum } from '@medplum/react';
import React from 'react';

export function SuperAdminPage(): JSX.Element {
  const medplum = useMedplum();

  if (!medplum.isLoading() && !medplum.isSuperAdmin()) {
    return <div>Not authorized</div>;
  }

  function rebuildStructureDefinitions(): void {
    medplum
      .post('admin/super/structuredefinitions', {})
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }

  function rebuildSearchParameters(): void {
    medplum
      .post('admin/super/searchparameters', {})
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }

  function rebuildValueSets(): void {
    medplum
      .post('admin/super/valuesets', {})
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }

  function reindexResourceType(formData: Record<string, string>): void {
    medplum
      .post('admin/super/reindex', formData)
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }

  function rebuildCompartments(formData: Record<string, string>): void {
    medplum
      .post('admin/super/compartments', formData)
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }

  function removeBotIdJobsFromQueue(formData: Record<string, string>): void {
    medplum
      .post('admin/super/removebotidjobsfromqueue', formData)
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }

  function purgeResources(formData: Record<string, string>): void {
    medplum
      .post('admin/super/purge', { ...formData, before: convertLocalToIso(formData.before) })
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }

  function forceSetPassword(formData: Record<string, string>): void {
    medplum
      .post('admin/super/setpassword', formData)
      .then(() => showNotification({ color: 'green', message: 'Done' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
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
      <Title order={2}>Reindex Resources</Title>
      <p>
        When Medplum changes how resources are indexed, the system may require a reindex for old resources to be indexed
        properly.
      </p>
      <Form onSubmit={reindexResourceType}>
        <Stack>
          <FormSection title="Resource Type">
            <TextInput name="resourceType" placeholder="Reindex Resource Type" />
          </FormSection>
          <Button type="submit">Reindex</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Rebuild Compartments</Title>
      <p>
        When Medplum changes how resource compartments are derived, the system may require a rebuild for old resources
        to take effect.
      </p>
      <Form onSubmit={rebuildCompartments}>
        <Stack>
          <FormSection title="Resource Type">
            <TextInput name="resourceType" placeholder="Compartments Resource Type" />
          </FormSection>
          <Button type="submit">Rebuild Compartments</Button>
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
    </Document>
  );
}
