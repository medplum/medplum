import { Title } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import { Document, ResourceName, SearchControl, useMedplumNavigate, useMedplumProfile } from '@medplum/react';
import { Outlet } from 'react-router-dom';

/**
 * Home page that greets the user and displays a list of patients.
 * @returns A React component that displays the home page.
 */
export function HomePage(): JSX.Element {
  // useMedplumProfile() returns the "profile resource" associated with the user.
  // This can be a Practitioner, Patient, or RelatedPerson depending on the user's role in the project.
  // See the "Register" tutorial for more detail
  // https://www.medplum.com/docs/tutorials/register
  const profile = useMedplumProfile() as Practitioner;

  const navigate = useMedplumNavigate();

  return (
    <Document>
      <Title>
        <ResourceName value={profile} link />
      </Title>
      <SearchControl
        search={{ resourceType: 'Patient', fields: ['name', 'birthdate', 'gender'] }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar
      />
      <Outlet />
    </Document>
  );
}
