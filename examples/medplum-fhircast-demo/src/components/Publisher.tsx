import { Button, Input, Stack, Title } from '@mantine/core';
import { FhircastEventContext } from '@medplum/core';
import { Document, useMedplum } from '@medplum/react';
import { useState } from 'react';
import TopicGenerator from './TopicGenerator';

function createFhircastMessageContext(patientId: string): FhircastEventContext {
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
        .fhircastPublish(topic, 'patient-open', createFhircastMessageContext(patientId))
        .then(() => setCurrentPatientId(patientId))
        .catch((err) => console.error(err));
    } else {
      setCurrentPatientId(patientId);
    }
  };

  return (
    <Document>
      <Title align="center" fz={36}>
        Publisher
      </Title>
      <Stack align="center">
        <div style={{ height: 150 }}>
          <TopicGenerator onTopicChange={(topic) => setTopic(topic)} />
        </div>
        <Input.Wrapper label="Patient ID" mb={20} w={350}>
          <Input value={currentPatientId ?? 'No current patient'} disabled={!currentPatientId} />
        </Input.Wrapper>
        <Button onClick={handleChangePatient} size="sm" radius="xl">
          Change patient
        </Button>
      </Stack>
    </Document>
  );
}
