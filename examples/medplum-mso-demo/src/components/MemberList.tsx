import { Table, Button, Text, Group } from '@mantine/core';
import { useMedplum, useMedplumNavigate } from '@medplum/react';
import { Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import { useEffect, useState } from 'react';
import { unEnrollPatient, unEnrollPractitioner } from '../actions/enrollment';

interface MemberListProps {
  resourceType: 'Patient' | 'Practitioner';
  organization: Organization;
}

export function MemberList({ resourceType, organization }: MemberListProps): JSX.Element {
  const medplum = useMedplum();
  const [members, setMembers] = useState<(Patient | Practitioner)[]>([]);
  const navigate = useMedplumNavigate();
  useEffect(() => {
    const loadMembers = async (): Promise<void> => {
      try {
        // For Patients, use compartment search
        if (resourceType === 'Patient') {
          const searchResult = await medplum.search('Patient', {
            _compartment: `Organization/${organization.id}`,
            _fields: 'name'
          });
          setMembers(searchResult.entry?.map(e => e.resource as Patient) ?? []);

        // For Practitioners, search ProjectMemberships first
        } else if (resourceType === 'Practitioner') {
          const membershipSearch = await medplum.search('ProjectMembership', {
            _include: 'ProjectMembership:profile'
          });

          // Get practitioners with access to this organization
          const practitioners = membershipSearch.entry
            ?.filter(e => e.resource?.access?.some(a => 
              a.parameter?.some(p => 
                p.name === 'organization' && 
                p.valueReference?.reference === `Organization/${organization.id}`
              )
            ))
            .map(e => e.resource?.profile)
            .filter(Boolean);

          if (practitioners && practitioners.length > 0) {
            const practitionerSearch = await medplum.search('Practitioner', {
              _id: practitioners.map(p => p?.reference?.split('/')[1] as string).join(','),
              _fields: 'name'
            });
            setMembers(practitionerSearch.entry?.map(e => e.resource as Practitioner) ?? []);
          } else {
            setMembers([]);
          }
        }
      } catch (error) {
        console.error(`Error loading ${resourceType}s:`, error);
      }
    };
    loadMembers().catch((error) => {
      console.error('Error loading members:', error);
    });

  }, [medplum, resourceType, organization]);

  const getName = (resource: Patient | Practitioner): string => {
    if (!resource.name?.[0]) {
      return 'Unknown';
    }
    const name = resource.name[0];
    return `${name.given?.[0] ?? ''} ${name.family ?? ''}`.trim();
  };

  const handleUnenroll = (resource: Patient | Practitioner): void => {
    if (resourceType === 'Patient') {
      unEnrollPatient(medplum, resource as Patient, organization).catch((error) => {
        console.error('Error unenrolling patient:', error);
      });
    } else if (resourceType === 'Practitioner') {
      unEnrollPractitioner(medplum, resource as Practitioner, organization).catch((error) => {
        console.error('Error unenrolling practitioner:', error);
      });
    }
  };

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {members.map((member) => (
          <Table.Tr key={member.id}>
            <Table.Td>
              <Text style={{ cursor: 'pointer' }} onClick={() => navigate(`/${resourceType}/${member.id}`)}>
                {getName(member)}
              </Text>
            </Table.Td>
            <Table.Td>
              <Group>
                <Button size="xs" color="red" onClick={() => handleUnenroll(member)}>
                  Unenroll
                </Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
} 