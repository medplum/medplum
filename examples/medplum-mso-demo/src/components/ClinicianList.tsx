// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Group, Modal, MultiSelect, Stack, Table, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { normalizeErrorString } from '@medplum/core';
import { Organization, Practitioner } from '@medplum/fhirtypes';
import { useMedplum, useMedplumNavigate } from '@medplum/react';
import { IconPlus, IconRefresh, IconSearch } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useState } from 'react';
import { enrollPractitioner, getEnrolledPractitioners, unEnrollPractitioner } from '../utils/enrollment';

interface ClinicianListProps {
  organization: Organization;
}

/**
 * A component that displays a list of clinicians for an organization.
 * Supports searching, filtering, enrollment, and unenrollment actions.
 *
 * @param props - The component props
 * @param props.organization - The organization to show clinicians for
 * @returns A table displaying the clinicians with their names and actions
 */
export function ClinicianList({ organization }: ClinicianListProps): JSX.Element {
  const medplum = useMedplum();
  const [clinicians, setClinicians] = useState<Practitioner[]>([]);
  const [filteredClinicians, setFilteredClinicians] = useState<Practitioner[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [enrollModalOpen, setEnrollModalOpen] = useState<boolean>(false);
  const [selectedClinicians, setSelectedClinicians] = useState<Practitioner[]>([]);
  const [availableClinicians, setAvailableClinicians] = useState<{ value: string; label: string }[]>([]);
  const [selectedClinicianIds, setSelectedClinicianIds] = useState<string[]>([]);
  const navigate = useMedplumNavigate();

  // Load enrolled Practitioners to display for the current clinic
  const loadClinicians = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      const practitioners = await getEnrolledPractitioners(medplum, organization);
      setClinicians(practitioners);
      setFilteredClinicians(practitioners);
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

  // Load the available practitioners for enrollment (practitioners not already enrolled in the clinic)
  const loadAvailableClinicians = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);

      const searchResult = await medplum.search('Practitioner', {
        _count: 100,
        _fields: 'name',
      });

      const allPractitioners = searchResult.entry?.map((e) => e.resource as Practitioner) ?? [];
      const enrolledPractitioners = await getEnrolledPractitioners(medplum, organization);

      // Filter out already enrolled practitioners and the current user
      const availablePractitioners = allPractitioners.filter(
        (practitioner) =>
          !enrolledPractitioners.some((p) => p.id === practitioner.id) && practitioner.id !== medplum.getProfile()?.id
      );

      const options = availablePractitioners.map((practitioner) => ({
        value: practitioner.id as string,
        label: getName(practitioner),
      }));

      setAvailableClinicians(options);
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
    loadClinicians().catch(console.error);
  }, [loadClinicians]);

  useEffect(() => {
    if (enrollModalOpen) {
      loadAvailableClinicians().catch(console.error);
    }
  }, [enrollModalOpen, loadAvailableClinicians]);

  useEffect(() => {
    if (!searchFilter) {
      setFilteredClinicians(clinicians);
      return;
    }
    const filtered = clinicians.filter((clinician) => {
      const name = getName(clinician).toLowerCase();
      return name.includes(searchFilter.toLowerCase());
    });
    setFilteredClinicians(filtered);
  }, [searchFilter, clinicians]);

  // Get the name of a practitioner
  const getName = (practitioner: Practitioner): string => {
    if (!practitioner.name?.[0]) {
      return 'Unknown';
    }
    const name = practitioner.name[0];
    return `${name.given?.[0] ?? ''} ${name.family ?? ''}`.trim();
  };

  // Unenroll a Practitioner from the organization
  const handleUnenroll = async (practitioner: Practitioner): Promise<void> => {
    try {
      await unEnrollPractitioner(medplum, practitioner, organization);
      // Refresh the list after unenrollment
      const updatedClinicians = clinicians.filter((c) => c.id !== practitioner.id);
      setClinicians(updatedClinicians);
      setFilteredClinicians(updatedClinicians);

      showNotification({
        title: 'Success',
        message: `Successfully unenrolled ${getName(practitioner)} from ${organization.name}`,
        color: 'green',
      });

      await loadClinicians();
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
    setSelectedClinicianIds(selectedIds);
    try {
      const practitioners: Practitioner[] = [];

      for (const id of selectedIds) {
        const practitioner = await medplum.readResource('Practitioner', id);
        practitioners.push(practitioner);
      }

      setSelectedClinicians(practitioners);
    } catch (error) {
      console.error('Error loading selected clinicians:', normalizeErrorString(error));
    }
  };

  const handleEnroll = async (): Promise<void> => {
    try {
      if (selectedClinicians.length > 0) {
        const results = await Promise.allSettled(
          selectedClinicians.map((practitioner) => enrollPractitioner(medplum, practitioner, organization))
        );

        const successCount = results.filter((result) => result.status === 'fulfilled').length;
        const failedCount = results.filter((result) => result.status === 'rejected');

        showNotification({
          title: 'Success',
          message: `${successCount} clinician${successCount !== 1 ? 's' : ''} enrolled in ${organization.name}`,
          color: 'green',
        });

        if (failedCount.length > 0) {
          showNotification({
            title: 'Error',
            message: `${failedCount.map((result) => result.reason).join(', ')}`,
            color: 'red',
          });
        }

        // Reset form, close modal, and refresh the list
        setSelectedClinicians([]);
        setSelectedClinicianIds([]);
        setEnrollModalOpen(false);
        loadClinicians().catch(console.error);
      }
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
            placeholder="Search clinicians..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            leftSection={<IconSearch size={16} />}
            style={{ width: '300px' }}
          />
          <Badge size="lg" variant="light">
            {clinicians.length} Clinicians
          </Badge>
        </Group>
        <Group>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEnrollModalOpen(true)}>
            Enroll New Clinician
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
                    loadClinicians().catch(console.error);
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
          {filteredClinicians.map((clinician) => (
            <Table.Tr key={clinician.id}>
              <Table.Td>
                <Text style={{ cursor: 'pointer' }} onClick={() => navigate(`/Practitioner/${clinician.id}`)}>
                  {getName(clinician)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Button size="xs" color="red" onClick={() => handleUnenroll(clinician)}>
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
          setSelectedClinicians([]);
          setSelectedClinicianIds([]);
        }}
        title="Enroll New Clinicians"
        size="lg"
      >
        <Stack>
          <Group align="flex-end">
            <MultiSelect
              data={availableClinicians}
              placeholder="Search for clinicians..."
              searchable
              nothingFoundMessage="No clinicians found"
              value={selectedClinicianIds}
              onChange={handleSelectionChange}
              maxDropdownHeight={200}
              disabled={isLoading}
              description={isLoading ? 'Loading available clinicians...' : 'Select clinicians to enroll'}
              style={{ flex: 1 }}
            />
            <Button onClick={handleEnroll} disabled={selectedClinicians.length === 0 || isLoading} loading={isLoading}>
              Enroll
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
