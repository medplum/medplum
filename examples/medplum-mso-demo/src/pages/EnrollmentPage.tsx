import { Button, Title, Tabs, Group, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import { useMedplum, ResourceInput, Document } from '@medplum/react';
import { useState } from 'react';
import { enrollPatient, enrollPractitioner } from '../actions/enrollment';

export function EnrollmentPage(): JSX.Element {
  const medplum = useMedplum();
  const [activeTab, setActiveTab] = useState<string | null>('patient');
  
  // Patient enrollment state
  const [selectedPatient, setSelectedPatient] = useState<Patient>();
  const [patientOrg, setPatientOrg] = useState<Organization>();
  
  // Practitioner enrollment state
  const [selectedPractitioner, setSelectedPractitioner] = useState<Practitioner>();
  const [practitionerOrg, setPractitionerOrg] = useState<Organization>();

  const handleEnrollPatient = async (): Promise<void> => {
    if (!selectedPatient || !patientOrg) {
      console.error('Patient or organization not selected');
      return;
    }
    
    await enrollPatient(medplum, selectedPatient, patientOrg);
    showNotification({
      title: 'Success',
      message: `Patient ${selectedPatient.name?.[0]?.given?.[0]} ${selectedPatient.name?.[0]?.family} enrolled in ${patientOrg.name}`,
      color: 'green',
    });
    // Reset form after successful notification
    setSelectedPatient(undefined);
    setPatientOrg(undefined);
  };

  const handleEnrollPractitioner = async (): Promise<void> => {
    if (!selectedPractitioner || !practitionerOrg) {
      console.error('Practitioner or organization not selected');
      return;
    }
    await enrollPractitioner(medplum, selectedPractitioner, practitionerOrg);
    showNotification({
      title: 'Practitioner Enrolled',
      message: `Practitioner ${selectedPractitioner.name?.[0]?.given?.[0]} ${selectedPractitioner.name?.[0]?.family} has been enrolled in ${practitionerOrg.name}`,
      color: 'green',
    });
    // Reset form
    setSelectedPractitioner(undefined);
    setPractitionerOrg(undefined);
  };

  return (
    <Document>
      <Title order={2} mb="xl">Enrollment Management</Title>
      
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="patient">Enroll Patient</Tabs.Tab>
          <Tabs.Tab value="practitioner">Enroll Practitioner</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="patient">
          <Stack gap="lg">
            <Title order={4}>Enroll Patient in Organization</Title>
            <Group grow align="flex-start">
              <ResourceInput
                resourceType="Patient"
                name="patient"
                label="Select Patient"
                defaultValue={selectedPatient}
                onChange={(pat) => setSelectedPatient(pat as Patient)}
              />
              
              <ResourceInput
                resourceType="Organization"
                name="organization"
                label="Select Organization"
                defaultValue={patientOrg}
                onChange={(org) => setPatientOrg(org as Organization)}
              />
              
              <Button 
                onClick={handleEnrollPatient}
                disabled={!selectedPatient || !patientOrg}
                style={{ marginTop: '24px' }}
              >
                Enroll Patient
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="practitioner">
          <Stack gap="lg">
            <Title order={4}>Enroll Practitioner in Organization</Title>
            <Group grow align="flex-start">
              <ResourceInput
                resourceType="Practitioner"
                name="practitioner"
                label="Select Practitioner"
                defaultValue={selectedPractitioner}
                onChange={(pract) => setSelectedPractitioner(pract as Practitioner)}
              />
              
              <ResourceInput
                resourceType="Organization"
                name="organization"
                label="Select Organization"
                defaultValue={practitionerOrg}
                onChange={(org) => setPractitionerOrg(org as Organization)}
              />
              
              <Button 
                onClick={handleEnrollPractitioner}
                disabled={!selectedPractitioner || !practitionerOrg}
                style={{ marginTop: '24px' }}
              >
                Enroll Practitioner
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
} 