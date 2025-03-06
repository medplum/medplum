import { Title, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import { Document, ResourceName, SearchControl, useMedplum, useMedplumNavigate, useMedplumProfile } from '@medplum/react';
import { Outlet } from 'react-router';

/**
 * A page component that displays a searchable list of all clinicians in the system.
 * Shows clinicians accessible to the current user in the current project context.
 * Provides search functionality and navigation to individual clinician details.
 * 
 * @component
 * @returns {JSX.Element} The clinicians listing page
 */
export function PractitionerPage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();
  const project = medplum.getProject();
  const navigate = useMedplumNavigate();

  return (
    <Document>
      <Title>
        Clinicians
      </Title>
      <Text mb="sm">
        Here are the Clinicians accessible to <ResourceName value={profile} link /> in <ResourceName value={project} link />
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
