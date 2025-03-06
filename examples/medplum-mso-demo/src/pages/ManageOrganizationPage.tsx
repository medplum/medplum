import { Title, Tabs, Button, Group, Stack, Modal, Text, TextInput, Badge, Alert } from '@mantine/core';
import { Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import { Document, ResourceName, useMedplum, ResourceInput } from '@medplum/react';
import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { MemberList } from '../components/MemberList';
import { enrollPatient, enrollPractitioner } from '../actions/enrollment';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { IconPlus, IconSearch, IconAlertCircle } from '@tabler/icons-react';
import { useAdminStatus } from '../utils/admin';

/**
 * A page component for managing a specific clinic and its members.
 * Provides interfaces for enrolling and managing patients and practitioners
 * associated with the clinic.
 * 
 * @component
 * @returns {JSX.Element} The clinic management page
 */
export function ManageOrganizationPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [organization, setOrganization] = useState<Organization>();
  const [activeTab, setActiveTab] = useState<string | null>('practitioners');
  const [memberCount, setMemberCount] = useState<number>(0);
  const [searchFilter, setSearchFilter] = useState('');
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  
  // Modal state
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient>();
  const [selectedPractitioner, setSelectedPractitioner] = useState<Practitioner>();

  useEffect(() => {
    const loadOrganization = async (): Promise<void> => {
      try {
        const org = await medplum.readResource('Organization', id as string);
        setOrganization(org);
      } catch (error) {
        console.error('Error loading clinic:', error);
        showNotification({
          title: 'Error',
          message: 'Failed to load clinic details',
          color: 'red',
        });
      }
    };
    loadOrganization().catch((error) => {
      console.error('Error loading organization:', error);
    });
  }, [medplum, id]);

  const handleEnrollPatient = async (): Promise<void> => {
    if (!selectedPatient || !organization) {
      return;
    }
    
    try {
      await enrollPatient(medplum, selectedPatient, organization);
      showNotification({
        title: 'Success',
        message: `Patient ${selectedPatient.name?.[0]?.given?.[0]} ${selectedPatient.name?.[0]?.family} enrolled in ${organization.name}`,
        color: 'green',
      });
      // Reset form and close modal
      setSelectedPatient(undefined);
      setEnrollModalOpen(false);
    } catch (error) {
      console.error('Error enrolling patient:', error);
      showNotification({
        title: 'Error',
        message: 'Failed to enroll patient',
        color: 'red',
      });
    }
  };

  const handleEnrollPractitioner = async (): Promise<void> => {
    if (!selectedPractitioner || !organization) {
      return;
    }
    
    try {
      await enrollPractitioner(medplum, selectedPractitioner, organization);
      showNotification({
        title: 'Success',
        message: `Clinician ${selectedPractitioner.name?.[0]?.given?.[0]} ${selectedPractitioner.name?.[0]?.family} enrolled in ${organization.name}`,
        color: 'green',
      });
      // Reset form and close modal
      setSelectedPractitioner(undefined);
      setEnrollModalOpen(false);
    } catch (error) {
      console.error('Error enrolling clinician:', error);
      showNotification({
        title: 'Error',
        message: 'Failed to enroll clinician',
        color: 'red',
      });
    }
  };

  // If still checking admin status, show loading
  if (adminLoading) {
    return (
      <Document>
        <Title>Manage Clinic</Title>
        <Text>Loading...</Text>
      </Document>
    );
  }

  // If user is not an admin, show access denied message
  if (!isAdmin) {
    return (
      <Document>
        <Title>Manage Clinic</Title>
        <Alert 
          icon={<IconAlertCircle size={16} />} 
          title="Access Denied" 
          color="red"
        >
          You need to be an Admin to view this page. Please contact your system administrator for access.
        </Alert>
      </Document>
    );
  }

  if (!organization) {
    return <Document><Title>Loading...</Title></Document>;
  }

  return (
    <Document>
      {organization && (
        <>
          <Title>{organization.name}</Title>
          
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List mb="md">
              <Tabs.Tab value="practitioners">Clinicians</Tabs.Tab>
              <Tabs.Tab value="patients">Patients</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="practitioners">
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
                      {memberCount} Clinicians
                    </Badge>
                  </Group>
                  <Button 
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setEnrollModalOpen(true)}
                  >
                    Enroll New Clinician
                  </Button>
                </Group>
                <MemberList
                  resourceType="Practitioner"
                  organization={organization}
                  onCountChange={setMemberCount}
                  searchFilter={searchFilter}
                />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="patients">
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
                      {memberCount} Patients
                    </Badge>
                  </Group>
                  <Button 
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setEnrollModalOpen(true)}
                  >
                    Enroll New Patient
                  </Button>
                </Group>
                <MemberList
                  resourceType="Patient"
                  organization={organization}
                  onCountChange={setMemberCount}
                  searchFilter={searchFilter}
                />
              </Stack>
            </Tabs.Panel>
          </Tabs>

          <Modal
            opened={enrollModalOpen}
            onClose={() => {
              setEnrollModalOpen(false);
              setSelectedPatient(undefined);
              setSelectedPractitioner(undefined);
            }}
            title={`Enroll New ${activeTab === 'practitioners' ? 'Clinician' : 'Patient'}`}
          >
            <Stack>
              {activeTab === 'practitioners' ? (
                <ResourceInput
                  resourceType="Practitioner"
                  name="practitioner"
                  label="Select Clinician"
                  defaultValue={selectedPractitioner}
                  onChange={(pract) => setSelectedPractitioner(pract as Practitioner)}
                />
              ) : (
                <ResourceInput
                  resourceType="Patient"
                  name="patient"
                  label="Select Patient"
                  defaultValue={selectedPatient}
                  onChange={(pat) => setSelectedPatient(pat as Patient)}
                />
              )}
              <Button
                onClick={activeTab === 'practitioners' ? handleEnrollPractitioner : handleEnrollPatient}
                disabled={!(selectedPractitioner || selectedPatient)}
              >
                Enroll
              </Button>
            </Stack>
          </Modal>
        </>
      )}
    </Document>
  );
}