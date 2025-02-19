import { Title, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import { Document, ResourceName, SearchControl, useMedplum, useMedplumNavigate, useMedplumProfile } from '@medplum/react';
import { Outlet } from 'react-router-dom';

/**
 * Organization page that greets the user and displays a list of organizations.
 * @returns A React component that displays the Organization page.
 */
export function PractitionerPage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();
  const project = medplum.getProject();
  const navigate = useMedplumNavigate();

  return (
    <Document>
      <Title>
        Practitioners
      </Title>
      <Text mb="sm">
        Here are the Practitioners accessible to <ResourceName value={profile} link /> in <ResourceName value={project} link />
      </Text>
      <SearchControl
        search={{
          resourceType: 'Practitioner',
          fields: ['name'],
        }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar
       />
      <Outlet />
    </Document>
  );
}
