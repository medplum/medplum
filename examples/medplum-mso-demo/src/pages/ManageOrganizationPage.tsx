import { Title, Tabs, Divider } from '@mantine/core';
import { Organization } from '@medplum/fhirtypes';
import { Document, ResourceName, useMedplum } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { MemberList } from '../components/MemberList';

export function ManageOrganizationPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [organization, setOrganization] = useState<Organization>();
  const [activeTab, setActiveTab] = useState<string | null>('practitioners');

  useEffect(() => {
    const loadOrganization = async (): Promise<void> => {
      try {
        const org = await medplum.readResource('Organization', id as string);
        setOrganization(org);
      } catch (error) {
        console.error('Error loading organization:', error);
      }
    };
    loadOrganization().catch((error) => {
      console.error('Error loading organization:', error);
    });
  }, [medplum, id]);

  if (!organization) {
    return <Document><Title>Loading...</Title></Document>;
  }

  return (
    <Document>
      <Title>
        Manage <ResourceName value={organization} link/>
      </Title>
      <Divider mb="xl" />

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="practitioners">Practitioners</Tabs.Tab>
          <Tabs.Tab value="patients">Patients</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="practitioners">
          <MemberList
            resourceType="Practitioner"
            organization={organization}
          />
        </Tabs.Panel>

        <Tabs.Panel value="patients">
          <MemberList
            resourceType="Patient"
            organization={organization}
          />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}