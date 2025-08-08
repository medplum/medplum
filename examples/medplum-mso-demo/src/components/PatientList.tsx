// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Group, Modal, MultiSelect, Stack, Table, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { normalizeErrorString } from '@medplum/core';
import { Organization, Patient } from '@medplum/fhirtypes';
import { useMedplum, useMedplumNavigate } from '@medplum/react';
import { IconPlus, IconRefresh, IconSearch } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useState } from 'react';
import { enrollPatient, getEnrolledPatients, unEnrollPatient } from '../utils/enrollment';

interface PatientListProps {
  organization: Organization;
}

/**
 * A component that displays a list of patients for an organization.
 * Supports searching, filtering, enrollment, and unenrollment actions.
 *
 * @param props - The component props
 * @param props.organization - The organization to show patients for
 * @returns A table displaying the patients with their names and actions
 */
export function PatientList({ organization }: PatientListProps): JSX.Element {
  const medplum = useMedplum();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [enrollModalOpen, setEnrollModalOpen] = useState<boolean>(false);
  const [selectedPatients, setSelectedPatients] = useState<Patient[]>([]);
  const [availablePatients, setAvailablePatients] = useState<{ value: string; label: string }[]>([]);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const navigate = useMedplumNavigate();

  // Load enrolled Patients to display for the current clinic
  const loadPatients = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      const patients = await getEnrolledPatients(medplum, organization);
      setPatients(patients);
      setFilteredPatients(patients);
    } catch (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  }, [medplum, organization]);

  // Load the available patients for enrollment (patients not already enrolled in the clinic)
  const loadAvailablePatients = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);

      const searchResult = await medplum.search('Patient', {
        _count: 100,
        _fields: 'name,meta',
      });

      const allPatients = searchResult.entry?.map((e) => e.resource as Patient) ?? [];
      const enrolledPatients = await getEnrolledPatients(medplum, organization);
      const availablePatients = allPatients.filter((patient) => !enrolledPatients.some((p) => p.id === patient.id));

      const options = availablePatients.map((patient) => ({
        value: patient.id as string,
        label: getName(patient),
      }));

      setAvailablePatients(options);
    } catch (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  }, [medplum, organization]);

  useEffect(() => {
    loadPatients().catch(console.error);
  }, [loadPatients]);

  useEffect(() => {
    if (enrollModalOpen) {
      loadAvailablePatients().catch(console.error);
    }
  }, [enrollModalOpen, loadAvailablePatients]);

  useEffect(() => {
    if (!searchFilter) {
      setFilteredPatients(patients);
      return;
    }
    const filtered = patients.filter((patient) => {
      const name = getName(patient).toLowerCase();
      return name.includes(searchFilter.toLowerCase());
    });
    setFilteredPatients(filtered);
  }, [searchFilter, patients]);

  // Get the name of a patient
  const getName = (patient: Patient): string => {
    if (!patient.name?.[0]) {
      return 'Unknown';
    }
    const name = patient.name[0];
    return `${name.given?.[0] ?? ''} ${name.family ?? ''}`.trim();
  };

  // Unenroll a Patient from the organization
  const handleUnenroll = async (patient: Patient): Promise<void> => {
    try {
      await unEnrollPatient(medplum, patient, organization);
      // Refresh the list after unenrollment
      const updatedPatients = patients.filter((p) => p.id !== patient.id);
      setPatients(updatedPatients);
      setFilteredPatients(updatedPatients);

      showNotification({
        title: 'Success',
        message: `Successfully unenrolled ${getName(patient)} from ${organization.name}`,
        color: 'green',
      });

      loadPatients().catch(console.error);
    } catch (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    }
  };

  // Handle selection change in MultiSelect
  const handleSelectionChange = async (selectedIds: string[]): Promise<void> => {
    setSelectedPatientIds(selectedIds);
    try {
      const patients: Patient[] = [];

      for (const id of selectedIds) {
        const patient = await medplum.readResource('Patient', id);
        patients.push(patient);
      }

      setSelectedPatients(patients);
    } catch (error) {
      console.error('Error loading selected patients:', normalizeErrorString(error));
    }
  };

  const handleEnroll = async (): Promise<void> => {
    try {
      let successCount = 0;
      if (selectedPatients.length > 0) {
        for (const patient of selectedPatients) {
          await enrollPatient(medplum, patient, organization);
          successCount++;
        }

        showNotification({
          title: 'Success',
          message: `${successCount} patient${successCount !== 1 ? 's' : ''} enrolled in ${organization.name}`,
          color: 'green',
        });
      }

      // Reset form, close modal, and refresh the list
      setSelectedPatients([]);
      setSelectedPatientIds([]);
      setEnrollModalOpen(false);
      loadPatients().catch(console.error);
    } catch (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Group>
          <TextInput
            placeholder="Search patients..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            leftSection={<IconSearch size={16} />}
            style={{ width: '300px' }}
          />
          <Badge size="lg" variant="light">
            {patients.length} Patients
          </Badge>
        </Group>
        <Group>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEnrollModalOpen(true)}>
            Enroll New Patient
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
                    loadPatients().catch(console.error);
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
          {filteredPatients.map((patient) => (
            <Table.Tr key={patient.id}>
              <Table.Td>
                <Text style={{ cursor: 'pointer' }} onClick={() => navigate(`/Patient/${patient.id}`)}>
                  {getName(patient)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Button size="xs" color="red" onClick={() => handleUnenroll(patient)}>
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
          setSelectedPatientIds([]);
        }}
        title="Enroll New Patients"
        size="lg"
      >
        <Stack>
          <Group align="flex-end">
            <MultiSelect
              data={availablePatients}
              placeholder="Search for patients..."
              searchable
              nothingFoundMessage="No patients found"
              value={selectedPatientIds}
              onChange={handleSelectionChange}
              maxDropdownHeight={200}
              disabled={isLoading}
              description={isLoading ? 'Loading available patients...' : 'Select patients to enroll'}
              style={{ flex: 1 }}
            />
            <Button onClick={handleEnroll} disabled={selectedPatients.length === 0 || isLoading} loading={isLoading}>
              Enroll
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
