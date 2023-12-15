import { Tabs } from '@mantine/core';
import { Filter, getReferenceString, Operator, ResourceArray, SearchRequest } from '@medplum/core';
import { Practitioner, PractitionerRole } from '@medplum/fhirtypes';
import { Document, SearchControl, useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * A queue that displays unclaimed tasks that are assigned to the current user's role
 * @returns A React component that displays a queue of tasks for a given role
 */
export function TaskByRoleQueue(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();
  const [roles, setRoles] = useState<PractitionerRole[]>();
  const [search, setSearch] = useState<SearchRequest>({ resourceType: 'Task' });

  useEffect(() => {
    // Search for all PractitionerRoles for the logged in user
    const getUserPractitionerRoles = async () => {
      const results: ResourceArray<PractitionerRole> = await medplum.searchResources('PractitionerRole', {
        practitioner: `Practitioner/${profile.id}`,
      });

      const practitionerRoles: PractitionerRole[] = results.filter(
        (result) => result.resourceType === 'PractitionerRole'
      );

      setRoles(practitionerRoles);
    };

    getUserPractitionerRoles();
  }, []);

  useEffect(() => {
    // Add a filter to only show tasks without an owner
    const filters: Filter[] = [{ code: 'owner:missing', operator: Operator.EQUALS, value: 'true' }];

    if (roles) {
      // Add a filter for each of the user's roles
      for (const role of roles) {
        const roleCode = role.specialty?.[0].coding?.[0];

        if (roleCode?.code) {
          const filter: Filter = { code: 'performer', operator: Operator.EQUALS, value: roleCode.code };
          filters.push(filter);
        }
      }
    }

    // Add filters for active and complete tabs

    const fields = ['id', 'priority', 'description', 'for'];
    const sortRules = [{ code: '-priority-order,due-date' }];

    const populatedSearch = {
      ...search,
      fields,
      sortRules,
      filters,
    };

    setSearch(populatedSearch);
  }, [roles]);

  return (
    <Document>
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideFilters={true}
        hideToolbar={true}
      />
    </Document>
  );
}
