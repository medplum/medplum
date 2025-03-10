import { Table, Button, Text, Group, Divider, TextInput, Badge, Modal, Stack, MultiSelect } from '@mantine/core';
import { useMedplum, useMedplumNavigate, ResourceInput } from '@medplum/react';
import { Organization, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useEffect, useState } from 'react';
import { unEnrollPatient, unEnrollPractitioner, enrollPatient, enrollPractitioner, getEnrolledPractitioners, getEnrolledPatients } from '../utils/enrollment';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { IconRefresh, IconPlus, IconSearch } from '@tabler/icons-react';
interface MemberListProps {
  resourceType: 'Patient' | 'Practitioner';
  organization: Organization;
}

/**
 * A component that displays a list of members (either Patients or Practitioners) for an organization.
 * Supports searching, filtering, enrollment, and unenrollment actions.
 * 
 * @component
 * @param {MemberListProps} props - The component props
 * @returns {JSX.Element} A table displaying the members with their names and actions
 */
export function MemberList({ resourceType, organization }: MemberListProps): JSX.Element {
  const medplum = useMedplum();
  const [members, setMembers] = useState<(Patient | Practitioner)[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<(Patient | Practitioner)[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [enrollModalOpen, setEnrollModalOpen] = useState<boolean>(false);
  const [selectedPatients, setSelectedPatients] = useState<Patient[]>([]);
  const [selectedPractitioners, setSelectedPractitioners] = useState<Practitioner[]>([]);
  const [availableResources, setAvailableResources] = useState<{ value: string; label: string }[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const navigate = useMedplumNavigate();

  // Load members when component mounts
  useEffect(() => {
    loadMembers();
  }, []);

    // Load available resources when modal opens
    useEffect(() => {
      if (enrollModalOpen) {
        loadAvailableResources();
      }
    }, [enrollModalOpen]);
  

  // Filter members when search filter changes
  useEffect(() => {
    if (!searchFilter) {
      setFilteredMembers(members);
      return;
    }
    const filtered = members.filter(member => {
      const name = getName(member).toLowerCase();
      return name.includes(searchFilter.toLowerCase());
    });
    setFilteredMembers(filtered);
  }, [searchFilter, members]);

  // Fetch enrolled Patients or Clinicians
  const loadMembers = async (): Promise<void> => {
    try {
      setIsLoading(true);
      let members: (Patient | Practitioner)[] = [];
      if (resourceType === 'Patient') {
        members = await getEnrolledPatients(medplum, organization);
      } else if (resourceType === 'Practitioner') {
        members = await getEnrolledPractitioners(medplum, organization);
      }
      setMembers(members);
      setFilteredMembers(members);
    } catch (error) {
      showNotification({
        title: 'Error',
        message: `Error loading ${resourceType}s: ${error}`,
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Get the name of a resource
  const getName = (resource: Patient | Practitioner): string => {
    if (!resource.name?.[0]) {
      return 'Unknown';
    }
    const name = resource.name[0];
    return `${name.given?.[0] ?? ''} ${name.family ?? ''}`.trim();
  };

  // Unenroll a Patient or Practitioner from the organization
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

      showNotification({
        title: 'Success',
        message: `Successfully unenrolled ${getName(resource)} from ${organization.name}`,
        color: 'green',
      });

      loadMembers();
    } catch (error) {
      showNotification({
        title: 'Error',
        message: `Error unenrolling ${getName(resource)} from ${organization.name}`,
        color: 'red',
      });
    }
  };

  // Load available resources for enrollment. These are the resources that are not already enrolled in the organization.
  const loadAvailableResources = async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      if (resourceType === 'Patient') {
        const searchResult = await medplum.search('Patient', {
          _count: 100,
          _fields: 'name,meta',
        });

        const patients = searchResult.entry?.map(e => e.resource as Patient) ?? [];
        const enrolledPatients = await getEnrolledPatients(medplum, organization);
        const availablePatients = patients.filter(patient => !enrolledPatients.some(p => p.id === patient.id));
        
        const options = availablePatients.map(patient => ({
          value: patient.id as string,
          label: getName(patient),
        }));
        
        setAvailableResources(options);
      } else if (resourceType === 'Practitioner') {
        const searchResult = await medplum.search('Practitioner', {
          _count: 100,
          _fields: 'name',
        });

        const practitioners = searchResult.entry?.map(e => e.resource as Practitioner) ?? [];
        const enrolledPractitioners = await getEnrolledPractitioners(medplum, organization);
        const availablePractitioners = practitioners.filter(practitioner => !enrolledPractitioners.some(p => p.id === practitioner.id));
        
        const options = availablePractitioners.map(practitioner => ({
          value: practitioner.id as string,
          label: getName(practitioner),
        }));
        
        setAvailableResources(options);
      }
    } catch (error) {
      showNotification({
        title: 'Error',
        message: `Error loading available ${resourceType}s: ${error}`,
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle selection change in MultiSelect
  const handleSelectionChange = async (selectedIds: string[]): Promise<void> => {
    setSelectedResourceIds(selectedIds);
    try {
      if (resourceType === 'Patient') {
        const patients: Patient[] = [];
        
        for (const id of selectedIds) {
          const patient = await medplum.readResource('Patient', id);
          patients.push(patient);
        }
        
        setSelectedPatients(patients);
      } else if (resourceType === 'Practitioner') {
        const practitioners: Practitioner[] = [];
        
        for (const id of selectedIds) {
          const practitioner = await medplum.readResource('Practitioner', id);
          practitioners.push(practitioner);
        }
        
        setSelectedPractitioners(practitioners);
      }
    } catch (error) {
      console.error(`Error loading selected ${resourceType}s:`, error);
    }
  };

  const handleEnroll = async (): Promise<void> => {
    try {
      let successCount = 0;
      if (resourceType === 'Patient' && selectedPatients.length > 0) {
        for (const patient of selectedPatients) {
          await enrollPatient(medplum, patient, organization);
          successCount++;
        }
        
        showNotification({
          title: 'Success',
          message: `${successCount} patient${successCount !== 1 ? 's' : ''} enrolled in ${organization.name}`,
          color: 'green',
        });
      } else if (resourceType === 'Practitioner' && selectedPractitioners.length > 0) {
        for (const practitioner of selectedPractitioners) {
          await enrollPractitioner(medplum, practitioner, organization);
          successCount++;
        }
        
        showNotification({
          title: 'Success',
          message: `${successCount} clinician${successCount !== 1 ? 's' : ''} enrolled in ${organization.name}`,
          color: 'green',
        });
      }
    
      // Reset form, close modal, and refresh the list
      setSelectedPatients([]);
      setSelectedPractitioners([]);
      setSelectedResourceIds([]);
      setEnrollModalOpen(false);
      loadMembers();
    } catch (error) {
      showNotification({
        title: 'Error',
        message: `Failed to enroll ${resourceType.toLowerCase()}`,
        color: 'red',
      });
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Group>
          <TextInput
            placeholder={`Search ${resourceType === 'Patient' ? 'patients' : 'clinicians'}...`}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            leftSection={<IconSearch size={16} />}
            style={{ width: '300px' }}
          />
          <Badge size="lg" variant="light">
            {members.length} {resourceType === 'Patient' ? 'Patients' : 'Clinicians'}
          </Badge>
        </Group>
        <Group>
          <Button 
            leftSection={<IconPlus size={16} />}
            onClick={() => setEnrollModalOpen(true)}
          >
            Enroll New {resourceType === 'Patient' ? 'Patient' : 'Clinician'}
          </Button>
        </Group>
      </Group>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: '80%' }}>Name</Table.Th>
            <Table.Th>
              <Group justify="flex-end">
                <Button 
                  size="xs" 
                  variant="subtle" 
                  color="gray"
                  onClick={() => {
                    loadMembers();
                  }} 
                  loading={isLoading}
                  p={6}
                  aria-label="Refresh list"
                >
                  <IconRefresh size={16} />
                </Button>
              </Group>
            </Table.Th>
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

      <Modal
        opened={enrollModalOpen}
        onClose={() => {
          setEnrollModalOpen(false);
          setSelectedPatients([]);
          setSelectedPractitioners([]);
          setSelectedResourceIds([]);
        }}
        title={`Enroll New ${resourceType === 'Patient' ? 'Patients' : 'Clinicians'}`}
        size="lg"
      >
        <Stack>
          <Group align="flex-end">
            <MultiSelect
              data={availableResources}
              placeholder={`Search for ${resourceType === 'Patient' ? 'patients' : 'clinicians'}...`}
              searchable
              nothingFoundMessage={`No ${resourceType.toLowerCase()} found`}
              value={selectedResourceIds}
              onChange={handleSelectionChange}
              maxDropdownHeight={200}
              disabled={isLoading}
              description={isLoading ? "Loading available resources..." : `Select ${resourceType === 'Patient' ? 'patients' : 'clinicians'} to enroll`}
              style={{ flex: 1 }}
            />
            <Button
              onClick={handleEnroll}
              disabled={(resourceType === 'Patient' ? selectedPatients.length === 0 : selectedPractitioners.length === 0) || isLoading}
              loading={isLoading}
            >
              Enroll
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
} 