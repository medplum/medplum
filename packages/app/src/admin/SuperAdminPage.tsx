import { Button, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Document, Form, FormSection, useMedplum } from '@medplum/react';
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

  return (
    <Document width={600}>
      <Title>Super Admin</Title>
      <hr />
      <h2>Structure Definitions</h2>
      <p>
        StructureDefinition resources contain the metadata about resource types. They are provided with the FHIR
        specification. Medplum also includes some custom StructureDefinition resources for internal data types. Press
        this button to update the database StructureDefinitions from the FHIR specification.
      </p>
      <Form>
        <Button onClick={rebuildStructureDefinitions}>Rebuild StructureDefinitions</Button>
      </Form>
      <hr />
      <h2>Search Parameters</h2>
      <p>
        SearchParameter resources contain the metadata about filters and sorting. They are provided with the FHIR
        specification. Medplum also includes some custom SearchParameter resources for internal data types. Press this
        button to update the database SearchParameters from the FHIR specification.
      </p>
      <Form>
        <Button onClick={rebuildSearchParameters}>Rebuild SearchParameters</Button>
      </Form>
      <hr />
      <h2>Value Sets</h2>
      <p>
        ValueSet resources enum values for a wide variety of use cases. Press this button to update the database
        ValueSets from the FHIR specification.
      </p>
      <Form>
        <Button onClick={rebuildValueSets}>Rebuild ValueSets</Button>
      </Form>
      <hr />
      <h2>Reindex Resources</h2>
      <p>
        When Medplum changes how resources are indexed, the system may require a reindex for old resources to be indexed
        properly.
      </p>
      <Form>
        <FormSection title="Resource Type">
          <TextInput
            name="resourceType"
            placeholder="Resource Type"
            defaultValue={resourceType}
            onChange={(e) => setResourceType(e.currentTarget.value)}
          />
        </FormSection>
        <Button onClick={reindexResourceType}>Reindex</Button>
      </Form>
    </Document>
  );
}
