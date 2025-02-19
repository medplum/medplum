import { Title } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Document, SearchControl, useMedplumNavigate } from '@medplum/react';
import { Outlet } from 'react-router-dom';

/**
 * Organization page that greets the user and displays a list of organizations.
 * @returns A React component that displays the Organization page.
 */
export function OrganizationPage(): JSX.Element {

  const navigate = useMedplumNavigate();

  return (
    <Document>
      <Title order={2} mb="sm">Manage Organizations</Title>

      <Title mb="sm">
        Select an organization and view its members
      </Title>
      <SearchControl
        search={{ resourceType: 'Organization', fields: ['name'] }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}/manage`)}
        hideToolbar
      />
      <Outlet />
    </Document>
  );
}
