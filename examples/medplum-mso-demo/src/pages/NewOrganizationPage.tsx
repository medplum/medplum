import { Button, TextInput, Title, Stack } from '@mantine/core';
import { useMedplum, Document } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Organization } from '@medplum/fhirtypes';

export function NewOrganizationPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [name, setName] = useState<string>('');

  const handleCreateClinic = async (): Promise<void> => {
    if (!name) {
      return;
    }

    const newOrg = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: name,
      active: true
    });

    // Navigate to the new organization's page
    navigate(`/Organization/${newOrg.id}`);
  };

  return (
    <Document>
      <Title order={2} mb="xl">Create New Clinic</Title>
      <Stack gap="lg">
        <TextInput
          label="Organization Name"
          placeholder="Enter organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        
        <Button 
          onClick={handleCreateClinic}
          disabled={!name}
        >
          Create Organization
        </Button>
      </Stack>
    </Document>
  );
} 