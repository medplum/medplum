import { Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { Document, Loading, ResourceTable, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { bundle } from './../../data/sample-data';

export function MedicationPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [medicationKnowledge, setMedicationKnowledge] = useState<MedicationKnowledge>();

  useEffect(() => {
    if (id) {
      medplum.readResource('MedicationKnowledge', id).then(setMedicationKnowledge).catch(console.error);
    }
  });

  if (!medicationKnowledge) {
    return <Loading />;
  }

  console.log(bundle);

  return (
    <Document>
      <Title>{getDisplayString(medicationKnowledge)}</Title>
      <ResourceTable key={id} value={medicationKnowledge} />
    </Document>
  );
}
