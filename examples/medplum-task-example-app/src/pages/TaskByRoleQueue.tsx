import { Paper } from '@mantine/core';
import { Filter, getReferenceString, Operator, ResourceArray, SearchRequest } from '@medplum/core';
import { Practitioner, PractitionerRole, Task } from '@medplum/fhirtypes';
import { SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function TaskByRoleQueue(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filter[]>();
  const [roles, setRoles] = useState<PractitionerRole[]>();

  useEffect(() => {
    const getUserPractitionerRoles = async () => {
      const profile = (await medplum.getProfile()) as Practitioner;

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
    const getRoleFilters = async () => {
      const filterQueue: Filter[] = [];

      if (roles) {
        for (const role of roles) {
          const roleCode = role.specialty?.[0].coding?.[0];

          if (roleCode?.code) {
            const filter: Filter = { code: 'performer', operator: Operator.EQUALS, value: roleCode.code };
            filterQueue.push(filter);
          }
        }
      }

      setFilters(filterQueue);
    };

    getRoleFilters();
  }, [roles]);

  return (
    <Paper>
      <SearchControl
        search={{
          resourceType: 'Task',
          filters: filters,
        }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
      />
    </Paper>
  );
}
