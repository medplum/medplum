import { Button, Divider, NativeSelect, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { convertLocalToIso, DateTimeInput, Document, Form, FormSection, useMedplum } from '@medplum/react';
import React, { useState } from 'react';

export function SuperAdminPage(): JSX.Element {
  const medplum = useMedplum();
  const [resourceType, setResourceType] = useState('');

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

  function reindexResourceType(): void {
    medplum
      .post('admin/super/reindex', { resourceType })
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
      <Form>
        <Stack>
          <FormSection title="Resource Type">
            <TextInput
              name="resourceType"
              placeholder="Resource Type"
              defaultValue={resourceType}
              onChange={(e) => setResourceType(e.currentTarget.value)}
            />
          </FormSection>
          <Button onClick={reindexResourceType}>Reindex</Button>
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
