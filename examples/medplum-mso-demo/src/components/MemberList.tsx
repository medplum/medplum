import { Table, Button, Text, Group, Divider } from '@mantine/core';
import { useMedplum, useMedplumNavigate } from '@medplum/react';
import { Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import { useEffect, useState } from 'react';
import { unEnrollPatient, unEnrollPractitioner } from '../actions/enrollment';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';

/**
 * Props for the MemberList component.
 * @interface MemberListProps
 * @property {('Patient' | 'Practitioner')} resourceType - The type of resource to display in the list
 * @property {Organization} organization - The organization context for the member list
 * @property {(count: number) => void} [onCountChange] - Callback function when the member count changes
 * @property {string} [searchFilter] - Text to filter the member list by name
 */
interface MemberListProps {
  resourceType: 'Patient' | 'Practitioner';
  organization: Organization;
  onCountChange?: (count: number) => void;
  searchFilter?: string;
}

/**
 * A component that displays a list of members (either Patients or Practitioners) for an organization.
 * Supports searching, filtering, and unenrollment actions.
 * 
 * @component
 * @param {MemberListProps} props - The component props
 * @returns {JSX.Element} A table displaying the members with their names and actions
 */
export function MemberList({ resourceType, organization, onCountChange, searchFilter }: MemberListProps): JSX.Element {
  const medplum = useMedplum();
  const [members, setMembers] = useState<(Patient | Practitioner)[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<(Patient | Practitioner)[]>([]);
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
          const patients = searchResult.entry?.map(e => e.resource as Patient) ?? [];
          setMembers(patients);
          setFilteredMembers(patients);
          onCountChange?.(patients.length);

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
            const practitionerList = practitionerSearch.entry?.map(e => e.resource as Practitioner) ?? [];
            setMembers(practitionerList);
            setFilteredMembers(practitionerList);
            onCountChange?.(practitionerList.length);
          } else {
            setMembers([]);
            setFilteredMembers([]);
            onCountChange?.(0);
          }
        }
      } catch (error) {
        console.error(`Error loading ${resourceType}s:`, error);
        onCountChange?.(0);
      }
    };
    loadMembers().catch((error) => {
      console.error('Error loading members:', error);
      onCountChange?.(0);
    });

  }, [medplum, resourceType, organization, onCountChange]);

  // Filter members when search filter changes
  useEffect(() => {
    if (!searchFilter) {
      setFilteredMembers(members);
      onCountChange?.(members.length);
      return;
    }

    const filtered = members.filter(member => {
      const name = getName(member).toLowerCase();
      return name.includes(searchFilter.toLowerCase());
    });
    setFilteredMembers(filtered);
    onCountChange?.(filtered.length);
  }, [searchFilter, members, onCountChange]);

  const getName = (resource: Patient | Practitioner): string => {
    if (!resource.name?.[0]) {
      return 'Unknown';
    }
    const name = resource.name[0];
    return `${name.given?.[0] ?? ''} ${name.family ?? ''}`.trim();
  };

  const handleUnenroll = async (resource: Patient | Practitioner): Promise<void> => {
    try {
      if (resourceType === 'Patient') {
        await unEnrollPatient(medplum, resource as Patient, organization);
      } else if (resourceType === 'Practitioner') {
        await unEnrollPractitioner(medplum, resource as Practitioner, organization);
      }
      // Refresh the list after unenrollment
      const updatedMembers = members.filter(m => m.id !== resource.id);
      setMembers(updatedMembers);
      setFilteredMembers(updatedMembers);
      onCountChange?.(updatedMembers.length);

      showNotification({
        title: 'Success',
        message: `Successfully unenrolled ${getName(resource)} from ${organization.name}`,
        color: 'green',
      });
    } catch (error) {
      console.error(`Error unenrolling ${resourceType.toLowerCase()}:`, error);
      showNotification({
        title: 'Error',
        message: `Error unenrolling ${getName(resource)} from ${organization.name}`,
        color: 'red',
      });
    }
  };

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: '80%' }}>Name</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {filteredMembers.map((member) => (
          <Table.Tr key={member.id}>
            <Table.Td>
              <Text style={{ cursor: 'pointer' }} onClick={() => navigate(`/${resourceType}/${member.id}`)}>
                {getName(member)}
              </Text>
            </Table.Td>
            <Table.Td>
              <Group justify="flex-end">
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