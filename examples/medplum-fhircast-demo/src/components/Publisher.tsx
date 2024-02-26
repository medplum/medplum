import { Button, Stack, TextInput, Title } from '@mantine/core';
import { FhircastEventContext } from '@medplum/core';
import { Document, useMedplum } from '@medplum/react';
import { useState } from 'react';
import TopicGenerator from './TopicGenerator';

function createFhircastMessageContext(patientId: string): FhircastEventContext<'Patient-open'> {
  if (!patientId) {
    throw new Error('Must provide a patientId!');
  }
  return {
    key: 'patient',
    resource: {
      resourceType: 'Patient',
      id: patientId,
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MR',
                display: 'Medical Record Number',
              },
            ],
          },
        },
      ],
    },
  };
}

export default function Publisher(): JSX.Element {
  const medplum = useMedplum();
  const [topic, setTopic] = useState<string>();
  const [currentPatientId, setCurrentPatientId] = useState<string>();

  const handleChangePatient = (): void => {
    const patientId = crypto.randomUUID();
    if (topic) {
      medplum
        .fhircastPublish(topic, 'Patient-open', createFhircastMessageContext(patientId))
        .then(() => setCurrentPatientId(patientId))
        .catch((err) => console.error(err));
    } else {
      setCurrentPatientId(patientId);
    }
  };

  return (
    <Document>
      <Title ta="center" fz={36}>
        Publisher
      </Title>
      <Stack align="center">
        <div style={{ height: 150 }}>
          <TopicGenerator onTopicChange={(topic) => setTopic(topic)} />
        </div>
        <TextInput
          label="Patient ID"
          mb={20}
          w={350}
          value={currentPatientId ?? 'No current patient'}
          disabled={!currentPatientId}
          readOnly
        />
        <Button onClick={handleChangePatient} size="sm">
          Change patient
        </Button>
      </Stack>
    </Document>
  );
}
