import { Button, Document, Form, FormSection, TextField, useMedplum } from '@medplum/ui';
import React, { useState } from 'react';

export function SuperAdminPage() {
  const medplum = useMedplum();
  const [resourceType, setResourceType] = useState('');

  function rebuildStructureDefinitions() {
    medplum.post('admin/super/structuredefinitions', {}).then(() => alert('Done'));
  }

  function rebuildValueSets() {
    medplum.post('admin/super/valuesets', {}).then(() => alert('Done'));
  }

  function reindexResourceType() {
    medplum.post('admin/super/reindex', { resourceType }).then(() => alert('Done'));
  }

  return (
    <Document width={600}>
      <h1>Super Admin</h1>
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
          <TextField
            name="resourceType"
            placeholder="Resource Type"
            defaultValue={resourceType}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResourceType(e.target.value)}
          />
        </FormSection>
        <Button onClick={reindexResourceType}>Reindex</Button>
      </Form>
    </Document>
  );
}
