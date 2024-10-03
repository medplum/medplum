import { Paper, Stack, Tabs, Title } from '@mantine/core';
import { getDisplayString, Operator } from '@medplum/core';
import { MedicationRequest } from '@medplum/fhirtypes';
import { Document, Loading, ResourceTable, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function PrescriptionPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { id } = useParams();
  const [prescription, setPrescription] = useState<MedicationRequest>();
  const tabs = ['details', 'orders'];

  useEffect(() => {
    if (id) {
      medplum.readResource('MedicationRequest', id).then(setPrescription).catch(console.error);
    }
  });

  if (!prescription) {
    return <Loading />;
  }

  return (
    <Document>
      <Stack>
        <Title>Medication: {getDisplayString(prescription)}</Title>
        <Title>For: {prescription.subject.display}</Title>
      </Stack>
      <Tabs defaultValue="details">
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab value={tab}>{getDisplay(tab)}</Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <Paper>
            <ResourceTable value={prescription} />
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="orders">
          <Paper>
            <SearchControl
              search={{
                resourceType: 'MedicationDispense',
                filters: [{ code: 'prescription', operator: Operator.EQUALS, value: `MedicationRequest/${id}` }],
              }}
              hideFilters={true}
              hideToolbar={true}
              onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
            />
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}

function getDisplay(tab: string): string {
  return tab.charAt(0).toUpperCase() + tab.slice(1);
}
