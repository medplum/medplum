import { Title, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import {
  Document,
  ResourceName,
  SearchControl,
  useMedplum,
  useMedplumNavigate,
  useMedplumProfile,
} from '@medplum/react';
import { Outlet } from 'react-router';

/**
 * A page component that displays a searchable list of clinical communications.
 * Shows communications accessible to the current user in the current project context.
 * Provides search functionality by subject, sender, recipient, and payload content,
 * with navigation to communication details.
 *
 * @returns The communications listing page
 */
export function CommunicationPage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();
  const project = medplum.getProject();
  const navigate = useMedplumNavigate();

  return (
    <Document>
      <Title>Communications</Title>
      <Text mb="sm">
        Here are the Communications accessible to <ResourceName value={profile} link /> in{' '}
        <ResourceName value={project} link />
      </Text>
      <SearchControl
        search={{
          resourceType: 'Communication',
          fields: ['payload', 'subject'],
        }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar
      />
      <Outlet />
    </Document>
  );
}
